import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { createTestUser } from '../setup/test.database';
import {
  generateUniqueEmail,
  extractErrorMessage,
  loginUser,
} from '../setup/test.helpers';

const SEED_USUARIO = {
  email: process.env.USER_EMAIL_TESTE ?? 'user@helpme.com',
  password: process.env.USER_PASSWORD_TESTE ?? 'User123!',
};

async function loginSeedUsuario() {
  return loginUser(SEED_USUARIO.email, SEED_USUARIO.password);
}

describe('E2E: Autenticação', () => {
  describe('POST /api/auth/login', () => {
    it('login com credenciais válidas retorna tokens e dados do usuário', async () => {
      const email = generateUniqueEmail('login');
      const password = 'Senha123!';

      await createTestUser({ nome: 'Teste', sobrenome: 'Login', email, password, regra: 'USUARIO' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);

      // expiresIn pode ser número (segundos) ou string (ex: "8h") dependendo da implementação
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.body.usuario).toMatchObject({
        email,
        nome: 'Teste',
        sobrenome: 'Login',
      });
      expect(res.body.usuario).not.toHaveProperty('password');
      expect(res.body.usuario).not.toHaveProperty('refreshToken');
    });

    it.each([
      ['ADMIN'],
      ['TECNICO'],
      ['USUARIO'],
    ] as const)('login bem-sucedido para regra %s', async (regra) => {
      const email = generateUniqueEmail(`regra-${regra.toLowerCase()}`);
      const password = 'Senha123!';

      await createTestUser({ email, password, regra });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);

      expect(res.body.usuario.regra).toBe(regra);
    });

    it.each([
      ['sem email', { password: 'Senha123!' }, 400, /obrigatório/i],
      ['sem senha', { email: 'test@example.com' }, 400, /obrigatório/i],
      ['email inválido', { email: 'email-invalido', password: 'Senha123!' }, 400, /email inválido/i],
    ])('rejeita login %s', async (_, body, status, msgPattern) => {
      const res = await request(app).post('/api/auth/login').send(body);

      expect(res.status).toBe(status);
      expect(extractErrorMessage(res)).toMatch(msgPattern);
    });

    it('usuário inexistente retorna 401 com credenciais inválidas', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'naoexiste@example.com', password: 'Senha123!' });

      expect(res.status).toBe(401);
      expect(extractErrorMessage(res)).toMatch(/credenciais inválidas/i);
    });

    it('senha incorreta retorna 401 com credenciais inválidas', async () => {
      const email = generateUniqueEmail('wrong-pass');
      await createTestUser({ email, password: 'SenhaCorreta123!' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'SenhaErrada123!' });

      expect(res.status).toBe(401);
      expect(extractErrorMessage(res)).toMatch(/credenciais inválidas/i);
    });

    it('usuário inativo retorna 401 com mensagem de conta inativa', async () => {
      const email = generateUniqueEmail('inativo');
      await createTestUser({ email, password: 'Senha123!', ativo: false });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Senha123!' });

      expect(res.status).toBe(401);
      expect(extractErrorMessage(res)).toMatch(/inativa/i);
    });

    it('bloqueia após 5 tentativas falhas → 429', async () => {
      const email = generateUniqueEmail('brute-force');
      await createTestUser({ email, password: 'SenhaCorreta123!' });

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'SenhaErrada!' });
      }

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'SenhaCorreta123!' });

      expect(res.status).toBe(429);
      expect(extractErrorMessage(res)).toMatch(/muitas tentativas/i);
      expect(res.body).toHaveProperty('bloqueadoAte');
      expect(res.body.tentativasRestantes).toBe(0);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('logout com token válido retorna mensagem de sucesso', async () => {
      const { accessToken } = await loginSeedUsuario();

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(/sucesso/i);
    });

    it('logout sem token retorna 401', async () => {
      await request(app).post('/api/auth/logout').expect(401);
    });

    it.todo('token não deve funcionar após logout — PENDENTE: blacklist implementada');
  });

  describe('POST /api/auth/refresh-token', () => {
    it('renova tokens com refresh token válido', async () => {
      const { refreshToken } = await loginSeedUsuario();

      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
    });

    it('novos tokens são diferentes dos originais', async () => {
      const { accessToken: oldAccess, refreshToken: oldRefresh } = await loginSeedUsuario();

      // Aguarda 1s para garantir iat diferente no JWT
      await new Promise((r) => setTimeout(r, 1000));

      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: oldRefresh })
        .expect(200);

      expect(res.body.accessToken).not.toBe(oldAccess);
    });

    it('sem refresh token retorna 400', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({});

      expect(res.status).toBe(400);
      expect(extractErrorMessage(res)).toMatch(/refresh token.*obrigatório/i);
    });

    it('refresh token inválido retorna 401', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'token.invalido.aqui' });

      expect(res.status).toBe(401);
    });

    it.todo('refresh token já rotacionado retorna 401 — PENDENTE: rotação de refresh token não implementada');
  });

  describe('GET /api/auth/me', () => {
    it('retorna perfil completo sem campos sensíveis', async () => {
      const { accessToken, usuario } = await loginSeedUsuario();

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(usuario.id);
      expect(res.body.email).toBe(usuario.email);
      expect(res.body).toHaveProperty('nome');
      expect(res.body).toHaveProperty('regra');
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('sem token retorna 401', async () => {
      await request(app).get('/api/auth/me').expect(401);
    });
  });

  describe('GET /api/auth/status', () => {
    it('retorna autenticado=true com dados básicos quando logado', async () => {
      const { accessToken } = await loginSeedUsuario();

      const res = await request(app)
        .get('/api/auth/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.autenticado).toBe(true);
      expect(res.body.usuario).toMatchObject({
        id: expect.any(String),
        email: expect.any(String),
        regra: expect.any(String),
      });
    });

    it('sem token retorna 401', async () => {
      // A rota retorna 401; campo autenticado no body depende da implementação
      await request(app).get('/api/auth/status').expect(401);
    });
  });
});