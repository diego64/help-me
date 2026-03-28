import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE } from '../../helpers/factory';
import { obterTokens } from '../../helpers/auth.helper';

describe('refreshTokenUseCase E2E — POST /auth/sessao/refresh', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('validação do refreshToken', () => {
    it('deve retornar 401 quando refreshToken não for informado', async () => {
      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({});

      expect(res.status).toBe(401);
    });

    it('deve retornar 401 com refreshToken inválido', async () => {
      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: 'token.invalido.assinatura' });

      expect(res.status).toBe(401);
    });

    it('deve retornar 401 ao usar accessToken no lugar do refreshToken', async () => {
      const { accessToken } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: accessToken });

      expect(res.status).toBe(401);
    });
  });

  describe('renovação bem-sucedida', () => {
    it('deve retornar 200 com novos accessToken e refreshToken', async () => {
      const { refreshToken } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
    });

    it('deve retornar um novo accessToken diferente do anterior', async () => {
      const tokens1 = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: tokens1.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).not.toBe(tokens1.accessToken);
    });
  });

  describe('rotação do refreshToken', () => {
    it('não deve aceitar o mesmo refreshToken após já ter sido rotacionado', async () => {
      const { refreshToken: tokenOriginal } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      // Primeiro refresh — consome o token e rotaciona
      await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: tokenOriginal });

      // Segunda tentativa com o token já consumido
      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: tokenOriginal });

      expect(res.status).toBe(401);
    });

    it('o novo refreshToken retornado deve ser utilizável', async () => {
      const { refreshToken: tokenOriginal } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const resRefresh = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: tokenOriginal });

      expect(resRefresh.status).toBe(200);

      const resSegundoRefresh = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: resRefresh.body.refreshToken });

      expect(resSegundoRefresh.status).toBe(200);
    });
  });
});
