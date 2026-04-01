import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../app';
import { cacheFlush } from '../../../../infrastructure/database/redis/client';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE } from '../../helpers/factory';
import { obterTokens, bearerHeader } from '../../helpers/auth.helper';

/**
 * Testa comportamentos do módulo JWT através dos endpoints HTTP.
 * O endpoint /auth/sessao/me é usado como referência pois
 * requer validação completa do accessToken.
 */
describe('jwt.config E2E — validação de tokens via HTTP', () => {
  let app: ReturnType<typeof createApp>;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await cacheFlush();
    await criarAdmin();

    const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    accessToken  = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('extractTokenFromHeader', () => {
    it('deve rejeitar header sem prefixo Bearer', async () => {
      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', accessToken);

      expect(res.status).toBe(401);
    });

    it('deve rejeitar prefixo Basic', async () => {
      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', `Basic ${accessToken}`);

      expect(res.status).toBe(401);
    });

    it('deve rejeitar token com espaço no meio', async () => {
      const partes = accessToken.split('.');
      const tokenComEspaco = `${partes[0]} ${partes[1]}.${partes[2]}`;

      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', `Bearer ${tokenComEspaco}`);

      expect(res.status).toBe(401);
    });

    it('deve aceitar token JWT válido com prefixo Bearer', async () => {
      const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(tokens.accessToken));

      expect(res.status).toBe(200);
    });
  });

  describe('verifyToken — assinatura e estrutura', () => {
    it('deve rejeitar token com assinatura adulterada', async () => {
      const partes = accessToken.split('.');
      const assinaturaAdulterada = 'assinatura_invalida_abc123';
      const tokenAdulterado = `${partes[0]}.${partes[1]}.${assinaturaAdulterada}`;

      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(tokenAdulterado));

      expect(res.status).toBe(401);
    });

    it('deve rejeitar token com payload adulterado', async () => {
      const partes = accessToken.split('.');
      // Altera o payload (base64)
      const payloadAdulterado = Buffer.from(
        JSON.stringify({ id: 'hacker', regra: 'ADMIN', type: 'access' })
      ).toString('base64url');
      const tokenAdulterado = `${partes[0]}.${payloadAdulterado}.${partes[2]}`;

      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(tokenAdulterado));

      expect(res.status).toBe(401);
    });

    it('deve rejeitar token completamente aleatório', async () => {
      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', 'Bearer abc.def.ghi');

      expect(res.status).toBe(401);
    });
  });

  describe('separação de tipo de token', () => {
    it('não deve aceitar refreshToken no endpoint que exige accessToken', async () => {
      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(refreshToken));

      expect(res.status).toBe(401);
    });

    it('não deve aceitar accessToken no endpoint de refresh', async () => {
      const res = await request(app)
        .post('/auth/sessao/refresh')
        .send({ refreshToken: accessToken });

      expect(res.status).toBe(401);
    });
  });

  describe('generateTokenPair — tokens gerados no login', () => {
    it('accessToken e refreshToken devem ser strings distintas', async () => {
      const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
      expect(tokens.accessToken.split('.').length).toBe(3); // formato JWT
      expect(tokens.refreshToken.split('.').length).toBe(3);
    });

    it('dois logins consecutivos devem gerar accessTokens diferentes', async () => {
      const tokens1 = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
      const tokens2 = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
    });
  });
});
