import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, emailUnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('buscarUsuarioUseCase E2E — GET /api/usuarios/:id', () => {
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

  describe('autenticação', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).get(`/api/usuarios/${usuarioId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('busca por ID', () => {
    it('deve retornar 200 com os dados do usuário para ADMIN', async () => {
      const res = await request(app)
        .get(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(usuarioId);
    });

    it('deve retornar 200 quando USUARIO busca seu próprio perfil', async () => {
      const res = await request(app)
        .get(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(usuarioId);
    });

    it('deve retornar 403 quando USUARIO tenta ver outro perfil', async () => {
      const outro = await criarAdmin({ email: emailUnico('outro-admin') });
      const res = await request(app)
        .get(`/api/usuarios/${outro.id}`)
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .get('/api/usuarios/id-que-nao-existe-jamais')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(404);
    });

    it('a resposta deve conter os campos esperados', async () => {
      const res = await request(app)
        .get(`/api/usuarios/${usuarioId}`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('nome');
      expect(res.body).toHaveProperty('email');
      expect(res.body).toHaveProperty('regra');
    });
  });
});
