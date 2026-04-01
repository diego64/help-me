import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../../app';
import { limparBancoDados } from '../../../helpers/database';
import {
  criarAdmin,
  criarUsuario,
  ADMIN_EMAIL,
  SENHA_TESTE,
  emailUnico,
} from '../../../helpers/factory';
import { obterTokens, bearerHeader } from '../../../helpers/auth.helper';

describe('errorMiddleware E2E — formato e segurança das respostas de erro', () => {
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

  describe('400 Bad Request', () => {
    it('deve retornar 400 com campo detail na resposta', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: '', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.detail).toBeDefined();
    });

    it('a mensagem de erro 400 deve ser uma string não vazia', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({});

      expect(res.status).toBe(400);
      expect(typeof res.body.detail).toBe('string');
      expect(res.body.detail.length).toBeGreaterThan(0);
    });
  });

  describe('401 Unauthorized', () => {
    it('deve retornar 401 com campo error na resposta', async () => {
      const res = await request(app).get('/auth/sessao/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('deve retornar 401 com mensagem genérica para credenciais inválidas', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: 'x@x.com', password: 'Invalido@123' });

      expect(res.status).toBe(401);
      // Não deve revelar informações sobre a existência do usuário
      expect(res.body.detail).not.toContain('não encontrado');
      expect(res.body.detail).not.toContain('não existe');
    });
  });

  describe('403 Forbidden', () => {
    it('deve retornar 403 com campo error ao acessar recurso sem permissão', async () => {
      const { criarTecnico, TECNICO_EMAIL } = await import('../../../helpers/factory');
      await criarTecnico();
      const { accessToken: tecnicoToken } = await obterTokens(TECNICO_EMAIL, SENHA_TESTE);

      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(tecnicoToken));

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('404 Not Found', () => {
    it('deve retornar 404 para rota inexistente', async () => {
      const res = await request(app).get('/rota-que-nao-existe');
      expect(res.status).toBe(404);
    });

    it('deve retornar 404 ao buscar usuário com ID inexistente', async () => {
      const res = await request(app)
        .get('/auth/usuarios/id-que-nao-existe')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(404);
      expect(res.body.detail).toBeDefined();
    });
  });

  describe('409 Conflict', () => {
    it('deve retornar 409 com campo detail ao criar usuário com email duplicado', async () => {
      const emailExistente = emailUnico('duplicado-error');
      await criarUsuario({ email: emailExistente });

      const res = await request(app)
        .post('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'X', sobrenome: 'Y', email: emailExistente, password: SENHA_TESTE, regra: 'USUARIO' });

      expect(res.status).toBe(409);
      expect(res.body.detail).toBeDefined();
    });
  });

  describe('segurança das respostas de erro', () => {
    it('não deve expor stack trace no campo detail da resposta de erro', async () => {
      const res = await request(app)
        .get('/auth/usuarios/id-inexistente')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(404);
      // O campo detail (visível ao cliente) não deve conter stack trace
      const detail = res.body.detail ?? '';
      expect(detail).not.toContain('at ');
      expect(detail).not.toContain('.ts:');
      // Em não-produção o campo stack pode existir, mas isolado — não vaza no detail
      expect(res.body.status).toBe(404);
    });

    it('não deve expor detalhes do banco de dados nas respostas de erro', async () => {
      const res = await request(app)
        .post('/auth/sessao/login')
        .send({ email: 'teste@teste.com', password: 'Invalido@123' });

      expect(res.status).toBe(401);
      const corpo = JSON.stringify(res.body);
      expect(corpo.toLowerCase()).not.toContain('prisma');
      expect(corpo.toLowerCase()).not.toContain('sql');
      expect(corpo.toLowerCase()).not.toContain('database');
    });
  });
});
