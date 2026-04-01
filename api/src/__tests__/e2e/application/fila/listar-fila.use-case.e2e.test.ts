import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarTecnico, criarUsuario } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('FilaUseCase E2E — GET /api/fila-chamados', () => {
  let adminToken: string;
  let tecnicoToken: string;
  let usuarioToken: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin   = await criarAdmin();
    const tecnico = await criarTecnico();
    const usuario = await criarUsuario();
    adminToken   = gerarToken(admin);
    tecnicoToken = gerarToken(tecnico);
    usuarioToken = gerarToken(usuario);
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação', () => {
    it('deve retornar 401 sem token em /fila/resumo', async () => {
      const res = await request(app).get('/api/fila-chamados/resumo');
      expect(res.status).toBe(401);
    });

    it('deve retornar 401 sem token em /estatisticas', async () => {
      const res = await request(app).get('/api/fila-chamados/estatisticas');
      expect(res.status).toBe(401);
    });
  });

  describe('autorização', () => {
    it('deve retornar 403 em /fila/resumo para USUARIO', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/resumo')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(403);
    });

    it('deve retornar 403 em /estatisticas para TECNICO', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/estatisticas')
        .set('Authorization', bearerHeader(tecnicoToken));
      expect(res.status).toBe(403);
    });
  });

  describe('fila resumo', () => {
    it('deve retornar 200 com resumo das filas para ADMIN', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/resumo')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(typeof res.body.totalGeral).toBe('number');
    });

    it('deve retornar 200 para TECNICO em /fila/resumo', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/resumo')
        .set('Authorization', bearerHeader(tecnicoToken));
      expect(res.status).toBe(200);
    });
  });

  describe('fila alta e baixa', () => {
    it('deve retornar 200 com lista da fila alta para ADMIN', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/alta')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('deve retornar 200 com lista da fila baixa para ADMIN', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/baixa')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('estatísticas', () => {
    it('deve retornar 200 com estatísticas para ADMIN', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/estatisticas')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(typeof res.body.porStatus.abertos).toBe('number');
      expect(typeof res.body.filaAlta).toBe('number');
    });
  });

  describe('meus chamados e atribuídos', () => {
    it('deve retornar 200 em /meus-chamados para USUARIO', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/meus-chamados')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('deve retornar 200 em /chamados-atribuidos para TECNICO', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/chamados-atribuidos')
        .set('Authorization', bearerHeader(tecnicoToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('deve retornar 200 em /todos-chamados para ADMIN', async () => {
      const res = await request(app)
        .get('/api/fila-chamados/todos-chamados')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
