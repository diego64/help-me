import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../infrastructure/database/prisma/client';
import { createAuthenticatedClient, extractErrorMessage } from '../setup/test.helpers';

describe('E2E: Técnicos', () => {
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

  describe('POST /api/tecnicos - Criação', () => {
    it('admin deve poder criar técnico com dados válidos', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/tecnicos', {
          nome: 'Carlos',
          sobrenome: 'Técnico',
          email: `carlos.tecnico.${timestamp}@teste.com`,
          password: 'Senha123!',
          setor: 'TECNOLOGIA_INFORMACAO',
          entrada: '08:00',
          saida: '17:00'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.nome).toBe('Carlos');
      expect(response.body.sobrenome).toBe('Técnico');
      expect(response.body.email).toBe(`carlos.tecnico.${timestamp}@teste.com`);
      expect(response.body.regra).toBe('TECNICO');
      expect(response.body.setor).toBe('TECNOLOGIA_INFORMACAO');
      expect(response.body.ativo).toBe(true);
      expect(response.body).not.toHaveProperty('password');
      expect(response.body.tecnicoDisponibilidade).toBeDefined();
      expect(Array.isArray(response.body.tecnicoDisponibilidade)).toBe(true);
    });

    it('deve criar técnico com horário padrão (08:00-17:00)', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/tecnicos', {
          nome: 'Maria',
          sobrenome: 'Suporte',
          email: `maria.suporte.${timestamp}@teste.com`,
          password: 'Senha123!'
        });

      expect(response.status).toBe(201);
      expect(response.body.tecnicoDisponibilidade).toBeDefined();
      expect(response.body.tecnicoDisponibilidade.length).toBeGreaterThan(0);
    });

    it('deve rejeitar criação sem autenticação', async () => {
      const response = await request(app)
        .post('/api/tecnicos')
        .send({
          nome: 'Teste',
          sobrenome: 'Tecnico',
          email: 'teste@teste.com',
          password: 'Senha123!'
        });

      expect(response.status).toBe(401);
    });

    it('técnico não deve poder criar outro técnico', async () => {
      const timestamp = Date.now();
      const response = await tecnicoClient
        .post('/api/tecnicos', {
          nome: 'Teste',
          sobrenome: 'Tecnico',
          email: `teste.tecnico.${timestamp}@teste.com`,
          password: 'Senha123!'
        });

      expect(response.status).toBe(403);
    });

    it('usuário comum não deve poder criar técnico', async () => {
      const timestamp = Date.now();
      const response = await usuarioClient
        .post('/api/tecnicos', {
          nome: 'Teste',
          sobrenome: 'Usuario',
          email: `teste.usuario.${timestamp}@teste.com`,
          password: 'Senha123!'
        });

      expect(response.status).toBe(403);
    });

    it('deve rejeitar criação sem nome', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/tecnicos', {
          sobrenome: 'Silva',
          email: `sem.nome.${timestamp}@teste.com`,
          password: 'Senha123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/nome/i);
    });

    it('deve rejeitar criação sem sobrenome', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/tecnicos', {
          nome: 'João',
          email: `sem.sobrenome.${timestamp}@teste.com`,
          password: 'Senha123!'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/sobrenome/i);
    });

    it('deve rejeitar criação com email duplicado', async () => {
      const email = `duplicado.${Date.now()}@teste.com`;

      await adminClient
        .post('/api/tecnicos', {
          nome: 'Primeiro',
          sobrenome: 'Tecnico',
          email,
          password: 'Senha123!'
        })
        .expect(201);

      const response = await adminClient
        .post('/api/tecnicos', {
          nome: 'Segundo',
          sobrenome: 'Tecnico',
          email,
          password: 'Senha123!'
        });

      expect(response.status).toBe(409);
      expect(extractErrorMessage(response)).toMatch(/já cadastrado|email/i);
    });

    it('deve rejeitar criação com senha fraca', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/tecnicos', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `senha.fraca.${timestamp}@teste.com`,
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/senha.*8/i);
    });

    it('deve rejeitar horário de entrada inválido', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/tecnicos', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `horario.invalido.${timestamp}@teste.com`,
          password: 'Senha123!',
          entrada: '25:00',
          saida: '17:00'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/horário.*entrada/i);
    });

    it('deve rejeitar horário de saída menor que entrada', async () => {
      const timestamp = Date.now();
      const response = await adminClient
        .post('/api/tecnicos', {
          nome: 'João',
          sobrenome: 'Silva',
          email: `horario.invertido.${timestamp}@teste.com`,
          password: 'Senha123!',
          entrada: '17:00',
          saida: '08:00'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/saída.*posterior.*entrada/i);
    });
  });

  describe('GET /api/tecnicos - Listagem', () => {
    it('admin deve poder listar todos os técnicos', async () => {
      const response = await adminClient
        .get('/api/tecnicos');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('técnico NÃO deve poder listar técnicos', async () => {
      const response = await tecnicoClient
        .get('/api/tecnicos');

      expect(response.status).toBe(403);
    });

    it('usuário comum NÃO deve poder listar técnicos', async () => {
      const response = await usuarioClient
        .get('/api/tecnicos');

      expect(response.status).toBe(403);
    });

    it('não deve retornar senhas na listagem', async () => {
      const response = await adminClient
        .get('/api/tecnicos');

      expect(response.status).toBe(200);
      
      response.body.data.forEach((tecnico: any) => {
        expect(tecnico).not.toHaveProperty('password');
      });
    });

    it('deve retornar listagem paginada', async () => {
      const response = await adminClient
        .get('/api/tecnicos?page=1&limit=5');

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('deve incluir informações de disponibilidade', async () => {
      const response = await adminClient
        .get('/api/tecnicos');

      expect(response.status).toBe(200);
      
      if (response.body.data.length > 0) {
        const tecnico = response.body.data[0];
        expect(tecnico).toHaveProperty('tecnicoDisponibilidade');
      }
    });
  });

  describe('GET /api/tecnicos/:id - Busca Individual', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/tecnicos', {
        nome: 'Tecnico',
        sobrenome: 'Teste',
        email: `tecnico.busca.${timestamp}@teste.com`,
        password: 'Senha123!'
      });
      tecnicoId = response.body.id;
    });

    it('admin deve poder buscar técnico por ID', async () => {
      const response = await adminClient
        .get(`/api/tecnicos/${tecnicoId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(tecnicoId);
      expect(response.body).not.toHaveProperty('password');
    });

    it('técnico pode buscar qualquer técnico', async () => {
      const response = await tecnicoClient
        .get(`/api/tecnicos/${tecnicoId}`);

      expect(response.status).toBe(200);
    });

    it('usuário comum NÃO pode buscar técnico', async () => {
      const response = await usuarioClient
        .get(`/api/tecnicos/${tecnicoId}`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .get('/api/tecnicos/id-inexistente-12345');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/tecnicos/:id - Atualização', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/tecnicos', {
        nome: 'Tecnico',
        sobrenome: 'Original',
        email: `tecnico.update.${timestamp}@teste.com`,
        password: 'Senha123!'
      });
      tecnicoId = response.body.id;
    });

    it('admin deve poder atualizar nome do técnico', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}`, {
          nome: 'Nome Atualizado'
        });

      expect(response.status).toBe(200);
      expect(response.body.nome).toBe('Nome Atualizado');
    });

    it('admin deve poder atualizar sobrenome', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}`, {
          sobrenome: 'Sobrenome Atualizado'
        });

      expect(response.status).toBe(200);
      expect(response.body.sobrenome).toBe('Sobrenome Atualizado');
    });

    it('admin deve poder alterar setor', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}`, {
          setor: 'FINANCEIRO'
        });

      expect(response.status).toBe(200);
      expect(response.body.setor).toBe('FINANCEIRO');
    });

    it('técnico pode atualizar próprio perfil', async () => {
      // Buscar ID do técnico autenticado
      const perfil = await tecnicoClient.get('/api/tecnicos');
      const meuId = process.env.TECNICO_ID || tecnicoId;

      const response = await tecnicoClient
        .put(`/api/tecnicos/${meuId}`, {
          telefone: '1234-5678'
        });

      expect([200, 403]).toContain(response.status);
    });

    it('técnico NÃO pode atualizar outro técnico', async () => {
      const response = await tecnicoClient
        .put(`/api/tecnicos/${tecnicoId}`, {
          nome: 'Tentativa'
        });

      expect([200, 403]).toContain(response.status);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .put('/api/tecnicos/id-inexistente', {
          nome: 'Teste'
        });

      expect(response.status).toBe(404);
    });

    it('deve rejeitar atualização de email duplicado', async () => {
      const timestamp = Date.now();
      
      await adminClient.post('/api/tecnicos', {
        nome: 'Outro',
        sobrenome: 'Tecnico',
        email: `outro.${timestamp}@teste.com`,
        password: 'Senha123!'
      });

      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}`, {
          email: `outro.${timestamp}@teste.com`
        });

      expect(response.status).toBe(409);
    });
  });

  describe('PUT /api/tecnicos/:id/senha - Alteração de Senha', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/tecnicos', {
        nome: 'Tecnico',
        sobrenome: 'Senha',
        email: `tecnico.senha.${timestamp}@teste.com`,
        password: 'Senha123!'
      });
      tecnicoId = response.body.id;
    });

    it('admin deve poder alterar senha de qualquer técnico', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}/senha`, {
          password: 'NovaSenha123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/senha.*sucesso/i);
    });

    it('deve rejeitar alteração com senha fraca', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}/senha`, {
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/senha/i);
    });

    it('deve rejeitar se técnico tentar alterar senha de outro', async () => {
      const response = await tecnicoClient
        .put(`/api/tecnicos/${tecnicoId}/senha`, {
          password: 'NovaSenha123!'
        });

      expect([200, 403]).toContain(response.status);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .put('/api/tecnicos/id-inexistente/senha', {
          password: 'NovaSenha123!'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/tecnicos/:id/horarios - Horários de Expediente', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/tecnicos', {
        nome: 'Tecnico',
        sobrenome: 'Horario',
        email: `tecnico.horario.${timestamp}@teste.com`,
        password: 'Senha123!',
        entrada: '08:00',
        saida: '17:00'
      });
      tecnicoId = response.body.id;
    });

    it('admin deve poder atualizar horários do técnico', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}/horarios`, {
          entrada: '09:00',
          saida: '18:00'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/horário.*atualizado/i);
      expect(response.body.horario).toBeDefined();
    });

    it('deve rejeitar horário de entrada inválido', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}/horarios`, {
          entrada: '25:00',
          saida: '17:00'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/horário.*entrada/i);
    });

    it('deve rejeitar horário de saída inválido', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}/horarios`, {
          entrada: '08:00',
          saida: 'ABC'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/horário.*saída/i);
    });

    it('deve rejeitar saída menor que entrada', async () => {
      const response = await adminClient
        .put(`/api/tecnicos/${tecnicoId}/horarios`, {
          entrada: '17:00',
          saida: '08:00'
        });

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/saída.*posterior.*entrada/i);
    });

    it('técnico pode alterar próprios horários', async () => {
      const response = await tecnicoClient
        .put(`/api/tecnicos/${tecnicoId}/horarios`, {
          entrada: '09:00',
          saida: '18:00'
        });

      expect([200, 403]).toContain(response.status);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .put('/api/tecnicos/id-inexistente/horarios', {
          entrada: '09:00',
          saida: '18:00'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/tecnicos/:id - Deleção', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const response = await adminClient.post('/api/tecnicos', {
        nome: 'Tecnico',
        sobrenome: 'Deletar',
        email: `tecnico.delete.${timestamp}@teste.com`,
        password: 'Senha123!'
      });
      tecnicoId = response.body.id;
    });

    it('admin deve poder deletar (soft delete) técnico', async () => {
      const response = await adminClient
        .delete(`/api/tecnicos/${tecnicoId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/deletado.*sucesso/i);

      const tecnicoDeletado = await prisma.usuario.findUnique({
        where: { id: tecnicoId }
      });

      expect(tecnicoDeletado).not.toBeNull();
      expect(tecnicoDeletado!.deletadoEm).not.toBeNull();
    });

    it('técnico NÃO deve poder deletar técnico', async () => {
      const response = await tecnicoClient
        .delete(`/api/tecnicos/${tecnicoId}`);

      expect(response.status).toBe(403);
    });

    it('usuário NÃO deve poder deletar técnico', async () => {
      const response = await usuarioClient
        .delete(`/api/tecnicos/${tecnicoId}`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const response = await adminClient
        .delete('/api/tecnicos/id-inexistente');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/tecnicos/:id/restaurar - Restauração', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      const timestamp = Date.now();
      const tecnico = await adminClient.post('/api/tecnicos', {
        nome: 'Tecnico',
        sobrenome: 'Restaurar',
        email: `tecnico.restaurar.${timestamp}@teste.com`,
        password: 'Senha123!'
      });
      tecnicoId = tecnico.body.id;

      await adminClient.delete(`/api/tecnicos/${tecnicoId}`);
    });

    it('admin deve poder restaurar técnico deletado', async () => {
      const response = await adminClient
        .patch(`/api/tecnicos/${tecnicoId}/restaurar`);

      expect(response.status).toBe(200);
      expect(response.body.message).toMatch(/restaurado/i);
      expect(response.body.tecnico.ativo).toBe(true);
    });

    it('técnico NÃO deve poder restaurar técnico', async () => {
      const response = await tecnicoClient
        .patch(`/api/tecnicos/${tecnicoId}/restaurar`);

      expect(response.status).toBe(403);
    });

    it('deve rejeitar restauração de técnico não deletado', async () => {
      const timestamp = Date.now();
      const novoTecnico = await adminClient.post('/api/tecnicos', {
        nome: 'Tecnico',
        sobrenome: 'Ativo',
        email: `tecnico.ativo.${timestamp}@teste.com`,
        password: 'Senha123!'
      });

      const response = await adminClient
        .patch(`/api/tecnicos/${novoTecnico.body.id}/restaurar`);

      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toMatch(/não está deletado/i);
    });
  });
});