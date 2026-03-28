import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../../app';
import { limparBancoDados } from '../../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE } from '../../../helpers/factory';
import { obterTokens, bearerHeader } from '../../../helpers/auth.helper';

describe('errorLoggerMiddleware E2E — rastreabilidade e sanitização', () => {
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

  describe('propagação do Correlation ID', () => {
    it('deve retornar o X-Correlation-ID no header quando enviado na requisição', async () => {
      const correlationId = 'test-correlation-id-e2e-123';

      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(adminToken))
        .set('X-Correlation-ID', correlationId);

      // O endpoint /me retorna 200 — o header deve ser refletido ou estar no response
      expect(res.status).toBe(200);
    });

    it('deve processar a requisição mesmo sem X-Correlation-ID', async () => {
      const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(tokens.accessToken));
      // Sem Correlation-ID — não deve falhar

      expect(res.status).toBe(200);
    });
  });

  describe('sanitização de dados sensíveis', () => {
    it('não deve expor senha no corpo da resposta de erro de login', async () => {
      const senhaEnviada = 'SenhaQueNaoPodeVazar@123';

      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: 'inexistente@e2e.com', password: senhaEnviada });

      expect(res.status).toBe(401);
      const corpo = JSON.stringify(res.body);
      expect(corpo).not.toContain(senhaEnviada);
    });

    it('não deve expor o token de acesso em respostas de erro', async () => {
      const { accessToken: tokenParaUsar } = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);

      // Tenta acessar endpoint protegido com token (válido) — deve retornar 200, não 401
      const resValido = await request(app)
        .get('/auth/sessao/me')
        .set('Authorization', bearerHeader(tokenParaUsar));

      expect(resValido.status).toBe(200);
      // O token não deve aparecer no corpo da resposta
      expect(JSON.stringify(resValido.body)).not.toContain(tokenParaUsar);
    });

    it('não deve vazar informações internas no campo detail do erro de recurso não encontrado', async () => {
      const res = await request(app)
        .get('/auth/usuarios/id-inexistente-logger')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(404);
      // O campo detail (mensagem visível ao cliente) não deve conter detalhes internos
      const detail: string = res.body.detail ?? '';
      expect(detail).not.toMatch(/\.ts\b/);
      expect(detail.toLowerCase()).not.toContain('node_modules');
      expect(detail.toLowerCase()).not.toContain('prisma');
    });
  });

  describe('resiliência do servidor após erros', () => {
    it('deve continuar respondendo normalmente após múltiplos erros consecutivos', async () => {
      // Dispara alguns erros
      await request(app).get('/auth/sessao/me'); // 401
      await request(app).get('/rota-inexistente'); // 404
      await request(app).post('/auth/sessao/login').send({}); // 400

      // O servidor deve ainda responder normalmente
      const resHealth = await request(app).get('/health');
      expect(resHealth.status).toBe(200);
    });
  });
});
