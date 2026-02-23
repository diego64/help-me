import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '@infrastructure/database/prisma/client';
import { createAuthenticatedClient, extractErrorMessage } from '../setup/test.helpers';

describe('E2E: Serviços', () => {
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let tecnicoClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;
  let usuarioClient: Awaited<ReturnType<typeof createAuthenticatedClient>>;

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
  });

  describe('POST /api/servicos - Criação', () => {
    it('admin deve poder criar serviço com nome e descrição válidos', async () => {
      const response = await adminClient
        .post('/api/servicos', {
          nome: 'Suporte de Rede',
          descricao: 'Serviço de suporte para problemas relacionados à infraestrutura de rede'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.nome).toBe('Suporte de Rede');
      expect(response.body.ativo).toBe(true);
    });

    it('admin deve poder criar serviço sem descrição', async () => {
      const response = await adminClient
        .post('/api/servicos', {
          nome: 'Serviço Simples'
        });

      expect(response.status).toBe(201);
      expect(response.body.nome).toBe('Serviço Simples');
    });

    it('deve rejeitar criação sem autenticação', async () => {
      const response = await request(app)
        .post('/api/servicos')
        .send({
          nome: 'Serviço Teste'
        });

      expect(response.status).toBe(401);
    });

    it('técnico não deve poder criar serviço', async () => {
      const response = await tecnicoClient
        .post('/api/servicos', {
          nome: 'Serviço do Técnico',
          descricao: 'Técnico tentando criar serviço sem permissão'
        });

      expect(response.status).toBe(403);
    });

    it('usuário comum não deve poder criar serviço', async () => {
      const response = await usuarioClient
        .post('/api/servicos', {
          nome: 'Serviço do Usuário',
          descricao: 'Usuário tentando criar serviço sem permissão'
        });

      expect(response.status).toBe(403);
    });

    it('deve rejeitar criação sem nome', async () => {
      const response = await adminClient
        .post('/api/servicos', {
          descricao: 'Serviço sem nome definido'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/nome/i);
    });

    it('deve rejeitar criação com nome vazio', async () => {
      const response = await adminClient
        .post('/api/servicos', {
          nome: '',
          descricao: 'Nome está vazio'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/nome/i);
    });

    it('deve rejeitar criação com nome duplicado', async () => {
      const nomeServico = 'Serviço Único Duplicado';

      await adminClient
        .post('/api/servicos', {
          nome: nomeServico,
          descricao: 'Primeiro serviço criado'
        })
        .expect(201);

      const response = await adminClient
        .post('/api/servicos', {
          nome: nomeServico,
          descricao: 'Tentando criar duplicado'
        });

      expect([400, 409]).toContain(response.status);
      expect(extractErrorMessage(response)).toMatch(/já existe|duplicado/i);
    });

    it('deve aceitar nome com acentuação e caracteres especiais', async () => {
      const response = await adminClient
        .post('/api/servicos', {
          nome: 'Manutenção & Reparos - TI',
          descricao: 'Serviço com caracteres especiais no nome'
        });

      expect(response.status).toBe(201);
      expect(response.body.nome).toBe('Manutenção & Reparos - TI');
    });
  });

  describe('GET /api/servicos - Listagem', () => {
    beforeEach(async () => {
      await adminClient.post('/api/servicos', {
        nome: 'Serviço Ativo 1',
        descricao: 'Primeiro serviço ativo'
      });

      await adminClient.post('/api/servicos', {
        nome: 'Serviço Ativo 2',
        descricao: 'Segundo serviço ativo'
      });
    });

    it('deve listar serviços (autenticado)', async () => {
      const response = await usuarioClient
        .get('/api/servicos');

      expect(response.status).toBe(200);
      
      // API pode retornar array ou objeto com paginação
      const servicos = Array.isArray(response.body) 
        ? response.body 
        : response.body.servicos || response.body.data;
      
      expect(Array.isArray(servicos)).toBe(true);
      expect(servicos.length).toBeGreaterThanOrEqual(2);
    });

    it('deve incluir informações completas do serviço', async () => {
      const response = await usuarioClient
        .get('/api/servicos');

      expect(response.status).toBe(200);
      
      const servicos = Array.isArray(response.body) 
        ? response.body 
        : response.body.servicos || response.body.data;
      
      const servico = servicos[0];
      expect(servico).toHaveProperty('id');
      expect(servico).toHaveProperty('nome');
      expect(servico).toHaveProperty('ativo');
    });
  });

  describe('GET /api/servicos/:id - Busca Individual', () => {
    let servicoId: string;

    beforeEach(async () => {
      const response = await adminClient.post('/api/servicos', {
        nome: 'Serviço para Busca',
        descricao: 'Serviço criado para teste de busca individual'
      });
      servicoId = response.body.id;
    });

    it('deve retornar serviço por ID', async () => {
      const response = await usuarioClient
        .get(`/api/servicos/${servicoId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(servicoId);
      expect(response.body.nome).toBe('Serviço para Busca');
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await usuarioClient
        .get('/api/servicos/id-inexistente-12345');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/servicos/:id - Atualização', () => {
    let servicoId: string;

    beforeEach(async () => {
      const response = await adminClient.post('/api/servicos', {
        nome: 'Serviço Original',
        descricao: 'Descrição original do serviço'
      });
      servicoId = response.body.id;
    });

    it('admin deve poder atualizar nome do serviço', async () => {
      const response = await adminClient
        .put(`/api/servicos/${servicoId}`, {
          nome: 'Serviço Atualizado',
          descricao: 'Descrição original do serviço'
        });

      expect(response.status).toBe(200);
      expect(response.body.nome).toBe('Serviço Atualizado');
    });

    it('admin deve poder atualizar descrição do serviço', async () => {
      const response = await adminClient
        .put(`/api/servicos/${servicoId}`, {
          nome: 'Serviço Original',
          descricao: 'Nova descrição atualizada'
        });

      expect(response.status).toBe(200);
      expect(response.body.descricao).toBe('Nova descrição atualizada');
    });

    it('técnico não deve poder atualizar serviço', async () => {
      const response = await tecnicoClient
        .put(`/api/servicos/${servicoId}`, {
          nome: 'Tentativa de Atualização'
        });

      expect(response.status).toBe(403);
    });

    it('usuário comum não deve poder atualizar serviço', async () => {
      const response = await usuarioClient
        .put(`/api/servicos/${servicoId}`, {
          nome: 'Tentativa de Atualização'
        });

      expect(response.status).toBe(403);
    });

    it('deve rejeitar atualização com nome duplicado', async () => {
      await adminClient.post('/api/servicos', {
        nome: 'Outro Serviço Existente'
      });

      const response = await adminClient
        .put(`/api/servicos/${servicoId}`, {
          nome: 'Outro Serviço Existente'
        });

      expect([400, 409]).toContain(response.status);
      expect(extractErrorMessage(response)).toMatch(/já existe|duplicado/i);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .put('/api/servicos/id-inexistente-12345', {
          nome: 'Nome Qualquer'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/servicos/:id - Deleção', () => {
    let servicoId: string;

    beforeEach(async () => {
      const response = await adminClient.post('/api/servicos', {
        nome: 'Serviço para Deletar',
        descricao: 'Este serviço será deletado (soft delete)'
      });
      servicoId = response.body.id;
    });

    it('admin deve poder deletar (soft delete) serviço', async () => {
      const response = await adminClient
        .delete(`/api/servicos/${servicoId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/excluído|deletado/i);

      // Verificar soft delete no banco
      const servicoDeletado = await prisma.servico.findUnique({
        where: { id: servicoId }
      });

      expect(servicoDeletado).not.toBeNull();
      expect(servicoDeletado!.deletadoEm).not.toBeNull();
    });

    it('técnico não deve poder deletar serviço', async () => {
      const response = await tecnicoClient
        .delete(`/api/servicos/${servicoId}`);

      expect(response.status).toBe(403);
    });

    it('usuário comum não deve poder deletar serviço', async () => {
      const response = await usuarioClient
        .delete(`/api/servicos/${servicoId}`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .delete('/api/servicos/id-inexistente-12345');

      expect(response.status).toBe(404);
    });
  });
});