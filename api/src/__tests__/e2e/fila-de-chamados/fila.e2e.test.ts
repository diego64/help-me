import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '@infrastructure/database/prisma/client';
import { createAuthenticatedClient, extractErrorMessage } from '../setup/test.helpers';

describe('E2E: Fila de Chamados', () => {
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

  describe('GET /api/fila-chamados/meus-chamados - Chamados do Usuário', () => {
    it('usuário deve poder listar seus próprios chamados', async () => {
      // Criar chamado para ter pelo menos um
      await usuarioClient.post('/api/chamados/abertura-chamado', {
        descricao: 'Chamado para testar listagem de meus chamados',
        servico: servicoNome
      });

      const response = await usuarioClient
        .get('/api/fila-chamados/meus-chamados');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('deve retornar apenas os chamados do próprio usuário', async () => {
      const response = await usuarioClient
        .get('/api/fila-chamados/meus-chamados');

      expect(response.status).toBe(200);

      response.body.data.forEach((chamado: any) => {
        expect(chamado.usuario).toBeDefined();
        expect(chamado.usuario.email).toBe(
          process.env.USER_EMAIL || 'user@helpme.com'
        );
      });
    });

    it('deve retornar estrutura completa do chamado', async () => {
      await usuarioClient.post('/api/chamados/abertura-chamado', {
        descricao: 'Chamado para testar estrutura de dados da listagem',
        servico: servicoNome
      });

      const response = await usuarioClient
        .get('/api/fila-chamados/meus-chamados');

      expect(response.status).toBe(200);

      const chamado = response.body.data[0];
      expect(chamado).toHaveProperty('id');
      expect(chamado).toHaveProperty('OS');
      expect(chamado).toHaveProperty('descricao');
      expect(chamado).toHaveProperty('status');
      expect(chamado).toHaveProperty('geradoEm');
      expect(chamado).toHaveProperty('usuario');
      expect(chamado).toHaveProperty('servicos');
    });

    it('deve suportar paginação', async () => {
      const response = await usuarioClient
        .get('/api/fila-chamados/meus-chamados?page=1&limit=2');

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('deve filtrar por status', async () => {
      const response = await usuarioClient
        .get('/api/fila-chamados/meus-chamados?status=ABERTO');

      expect(response.status).toBe(200);

      response.body.data.forEach((chamado: any) => {
        expect(chamado.status).toBe('ABERTO');
      });
    });

    it('técnico NÃO deve poder acessar meus-chamados', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/meus-chamados');

      expect(response.status).toBe(403);
    });

    it('admin NÃO deve poder acessar meus-chamados', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/meus-chamados');

      expect(response.status).toBe(403);
    });

    it('deve rejeitar sem autenticação', async () => {
      const response = await request(app)
        .get('/api/fila-chamados/meus-chamados');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/fila-chamados/chamados-atribuidos - Chamados do Técnico', () => {
    it('técnico deve poder listar chamados atribuídos', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/chamados-atribuidos');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve retornar apenas chamados EM_ATENDIMENTO ou REABERTO', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/chamados-atribuidos');

      expect(response.status).toBe(200);

      response.body.data.forEach((chamado: any) => {
        expect(['EM_ATENDIMENTO', 'REABERTO']).toContain(chamado.status);
      });
    });

    it('deve suportar paginação', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/chamados-atribuidos?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('deve suportar filtro por prioridade recentes', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/chamados-atribuidos?prioridade=recentes');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve suportar filtro por prioridade antigos', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/chamados-atribuidos?prioridade=antigos');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve suportar filtro por prioridade reabertos', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/chamados-atribuidos?prioridade=reabertos');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('usuário NÃO deve poder acessar chamados-atribuidos', async () => {
      const response = await usuarioClient
        .get('/api/fila-chamados/chamados-atribuidos');

      expect(response.status).toBe(403);
    });

    it('admin NÃO deve poder acessar chamados-atribuidos', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/chamados-atribuidos');

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/fila-chamados/todos-chamados - Todos os Chamados (Admin)', () => {
    it('admin deve poder listar todos os chamados', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/todos-chamados');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve suportar paginação', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/todos-chamados?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it('deve filtrar por status ABERTO', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/todos-chamados?status=ABERTO');

      expect(response.status).toBe(200);

      response.body.data.forEach((chamado: any) => {
        expect(chamado.status).toBe('ABERTO');
      });
    });

    it('deve filtrar por status ENCERRADO', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/todos-chamados?status=ENCERRADO');

      expect(response.status).toBe(200);

      response.body.data.forEach((chamado: any) => {
        expect(chamado.status).toBe('ENCERRADO');
      });
    });

    it('deve rejeitar status inválido', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/todos-chamados?status=STATUS_INVALIDO');

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/status.*inválido/i);
      expect(response.body).toHaveProperty('statusValidos');
    });

    it('deve filtrar por data início', async () => {
      const hoje = new Date().toISOString().split('T')[0];
      const response = await adminClient
        .get(`/api/fila-chamados/todos-chamados?dataInicio=${hoje}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve filtrar por intervalo de datas', async () => {
      const hoje = new Date().toISOString().split('T')[0];
      const response = await adminClient
        .get(`/api/fila-chamados/todos-chamados?dataInicio=${hoje}&dataFim=${hoje}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve filtrar por busca (OS ou descrição)', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/todos-chamados?busca=INC');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve incluir chamados deletados com incluirInativos=true', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/todos-chamados?incluirInativos=true');

      expect(response.status).toBe(200);
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(0);
    });

    it('técnico NÃO deve poder acessar todos-chamados', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/todos-chamados');

      expect(response.status).toBe(403);
    });

    it('usuário NÃO deve poder acessar todos-chamados', async () => {
      const response = await usuarioClient
        .get('/api/fila-chamados/todos-chamados');

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/fila-chamados/estatisticas - Estatísticas', () => {
    it('admin deve poder ver estatísticas', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/estatisticas');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('porStatus');
      expect(response.body).toHaveProperty('pendentes');
      expect(response.body).toHaveProperty('semTecnico');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('deve retornar contadores por status', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/estatisticas');

      expect(response.status).toBe(200);
      expect(response.body.porStatus).toHaveProperty('abertos');
      expect(response.body.porStatus).toHaveProperty('emAtendimento');
      expect(response.body.porStatus).toHaveProperty('encerrados');
      expect(response.body.porStatus).toHaveProperty('cancelados');
      expect(response.body.porStatus).toHaveProperty('reabertos');
    });

    it('pendentes deve ser soma de abertos e reabertos', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/estatisticas');

      expect(response.status).toBe(200);

      const { abertos, reabertos } = response.body.porStatus;
      expect(response.body.pendentes).toBe(abertos + reabertos);
    });

    it('total deve ser número não negativo', async () => {
      const response = await adminClient
        .get('/api/fila-chamados/estatisticas');

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThanOrEqual(0);
    });

    it('técnico NÃO deve poder ver estatísticas', async () => {
      const response = await tecnicoClient
        .get('/api/fila-chamados/estatisticas');

      expect(response.status).toBe(403);
    });

    it('usuário NÃO deve poder ver estatísticas', async () => {
      const response = await usuarioClient
        .get('/api/fila-chamados/estatisticas');

      expect(response.status).toBe(403);
    });
  });
});