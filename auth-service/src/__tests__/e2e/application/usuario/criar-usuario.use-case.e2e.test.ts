import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import {
  criarAdmin,
  criarTecnico,
  criarUsuario,
  ADMIN_EMAIL,
  TECNICO_EMAIL,
  SENHA_TESTE,
  emailUnico,
} from '../../helpers/factory';
import { obterTokens, bearerHeader } from '../../helpers/auth.helper';

describe('criarUsuarioUseCase E2E — POST /auth/usuarios', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let tecnicoToken: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
    await criarTecnico();

    const adminAuth   = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    const tecnicoAuth = await obterTokens(TECNICO_EMAIL, SENHA_TESTE);
    adminToken   = adminAuth.accessToken;
    tecnicoToken = tecnicoAuth.accessToken;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação e autorização', () => {
    it('deve retornar 401 sem token de autenticação', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(401);
    });

    it('deve retornar 403 quando o solicitante não for ADMIN', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(tecnicoToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(403);
    });
  });

  describe('validação de entrada', () => {
    it('deve retornar 400 com campos obrigatórios ausentes', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Apenas Nome' });

      expect(res.status).toBe(400);
    });

    it('deve retornar 400 com email em formato inválido', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: 'email-sem-arroba', password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(400);
    });

    it('deve retornar erro de validação com senha sem maiúsculas', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: 'semmaiu@123', regra: 'USUARIO' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('deve retornar erro de validação com senha sem números', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailUnico(), password: 'SemNumeros@abc', regra: 'USUARIO' });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('deve retornar 409 quando o email já estiver cadastrado', async () => {
      const emailExistente = emailUnico('duplicado');
      await criarUsuario({ email: emailExistente });

      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailExistente, password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(409);
    });
  });

  describe('criação bem-sucedida', () => {
    it('deve criar usuário ADMIN retornando 201 com id e regra', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Novo', sobrenome: 'Admin', email: emailUnico('admin'), password: SENHA_TESTE, regra: 'ADMIN' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.regra).toBe('ADMIN');
      expect(res.body.ativo).toBe(true);
    });

    it('deve criar usuário TECNICO retornando 201', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Novo', sobrenome: 'Tecnico', email: emailUnico('tecnico'), password: SENHA_TESTE, regra: 'TECNICO' });

      expect(res.status).toBe(201);
      expect(res.body.regra).toBe('TECNICO');
    });

    it('deve criar usuário USUARIO retornando 201', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Novo', sobrenome: 'Usuario', email: emailUnico('usuario'), password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(201);
      expect(res.body.regra).toBe('USUARIO');
    });

    it('não deve retornar a senha no corpo da resposta', async () => {
      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Novo', sobrenome: 'Seguro', email: emailUnico('seguro'), password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(201);
      expect(res.body.password).toBeUndefined();
    });

    it('deve reativar usuário com soft delete ao criar com o mesmo email', async () => {
      const emailReativavel = emailUnico('reativavel');
      await criarUsuario({ email: emailReativavel, deletadoEm: new Date() });

      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Reativado', sobrenome: 'Usuario', email: emailReativavel, password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(201);
      expect(res.body.ativo).toBe(true);
    });
  });
});
