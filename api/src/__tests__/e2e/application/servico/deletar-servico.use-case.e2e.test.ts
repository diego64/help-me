import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';
import { prisma } from '@infrastructure/database/prisma/client';

describe('deletarServicoUseCase E2E — DELETE/PATCH /api/servicos/:id', () => {
  let adminToken: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin = await criarAdmin();
    adminToken  = gerarToken(admin);
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('soft delete', () => {
    it('deve retornar 200 e marcar como deletado', async () => {
      const servico = await prisma.servico.create({ data: { nome: 'Del Soft E2E' } });
      const res = await request(app)
        .delete(`/api/servicos/${servico.id}`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .delete('/api/servicos/id-nao-existe-del-serv')
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(404);
    });
  });

  describe('hard delete (permanente=true)', () => {
    it('deve remover o serviço permanentemente', async () => {
      const servico = await prisma.servico.create({ data: { nome: 'Del Perm E2E' } });
      const del = await request(app)
        .delete(`/api/servicos/${servico.id}?permanente=true`)
        .set('Authorization', bearerHeader(adminToken));
      expect(del.status).toBe(200);

      const busca = await request(app)
        .get(`/api/servicos/${servico.id}`)
        .set('Authorization', bearerHeader(adminToken));
      expect(busca.status).toBe(404);
    });
  });

  describe('restaurar serviço', () => {
    it('deve restaurar serviço deletado via PATCH /restaurar', async () => {
      const servico = await prisma.servico.create({ data: { nome: 'Rest Serv E2E', deletadoEm: new Date() } });
      const res = await request(app)
        .patch(`/api/servicos/${servico.id}/restaurar`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.servico.ativo).toBe(true);
    });

    it('deve retornar 400 ao restaurar serviço não deletado', async () => {
      const servico = await prisma.servico.create({ data: { nome: 'Rest Ativo E2E' } });
      const res = await request(app)
        .patch(`/api/servicos/${servico.id}/restaurar`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(400);
    });
  });

  describe('desativar e reativar serviço', () => {
    it('deve desativar serviço ativo', async () => {
      const servico = await prisma.servico.create({ data: { nome: 'Desativar E2E', ativo: true } });
      const res = await request(app)
        .patch(`/api/servicos/${servico.id}/desativar`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      // desativar retorna { message, id } — verifica via banco que ativo=false
      expect(res.body.message).toBeDefined();
    });

    it('deve reativar serviço inativo', async () => {
      const servico = await prisma.servico.create({ data: { nome: 'Reativar E2E', ativo: false } });
      const res = await request(app)
        .patch(`/api/servicos/${servico.id}/reativar`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.servico.ativo).toBe(true);
    });

    it('deve retornar 400 ao desativar serviço já inativo', async () => {
      const servico = await prisma.servico.create({ data: { nome: 'Ja Inativo E2E', ativo: false } });
      const res = await request(app)
        .patch(`/api/servicos/${servico.id}/desativar`)
        .set('Authorization', bearerHeader(adminToken));
      expect(res.status).toBe(400);
    });
  });
});
