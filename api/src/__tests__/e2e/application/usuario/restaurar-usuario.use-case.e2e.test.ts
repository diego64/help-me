import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, emailUnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('restaurarUsuarioUseCase E2E — PATCH /api/usuarios/:id/restaurar', () => {
  let adminToken: string;
  let usuarioToken: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin   = await criarAdmin();
    const usuario = await criarUsuario();
    adminToken   = gerarToken(admin);
    usuarioToken = gerarToken(usuario);
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação e autorização', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).patch('/api/usuarios/qualquer-id/restaurar');
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para perfil USUARIO', async () => {
      const res = await request(app)
        .patch('/api/usuarios/qualquer-id/restaurar')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(403);
    });
  });

  describe('restauração', () => {
    it('deve restaurar usuário com deletadoEm definido', async () => {
      const usuario = await criarUsuario({
        email: emailUnico('rest-usuario'),
        deletadoEm: new Date(),
      });

      const res = await request(app)
        .patch(`/api/usuarios/${usuario.id}/restaurar`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.usuario.deletadoEm).toBeNull();
    });

    it('deve retornar 400 ao tentar restaurar usuário não deletado', async () => {
      const usuario = await criarUsuario({ email: emailUnico('rest-ativo') });
      const res = await request(app)
        .patch(`/api/usuarios/${usuario.id}/restaurar`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(400);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .patch('/api/usuarios/id-nao-existe-rest/restaurar')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(404);
    });
  });
});
