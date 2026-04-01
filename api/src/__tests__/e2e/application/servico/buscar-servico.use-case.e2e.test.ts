import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';
import { prisma } from '@infrastructure/database/prisma/client';

describe('buscarServicoUseCase E2E — GET /api/servicos/:id', () => {
  let adminToken: string;
  let usuarioToken: string;
  let servicoId: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin   = await criarAdmin();
    const usuario = await criarUsuario();
    adminToken   = gerarToken(admin);
    usuarioToken = gerarToken(usuario);

    const servico = await prisma.servico.create({ data: { nome: 'Serviço Busca E2E' } });
    servicoId = servico.id;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  it('deve retornar 401 sem token', async () => {
    const res = await request(app).get(`/api/servicos/${servicoId}`);
    expect(res.status).toBe(401);
  });

  it('deve retornar 200 com o serviço encontrado', async () => {
    const res = await request(app)
      .get(`/api/servicos/${servicoId}`)
      .set('Authorization', bearerHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(servicoId);
    expect(res.body.nome).toBe('Serviço Busca E2E');
  });

  it('deve retornar 200 para perfil USUARIO', async () => {
    const res = await request(app)
      .get(`/api/servicos/${servicoId}`)
      .set('Authorization', bearerHeader(usuarioToken));
    expect(res.status).toBe(200);
  });

  it('deve retornar 404 para ID inexistente', async () => {
    const res = await request(app)
      .get('/api/servicos/id-nao-existe-servico')
      .set('Authorization', bearerHeader(adminToken));
    expect(res.status).toBe(404);
  });
});
