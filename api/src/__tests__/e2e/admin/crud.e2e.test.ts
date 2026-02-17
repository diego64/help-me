import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../infrastructure/database/prisma/client';
import { createAuthenticatedClient, extractErrorMessage } from '../setup/test.helpers';

describe('E2E: Administradores', () => {
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

  describe('POST /api/admin - Criação', () => {
    it('admin deve poder criar outro admin com dados válidos', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/admin', {
          nome: 'Super',
          sobrenome: 'Admin',
          email: `super.admin.${timestamp}@teste.com`,
          password: 'Admin123!',
          setor: 'ADMINISTRACAO'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.nome).toBe('Super');
      expect(response.body.sobrenome).toBe('Admin');
      expect(response.body.email).toBe(`super.admin.${timestamp}@teste.com`);
      expect(response.body.regra).toBe('ADMIN');
      expect(response.body.setor).toBe('ADMINISTRACAO');
      expect(response.body.ativo).toBe(true);
      expect(response.body).not.toHaveProperty('password');
    });

    it('deve criar admin sem setor (campo opcional)', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/admin', {
          nome: 'Admin',
          sobrenome: 'Simples',
          email: `admin.simples.${timestamp}@teste.com`,
          password: 'Admin123!'
        });

      expect(response.status).toBe(201);
      expect(response.body.setor).toBeNull();
    });

    it('deve rejeitar criação sem autenticação', async () => {
      const response = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Teste',
          sobrenome: 'Admin',
          email: 'teste@teste.com',
          password: 'Admin123!'
        });

      expect(response.status).toBe(401);
    });

    it('técnico não deve poder criar admin', async () => {
      const timestamp = Date.now();
      const response = await tecnicoClient
        .post('/api/admin', {
          nome: 'Teste',
          sobrenome: 'Tecnico',
          email: `teste.tecnico.${timestamp}@teste.com`,
          password: 'Admin123!'
        });

      expect(response.status).toBe(403);
    });

    it('usuário comum não deve poder criar admin', async () => {
      const timestamp = Date.now();
      const response = await usuarioClient
        .post('/api/admin', {
          nome: 'Teste',
          sobrenome: 'Usuario',
          email: `teste.usuario.${timestamp}@teste.com`,
          password: 'Admin123!'
        });

      expect(response.status).toBe(403);
    });

    it('deve rejeitar criação sem nome', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/admin', {
          sobrenome: 'Silva',
          email: `sem.nome.${timestamp}@teste.com`,
          password: 'Admin123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/campos obrigatórios|nome/i);
    });

    it('deve rejeitar criação sem sobrenome', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/admin', {
          nome: 'João',
          email: `sem.sobrenome.${timestamp}@teste.com`,
          password: 'Admin123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/campos obrigatórios|sobrenome/i);
    });

    it('deve rejeitar criação sem email', async () => {
      const response = await adminClient
        .post('/api/admin', {
          nome: 'João',
          sobrenome: 'Silva',
          password: 'Admin123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/campos obrigatórios|email/i);
    });

    it('deve rejeitar criação com email inválido', async () => {
      const response = await adminClient
        .post('/api/admin', {
          nome: 'João',
          sobrenome: 'Silva',
          email: 'email-invalido',
          password: 'Admin123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/email.*inválido/i);
    });

    it('deve rejeitar criação com email duplicado', async () => {
      const email = `duplicado.${Date.now()}@teste.com`;

      await adminClient
        .post('/api/admin', {
          nome: 'Primeiro',
          sobrenome: 'Admin',
          email,
          password: 'Admin123!'
        })
        .expect(201);

      const response = await adminClient
        .post('/api/admin', {
          nome: 'Segundo',
          sobrenome: 'Admin',
          email,
          password: 'Admin123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/já cadastrado|email/i);
    });

    it('deve rejeitar criação sem password', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/admin', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `sem.password.${timestamp}@teste.com`
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/campos obrigatórios|password/i);
    });

    it('deve rejeitar criação com senha fraca', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/admin', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `senha.fraca.${timestamp}@teste.com`,
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/senha.*8/i);
    });

    it('deve reativar admin deletado ao criar com mesmo email', async () => {
      const email = `reativar.${Date.now()}@teste.com`;

      const admin = await adminClient.post('/api/admin', {
        nome: 'Admin',
        sobrenome: 'Deletado',
        email,
        password: 'Admin123!'
      });

      await adminClient.delete(`/api/admin/${admin.body.id}`);

      const response = await adminClient.post('/api/admin', {
        nome: 'Admin',
        sobrenome: 'Reativado',
        email,
        password: 'NovoAdmin123!'
      });

      expect(response.status).toBe(201);
      expect(response.body.message).toMatch(/reativado/i);
    });
  });

  describe('GET /api/admin - Listagem', () => {
    it('admin deve poder listar todos os administradores', async () => {
      const response = await adminClient
        .get('/api/admin');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('totalPages');
      expect(response.body).toHaveProperty('admins');
      expect(Array.isArray(response.body.admins)).toBe(true);
    });

    it('técnico NÃO deve poder listar administradores', async () => {
      const response = await tecnicoClient
        .get('/api/admin');

      expect(response.status).toBe(403);
    });

    it('usuário comum NÃO deve poder listar administradores', async () => {
      const response = await usuarioClient
        .get('/api/admin');

      expect(response.status).toBe(403);
    });

    it('não deve retornar senhas na listagem', async () => {
      const response = await adminClient
        .get('/api/admin');

      expect(response.status).toBe(200);
      
      response.body.admins.forEach((admin: any) => {
        expect(admin).not.toHaveProperty('password');
        expect(admin).not.toHaveProperty('refreshToken');
      });
    });

    it('deve retornar listagem paginada', async () => {
      const response = await adminClient
        .get('/api/admin?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(5);
    });

    it('deve permitir incluir inativos', async () => {
      const response = await adminClient
        .get('/api/admin?incluirInativos=true');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('admins');
    });
  });

  describe('GET /api/admin/:id - Busca Individual', () => {
    let adminId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/admin', {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: `admin.busca.${timestamp}@teste.com`,
        password: 'Admin123!'
      });
      adminId = response.body.id;
    });

    it('admin deve poder buscar outro admin por ID', async () => {
      const response = await adminClient
        .get(`/api/admin/${adminId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(adminId);
      expect(response.body).not.toHaveProperty('password');
    });

    it('técnico NÃO deve poder buscar admin', async () => {
      const response = await tecnicoClient
        .get(`/api/admin/${adminId}`);

      expect(response.status).toBe(403);
    });

    it('usuário comum NÃO deve poder buscar admin', async () => {
      const response = await usuarioClient
        .get(`/api/admin/${adminId}`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .get('/api/admin/id-inexistente-12345');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/admin/:id - Atualização', () => {
    let adminId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/admin', {
        nome: 'Admin',
        sobrenome: 'Original',
        email: `admin.update.${timestamp}@teste.com`,
        password: 'Admin123!'
      });
      adminId = response.body.id;
    });

    it('admin deve poder atualizar nome de outro admin', async () => {
      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          nome: 'Nome Atualizado'
        });

      expect(response.status).toBe(200);
      expect(response.body.nome).toBe('Nome Atualizado');
    });

    it('admin deve poder atualizar sobrenome', async () => {
      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          sobrenome: 'Sobrenome Atualizado'
        });

      expect(response.status).toBe(200);
      expect(response.body.sobrenome).toBe('Sobrenome Atualizado');
    });

    it('admin deve poder alterar setor', async () => {
      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          setor: 'FINANCEIRO'
        });

      expect(response.status).toBe(200);
      expect(response.body.setor).toBe('FINANCEIRO');
    });

    it('admin deve poder alterar senha de outro admin', async () => {
      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          password: 'NovaSenha123!'
        });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('password');
    });

    it('admin deve poder ativar/desativar outro admin', async () => {
      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          ativo: false
        });

      expect(response.status).toBe(200);
      expect(response.body.ativo).toBe(false);
    });

    it('técnico NÃO deve poder atualizar admin', async () => {
      const response = await tecnicoClient
        .put(`/api/admin/${adminId}`, {
          nome: 'Tentativa'
        });

      expect(response.status).toBe(403);
    });

    it('usuário comum NÃO deve poder atualizar admin', async () => {
      const response = await usuarioClient
        .put(`/api/admin/${adminId}`, {
          nome: 'Tentativa'
        });

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .put('/api/admin/id-inexistente', {
          nome: 'Teste'
        });

      expect(response.status).toBe(404);
    });

    it('deve rejeitar atualização com email inválido', async () => {
      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          email: 'email-invalido'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/email.*inválido/i);
    });

    it('deve rejeitar atualização de email duplicado', async () => {
      const timestamp = Date.now();
      
      await adminClient.post('/api/admin', {
        nome: 'Outro',
        sobrenome: 'Admin',
        email: `outro.${timestamp}@teste.com`,
        password: 'Admin123!'
      });

      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          email: `outro.${timestamp}@teste.com`
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/já cadastrado/i);
    });

    it('deve rejeitar senha fraca na atualização', async () => {
      const response = await adminClient
        .put(`/api/admin/${adminId}`, {
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/senha.*8/i);
    });
  });

  describe('DELETE /api/admin/:id - Deleção', () => {
    let adminId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/admin', {
        nome: 'Admin',
        sobrenome: 'Deletar',
        email: `admin.delete.${timestamp}@teste.com`,
        password: 'Admin123!'
      });
      adminId = response.body.id;
    });

    it('admin deve poder deletar (soft delete) outro admin', async () => {
      const response = await adminClient
        .delete(`/api/admin/${adminId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/desativado.*sucesso/i);

      const adminDeletado = await prisma.usuario.findUnique({
        where: { id: adminId }
      });

      expect(adminDeletado).not.toBeNull();
      expect(adminDeletado!.deletadoEm).not.toBeNull();
      expect(adminDeletado!.ativo).toBe(false);
    });

    it('admin NÃO deve poder deletar a própria conta', async () => {
      const perfil = await adminClient.get('/api/admin');
      const meuId = perfil.body.admins.find((a: any) => 
        a.email === (process.env.ADMIN_EMAIL || 'admin@helpme.com')
      )?.id;

      if (meuId) {
        const response = await adminClient
          .delete(`/api/admin/${meuId}`);

        expect(response.status).toBe(400);
        expect(extractErrorMessage(response)).toMatch(/não é possível deletar.*própria/i);
      }
    });

    it('admin deve poder deletar permanentemente', async () => {
      const response = await adminClient
        .delete(`/api/admin/${adminId}?permanente=true`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/excluído permanentemente/i);

      const adminDeletado = await prisma.usuario.findUnique({
        where: { id: adminId }
      });

      expect(adminDeletado).toBeNull();
    });

    it('técnico NÃO deve poder deletar admin', async () => {
      const response = await tecnicoClient
        .delete(`/api/admin/${adminId}`);

      expect(response.status).toBe(403);
    });

    it('usuário NÃO deve poder deletar admin', async () => {
      const response = await usuarioClient
        .delete(`/api/admin/${adminId}`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .delete('/api/admin/id-inexistente');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/admin/:id/reativar - Reativação', () => {
    let adminId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const admin = await adminClient.post('/api/admin', {
        nome: 'Admin',
        sobrenome: 'Reativar',
        email: `admin.reativar.${timestamp}@teste.com`,
        password: 'Admin123!'
      });
      adminId = admin.body.id;

      await adminClient.delete(`/api/admin/${adminId}`);
    });

    it('admin deve poder reativar admin deletado', async () => {
      const response = await adminClient
        .patch(`/api/admin/${adminId}/reativar`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/reativado.*sucesso/i);
      expect(response.body.admin.ativo).toBe(true);
    });

    it('deve rejeitar reativação de admin já ativo', async () => {
      await adminClient.patch(`/api/admin/${adminId}/reativar`);

      const response = await adminClient
        .patch(`/api/admin/${adminId}/reativar`);

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/já está ativo/i);
    });

    it('técnico NÃO deve poder reativar admin', async () => {
      const response = await tecnicoClient
        .patch(`/api/admin/${adminId}/reativar`);

      expect(response.status).toBe(403);
    });

    it('usuário NÃO deve poder reativar admin', async () => {
      const response = await usuarioClient
        .patch(`/api/admin/${adminId}/reativar`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .patch('/api/admin/id-inexistente/reativar');

      expect(response.status).toBe(404);
    });
  });
});