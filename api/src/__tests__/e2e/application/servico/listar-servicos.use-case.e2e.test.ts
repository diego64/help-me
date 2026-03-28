import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, criarTecnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';
import { prisma } from '@infrastructure/database/prisma/client';

describe('listarServicosUseCase E2E — GET /api/servicos', () => {
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

    // Semear serviços para os testes
    await prisma.servico.createMany({
      data: [
        { nome: 'Infraestrutura Lista E2E',  ativo: true  },
        { nome: 'Redes Lista E2E',            ativo: true  },
        { nome: 'Inativo Lista E2E',          ativo: false },
      ],
    });
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autenticação', () => {
    it('deve retornar 401 sem token', async () => {
      const res = await request(app).get('/api/servicos');
      expect(res.status).toBe(401);
    });
  });

  describe('listagem', () => {
    it('deve retornar 200 com lista paginada para ADMIN', async () => {
      const res = await request(app)
        .get('/api/servicos')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.pagination.total).toBe('number');
    });

    it('deve retornar 200 para USUARIO', async () => {
      const res = await request(app)
        .get('/api/servicos')
        .set('Authorization', bearerHeader(usuarioToken));
      expect(res.status).toBe(200);
    });

    it('deve retornar 200 para TECNICO', async () => {
      const res = await request(app)
        .get('/api/servicos')
        .set('Authorization', bearerHeader(tecnicoToken));
      expect(res.status).toBe(200);
    });

    it('deve listar apenas serviços ativos por padrão', async () => {
      const res = await request(app)
        .get('/api/servicos')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      res.body.data.forEach((s: any) => {
        expect(s.ativo).toBe(true);
      });
    });

    it('deve incluir inativos com incluirInativos=true', async () => {
      const resSem = await request(app)
        .get('/api/servicos')
        .set('Authorization', bearerHeader(adminToken));
      const resCom = await request(app)
        .get('/api/servicos?incluirInativos=true')
        .set('Authorization', bearerHeader(adminToken));
      expect(resCom.body.pagination.total).toBeGreaterThan(resSem.body.pagination.total);
    });

    it('deve filtrar por busca parcial de nome', async () => {
      const res = await request(app)
        .get('/api/servicos?busca=Infraestrutura')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].nome).toContain('Infraestrutura');
    });

    it('deve respeitar parâmetros de paginação', async () => {
      const res = await request(app)
        .get('/api/servicos?page=1&limit=1')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });
  });
});
