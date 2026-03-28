import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../../app';
import { cacheFlush } from '../../../../../infrastructure/database/redis/client';
import { limparBancoDados } from '../../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE } from '../../../helpers/factory';
import { obterTokens, bearerHeader } from '../../../helpers/auth.helper';

const ME = '/auth/sessao/me';

describe('authMiddleware E2E — verificação de token e RBAC', () => {
  let app: ReturnType<typeof createApp>;
  let accessToken: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await cacheFlush();
    await criarAdmin();

    const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    accessToken = tokens.accessToken;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('token ausente', () => {
    it('deve retornar 401 sem header Authorization', async () => {
      const res = await request(app).get(ME);
      expect(res.status).toBe(401);
    });

    it('deve retornar 401 com header Authorization vazio', async () => {
      const res = await request(app)
        .get(ME)
        .set('Authorization', '');

      expect(res.status).toBe(401);
    });
  });

  describe('formato do header Authorization', () => {
    it('deve retornar 401 sem o prefixo "Bearer "', async () => {
      const res = await request(app)
        .get(ME)
        .set('Authorization', accessToken); // sem "Bearer "

      expect(res.status).toBe(401);
    });

    it('deve retornar 401 com prefixo incorreto (Basic)', async () => {
      const res = await request(app)
        .get(ME)
        .set('Authorization', `Basic ${accessToken}`);

      expect(res.status).toBe(401);
    });

    it('deve retornar 401 com token visivelmente malformado', async () => {
      const res = await request(app)
        .get(ME)
        .set('Authorization', 'Bearer nao.e.um.jwt.valido');

      expect(res.status).toBe(401);
    });
  });

  describe('tipo de token incorreto', () => {
    it('deve retornar 401 ao usar refreshToken no lugar do accessToken', async () => {
      const { refreshToken } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .get(ME)
        .set('Authorization', bearerHeader(refreshToken));

      expect(res.status).toBe(401);
    });
  });

  describe('token revogado (blacklist Redis)', () => {
    it('deve retornar 401 ao usar token que foi revogado pelo logout', async () => {
      const { accessToken: tokenParaRevogar } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      await request(app)
        .post('/auth/sessao/logout')
        .set('Authorization', bearerHeader(tokenParaRevogar));

      const res = await request(app)
        .get(ME)
        .set('Authorization', bearerHeader(tokenParaRevogar));

      expect(res.status).toBe(401);
    });
  });

  describe('token válido', () => {
    it('deve retornar 200 com dados do usuário autenticado', async () => {
      const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .get(ME)
        .set('Authorization', bearerHeader(tokens.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.usuario.email).toBe(ADMIN_EMAIL);
      expect(res.body.usuario.id).toBeDefined();
    });

    it('não deve expor senha ou refreshToken no retorno do /me', async () => {
      const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .get(ME)
        .set('Authorization', bearerHeader(tokens.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.usuario.password).toBeUndefined();
      expect(res.body.usuario.refreshToken).toBeUndefined();
    });
  });

  describe('authorizeRoles (RBAC)', () => {
    it('deve retornar 403 quando a regra não tem permissão para o endpoint', async () => {
      const { criarTecnico, TECNICO_EMAIL } = await import('../../../helpers/factory');
      await criarTecnico();

      const { accessToken: tecnicoToken } = await obterTokens(TECNICO_EMAIL, SENHA_TESTE);

      // Endpoint restrito a ADMIN
      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(tecnicoToken));

      expect(res.status).toBe(403);
    });
  });
});
