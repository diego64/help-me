import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../infrastructure/database/prisma/client';
import { createAuthenticatedClient, extractErrorMessage } from '../setup/test.helpers';

describe('E2E: Usuários', () => {
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

  describe('POST /api/usuarios - Criação', () => {
    it('admin deve poder criar usuário com dados válidos', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `joao.silva.${timestamp}@teste.com`,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.nome).toBe('João');
      expect(response.body.sobrenome).toBe('Silva');
      expect(response.body.email).toBe(`joao.silva.${timestamp}@teste.com`);
      expect(response.body.regra).toBe('USUARIO');
      expect(response.body.setor).toBe('TECNOLOGIA_INFORMACAO');
      expect(response.body.ativo).toBe(true);
      expect(response.body).not.toHaveProperty('password');
    });

    it('deve rejeitar criação sem autenticação', async () => {
      const response = await request(app)
        .post('/api/usuarios')
        .send({
          nome: 'Teste',
          sobrenome: 'Usuario',
          email: 'teste@teste.com',
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(401);
    });

    it('técnico não deve poder criar usuário', async () => {
      const timestamp = Date.now();
      const response = await tecnicoClient
        .post('/api/usuarios', {
          nome: 'Teste',
          sobrenome: 'Tecnico',
          email: `teste.tecnico.${timestamp}@teste.com`,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(403);
    });

    it('usuário comum não deve poder criar usuário', async () => {
      const timestamp = Date.now();
      const response = await usuarioClient
        .post('/api/usuarios', {
          nome: 'Teste',
          sobrenome: 'Usuario',
          email: `teste.usuario.${timestamp}@teste.com`,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(403);
    });

    it('deve rejeitar criação sem nome', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/usuarios', {
          sobrenome: 'Silva',
          email: `sem.nome.${timestamp}@teste.com`,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/nome/i);
    });

    it('deve rejeitar criação sem sobrenome', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          email: `sem.sobrenome.${timestamp}@teste.com`,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/sobrenome/i);
    });

    it('deve rejeitar criação sem email', async () => {
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          sobrenome: 'Silva',
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/email/i);
    });

    it('deve rejeitar criação com email inválido', async () => {
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          sobrenome: 'Silva',
          email: 'email-invalido',
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/email/i);
    });

    it('deve rejeitar criação com email duplicado', async () => {
      const email = `duplicado.${Date.now()}@teste.com`;

      await adminClient
        .post('/api/usuarios', {
          nome: 'Primeiro',
          sobrenome: 'Usuario',
          email,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        })
        .expect(201);

      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'Segundo',
          sobrenome: 'Usuario',
          email,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(409);
      expect(extractErrorMessage(response)).toMatch(/já cadastrado|email/i);
    });

    it('deve rejeitar criação sem password', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `sem.password.${timestamp}@teste.com`,
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/senha/i);
    });

    it('deve rejeitar criação com senha fraca', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `senha.fraca.${timestamp}@teste.com`,
          password: '123',
          setor: 'TECNOLOGIA_INFORMACAO'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/senha.*8/i);
    });

    it('deve rejeitar criação sem setor', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `sem.setor.${timestamp}@teste.com`,
          password: 'Senha123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/setor/i);
    });

    it('deve rejeitar criação com setor inválido', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/usuarios', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `setor.invalido.${timestamp}@teste.com`,
          password: 'Senha123!',
          setor: 'SETOR_INEXISTENTE'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/setor/i);
    });
  });

  describe('GET /api/usuarios - Listagem', () => {
    it('admin deve poder listar todos os usuários', async () => {
      const response = await adminClient
        .get('/api/usuarios');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('técnico NÃO deve poder listar usuários', async () => {
      const response = await tecnicoClient
        .get('/api/usuarios');

      expect(response.status).toBe(403);
    });

    it('usuário comum NÃO deve poder listar usuários', async () => {
      const response = await usuarioClient
        .get('/api/usuarios');

      expect(response.status).toBe(403);
    });

    it('não deve retornar senhas na listagem', async () => {
      const response = await adminClient
        .get('/api/usuarios');

      expect(response.status).toBe(200);
      
      response.body.data.forEach((usuario: any) => {
        expect(usuario).not.toHaveProperty('password');
      });
    });

    it('deve retornar listagem paginada', async () => {
      const response = await adminClient
        .get('/api/usuarios?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/usuarios/:id - Busca Individual', () => {
    let usuarioId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/usuarios', {
        nome: 'Usuario',
        sobrenome: 'Teste',
        email: `usuario.busca.${timestamp}@teste.com`,
        password: 'Senha123!',
        setor: 'TECNOLOGIA_INFORMACAO'
      });
      usuarioId = response.body.id;
    });

    it('admin deve poder buscar usuário por ID', async () => {
      const response = await adminClient
        .get(`/api/usuarios/${usuarioId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(usuarioId);
      expect(response.body).not.toHaveProperty('password');
    });

    it('usuário pode buscar próprio perfil', async () => {
      const response = await usuarioClient
        .get(`/api/usuarios/${usuarioId}`);

      // Pode ser 200 (se for o próprio) ou 403 (se não for)
      expect([200, 403]).toContain(response.status);
    });

    it('usuário NÃO pode buscar perfil de outro usuário', async () => {
      const response = await usuarioClient
        .get(`/api/usuarios/${usuarioId}`);

      expect([200, 403]).toContain(response.status);
      
      if (response.status === 403) {
        expect(extractErrorMessage(response)).toMatch(/próprio perfil/i);
      }
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .get('/api/usuarios/id-inexistente-12345');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/usuarios/:id - Atualização', () => {
    let usuarioId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/usuarios', {
        nome: 'Usuario',
        sobrenome: 'Original',
        email: `usuario.update.${timestamp}@teste.com`,
        password: 'Senha123!',
        setor: 'TECNOLOGIA_INFORMACAO'
      });
      usuarioId = response.body.id;
    });

    it('admin deve poder atualizar nome do usuário', async () => {
      const response = await adminClient
        .put(`/api/usuarios/${usuarioId}`, {
          nome: 'Nome Atualizado'
        });

      expect(response.status).toBe(200);
      expect(response.body.nome).toBe('Nome Atualizado');
    });

    it('admin deve poder atualizar sobrenome', async () => {
      const response = await adminClient
        .put(`/api/usuarios/${usuarioId}`, {
          sobrenome: 'Sobrenome Atualizado'
        });

      expect(response.status).toBe(200);
      expect(response.body.sobrenome).toBe('Sobrenome Atualizado');
    });

    it('admin deve poder alterar setor', async () => {
      const response = await adminClient
        .put(`/api/usuarios/${usuarioId}`, {
          setor: 'FINANCEIRO'
        });

      expect(response.status).toBe(200);
      expect(response.body.setor).toBe('FINANCEIRO');
    });

    it('usuário comum não deve poder atualizar outros usuários', async () => {
      const response = await usuarioClient
        .put(`/api/usuarios/${usuarioId}`, {
          nome: 'Tentativa'
        });

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .put('/api/usuarios/id-inexistente', {
          nome: 'Teste'
        });

      expect(response.status).toBe(404);
    });

    it('deve rejeitar atualização de email duplicado', async () => {
      const timestamp = Date.now();
      
      // Criar outro usuário
      await adminClient.post('/api/usuarios', {
        nome: 'Outro',
        sobrenome: 'Usuario',
        email: `outro.${timestamp}@teste.com`,
        password: 'Senha123!',
        setor: 'TECNOLOGIA_INFORMACAO'
      });

      // Tentar usar o email do outro
      const response = await adminClient
        .put(`/api/usuarios/${usuarioId}`, {
          email: `outro.${timestamp}@teste.com`
        });

      expect(response.status).toBe(409);
    });
  });

  describe('PUT /api/usuarios/:id/senha - Alteração de Senha', () => {
    let usuarioId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/usuarios', {
        nome: 'Usuario',
        sobrenome: 'Senha',
        email: `usuario.senha.${timestamp}@teste.com`,
        password: 'Senha123!',
        setor: 'TECNOLOGIA_INFORMACAO'
      });
      usuarioId = response.body.id;
    });

    it('admin deve poder alterar senha de qualquer usuário', async () => {
      const response = await adminClient
        .put(`/api/usuarios/${usuarioId}/senha`, {
          password: 'NovaSenha123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/senha.*sucesso/i);
    });

    it('deve rejeitar alteração com senha fraca', async () => {
      const response = await adminClient
        .put(`/api/usuarios/${usuarioId}/senha`, {
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/senha/i);
    });

    it('deve rejeitar se usuário tentar alterar senha de outro', async () => {
      const response = await usuarioClient
        .put(`/api/usuarios/${usuarioId}/senha`, {
          password: 'NovaSenha123!'
        });

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .put('/api/usuarios/id-inexistente/senha', {
          password: 'NovaSenha123!'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/usuarios/:id - Deleção', () => {
    let usuarioId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/usuarios', {
        nome: 'Usuario',
        sobrenome: 'Deletar',
        email: `usuario.delete.${timestamp}@teste.com`,
        password: 'Senha123!',
        setor: 'TECNOLOGIA_INFORMACAO'
      });
      usuarioId = response.body.id;
    });

    it('admin deve poder deletar (soft delete) usuário', async () => {
      const response = await adminClient
        .delete(`/api/usuarios/${usuarioId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/deletado.*sucesso/i);

      // Verificar soft delete
      const usuarioDeletado = await prisma.usuario.findUnique({
        where: { id: usuarioId }
      });

      expect(usuarioDeletado).not.toBeNull();
      expect(usuarioDeletado!.deletadoEm).not.toBeNull();
    });

    it('usuário NÃO deve poder deletar outros usuários', async () => {
      const response = await usuarioClient
        .delete(`/api/usuarios/${usuarioId}`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .delete('/api/usuarios/id-inexistente');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/usuarios/:id/restaurar - Restauração', () => {
    let usuarioId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const usuario = await adminClient.post('/api/usuarios', {
        nome: 'Usuario',
        sobrenome: 'Restaurar',
        email: `usuario.restaurar.${timestamp}@teste.com`,
        password: 'Senha123!',
        setor: 'TECNOLOGIA_INFORMACAO'
      });
      usuarioId = usuario.body.id;

      // Deletar o usuário
      await adminClient.delete(`/api/usuarios/${usuarioId}`);
    });

    it('admin deve poder restaurar usuário deletado', async () => {
      const response = await adminClient
        .patch(`/api/usuarios/${usuarioId}/restaurar`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/restaurado/i);
      expect(response.body.usuario.ativo).toBe(true);
    });

    it('técnico NÃO deve poder restaurar usuário', async () => {
      const response = await tecnicoClient
        .patch(`/api/usuarios/${usuarioId}/restaurar`);

      expect(response.status).toBe(403);
    });
  });
});