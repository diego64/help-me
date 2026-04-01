import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, emailUnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('atualizarUsuarioUseCase E2E — PUT /api/usuarios/:id', () => {
  let adminToken: string;
  let usuarioToken: string;
  let usuarioId: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin   = await criarAdmin();
    const usuario = await criarUsuario();
    adminToken   = gerarToken(admin);
    usuarioToken = gerarToken(usuario);
    usuarioId    = usuario.id;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação e autorização', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).put(`/api/usuarios/${usuarioId}`).send({ nome: 'Novo' });
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 quando USUARIO tenta editar outro perfil', async () => {
      const outro = await criarAdmin({ email: emailUnico('outro-admin2') });
      const res = await request(app)
        .put(`/api/usuarios/${outro.id}`)
        .set('Authorization', bearerHeader(usuarioToken))
        .send({ nome: 'Hackeado' });
      expect(res.status).toBe(403);
    });
  });

  describe('validação de campos', () => {
    it('deve retornar 400 para nome muito curto', async () => {
      const res = await request(app)
        .put(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('deve retornar 400 para email inválido', async () => {
      const res = await request(app)
        .put(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ email: 'nao-e-email' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('atualização válida', () => {
    it('deve retornar 200 ao atualizar nome e sobrenome', async () => {
      const res = await request(app)
        .put(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'NomeAtualizado', sobrenome: 'SobrenomeAtualizado' });
      expect(res.status).toBe(200);
      expect(res.body.nome).toBe('NomeAtualizado');
      expect(res.body.sobrenome).toBe('SobrenomeAtualizado');
    });

    it('deve retornar 200 quando USUARIO edita seu próprio perfil', async () => {
      const res = await request(app)
        .put(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(usuarioToken))
        .send({ nome: 'SelfUpdate' });
      expect(res.status).toBe(200);
    });

    it('deve retornar 409 ao usar email já existente', async () => {
      const outro = await criarUsuario({ email: emailUnico('dup') });
      const res = await request(app)
        .put(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ email: outro.email });
      expect(res.status).toBe(409);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .put('/api/usuarios/id-inexistente-atualizar')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Ninguem' });
      expect(res.status).toBe(404);
    });
  });
});
