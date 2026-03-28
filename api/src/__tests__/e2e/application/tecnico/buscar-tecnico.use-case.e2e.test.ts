import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarTecnico, criarUsuario } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('buscarTecnicoUseCase E2E — GET /api/tecnicos/:id', () => {
  let adminToken: string;
  let usuarioToken: string;
  let tecnicoToken: string;
  let tecnicoId: string;

  beforeAll(async () => {
    await limparBancoDados();
    const admin   = await criarAdmin();
    const usuario = await criarUsuario();
    const tecnico = await criarTecnico();
    adminToken   = gerarToken(admin);
    usuarioToken = gerarToken(usuario);
    tecnicoToken = gerarToken(tecnico);
    tecnicoId    = tecnico.id;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  it('deve retornar 401 sem token', async () => {
    const res = await request(app).get(`/api/tecnicos/${tecnicoId}`);
    expect(res.status).toBe(401);
  });

  it('deve retornar 403 para perfil USUARIO', async () => {
    const res = await request(app)
      .get(`/api/tecnicos/${tecnicoId}`)
      .set('Authorization', bearerHeader(usuarioToken));
    expect(res.status).toBe(403);
  });

  it('deve retornar 200 com os dados do técnico para ADMIN', async () => {
    const res = await request(app)
      .get(`/api/tecnicos/${tecnicoId}`)
      .set('Authorization', bearerHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tecnicoId);
    expect(res.body.regra).toBe('TECNICO');
  });

  it('deve retornar 200 quando TECNICO busca seu próprio perfil', async () => {
    const res = await request(app)
      .get(`/api/tecnicos/${tecnicoId}`)
      .set('Authorization', bearerHeader(tecnicoToken));
    expect(res.status).toBe(200);
  });

  it('deve retornar 404 para ID inexistente', async () => {
    const res = await request(app)
      .get('/api/tecnicos/id-que-nao-existe-tec')
      .set('Authorization', bearerHeader(adminToken));
    expect(res.status).toBe(404);
  });

  it('a resposta deve conter os campos esperados', async () => {
    const res = await request(app)
      .get(`/api/tecnicos/${tecnicoId}`)
      .set('Authorization', bearerHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('nome');
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('regra');
    expect(res.body).toHaveProperty('nivel');
  });
});
