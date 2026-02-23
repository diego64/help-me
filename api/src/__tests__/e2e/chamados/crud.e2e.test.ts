import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../infrastructure/database/prisma/client';
import { createAuthenticatedClient, generateUniqueEmail, extractErrorMessage } from '../setup/test.helpers';
import { createTestUser } from '../setup/test.database';

describe('E2E: Chamados', () => {
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let tecnicoClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let usuarioClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let servicoNome: string;

  beforeEach(async () => {
    // Cria clients APÓS a limpeza do banco (que acontece no test-environment)
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

    // Busca serviço disponível
    const servico = await prisma.servico.findFirst();
    servicoNome = servico!.nome;
  });

  describe('POST /api/chamados/abertura-chamado - Criação', () => {
    it('deve criar um chamado com descrição e serviço válidos', async () => {
      const response = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Computador não está ligando após atualização do Windows. Já tentei reiniciar várias vezes.',
          servico: servicoNome
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('OS');
      expect(response.body.OS).toMatch(/^INC\d{4}$/);
      expect(response.body.status).toBe('ABERTO');
    });

    it('deve criar chamado com array de serviços', async () => {
      const servicos = await prisma.servico.findMany({ take: 2 });
      
      const response = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Problema com múltiplos sistemas que precisam de atenção urgente.',
          servico: servicos.map(s => s.nome)
        })
        .expect(201);

      expect(response.body.servicos).toHaveLength(2);
    });

    it('deve rejeitar criação sem autenticação', async () => {
      const response = await request(app)
        .post('/api/chamados/abertura-chamado')
        .send({
          descricao: 'Teste sem autenticação - descrição válida para passar validação',
          servico: servicoNome
        });

      expect(response.status).toBe(401);
    });

    it('deve rejeitar descrição muito curta (menos de 10 caracteres)', async () => {
      const response = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Curto',
          servico: servicoNome
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/mínimo.*10 caracteres/i);
    });

    it('deve rejeitar criação sem serviço', async () => {
      const response = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Teste sem serviço mas com descrição válida para passar validação'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/serviço/i);
    });

    it('deve rejeitar criação com serviço inexistente', async () => {
      const response = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Teste com serviço inválido mas descrição longa suficiente',
          servico: 'Serviço Inexistente que não existe no banco de dados'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/não encontrado|inativo/i);
    });

    it('deve gerar números de OS únicos e sequenciais', async () => {
      const response1 = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Primeiro chamado para testar sequência de OS',
          servico: servicoNome
        })
        .expect(201);

      const response2 = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Segundo chamado para testar sequência de OS',
          servico: servicoNome
        })
        .expect(201);

      expect(response1.body.OS).not.toBe(response2.body.OS);
      expect(response1.body.OS).toMatch(/^INC\d{4}$/);
      expect(response2.body.OS).toMatch(/^INC\d{4}$/);
    });
  });

  describe('PATCH /api/chamados/:id/status - Atualização de Status', () => {
    it('técnico deve poder assumir chamado (EM_ATENDIMENTO)', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado para técnico assumir e iniciar atendimento',
          servico: servicoNome
        })
        .expect(201);

      const response = await tecnicoClient
        .patch(`/api/chamados/${chamado.body.id}/status`, {
          status: 'EM_ATENDIMENTO'
        });

      if (response.status === 200) {
        expect(response.body.status).toBe('EM_ATENDIMENTO');
        expect(response.body.tecnico).toBeDefined();
      } else {
        expect(response.status).toBe(403);
        expect(extractErrorMessage(response)).toMatch(/expediente|horário/i);
      }
    });

    it('técnico deve poder encerrar chamado com descrição', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado para ser encerrado pelo técnico após resolução',
          servico: servicoNome
        })
        .expect(201);

      const response = await tecnicoClient
        .patch(`/api/chamados/${chamado.body.id}/status`, {
          status: 'ENCERRADO',
          descricaoEncerramento: 'Problema resolvido. Foi necessário reinstalar o driver de rede.'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ENCERRADO');
      expect(response.body.descricaoEncerramento).toBeDefined();
      expect(response.body.encerradoEm).toBeDefined();
    });

    it('deve rejeitar encerramento sem descrição', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado para testar validação de encerramento sem descrição',
          servico: servicoNome
        })
        .expect(201);

      const response = await tecnicoClient
        .patch(`/api/chamados/${chamado.body.id}/status`, {
          status: 'ENCERRADO'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/descrição/i);
    });

    it('técnico não deve poder cancelar chamado', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado para testar que técnico não pode cancelar diretamente',
          servico: servicoNome
        })
        .expect(201);

      const response = await tecnicoClient
        .patch(`/api/chamados/${chamado.body.id}/status`, {
          status: 'CANCELADO',
          descricaoEncerramento: 'Tentando cancelar como técnico mas não deveria conseguir'
        });

      expect(response.status).toBe(403);
      expect(extractErrorMessage(response)).toMatch(/técnico.*não.*cancelar/i);
    });

    it('usuário comum não deve poder alterar status', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado para testar que usuário comum não altera status',
          servico: servicoNome
        })
        .expect(201);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/status`, {
          status: 'EM_ATENDIMENTO'
        });

      expect(response.status).toBe(403);
    });
  });

  describe.skip('GET /api/chamados/:id/historico - Histórico', () => {
    // TODO: Corrigir integração MongoDB nos testes E2E
    it('deve retornar histórico do chamado', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado para testar consulta de histórico de atualizações',
          servico: servicoNome
        })
        .expect(201);

      const response = await usuarioClient.get(`/api/chamados/${chamado.body.id}/historico`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      const abertura = response.body.find((h: any) => h.tipo === 'ABERTURA');
      expect(abertura).toBeDefined();
    });
  });

  describe('PATCH /api/chamados/:id/reabrir-chamado - Reabertura', () => {
    it('usuário deve poder reabrir chamado encerrado recentemente', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado que será encerrado e reaberto pelo usuário',
          servico: servicoNome
        })
        .expect(201);

      await tecnicoClient
        .patch(`/api/chamados/${chamado.body.id}/status`, {
          status: 'ENCERRADO',
          descricaoEncerramento: 'Problema foi resolvido inicialmente mas precisará reabrir'
        })
        .expect(200);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/reabrir-chamado`, {
          atualizacaoDescricao: 'O problema voltou a ocorrer logo após o encerramento'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('REABERTO');
      expect(response.body.encerradoEm).toBeNull();
    });

    it.skip('deve rejeitar reabertura de chamado não encerrado', async () => {
      // TODO: Este teste depende do histórico no MongoDB
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado aberto que não pode ser reaberto pois não está encerrado',
          servico: servicoNome
        })
        .expect(201);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/reabrir-chamado`);

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/encerrado/i);
    });
  });

  describe('PATCH /api/chamados/:id/cancelar-chamado - Cancelamento', () => {
    it('usuário deve poder cancelar próprio chamado com justificativa', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado que será cancelado pelo próprio usuário com justificativa',
          servico: servicoNome
        })
        .expect(201);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Problema foi resolvido internamente pela própria equipe'
        });

      expect(response.status).toBe(200);
      expect(response.body.chamado.status).toBe('CANCELADO');
    });

    it('deve rejeitar cancelamento sem justificativa', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado para testar cancelamento sem justificativa adequada',
          servico: servicoNome
        })
        .expect(201);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Curto'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/justificativa.*inválida|mínimo/i);
    });

    it('não deve permitir cancelar chamado encerrado', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado que será encerrado e depois tentará cancelar indevidamente',
          servico: servicoNome
        })
        .expect(201);

      await tecnicoClient
        .patch(`/api/chamados/${chamado.body.id}/status`, {
          status: 'ENCERRADO',
          descricaoEncerramento: 'Chamado foi encerrado normalmente pelo técnico responsável'
        })
        .expect(200);

      const response = await usuarioClient
        .patch(`/api/chamados/${chamado.body.id}/cancelar-chamado`, {
          descricaoEncerramento: 'Tentando cancelar chamado que já foi encerrado'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/encerrado/i);
    });
  });

  describe('DELETE /api/chamados/:id - Deleção', () => {
    it('admin deve poder deletar (soft delete) chamado', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado que será deletado (soft delete) pelo administrador',
          servico: servicoNome
        })
        .expect(201);

      const response = await adminClient
        .delete(`/api/chamados/${chamado.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/excluido/i);

      const chamadoDeletado = await prisma.chamado.findUnique({
        where: { id: chamado.body.id }
      });

      expect(chamadoDeletado).not.toBeNull();
      expect(chamadoDeletado!.deletadoEm).not.toBeNull();
    });

    it('usuário comum não deve poder deletar chamado', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado que usuário comum tentará deletar sem permissão',
          servico: servicoNome
        })
        .expect(201);

      const response = await usuarioClient
        .delete(`/api/chamados/${chamado.body.id}`);

      expect(response.status).toBe(403);
    });

    it('técnico não deve poder deletar chamado', async () => {
      const chamado = await usuarioClient
        .post('/api/chamados/abertura-chamado', {
          descricao: 'Chamado que técnico tentará deletar mas não tem permissão',
          servico: servicoNome
        })
        .expect(201);

      const response = await tecnicoClient
        .delete(`/api/chamados/${chamado.body.id}`);

      expect(response.status).toBe(403);
    });
  });
});