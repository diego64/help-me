import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../../app';
import { limparBancoDados } from '../../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE } from '../../../helpers/factory';
import { obterTokens, bearerHeader } from '../../../helpers/auth.helper';

/**
 * Em NODE_ENV=test, todos os rate limiters são automaticamente
 * desativados pela função `defaultSkip`:
 *   if (req.app.get('env') === 'test') return true
 *
 * Estes testes verificam esse comportamento de skip e garantem
 * que a aplicação responde corretamente com múltiplas requisições
 * sem acionar o bloqueio.
 */
describe('rateLimitMiddleware E2E — comportamento em ambiente de teste', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
    const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    adminToken = tokens.accessToken;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('apiLimiter — skip em NODE_ENV=test', () => {
    it('deve processar múltiplas requisições ao /health sem retornar 429', async () => {
      const respostas = await Promise.all(
        Array.from({ length: 10 }, () => request(app).get('/health'))
      );

      respostas.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.status).not.toBe(429);
      });
    });
  });

  describe('authLimiter — skip em NODE_ENV=test', () => {
    it('deve permitir múltiplas tentativas de login inválidas consecutivas sem bloquear', async () => {
      const tentativas = 8; // acima do limite real de 5

      for (let i = 0; i < tentativas; i++) {
        const res = await request(app)
          .post('/auth/sessao/login')
          .send({ email: 'tentativa@e2e.com', password: 'SenhaErrada@999' });

        // Deve retornar 401 (credenciais inválidas), NUNCA 429 (rate limit)
        expect(res.status).toBe(401);
        expect(res.status).not.toBe(429);
      }
    });
  });

  describe('writeLimiter — skip em NODE_ENV=test', () => {
    it('deve aceitar múltiplas requisições de escrita sem retornar 429', async () => {
      const respostas = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .get('/auth/usuarios/id-inexistente')
            .set('Authorization', bearerHeader(adminToken))
        )
      );

      respostas.forEach(res => {
        // 404 é esperado (ID não existe), mas nunca 429
        expect(res.status).toBe(404);
        expect(res.status).not.toBe(429);
      });
    });
  });

  describe('registerLimiter — skip em NODE_ENV=test', () => {
    it('deve criar mais de 3 usuários sem atingir o limite de registro', async () => {
      const { emailUnico } = await import('../../../helpers/factory');
      const criações = 4; // acima do limite real de 3

      for (let i = 0; i < criações; i++) {
        const res = await request(app)
          .post('/auth/usuarios')
          .set('Authorization', bearerHeader(adminToken))
          .send({
            nome: 'Reg', sobrenome: 'Teste',
            email: emailUnico(`reg-${i}`),
            password: SENHA_TESTE,
            regra: 'USUARIO',
          });

        expect(res.status).toBe(201);
        expect(res.status).not.toBe(429);
      }
    });
  });
});
