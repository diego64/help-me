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

describe('reativarUsuarioUseCase E2E — PATCH /auth/usuarios/:id/reativar', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let tecnicoToken: string;
  let usuarioInativoId: string;
  let usuarioAtivoId: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
    await criarTecnico();

    const adminAuth   = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    const tecnicoAuth = await obterTokens(TECNICO_EMAIL, SENHA_TESTE);
    adminToken   = adminAuth.accessToken;
    tecnicoToken = tecnicoAuth.accessToken;

    // Cria e desativa um usuário para ser reativado
    const usuarioParaInativar = await criarUsuario({ email: emailUnico('inativar-reativar') });
    usuarioInativoId = usuarioParaInativar.id;

    await request(app)
      .delete(`/auth/usuarios/${usuarioInativoId}`)
      .set('Authorization', bearerHeader(adminToken));

    // Cria um usuário que já está ativo (para testar erro de reativação)
    const ativo = await criarUsuario({ email: emailUnico('ja-ativo') });
    usuarioAtivoId = ativo.id;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autorização', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await request(app)
        .patch(`/auth/usuarios/${usuarioInativoId}/reativar`);

      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para não-ADMIN', async () => {
      const res = await request(app)
        .patch(`/auth/usuarios/${usuarioInativoId}/reativar`)
        .set('Authorization', bearerHeader(tecnicoToken));

      expect(res.status).toBe(403);
    });
  });

  describe('reativação bem-sucedida', () => {
    it('deve reativar usuário inativo retornando 200 com ativo=true', async () => {
      const res = await request(app)
        .patch(`/auth/usuarios/${usuarioInativoId}/reativar`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
      expect(res.body.usuario.ativo).toBe(true);
    });

    it('após reativação o usuário deve conseguir fazer login novamente', async () => {
      const emailReativavel = emailUnico('login-pos-reativacao');
      const u = await criarUsuario({ email: emailReativavel });

      // Desativa
      await request(app)
        .delete(`/auth/usuarios/${u.id}`)
        .set('Authorization', bearerHeader(adminToken));

      // Reativa
      await request(app)
        .patch(`/auth/usuarios/${u.id}/reativar`)
        .set('Authorization', bearerHeader(adminToken));

      // Tenta login
      const resLogin = await request(app)
        .post('/auth/sessao/login')
        .send({ email: emailReativavel, password: SENHA_TESTE });

      expect(resLogin.status).toBe(200);
    });
  });

  describe('usuário já ativo', () => {
    it('deve retornar erro (4xx) ao tentar reativar usuário que já está ativo', async () => {
      const res = await request(app)
        .patch(`/auth/usuarios/${usuarioAtivoId}/reativar`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('ID inexistente', () => {
    it('deve retornar 404 para ID que não existe no banco', async () => {
      const res = await request(app)
        .patch('/auth/usuarios/id-inexistente-e2e-999/reativar')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(404);
    });
  });
});
