import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../../app';
import { limparBancoDados } from '../../helpers/database';
import { criarAdmin, criarUsuario, criarTecnico } from '../../helpers/factory';
import { gerarToken, bearerHeader } from '../../helpers/auth.helper';

describe('criarServicoUseCase E2E — POST /api/servicos', () => {
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
      const res = await request(app).post('/api/servicos').send({ nome: 'Serviço X' });
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para perfil USUARIO', async () => {
      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(usuarioToken))
        .send({ nome: 'Serviço Y' });
      expect(res.status).toBe(403);
    });

    it('deve retornar 403 para perfil TECNICO', async () => {
      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(tecnicoToken))
        .send({ nome: 'Serviço Z' });
      expect(res.status).toBe(403);
    });
  });

  describe('validação', () => {
    it('deve retornar 400 quando nome não é fornecido', async () => {
      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(adminToken))
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('deve retornar 400 quando nome tem menos de 3 caracteres', async () => {
      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'TI' });
      expect(res.status).toBe(400);
    });

    it('deve retornar 400 quando descrição excede 500 caracteres', async () => {
      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Serviço Valid', descricao: 'x'.repeat(501) });
      expect(res.status).toBe(400);
    });
  });

  describe('criação bem-sucedida', () => {
    it('deve retornar 201 com o serviço criado', async () => {
      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Suporte Técnico E2E', descricao: 'Serviço de suporte para testes E2E' });
      expect(res.status).toBe(201);
      expect(res.body.nome).toBe('Suporte Técnico E2E');
      expect(res.body.id).toBeDefined();
    });

    it('deve criar serviço sem descrição', async () => {
      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Serviço Sem Desc E2E' });
      expect(res.status).toBe(201);
      expect(res.body.nome).toBe('Serviço Sem Desc E2E');
    });

    it('deve retornar 409 ao criar serviço com nome duplicado', async () => {
      await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Serviço Duplicado E2E' });

      const res = await request(app)
        .post('/api/servicos')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Serviço Duplicado E2E' });
      expect(res.status).toBe(409);
    });
  });
});
