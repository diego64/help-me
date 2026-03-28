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

describe('listarUsuariosUseCase E2E — GET /auth/usuarios', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let tecnicoToken: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
    await criarTecnico();

    // Cria usuários extras para popular a listagem
    await criarUsuario({ email: emailUnico('lista-1') });
    await criarUsuario({ email: emailUnico('lista-2'), ativo: false });

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
      const res = await request(app).get('/auth/usuarios');
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para não-ADMIN', async () => {
      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(tecnicoToken));

      expect(res.status).toBe(403);
    });
  });

  describe('listagem e paginação', () => {
    it('deve retornar 200 com estrutura de paginação', async () => {
      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.usuarios)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(typeof res.body.page).toBe('number');
      expect(typeof res.body.limit).toBe('number');
      expect(typeof res.body.totalPages).toBe('number');
    });

    it('deve respeitar o parâmetro limit', async () => {
      const res = await request(app)
        .get('/auth/usuarios?limit=1')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.usuarios.length).toBeLessThanOrEqual(1);
      expect(res.body.limit).toBe(1);
    });

    it('deve navegar para a segunda página corretamente', async () => {
      const resPagina1 = await request(app)
        .get('/auth/usuarios?page=1&limit=1')
        .set('Authorization', bearerHeader(adminToken));

      const resPagina2 = await request(app)
        .get('/auth/usuarios?page=2&limit=1')
        .set('Authorization', bearerHeader(adminToken));

      expect(resPagina1.status).toBe(200);
      expect(resPagina2.status).toBe(200);

      if (resPagina1.body.usuarios[0] && resPagina2.body.usuarios[0]) {
        expect(resPagina1.body.usuarios[0].id).not.toBe(resPagina2.body.usuarios[0].id);
      }
    });
  });

  describe('filtros', () => {
    it('deve filtrar apenas usuários com regra ADMIN', async () => {
      const res = await request(app)
        .get('/auth/usuarios?regra=ADMIN')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: { regra: string }) => {
        expect(u.regra).toBe('ADMIN');
      });
    });

    it('deve filtrar apenas usuários com regra TECNICO', async () => {
      const res = await request(app)
        .get('/auth/usuarios?regra=TECNICO')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: { regra: string }) => {
        expect(u.regra).toBe('TECNICO');
      });
    });

    it('deve filtrar apenas usuários ativos com ativo=true', async () => {
      const res = await request(app)
        .get('/auth/usuarios?ativo=true')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: { ativo: boolean }) => {
        expect(u.ativo).toBe(true);
      });
    });

    it('deve buscar usuário pelo nome (case-insensitive)', async () => {
      const nomeUnico = `BuscaE2E${Date.now()}`;
      await criarUsuario({ nome: nomeUnico, email: emailUnico('busca-nome') });

      const res = await request(app)
        .get(`/auth/usuarios?busca=${nomeUnico.toLowerCase()}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.usuarios.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('segurança dos dados retornados', () => {
    it('não deve retornar o campo password em nenhum usuário da lista', async () => {
      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: Record<string, unknown>) => {
        expect(u.password).toBeUndefined();
      });
    });

    it('não deve retornar o campo refreshToken em nenhum usuário da lista', async () => {
      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: Record<string, unknown>) => {
        expect(u.refreshToken).toBeUndefined();
      });
    });
  });
});
