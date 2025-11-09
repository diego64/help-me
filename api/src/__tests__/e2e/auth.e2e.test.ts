import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { Regra } from '@prisma/client';

import { authMiddleware, authorizeRoles, AuthRequest } from '../../middleware/auth';
import * as jwtUtil from '../../auth/jwt';
import * as redisClient from '../../services/redisClient';

describe('Auth Middleware', () => {
  // ============================================================================
  // Dados de Teste
  // ============================================================================

  const createApp = () => {
    const app = express();
    app.use(express.json());

    app.get('/protegida', authMiddleware, (req: AuthRequest, res: Response) => {
      res.status(200).json({ usuario: req.usuario });
    });

    app.get(
      '/admin',
      authMiddleware,
      authorizeRoles(Regra.ADMIN),
      (req: AuthRequest, res: Response) => res.status(200).json({ ok: true })
    );
    return app;
  };

  const createDefaultUser = () => ({
    id: '1',
    nome: 'Usuário',
    sobrenome: 'Teste',
    email: 'usuario@teste.com',
    password: 'senha123',
    regra: Regra.USUARIO,
    setor: null,
    telefone: null,
    ramal: null,
    avatarUrl: null,
    geradoEm: new Date(),
    atualizadoEm: new Date(),
    ativo: true,
    refreshToken: null,
  });

  const FAKE_SECRET = 'a'.repeat(32);
  const FAKE_REFRESH_SECRET = 'b'.repeat(32);
  const createAuthHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ============================================================================
  // Configuração e Limpeza
  // ============================================================================

  beforeEach(() => {
    process.env.JWT_SECRET = FAKE_SECRET;
    process.env.JWT_REFRESH_SECRET = FAKE_REFRESH_SECRET;
    process.env.JWT_EXPIRATION = '1h';
    process.env.JWT_REFRESH_EXPIRATION = '1d';
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Testes de authMiddleware
  // ============================================================================

  describe('authMiddleware', () => {
    it('Given token JWT válido, When chamar rota protegida, Then retorna 200 e payload do usuário', async () => {
      // Arrange
      const app = createApp();
      const defaultUser = createDefaultUser();
      const validToken = jwtUtil.generateToken(defaultUser, 'access');

      // Act
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(validToken));

      // Assert - Status da resposta
      expect(response.status).toBe(200);

      // Assert - Conteúdo da resposta
      expect(response.body).toHaveProperty('usuario');
      expect(response.body.usuario.email).toBe(defaultUser.email);
      expect(response.body.usuario.id).toBe(defaultUser.id);
    });

    it('Given request sem token, When chamar rota protegida, Then retorna 401 com mensagem de erro', async () => {
      // Arrange
      const app = createApp();

      // Act
      const response = await request(app).get('/protegida');

      // Assert - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/Token não fornecido/i);
    });

    it('Given token expirado, When chamar rota protegida, Then retorna 401 com mensagem de expiração', async () => {
      // Arrange
      const app = createApp();
      const defaultUser = createDefaultUser();
      const expiredToken = jwtUtil.generateToken(defaultUser, 'access');

      const verifyTokenSpy = vi.spyOn(jwtUtil, 'verifyToken').mockImplementation(() => {
        throw new Error('Token expirado');
      });

      // Act
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(expiredToken));

      // Assert - Verificação do token
      expect(verifyTokenSpy).toHaveBeenCalledTimes(1);

      // Assert - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/expirado/i);
    });

    it('Given token revogado na blacklist do Redis, When chamar rota protegida, Then retorna 401 com mensagem de revogação', async () => {
      // Arrange
      const app = createApp();
      const defaultUser = createDefaultUser();
      const userWithJti = { ...(defaultUser as any), jti: 'test-jti' };
      const revokedToken = jwtUtil.generateToken(userWithJti, 'access');

      const verifyTokenSpy = vi
        .spyOn(jwtUtil, 'verifyToken')
        .mockReturnValue({ ...userWithJti, jti: 'test-jti', type: 'access' });

      const cacheGetSpy = vi
        .spyOn(redisClient, 'cacheGet')
        .mockResolvedValueOnce('1');

      // Act
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(revokedToken));

      // Assert - Verificações de token e cache
      expect(verifyTokenSpy).toHaveBeenCalledTimes(1);
      expect(cacheGetSpy).toHaveBeenCalledWith('jwt:blacklist:test-jti');

      // Assert - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/revogado/i);
    });

    it('Given token inválido, When chamar rota protegida, Then retorna 401 com mensagem de token inválido', async () => {
      // Arrange
      const app = createApp();
      const invalidToken = 'token.invalido.x';

      // Act
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(invalidToken));

      // Assert - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/inválido/i);
    });
  });

  // ============================================================================
  // Testes de authorizeRoles
  // ============================================================================

  describe('authorizeRoles', () => {
    it('Given usuário com role permitida, When chamar rota de admin, Then retorna 200 e permite acesso', async () => {
      // Arrange
      const app = createApp();
      const adminUser = { ...createDefaultUser(), regra: Regra.ADMIN };
      const adminToken = jwtUtil.generateToken(adminUser, 'access');

      // Act
      const response = await request(app)
        .get('/admin')
        .set(createAuthHeader(adminToken));

      // Assert - Status da resposta
      expect(response.status).toBe(200);

      // Assert - Conteúdo da resposta
      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('Given usuário com role não permitida, When chamar rota de admin, Then retorna 403 com mensagem de acesso negado', async () => {
      // Arrange
      const app = createApp();
      const defaultUser = createDefaultUser();
      const userToken = jwtUtil.generateToken(defaultUser, 'access');

      // Act
      const response = await request(app)
        .get('/admin')
        .set(createAuthHeader(userToken));

      // Assert - Status da resposta
      expect(response.status).toBe(403);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/Acesso negado/i);
    });

    it('Given ausência de usuário autenticado, When chamar authorizeRoles, Then retorna 401 com mensagem de não autorizado', async () => {
      // Arrange
      const app = createApp();
      const expectedErrors = ['Não autorizado.', 'Token não fornecido.'];

      // Act
      const response = await request(app).get('/admin');

      // Assert - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro (aceita ambas as mensagens possíveis)
      expect(response.body).toHaveProperty('error');
      expect(expectedErrors).toContain(response.body.error);
    });
  });
});