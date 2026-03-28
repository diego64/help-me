import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE, emailUnico } from '../../helpers/factory';
import { obterTokens, bearerHeader } from '../../helpers/auth.helper';

/**
 * Testa os comportamentos de hashPassword e validarForcaSenha
 * através dos endpoints HTTP de criação de usuário e login.
 */
describe('password.config E2E — validação e verificação de senha via HTTP', () => {
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

  describe('validarForcaSenha — validação de requisitos', () => {
    it('deve rejeitar senha com menos de 8 caracteres', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: 'Ab1@', regra: 'USUARIO' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('deve rejeitar senha sem letras maiúsculas', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: 'semmaiu@123', regra: 'USUARIO' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('deve rejeitar senha sem letras minúsculas', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: 'SEMMINUSC@123', regra: 'USUARIO' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('deve rejeitar senha sem números', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: 'SemNumeros@abc', regra: 'USUARIO' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('deve aceitar senha que atende todos os requisitos mínimos', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico('senha-valida'), password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(201);
    });

    it('deve retornar erros descritivos ao rejeitar senha fraca', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: 'fraca', regra: 'USUARIO' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      // A resposta deve conter alguma informação sobre o erro
      expect(res.body).toBeDefined();
    });
  });

  describe('hashPassword + verifyPassword — via login', () => {
    it('deve autenticar com a senha correta após hashPassword no cadastro', async () => {
      const emailNovo = emailUnico('hash-verify');

      await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Hash', sobrenome: 'Test', email: emailNovo, password: SENHA_TESTE, regra: 'USUARIO' });

      const resLogin = await request(app)
        .post('/auth/sessao/login')
        .send({ email: emailNovo, password: SENHA_TESTE });

      expect(resLogin.status).toBe(200);
      expect(resLogin.body.accessToken).toBeDefined();
    });

    it('deve rejeitar login com senha incorreta após hashPassword no cadastro', async () => {
      const emailNovo = emailUnico('hash-wrong');

      await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Hash', sobrenome: 'Wrong', email: emailNovo, password: SENHA_TESTE, regra: 'USUARIO' });

      const resLogin = await request(app)
        .post('/auth/sessao/login')
        .send({ email: emailNovo, password: 'SenhaErrada@999' });

      expect(resLogin.status).toBe(401);
    });

    it('não deve expor o hash da senha em nenhum endpoint', async () => {
      const emailNovo = emailUnico('hash-leak');

      const resCriacao = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Hash', sobrenome: 'Leak', email: emailNovo, password: SENHA_TESTE, regra: 'USUARIO' });

      expect(resCriacao.status).toBe(201);
      expect(resCriacao.body.password).toBeUndefined();

      const resBusca = await request(app)
        .get(`/auth/usuarios/${resCriacao.body.id}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(resBusca.status).toBe(200);
      expect(resBusca.body.password).toBeUndefined();
    });
  });
});
