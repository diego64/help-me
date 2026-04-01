import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarTecnico, criarUsuario, emailUnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';
import { NivelTecnico } from '@prisma/client';

describe('listarTecnicosUseCase E2E — GET /api/tecnicos', () => {
  let adminToken: string;
  let usuarioToken: string;
  let tecnicoToken: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin   = await criarAdmin();
    const usuario = await criarUsuario();
    const tecnico = await criarTecnico();
    adminToken   = gerarToken(admin);
    usuarioToken = gerarToken(usuario);
    tecnicoToken = gerarToken(tecnico);

    // Técnicos adicionais para cobrir filtros
    await criarTecnico({ email: emailUnico('tec-n2'), nivel: NivelTecnico.N2 });
    await criarTecnico({ email: emailUnico('tec-inativo'), ativo: false });
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação e autorização', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).get('/api/tecnicos');
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para perfil USUARIO', async () => {
      const res = await request(app)
        .get('/api/tecnicos')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(403);
    });
  });

  describe('listagem', () => {
    it('deve retornar 200 com lista paginada para ADMIN', async () => {
      const res = await request(app)
        .get('/api/tecnicos')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.pagination.total).toBe('number');
    });

    it('deve retornar 403 para perfil TECNICO (coleção requer ADMIN)', async () => {
      const res = await request(app)
        .get('/api/tecnicos')
        .set('Authorization', bearerHeader(tecnicoToken));
      expect(res.status).toBe(403);
    });

    it('deve listar apenas técnicos ativos por padrão', async () => {
      const res = await request(app)
        .get('/api/tecnicos')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      res.body.data.forEach((t: any) => {
        expect(t.ativo).toBe(true);
      });
    });

    it('deve incluir inativos com incluirInativos=true', async () => {
      const resSem = await request(app)
        .get('/api/tecnicos')
        .set('Authorization', bearerHeader(adminToken));
      const resCom = await request(app)
        .get('/api/tecnicos?incluirInativos=true')
        .set('Authorization', bearerHeader(adminToken));
      expect(resCom.body.pagination.total).toBeGreaterThanOrEqual(resSem.body.pagination.total);
    });

    it('deve respeitar parâmetros de paginação', async () => {
      const res = await request(app)
        .get('/api/tecnicos?page=1&limit=1')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });
  });
});
