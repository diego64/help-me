import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';
import { prisma } from '@infrastructure/database/prisma/client';

describe('atualizarServicoUseCase E2E — PUT /api/servicos/:id', () => {
  let adminToken: string;
  let usuarioToken: string;
  let servicoId: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin   = await criarAdmin();
    const usuario = await criarUsuario();
    adminToken   = gerarToken(admin);
    usuarioToken = gerarToken(usuario);

    const servico = await prisma.servico.create({ data: { nome: 'Serviço Atualizar E2E' } });
    servicoId = servico.id;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  it('deve retornar 401 sem token', async () => {
    const res = await request(app).put(`/api/servicos/${servicoId}`).send({ nome: 'Novo' });
    expect(res.status).toBe(401);
  });

  it('deve retornar 403 para perfil USUARIO', async () => {
    const res = await request(app)
      .put(`/api/servicos/${servicoId}`)
      .set('Authorization', bearerHeader(usuarioToken))
      .send({ nome: 'Tentativa' });
    expect(res.status).toBe(403);
  });

  it('deve retornar 400 para nome muito curto', async () => {
    const res = await request(app)
      .put(`/api/servicos/${servicoId}`)
      .set('Authorization', bearerHeader(adminToken))
      .send({ nome: 'AB' });
    expect(res.status).toBe(400);
  });

  it('deve retornar 200 ao atualizar nome', async () => {
    const res = await request(app)
      .put(`/api/servicos/${servicoId}`)
      .set('Authorization', bearerHeader(adminToken))
      .send({ nome: 'Serviço Renomeado E2E' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Serviço Renomeado E2E');
  });

  it('deve retornar 200 ao atualizar descrição', async () => {
    const res = await request(app)
      .put(`/api/servicos/${servicoId}`)
      .set('Authorization', bearerHeader(adminToken))
      .send({ descricao: 'Nova descrição do serviço E2E' });
    expect(res.status).toBe(200);
    expect(res.body.descricao).toBe('Nova descrição do serviço E2E');
  });

  it('deve retornar 404 para ID inexistente', async () => {
    const res = await request(app)
      .put('/api/servicos/id-nao-existe-update')
      .set('Authorization', bearerHeader(adminToken))
      .send({ nome: 'Ninguem' });
    expect(res.status).toBe(404);
  });

  it('deve retornar 409 ao usar nome já existente', async () => {
    const outro = await prisma.servico.create({ data: { nome: 'Serviço Conflito E2E' } });
    const res = await request(app)
      .put(`/api/servicos/${servicoId}`)
      .set('Authorization', bearerHeader(adminToken))
      .send({ nome: outro.nome });
    expect(res.status).toBe(409);
  });
});
