import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, criarTecnico, emailUnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('listarAdminsUseCase E2E — GET /api/admin', () => {
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

    await criarAdmin({ email: emailUnico('admin2') });
    await criarAdmin({ email: emailUnico('admin-inativo'), ativo: false });
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação e autorização', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).get('/api/admin');
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para perfil USUARIO', async () => {
      const res = await request(app)
        .get('/api/admin')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(403);
    });

    it('deve retornar 403 para perfil TECNICO', async () => {
      const res = await request(app)
        .get('/api/admin')
        .set('Authorization', bearerHeader(tecnicoToken));
      expect(res.status).toBe(403);
    });
  });

  describe('listagem', () => {
    it('deve retornar 200 com lista paginada para ADMIN', async () => {
      const res = await request(app)
        .get('/api/admin')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.admins)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('deve listar apenas administradores ativos por padrão', async () => {
      const res = await request(app)
        .get('/api/admin')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      res.body.admins.forEach((a: any) => {
        expect(a.ativo).toBe(true);
        expect(a.regra).toBe('ADMIN');
      });
    });

    it('deve incluir inativos com incluirInativos=true', async () => {
      const resSem = await request(app)
        .get('/api/admin')
        .set('Authorization', bearerHeader(adminToken));
      const resCom = await request(app)
        .get('/api/admin?incluirInativos=true')
        .set('Authorization', bearerHeader(adminToken));
      expect(resCom.body.total).toBeGreaterThan(resSem.body.total);
    });

    it('deve respeitar paginação', async () => {
      const res = await request(app)
        .get('/api/admin?page=1&limit=1')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.admins.length).toBeLessThanOrEqual(1);
    });
  });

  describe('buscar admin por ID', () => {
    it('deve retornar 200 com dados do administrador', async () => {
      const lista = await request(app)
        .get('/api/admin')
        .set('Authorization', bearerHeader(adminToken));
      const { id } = lista.body.admins[0];

      const res = await request(app)
        .get(`/api/admin/${id}`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .get('/api/admin/id-nao-existe-admin')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(404);
    });
  });
});
