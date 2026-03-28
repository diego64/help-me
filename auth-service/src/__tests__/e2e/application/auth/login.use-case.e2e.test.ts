import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, ADMIN_EMAIL, SENHA_TESTE, emailUnico } from '../../helpers/factory';

describe('loginUseCase E2E — POST /auth/sessao/login', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('validação de campos obrigatórios', () => {
    it('deve retornar 400 quando email não for informado', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ password: SENHA_TESTE });

      expect(res.status).toBe(400);
    });

    it('deve retornar 400 quando senha não for informada', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: ADMIN_EMAIL });

      expect(res.status).toBe(400);
    });

    it('deve retornar 400 com body vazio', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('validação de credenciais', () => {
    it('deve retornar 401 quando o email não existir', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: 'naoexiste@helpme.com', password: SENHA_TESTE });

      expect(res.status).toBe(401);
    });

    it('deve retornar 401 quando a senha estiver incorreta', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: ADMIN_EMAIL, password: 'SenhaErrada@999' });

      expect(res.status).toBe(401);
    });

    it('não deve revelar na mensagem de erro se o email existe', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: 'naoexiste@helpme.com', password: SENHA_TESTE });

      expect(res.status).toBe(401);
      const corpo = JSON.stringify(res.body);
      expect(corpo).not.toContain('não encontrado');
      expect(corpo).not.toContain('não existe');
      expect(corpo).not.toContain('not found');
    });

    it('deve retornar 401 para usuário com ativo=false', async () => {
      const emailInativo = emailUnico('inativo');
      await criarAdmin({ email: emailInativo, ativo: false });

      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: emailInativo, password: SENHA_TESTE });

      expect(res.status).toBe(401);
    });
  });

  describe('login bem-sucedido', () => {
    it('deve retornar 200 com accessToken e refreshToken', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: ADMIN_EMAIL, password: SENHA_TESTE });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
    });

    it('deve retornar dados do usuário no campo usuario', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: ADMIN_EMAIL, password: SENHA_TESTE });

      expect(res.status).toBe(200);
      expect(res.body.usuario.id).toBeDefined();
      expect(res.body.usuario.email).toBe(ADMIN_EMAIL);
      expect(res.body.usuario.regra).toBe('ADMIN');
    });

    it('não deve expor a senha no retorno', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: ADMIN_EMAIL, password: SENHA_TESTE });

      expect(res.status).toBe(200);
      expect(res.body.usuario.password).toBeUndefined();
    });

    it('deve incluir expiresIn no retorno', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: ADMIN_EMAIL, password: SENHA_TESTE });

      expect(res.status).toBe(200);
      expect(typeof res.body.expiresIn).toBe('string');
    });
  });
});
