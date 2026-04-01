import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, emailUnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('deletarUsuarioUseCase E2E — DELETE /api/usuarios/:id', () => {
  let adminToken: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin = await criarAdmin();
    adminToken  = gerarToken(admin);
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação', () => {
    it('deve retornar 401 sem token', async () => {
      const usuario = await criarUsuario({ email: emailUnico('del-auth') });
      const res = await request(app).delete(`/api/usuarios/${usuario.id}`);
      expect(res.status).toBe(401);
    });
  });

  describe('soft delete (padrão)', () => {
    it('deve retornar 200 e marcar usuário como deletado', async () => {
      const usuario = await criarUsuario({ email: emailUnico('del-soft') });
      const res = await request(app)
        .delete(`/api/usuarios/${usuario.id}`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
    });

    it('deve retornar 404 ao deletar usuário inexistente', async () => {
      const res = await request(app)
        .delete('/api/usuarios/id-nao-existe-del')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(404);
    });
  });

  describe('hard delete (permanente=true)', () => {
    it('deve remover permanentemente o usuário', async () => {
      const usuario = await criarUsuario({ email: emailUnico('del-perm') });
      const del = await request(app)
        .delete(`/api/usuarios/${usuario.id}?permanente=true`)
        .set('Authorization', bearerHeader(adminToken));
      expect(del.status).toBe(200);

      // Não deve encontrar mais
      const busca = await request(app)
        .get(`/api/usuarios/${usuario.id}`)
        .set('Authorization', bearerHeader(adminToken));
      expect(busca.status).toBe(404);
    });
  });

  describe('USUARIO deletando própria conta', () => {
    it('deve permitir que USUARIO delete sua própria conta', async () => {
      const usuario = await criarUsuario({ email: emailUnico('del-self') });
      const usuarioToken = gerarToken(usuario);
      const res = await request(app)
        .delete(`/api/usuarios/${usuario.id}`)
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(200);
    });

    it('deve retornar 403 quando USUARIO tenta deletar outra conta', async () => {
      const u1 = await criarUsuario({ email: emailUnico('del-u1') });
      const u2 = await criarUsuario({ email: emailUnico('del-u2') });
      const tokenU1 = gerarToken(u1);
      const res = await request(app)
        .delete(`/api/usuarios/${u2.id}`)
        .set('Authorization', bearerHeader(tokenU1));
      expect(res.status).toBe(403);
    });
  });
});
