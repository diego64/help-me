import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

describe('deletarUsuarioUseCase E2E — DELETE /auth/usuarios/:id', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let tecnicoToken: string;
  let adminId: string;
  let usuarioAlvoId: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();

    const admin   = await criarAdmin();
    const tecnico = await criarTecnico();
    adminId = admin.id;

    const adminAuth   = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    const tecnicoAuth = await obterTokens(TECNICO_EMAIL, SENHA_TESTE);
    adminToken   = adminAuth.accessToken;
    tecnicoToken = tecnicoAuth.accessToken;
  });

  beforeEach(async () => {
    // Cria alvo fresco para cada teste de deleção
    const alvo = await criarUsuario({ email: emailUnico('deletar') });
    usuarioAlvoId = alvo.id;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autorização', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await request(app)
        .delete(`/auth/usuarios/${usuarioAlvoId}`);

      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para não-ADMIN', async () => {
      const res = await request(app)
        .delete(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(tecnicoToken));

      expect(res.status).toBe(403);
    });
  });


  describe('soft delete', () => {
    it('deve realizar soft delete retornando 200 com o ID', async () => {
      const res = await request(app)
        .delete(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(usuarioAlvoId);
    });

    it('após soft delete o usuário não deve conseguir fazer login', async () => {
      const emailAlvo = emailUnico('soft-delete-login');
      const alvo = await criarUsuario({ email: emailAlvo });

      await request(app)
        .delete(`/auth/usuarios/${alvo.id}`)
        .set('Authorization', bearerHeader(adminToken));

      const resLogin = await request(app)
        .post('/auth/sessao/login')
        .send({ email: emailAlvo, password: SENHA_TESTE });

      expect(resLogin.status).toBe(401);
    });
  });

  describe('hard delete (?permanente=true)', () => {
    it('deve remover permanentemente retornando mensagem adequada', async () => {
      const res = await request(app)
        .delete(`/auth/usuarios/${usuarioAlvoId}?permanente=true`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('permanentemente');
    });

    it('após hard delete o usuário não deve ser encontrado por busca', async () => {
      const emailAlvo = emailUnico('hard-delete-busca');
      const alvo = await criarUsuario({ email: emailAlvo });

      await request(app)
        .delete(`/auth/usuarios/${alvo.id}?permanente=true`)
        .set('Authorization', bearerHeader(adminToken));

      const resBusca = await request(app)
        .get(`/auth/usuarios/${alvo.id}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(resBusca.status).toBe(404);
    });
  });


  describe('regra: admin não pode deletar a si mesmo', () => {
    it('deve retornar 400 quando admin tenta deletar o próprio ID', async () => {
      const res = await request(app)
        .delete(`/auth/usuarios/${adminId}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(400);
    });
  });


  describe('ID inexistente', () => {
    it('deve retornar 404 para ID que não existe no banco', async () => {
      const res = await request(app)
        .delete('/auth/usuarios/id-inexistente-e2e-999')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(404);
    });
  });
});
