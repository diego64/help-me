import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import {
  criarAdmin,
  criarTecnico,
  criarUsuario,
  ADMIN_EMAIL,
  SENHA_TESTE,
  emailUnico,
} from '../../helpers/factory';
import { obterTokens, bearerHeader } from '../../helpers/auth.helper';

/**
 * Testa o comportamento das funções de request-params
 * (getNumberParamClamped, getBooleanParam, getEnumParam, getStringParam)
 * através do endpoint GET /auth/usuarios que usa todos esses helpers.
 */
describe('request-params E2E — parsing de query params via GET /auth/usuarios', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
    await criarTecnico();

    // Popula o banco com usuários de diferentes regras e estados
    await criarUsuario({ email: emailUnico('params-1') });
    await criarUsuario({ email: emailUnico('params-2') });
    await criarUsuario({ email: emailUnico('params-3'), ativo: false });

    const tokens = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    adminToken = tokens.accessToken;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('getNumberParamClamped — parâmetros numéricos com clamp', () => {
    it('deve usar o valor padrão de limit=10 quando não informado', async () => {
      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(10);
    });

    it('deve respeitar limit=5 quando informado', async () => {
      const res = await request(app)
        .get('/auth/usuarios?limit=5')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
      expect(res.body.usuarios.length).toBeLessThanOrEqual(5);
    });

    it('deve aplicar clamp máximo de 100 quando limit > 100', async () => {
      const res = await request(app)
        .get('/auth/usuarios?limit=500')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('deve usar limit mínimo de 1 quando limit=0 ou negativo', async () => {
      const res = await request(app)
        .get('/auth/usuarios?limit=0')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.limit).toBeGreaterThanOrEqual(1);
    });

    it('deve usar page=1 como padrão quando não informado', async () => {
      const res = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
    });

    it('deve navegar para a página 2 com page=2', async () => {
      const res = await request(app)
        .get('/auth/usuarios?page=2&limit=1')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
    });
  });

  describe('getBooleanParam — parâmetro booleano', () => {
    it('deve filtrar apenas ativos com ativo=true', async () => {
      const res = await request(app)
        .get('/auth/usuarios?ativo=true')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: { ativo: boolean }) => {
        expect(u.ativo).toBe(true);
      });
    });

    it('deve filtrar apenas inativos com ativo=false', async () => {
      const res = await request(app)
        .get('/auth/usuarios?ativo=false')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: { ativo: boolean }) => {
        expect(u.ativo).toBe(false);
      });
    });

    it('deve retornar todos quando ativo não for informado', async () => {
      const resTodos   = await request(app).get('/auth/usuarios').set('Authorization', bearerHeader(adminToken));
      const resAtivos  = await request(app).get('/auth/usuarios?ativo=true').set('Authorization', bearerHeader(adminToken));
      const resInativos = await request(app).get('/auth/usuarios?ativo=false').set('Authorization', bearerHeader(adminToken));

      expect(resTodos.status).toBe(200);
      expect(resTodos.body.total).toBeGreaterThanOrEqual(
        resAtivos.body.total + resInativos.body.total
      );
    });
  });

  describe('getEnumParam — parâmetro de enum', () => {
    it('deve filtrar por regra=ADMIN retornando apenas ADMINs', async () => {
      const res = await request(app)
        .get('/auth/usuarios?regra=ADMIN')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: { regra: string }) => {
        expect(u.regra).toBe('ADMIN');
      });
    });

    it('deve filtrar por regra=TECNICO retornando apenas TECNICOs', async () => {
      const res = await request(app)
        .get('/auth/usuarios?regra=TECNICO')
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      res.body.usuarios.forEach((u: { regra: string }) => {
        expect(u.regra).toBe('TECNICO');
      });
    });

    it('deve ignorar ou tratar corretamente um valor de regra inválido', async () => {
      const res = await request(app)
        .get('/auth/usuarios?regra=REGRA_INVALIDA')
        .set('Authorization', bearerHeader(adminToken));

      // Pode retornar 200 com lista vazia ou 200 ignorando o filtro
      expect(res.status).toBe(200);
    });
  });

  describe('getStringParam — parâmetro de busca textual', () => {
    it('deve buscar usuário pelo nome parcial', async () => {
      const nomeBusca = `UnicoNome${Date.now()}`;
      await criarUsuario({ nome: nomeBusca, email: emailUnico('busca-str') });

      const res = await request(app)
        .get(`/auth/usuarios?busca=${nomeBusca.slice(0, 8)}`)
        .set('Authorization', bearerHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.usuarios.length).toBeGreaterThanOrEqual(1);
    });

    it('deve retornar todos quando busca não for informada', async () => {
      const resSemBusca = await request(app)
        .get('/auth/usuarios')
        .set('Authorization', bearerHeader(adminToken));

      const resComBusca = await request(app)
        .get('/auth/usuarios?busca=')
        .set('Authorization', bearerHeader(adminToken));

      expect(resSemBusca.status).toBe(200);
      expect(resComBusca.status).toBe(200);
    });
  });
});
