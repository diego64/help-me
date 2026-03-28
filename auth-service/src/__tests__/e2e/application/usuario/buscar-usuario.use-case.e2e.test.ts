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

describe('buscarUsuarioPorIdUseCase E2E — GET /auth/usuarios/:id', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let tecnicoToken: string;
  let usuarioAlvoId: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
    await criarTecnico();

    const alvo = await criarUsuario({ email: emailUnico('alvo-busca') });
    usuarioAlvoId = alvo.id;

    const adminAuth   = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    const tecnicoAuth = await obterTokens(TECNICO_EMAIL, SENHA_TESTE);
    adminToken   = adminAuth.accessToken;
    tecnicoToken = tecnicoAuth.accessToken;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autorização', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await request(app).get(`/auth/usuarios/${usuarioAlvoId}`);
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para não-ADMIN', async () => {
      const res = await request(app)
        .get(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(tecnicoToken));

      expect(res.status).toBe(403);
    });
  });

  describe('busca bem-sucedida', () => {
    it('deve retornar 200 com os dados do usuário existente', async () => {
      const res = await request(app)
        .get(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(usuarioAlvoId);
      expect(res.body.nome).toBeDefined();
      expect(res.body.email).toBeDefined();
    });

    it('não deve retornar a senha no detalhe do usuário', async () => {
      const res = await request(app)
        .get(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.password).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
    });
  });

  describe('ID inexistente', () => {
    it('deve retornar 404 para ID que não existe no banco', async () => {
      const res = await request(app)
        .get('/auth/usuarios/id-que-nao-existe-e2e')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(404);
    });
  });
});
