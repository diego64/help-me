import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, criarTecnico, emailUnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';
import { Regra } from '@prisma/client';

describe('listarUsuariosUseCase E2E — GET /api/usuarios', () => {
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
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação e autorização', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).get('/api/usuarios');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('deve retornar 401 com token expirado', async () => {
      const admin = await criarAdmin({ email: emailUnico('exp-admin') });
      const token = gerarToken(admin, -1);
      const res = await request(app).get('/api/usuarios').set('Authorization', bearerHeader(token));
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para perfil USUARIO', async () => {
      const res = await request(app)
        .get('/api/usuarios')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
    });

    it('deve retornar 403 para perfil TECNICO', async () => {
      const res = await request(app)
        .get('/api/usuarios')
        .set('Authorization', bearerHeader(tecnicoToken));
      expect(res.status).toBe(403);
    });
  });

  describe('listagem com ADMIN', () => {
    it('deve retornar 200 com lista paginada', async () => {
      const res = await request(app)
        .get('/api/usuarios')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.pagination.total).toBe('number');
    });

    it('deve listar apenas usuários com regra USUARIO por padrão', async () => {
      const res = await request(app)
        .get('/api/usuarios')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      res.body.data.forEach((u: any) => {
        expect(u.regra).toBe(Regra.USUARIO);
      });
    });

    it('deve respeitar parâmetros de paginação', async () => {
      const res = await request(app)
        .get('/api/usuarios?page=1&limit=5')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('deve filtrar usuários inativos com incluirInativos=true', async () => {
      await criarUsuario({ email: emailUnico('inativo'), ativo: false });
      const resSem = await request(app)
        .get('/api/usuarios')
        .set('Authorization', bearerHeader(adminToken));
      const comAtivos = resSem.body.pagination.total;

      const resCom = await request(app)
        .get('/api/usuarios?incluirInativos=true')
        .set('Authorization', bearerHeader(adminToken));
      expect(resCom.body.pagination.total).toBeGreaterThanOrEqual(comAtivos);
    });

    it('deve buscar por nome parcial com filtro busca', async () => {
      await criarUsuario({ email: emailUnico('busca'), nome: 'ZeñoUnico' });
      const res = await request(app)
        .get('/api/usuarios?busca=ZeñoUnico')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
