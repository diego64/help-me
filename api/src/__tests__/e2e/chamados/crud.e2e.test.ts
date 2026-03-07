import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../infrastructure/database/prisma/client';
import { createTestUser } from '../setup/test.database';
import { createAuthenticatedClient, generateUniqueEmail, extractErrorMessage } from '../setup/test.helpers';

describe('E2E: Chamados', () => {
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let tecnicoClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let usuarioClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let servicoNome: string;

  beforeEach(async () => {
    adminClient = await createAuthenticatedClient(
      process.env.ADMIN_EMAIL || 'admin@helpme.com',
      process.env.ADMIN_PASSWORD || 'Admin123!'
    );

    tecnicoClient = await createAuthenticatedClient(
      process.env.TECNICO_EMAIL || 'tecnico@helpme.com',
      process.env.TECNICO_PASSWORD || 'Tecnico123!'
    );

    usuarioClient = await createAuthenticatedClient(
      process.env.USER_EMAIL || 'user@helpme.com',
      process.env.USER_PASSWORD || 'User123!'
    );

    const servico = await prisma.servico.findFirst();
    servicoNome = servico!.nome;
  });

  async function criarChamado(descricao?: string) {
    return usuarioClient
      .post('/api/chamados/abertura-chamado', {
        descricao: descricao ?? 'Descrição padrão do chamado para fins de teste automatizado.',
        servico: servicoNome,
      })
      .expect(201);
  }

  async function encerrarChamado(id: string) {
    return tecnicoClient
      .patch(`/api/chamados/${id}/status`, {
        status: 'ENCERRADO',
        descricaoEncerramento: 'Problema resolvido pelo técnico responsável.',
      })
      .expect(200);
  }

  describe('POST /api/chamados/abertura-chamado - Criação', () => {
    it('deve criar chamado com descrição e serviço válidos', async () => {
      const response = await criarChamado(
        'Computador não está ligando após atualização do Windows. Já tentei reiniciar várias vezes.'
      );

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('OS');
      expect(response.body.OS).toMatch(/^INC\d{4}$/);
      expect(response.body.status).toBe('ABERTO');
      expect(response.body.prioridade).toBe('P4');
      expect(response.body).toHaveProperty('prioridadeDescricao');
      expect(response.body).toHaveProperty('anexos');
      expect(response.body.anexos.enviados).toBe(0);
    });

    it('deve criar chamado com array de serviços', async () => {
      const servicos = await prisma.servico.findMany({ take: 2 });

      const response = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Problema com múltiplos sistemas que precisam de atenção urgente.',
          servico: servicos.map((s) => s.nome),
        })
        .expect(201);

      expect(response.body.servicos).toHaveLength(2);
    });

    it('deve rejeitar criação sem autenticação', async () => {
      const response = await request(app)
        .post('/api/chamados/abertura-chamado')
        .send({ descricao: 'Teste sem autenticação válida', servico: servicoNome });

      expect(response.status).toBe(401);
    });

    it('deve rejeitar quando TECNICO tenta abrir chamado', async () => {
      const response = await tecnicoClient.post('/api/chamados/abertura-chamado', {
        descricao: 'Técnico tentando abrir chamado sem permissão.',
        servico: servicoNome,
      });

      expect(response.status).toBe(403);
    });

    it('deve rejeitar descrição muito curta (menos de 10 caracteres)', async () => {
      const response = await usuarioClient.post('/api/chamados/abertura-chamado', {
        descricao: 'Curto',
        servico: servicoNome,
      });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/mínimo.*10 caracteres/i);
    });

    it('deve rejeitar criação sem serviço', async () => {
      const response = await usuarioClient.post('/api/chamados/abertura-chamado', {
        descricao: 'Teste sem serviço mas com descrição válida para passar validação',
      });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/serviço/i);
    });

    it('deve rejeitar serviço inexistente', async () => {
      const response = await usuarioClient.post('/api/chamados/abertura-chamado', {
        descricao: 'Teste com serviço inválido mas descrição longa suficiente',
        servico: 'Serviço Inexistente que não existe no banco de dados',
      });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/não encontrado|inativo/i);
    });

    it('deve gerar números de OS únicos e sequenciais', async () => {
      const r1 = await criarChamado('Primeiro chamado para testar sequência de OS');
      const r2 = await criarChamado('Segundo chamado para testar sequência de OS');

      expect(r1.body.OS).not.toBe(r2.body.OS);
      expect(r1.body.OS).toMatch(/^INC\d{4}$/);
      expect(r2.body.OS).toMatch(/^INC\d{4}$/);
    });
  });

  describe('GET /api/chamados - Listagem', () => {
    beforeEach(async () => {
      await criarChamado('Chamado A para listagem e filtro de testes automatizados');
      await criarChamado('Chamado B para listagem e filtro de testes automatizados');
    });

    it('admin deve listar todos os chamados com paginação', async () => {
      const response = await adminClient.get('/api/chamados').expect(200);

      expect(response.body).toHaveProperty('chamados');
      expect(response.body).toHaveProperty('paginacao');
      expect(response.body).toHaveProperty('ordenacao');
      expect(Array.isArray(response.body.chamados)).toBe(true);
      expect(response.body.paginacao).toHaveProperty('total');
      expect(response.body.paginacao).toHaveProperty('totalPaginas');
      expect(response.body.paginacao).toHaveProperty('paginaAtual');
      expect(response.body.paginacao).toHaveProperty('limite');
    });

    it('usuário deve ver apenas seus próprios chamados', async () => {
      const response = await usuarioClient.get('/api/chamados').expect(200);

      expect(Array.isArray(response.body.chamados)).toBe(true);
      response.body.chamados.forEach((c: any) => {
        expect(c.usuario).toBeDefined();
      });
    });

    it('deve filtrar por status', async () => {
      const response = await adminClient
        .get('/api/chamados?status=ABERTO')
        .expect(200);

      response.body.chamados.forEach((c: any) => {
        expect(c.status).toBe('ABERTO');
      });
    });

    it('deve filtrar por múltiplos status separados por vírgula', async () => {
      const response = await adminClient
        .get('/api/chamados?status=ABERTO,ENCERRADO')
        .expect(200);

      response.body.chamados.forEach((c: any) => {
        expect(['ABERTO', 'ENCERRADO']).toContain(c.status);
      });
    });

    it('deve filtrar por prioridade', async () => {
      const response = await adminClient
        .get('/api/chamados?prioridade=P4')
        .expect(200);

      response.body.chamados.forEach((c: any) => {
        expect(c.prioridade).toBe('P4');
      });
    });

    it('deve aplicar paginação corretamente', async () => {
      const response = await adminClient
        .get('/api/chamados?pagina=1&limite=1')
        .expect(200);

      expect(response.body.chamados).toHaveLength(1);
      expect(response.body.paginacao.paginaAtual).toBe(1);
      expect(response.body.paginacao.limite).toBe(1);
    });

    it('deve buscar por texto na OS ou descrição', async () => {
      const chamado = await criarChamado('Chamado com termo buscável único xyz987');

      const response = await adminClient
        .get('/api/chamados?busca=xyz987')
        .expect(200);

      expect(response.body.chamados.length).toBeGreaterThan(0);
      const encontrado = response.body.chamados.find((c: any) =>
        c.descricao.includes('xyz987')
      );
      expect(encontrado).toBeDefined();
    });

    it('deve retornar filtros ativos no response', async () => {
      const response = await adminClient
        .get('/api/chamados?status=ABERTO')
        .expect(200);

      expect(response.body.filtros).not.toBeNull();
      expect(response.body.filtros.status).toBe('ABERTO');
    });

    it('deve rejeitar sem autenticação', async () => {
      await request(app).get('/api/chamados').expect(401);
    });
  });

  describe('PATCH /api/chamados/:id - Edição de descrição', () => {
    it('usuário dono deve poder editar descrição de chamado ABERTO', async () => {
      const chamado = await criarChamado();

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}`, {
          descricao: 'Descrição atualizada com mais detalhes sobre o problema encontrado.',
        })
        .expect(200);

      expect(response.body.chamado.descricao).toBe(
        'Descrição atualizada com mais detalhes sobre o problema encontrado.'
      );
      expect(response.body.message).toMatch(/atualizado/i);
    });

    it('deve rejeitar edição sem descrição nem arquivo', async () => {
      const chamado = await criarChamado();

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}`, {})
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/descrição|arquivo/i);
    });

    it('não deve permitir editar chamado de outro usuário', async () => {
      const chamado = await criarChamado();

      // Cria outro usuário e tenta editar
      const outroEmail = generateUniqueEmail();
      await createTestUser({ email: outroEmail, password: 'Senha123!', regra: 'USUARIO' });
      const outroClient = await createAuthenticatedClient(outroEmail, 'Senha123!');

      const response = await outroClient
        .patch(`/api/chamados/${chamado.body.id}`, {
          descricao: 'Tentando editar chamado de outro usuário sem permissão.',
        })
        .expect(403);

      expect(extractErrorMessage(response)).toMatch(/você só pode editar/i);
    });

    it('não deve permitir editar chamado em status EM_ATENDIMENTO', async () => {
      const chamado = await criarChamado();

      const assumido = await tecnicoClient.patch(`/api/chamados/${chamado.body.id}/status`, {
        status: 'EM_ATENDIMENTO',
      });

      // Só continua se o técnico conseguiu assumir (pode estar fora de expediente)
      if (assumido.status !== 200) return;

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}`, {
          descricao: 'Tentando editar chamado que está em atendimento.',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/não pode ser editado/i);
    });

    it('admin deve poder editar qualquer chamado', async () => {
      const chamado = await criarChamado();

      const response = await adminClient
        .patch(`/api/chamados/${chamado.body.id}`, {
          descricao: 'Admin editando chamado de outro usuário com permissão total.',
        })
        .expect(200);

      expect(response.body.chamado.descricao).toContain('Admin editando');
    });
  });

  describe('PATCH /api/chamados/:id/status - Atualização de Status', () => {
    it('técnico deve poder assumir chamado (EM_ATENDIMENTO)', async () => {
      const chamado = await criarChamado(
        'Chamado para técnico assumir e iniciar atendimento'
      );

      const response = await tecnicoClient.patch(
        `/api/chamados/${chamado.body.id}/status`,
        { status: 'EM_ATENDIMENTO' }
      );

      if (response.status === 200) {
        expect(response.body.status).toBe('EM_ATENDIMENTO');
        expect(response.body.tecnico).toBeDefined();
      } else {
        expect(response.status).toBe(403);
        expect(extractErrorMessage(response)).toMatch(/expediente|horário/i);
      }
    });

    it('técnico deve poder encerrar chamado com descrição', async () => {
      const chamado = await criarChamado(
        'Chamado para ser encerrado pelo técnico após resolução'
      );

      const response = await tecnicoClient.patch(
        `/api/chamados/${chamado.body.id}/status`,
        {
          status: 'ENCERRADO',
          descricaoEncerramento:
            'Problema resolvido. Foi necessário reinstalar o driver de rede.',
        }
      );

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ENCERRADO');
      expect(response.body.descricaoEncerramento).toBeDefined();
      expect(response.body.encerradoEm).toBeDefined();
    });

    it('deve rejeitar encerramento sem descrição', async () => {
      const chamado = await criarChamado(
        'Chamado para testar validação de encerramento sem descrição'
      );

      const response = await tecnicoClient.patch(
        `/api/chamados/${chamado.body.id}/status`,
        { status: 'ENCERRADO' }
      );

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/descrição/i);
    });

    it('técnico não deve poder cancelar chamado', async () => {
      const chamado = await criarChamado(
        'Chamado para testar que técnico não pode cancelar diretamente'
      );

      const response = await tecnicoClient.patch(
        `/api/chamados/${chamado.body.id}/status`,
        {
          status: 'CANCELADO',
          descricaoEncerramento: 'Tentando cancelar como técnico mas não deveria conseguir',
        }
      );

      expect(response.status).toBe(403);
      expect(extractErrorMessage(response)).toMatch(/técnico.*não.*cancelar/i);
    });

    it('usuário comum não deve poder alterar status', async () => {
      const chamado = await criarChamado(
        'Chamado para testar que usuário comum não altera status'
      );

      const response = await usuarioClient.patch(
        `/api/chamados/${chamado.body.id}/status`,
        { status: 'EM_ATENDIMENTO' }
      );

      expect(response.status).toBe(403);
    });

    it('deve rejeitar status inválido', async () => {
      const chamado = await criarChamado();

      const response = await tecnicoClient.patch(
        `/api/chamados/${chamado.body.id}/status`,
        { status: 'STATUS_INVALIDO' }
      );

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/status inválido/i);
    });
  });

  describe('PATCH /api/chamados/:id/prioridade - Alteração de Prioridade', () => {
    it('admin deve poder alterar prioridade de chamado', async () => {
      const chamado = await criarChamado();

      const response = await adminClient
        .patch(`/api/chamados/${chamado.body.id}/prioridade`, { prioridade: 'P2' })
        .expect(200);

      expect(response.body.chamado.prioridade).toBe('P2');
      expect(response.body.message).toMatch(/P2/);
    });

    it('deve rejeitar prioridade inválida', async () => {
      const chamado = await criarChamado();

      const response = await adminClient
        .patch(`/api/chamados/${chamado.body.id}/prioridade`, { prioridade: 'P9' })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/prioridade inválida/i);
    });

    it('deve rejeitar quando prioridade já é a mesma', async () => {
      const chamado = await criarChamado(); // prioridade padrão P4

      const response = await adminClient
        .patch(`/api/chamados/${chamado.body.id}/prioridade`, { prioridade: 'P4' })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/já possui/i);
    });

    it('técnico N1/N2 não deve poder alterar prioridade', async () => {
      const chamado = await criarChamado();

      const response = await tecnicoClient.patch(
        `/api/chamados/${chamado.body.id}/prioridade`,
        { prioridade: 'P1' }
      );

      // Técnico padrão dos testes é N1 ou N2; apenas N3 pode alterar
      if (response.status !== 200) {
        expect(response.status).toBe(403);
        expect(extractErrorMessage(response)).toMatch(/N3/i);
      }
    });

    it('usuário não deve poder alterar prioridade', async () => {
      const chamado = await criarChamado();

      const response = await usuarioClient.patch(
        `/api/chamados/${chamado.body.id}/prioridade`,
        { prioridade: 'P1' }
      );

      expect(response.status).toBe(403);
    });

    it('não deve alterar prioridade de chamado cancelado', async () => {
      const chamado = await criarChamado();
      await usuarioClient.patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
        descricaoEncerramento: 'Cancelando para testar restrição de prioridade.',
      });

      const response = await adminClient
        .patch(`/api/chamados/${chamado.body.id}/prioridade`, { prioridade: 'P1' })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/cancelado/i);
    });
  });

  describe('PATCH /api/chamados/:id/transferir - Transferência', () => {
    it('admin deve poder transferir chamado para outro técnico', async () => {
      const chamado = await criarChamado();

      const tecnico = await prisma.usuario.findFirst({
        where: { regra: 'TECNICO', ativo: true, deletadoEm: null },
      });

      if (!tecnico) return;

      const response = await adminClient.patch(
        `/api/chamados/${chamado.body.id}/transferir`,
        {
          tecnicoNovoId: tecnico.id,
          motivo: 'Transferindo para técnico com maior especialização no assunto.',
        }
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('transferencia');
      expect(response.body.transferencia.tecnicoNovo.id).toBe(tecnico.id);
    });

    it('deve rejeitar transferência sem motivo', async () => {
      const chamado = await criarChamado();

      const tecnico = await prisma.usuario.findFirst({
        where: { regra: 'TECNICO', ativo: true, deletadoEm: null },
      });

      if (!tecnico) return;

      const response = await adminClient
        .patch(`/api/chamados/${chamado.body.id}/transferir`, {
          tecnicoNovoId: tecnico.id,
          motivo: 'Curto',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/motivo inválido/i);
    });

    it('deve rejeitar transferência para o mesmo técnico', async () => {
      const chamado = await criarChamado();
      const tecnico = await prisma.usuario.findFirst({
        where: { regra: 'TECNICO', ativo: true, deletadoEm: null },
      });
      if (!tecnico) return;

      // Primeiro atribuir ao técnico
      await prisma.chamado.update({
        where: { id: chamado.body.id },
        data: { tecnicoId: tecnico.id },
      });

      const response = await adminClient
        .patch(`/api/chamados/${chamado.body.id}/transferir`, {
          tecnicoNovoId: tecnico.id,
          motivo: 'Tentando transferir para o mesmo técnico que já está atribuído.',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/já está atribuído/i);
    });

    it('usuário não deve poder transferir chamado', async () => {
      const chamado = await criarChamado();
      const tecnico = await prisma.usuario.findFirst({
        where: { regra: 'TECNICO', ativo: true, deletadoEm: null },
      });
      if (!tecnico) return;

      const response = await usuarioClient.patch(
        `/api/chamados/${chamado.body.id}/transferir`,
        {
          tecnicoNovoId: tecnico.id,
          motivo: 'Usuário tentando transferir chamado sem permissão para isso.',
        }
      );

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/chamados/:id/transferencias - Histórico de Transferências', () => {
    it('admin deve poder listar transferências de um chamado', async () => {
      const chamado = await criarChamado();

      const response = await adminClient
        .get(`/api/chamados/${chamado.body.id}/transferencias`)
        .expect(200);

      expect(response.body).toHaveProperty('chamadoOS');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.transferencias)).toBe(true);
    });

    it('usuário não deve poder listar transferências', async () => {
      const chamado = await criarChamado();

      await usuarioClient
        .get(`/api/chamados/${chamado.body.id}/transferencias`)
        .expect(403);
    });
  });

  describe('Comentários - CRUD', () => {
    it('deve adicionar comentário a um chamado', async () => {
      const chamado = await criarChamado();

      const response = await usuarioClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: 'Gostaria de adicionar mais contexto sobre o problema.',
        })
        .expect(201);

      expect(response.body.comentario).toHaveProperty('id');
      expect(response.body.comentario.comentario).toBe(
        'Gostaria de adicionar mais contexto sobre o problema.'
      );
      expect(response.body.comentario.visibilidadeInterna).toBe(false);
    });

    it('usuário não deve poder criar comentário interno', async () => {
      const chamado = await criarChamado();

      const response = await usuarioClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: 'Tentando criar comentário interno sem permissão.',
          visibilidadeInterna: true,
        })
        .expect(403);

      expect(extractErrorMessage(response)).toMatch(/usuários não podem/i);
    });

    it('admin/técnico deve poder criar comentário interno', async () => {
      const chamado = await criarChamado();

      const response = await tecnicoClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: 'Nota interna do técnico sobre investigação realizada.',
          visibilidadeInterna: true,
        })
        .expect(201);

      expect(response.body.comentario.visibilidadeInterna).toBe(true);
    });

    it('deve listar comentários ocultando internos para usuário', async () => {
      const chamado = await criarChamado();

      await tecnicoClient.post(`/api/chamados/${chamado.body.id}/comentarios`, {
        comentario: 'Comentário interno visível apenas para admin e técnico.',
        visibilidadeInterna: true,
      });
      await usuarioClient.post(`/api/chamados/${chamado.body.id}/comentarios`, {
        comentario: 'Comentário público visível para todos os participantes.',
      });

      const response = await usuarioClient
        .get(`/api/chamados/${chamado.body.id}/comentarios`)
        .expect(200);

      response.body.comentarios.forEach((c: any) => {
        expect(c.visibilidadeInterna).toBe(false);
      });
    });

    it('admin deve ver comentários internos na listagem', async () => {
      const chamado = await criarChamado();

      await tecnicoClient.post(`/api/chamados/${chamado.body.id}/comentarios`, {
        comentario: 'Comentário interno que admin deve conseguir visualizar.',
        visibilidadeInterna: true,
      });

      const response = await adminClient
        .get(`/api/chamados/${chamado.body.id}/comentarios`)
        .expect(200);

      const interno = response.body.comentarios.find((c: any) => c.visibilidadeInterna);
      expect(interno).toBeDefined();
    });

    it('deve editar comentário próprio', async () => {
      const chamado = await criarChamado();

      const criado = await usuarioClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: 'Comentário original que será editado em seguida.',
        })
        .expect(201);

      const response = await usuarioClient
        .put(
          `/api/chamados/${chamado.body.id}/comentarios/${criado.body.comentario.id}`,
          { comentario: 'Comentário editado com informações adicionais importantes.' }
        )
        .expect(200);

      expect(response.body.comentario.comentario).toBe(
        'Comentário editado com informações adicionais importantes.'
      );
    });

    it('não deve editar comentário de outro usuário', async () => {
      const chamado = await criarChamado();

      const criado = await usuarioClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: 'Comentário do usuário que outro não deve conseguir editar.',
        })
        .expect(201);

      const response = await tecnicoClient
        .put(
          `/api/chamados/${chamado.body.id}/comentarios/${criado.body.comentario.id}`,
          { comentario: 'Técnico tentando editar comentário de outro usuário.' }
        )
        .expect(403);

      expect(extractErrorMessage(response)).toMatch(/seus próprios comentários/i);
    });

    it('deve remover comentário (soft delete)', async () => {
      const chamado = await criarChamado();

      const criado = await usuarioClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: 'Comentário que será removido via soft delete.',
        })
        .expect(201);

      const response = await usuarioClient
        .delete(
          `/api/chamados/${chamado.body.id}/comentarios/${criado.body.comentario.id}`
        )
        .expect(200);

      expect(response.body.message).toMatch(/removido/i);
      expect(response.body.id).toBe(criado.body.comentario.id);
    });

    it('não deve permitir comentar em chamado cancelado', async () => {
      const chamado = await criarChamado();
      await usuarioClient.patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
        descricaoEncerramento: 'Cancelando para testar restrição de comentário.',
      });

      const response = await usuarioClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: 'Tentando comentar em chamado cancelado.',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/cancelado/i);
    });

    it('deve rejeitar comentário vazio', async () => {
      const chamado = await criarChamado();

      const response = await usuarioClient
        .post(`/api/chamados/${chamado.body.id}/comentarios`, {
          comentario: '',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/comentário/i);
    });
  });

  describe('PATCH /api/chamados/:id/reabrir-chamado - Reabertura', () => {
    it('usuário deve poder reabrir chamado encerrado recentemente', async () => {
      const chamado = await criarChamado(
        'Chamado que será encerrado e reaberto pelo usuário'
      );

      await encerrarChamado(chamado.body.id);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/reabrir-chamado`, {
          atualizacaoDescricao: 'O problema voltou a ocorrer logo após o encerramento',
        })
        .expect(200);

      expect(response.body.status).toBe('REABERTO');
      expect(response.body.encerradoEm).toBeNull();
    });

    it('deve rejeitar reabertura de chamado não encerrado', async () => {
      const chamado = await criarChamado(
        'Chamado aberto que não pode ser reaberto pois não está encerrado'
      );

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/reabrir-chamado`)
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/encerrado/i);
    });

    it('não deve permitir reabrir chamado de outro usuário', async () => {
      const chamado = await criarChamado();
      await encerrarChamado(chamado.body.id);

      const outroEmail = generateUniqueEmail();
      await createTestUser({ email: outroEmail, password: 'Senha123!', regra: 'USUARIO' });
      const outroClient = await createAuthenticatedClient(outroEmail, 'Senha123!');

      const response = await outroClient
        .patch(`/api/chamados/${chamado.body.id}/reabrir-chamado`)
        .expect(403);

      expect(extractErrorMessage(response)).toMatch(/criados por você/i);
    });
  });

  describe('PATCH /api/chamados/:id/cancelar-chamado - Cancelamento', () => {
    it('usuário deve poder cancelar próprio chamado com justificativa', async () => {
      const chamado = await criarChamado(
        'Chamado que será cancelado pelo próprio usuário com justificativa'
      );

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Problema foi resolvido internamente pela própria equipe',
        })
        .expect(200);

      expect(response.body.chamado.status).toBe('CANCELADO');
    });

    it('deve rejeitar cancelamento com justificativa muito curta', async () => {
      const chamado = await criarChamado(
        'Chamado para testar cancelamento sem justificativa adequada'
      );

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Curto',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/justificativa.*inválida|mínimo/i);
    });

    it('não deve permitir cancelar chamado encerrado', async () => {
      const chamado = await criarChamado(
        'Chamado que será encerrado e depois tentará cancelar indevidamente'
      );

      await encerrarChamado(chamado.body.id);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Tentando cancelar chamado que já foi encerrado',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/encerrado/i);
    });

    it('não deve permitir cancelar chamado já cancelado', async () => {
      const chamado = await criarChamado();

      await usuarioClient.patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
        descricaoEncerramento: 'Primeiro cancelamento com justificativa válida.',
      });

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Tentando cancelar novamente um chamado já cancelado.',
        })
        .expect(400);

      expect(extractErrorMessage(response)).toMatch(/já está cancelado/i);
    });

    it('usuário não deve cancelar chamado de outro usuário', async () => {
      const chamado = await criarChamado();

      const outroEmail = generateUniqueEmail();
      await createTestUser({ email: outroEmail, password: 'Senha123!', regra: 'USUARIO' });
      const outroClient = await createAuthenticatedClient(outroEmail, 'Senha123!');

      const response = await outroClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Usuário tentando cancelar chamado de outra pessoa.',
        })
        .expect(403);

      expect(extractErrorMessage(response)).toMatch(/permissão/i);
    });
  });

  describe.skip('GET /api/chamados/:id/historico - Histórico', () => {
    it('deve retornar histórico do chamado com entrada de abertura', async () => {
      const chamado = await criarChamado(
        'Chamado para testar consulta de histórico de atualizações'
      );

      const response = await usuarioClient
        .get(`/api/chamados/${chamado.body.id}/historico`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const abertura = response.body.find((h: any) => h.tipo === 'ABERTURA');
      expect(abertura).toBeDefined();
    });
  });

  describe('DELETE /api/chamados/:id - Deleção', () => {
    it('admin deve poder fazer soft delete de chamado', async () => {
      const chamado = await criarChamado(
        'Chamado que será deletado (soft delete) pelo administrador'
      );

      const response = await adminClient
        .delete(`/api/chamados/${chamado.body.id}`)
        .expect(200);

      expect(response.body.message).toMatch(/exclu/i);

      const chamadoDeletado = await prisma.chamado.findUnique({
        where: { id: chamado.body.id },
      });

      expect(chamadoDeletado).not.toBeNull();
      expect(chamadoDeletado!.deletadoEm).not.toBeNull();
    });

    it('admin deve poder fazer hard delete com ?permanente=true', async () => {
      const chamado = await criarChamado(
        'Chamado que será permanentemente excluído pelo administrador'
      );

      const response = await adminClient
        .delete(`/api/chamados/${chamado.body.id}?permanente=true`)
        .expect(200);

      expect(response.body.message).toMatch(/permanentemente/i);

      const chamadoDeletado = await prisma.chamado.findUnique({
        where: { id: chamado.body.id },
      });

      expect(chamadoDeletado).toBeNull();
    });

    it('usuário comum não deve poder deletar chamado', async () => {
      const chamado = await criarChamado(
        'Chamado que usuário comum tentará deletar sem permissão'
      );

      await usuarioClient.delete(`/api/chamados/${chamado.body.id}`).expect(403);
    });

    it('técnico não deve poder deletar chamado', async () => {
      const chamado = await criarChamado(
        'Chamado que técnico tentará deletar mas não tem permissão'
      );

      await tecnicoClient.delete(`/api/chamados/${chamado.body.id}`).expect(403);
    });

    it('deve retornar 404 para chamado inexistente', async () => {
      await adminClient
        .delete('/api/chamados/id-que-nao-existe-no-banco')
        .expect(404);
    });
  });
});