import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../app';
import { cacheFlush } from '../../../../infrastructure/database/redis/client';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE } from '../../helpers/factory';
import { obterTokens, bearerHeader } from '../../helpers/auth.helper';

describe('logoutUseCase E2E — POST /auth/sessao/logout', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await cacheFlush();
    await criarAdmin();
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação obrigatória', () => {
    it('deve retornar 401 sem token no header', async () => {
      const res = await request(app).post('/auth/sessao/logout');
      expect(res.status).toBe(401);
    });

    it('deve retornar 401 com token malformado', async () => {
      const res = await request(app)
        .post('/auth/sessao/logout')
        .set('Authorization', 'Bearer token.invalido.abc');

      expect(res.status).toBe(401);
    });
  });

  describe('logout bem-sucedido', () => {
    it('deve retornar 200 com mensagem de confirmação', async () => {
      const { accessToken } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .post('/auth/sessao/logout')
        .set('Authorization', bearerHeader(accessToken));

      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('invalidação do token após logout', () => {
    it('deve adicionar o accessToken na blacklist (Redis) e rejeitar uso posterior', async () => {
      const { accessToken } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      await request(app)
        .post('/auth/sessao/logout')
        .set('Authorization', bearerHeader(accessToken));

      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(accessToken));

      expect(res.status).toBe(401);
    });

    it('deve impedir uso do refreshToken após logout', async () => {
      const { accessToken, refreshToken } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      await request(app)
        .post('/auth/sessao/logout')
        .set('Authorization', bearerHeader(accessToken));

      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
    });
  });
});
