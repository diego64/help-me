import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

describe('atualizarUsuarioUseCase E2E — PUT /auth/usuarios/:id', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let tecnicoToken: string;
  let usuarioAlvoId: string;

  beforeAll(async () => {
    app = createApp();
    await limparBancoDados();
    await criarAdmin();
    await criarTecnico();

    const adminAuth   = await obterTokens(ADMIN_EMAIL, SENHA_TESTE);
    const tecnicoAuth = await obterTokens(TECNICO_EMAIL, SENHA_TESTE);
    adminToken   = adminAuth.accessToken;
    tecnicoToken = tecnicoAuth.accessToken;
  });

  beforeEach(async () => {
    // Cria um usuário alvo fresco para cada teste, evitando interferência
    const alvo = await criarUsuario({ email: emailUnico('atualizar') });
    usuarioAlvoId = alvo.id;
  });

  afterAll(async () => {
    await limparBancoDados();
  });

  describe('autorização', () => {
    it('deve retornar 401 sem autenticação', async () => {
      const res = await request(app)
        .put(`/auth/usuarios/${usuarioAlvoId}`)
        .send({ nome: 'Novo Nome' });

      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para não-ADMIN', async () => {
      const res = await request(app)
        .put(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(tecnicoToken))
        .send({ nome: 'Novo Nome' });

      expect(res.status).toBe(403);
    });
  });

  describe('atualização bem-sucedida', () => {
    it('deve atualizar nome e sobrenome retornando 200', async () => {
      const res = await request(app)
        .put(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'NomeAtualizado', sobrenome: 'SobrenomeAtualizado' });

      expect(res.status).toBe(200);
      expect(res.body.nome).toBe('NomeAtualizado');
      expect(res.body.sobrenome).toBe('SobrenomeAtualizado');
    });

    it('deve atualizar a regra do usuário', async () => {
      const res = await request(app)
        .put(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ regra: 'TECNICO' });

      expect(res.status).toBe(200);
      expect(res.body.regra).toBe('TECNICO');
    });
  });

  describe('conflito de email', () => {
    it('deve retornar 409 ao atualizar para um email já cadastrado', async () => {
      const emailOcupado = emailUnico('ocupado');
      await criarUsuario({ email: emailOcupado });

      const res = await request(app)
        .put(`/auth/usuarios/${usuarioAlvoId}`)
        .set('Authorization', bearerHeader(adminToken))
        .send({ email: emailOcupado });

      expect(res.status).toBe(409);
    });
  });

  describe('ID inexistente', () => {
    it('deve retornar 404 para ID que não existe no banco', async () => {
      const res = await request(app)
        .put('/auth/usuarios/id-inexistente-e2e-999')
        .set('Authorization', bearerHeader(adminToken))
        .send({ nome: 'Qualquer' });

      expect(res.status).toBe(404);
    });
  });
});
