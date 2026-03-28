import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados, limparMongoDB } from '../../helpers/database';
import { criarAdmin, criarUsuario } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('notificacaoUseCase E2E — GET /api/notificacoes', () => {
  let adminToken: string;
  let usuarioToken: string;

  beforeAll(async () => {
    await limparBancoDados();
    await limparMongoDB();
    const admin   = await criarAdmin();
    const usuario = await criarUsuario();
    adminToken   = gerarToken(admin);
    usuarioToken = gerarToken(usuario);
  });

  afterAll(async () => {
    await limparBancoDados();
    await limparMongoDB();
  });

  describe('autenticação', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).get('/api/notificacoes');
      expect(res.status).toBe(401);
    });
  });

  describe('listagem', () => {
    it('deve retornar 200 com lista vazia quando não há notificações (ADMIN)', async () => {
      const res = await request(app)
        .get('/api/notificacoes')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.naoLidas).toBe('number');
    });

    it('deve retornar 200 para USUARIO autenticado', async () => {
      const res = await request(app)
        .get('/api/notificacoes')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(200);
    });

    it('deve aceitar filtro naoLidas=true', async () => {
      const res = await request(app)
        .get('/api/notificacoes?naoLidas=true')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
    });

    it('deve respeitar parâmetros de paginação', async () => {
      const res = await request(app)
        .get('/api/notificacoes?page=1&limit=5')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });

  describe('marcar todas como lidas', () => {
    it('deve retornar 200 ao marcar todas como lidas', async () => {
      const res = await request(app)
        .patch('/api/notificacoes/marcar-todas-lidas')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(typeof res.body.atualizadas).toBe('number');
    });
  });
});
