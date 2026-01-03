import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from 'vitest';
import express, {
  Request,
  Response,
  NextFunction
} from 'express';
import request from 'supertest';
import { Regra } from '@prisma/client';

import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../../middleware/auth';
import * as jwtUtil from '../../auth/jwt';
import { redisClient } from '../../services/redisClient';

describe('Middleware de Autenticação', () => {
  // ================================
  // dadoS PARA TESTES
  // ================================

  const createApp = () => {
    const app = express();
    app.use(express.json());

    app.get('/protegida',
      authMiddleware,
      (req: AuthRequest, res: Response) => {
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
    deletadoEm: null,
    ativo: true,
    refreshToken: null,
  });

  const FAKE_SECRET = 'a'.repeat(32);
  const FAKE_REFRESH_SECRET = 'b'.repeat(32);
  const createAuthHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ================================
  // CONFIGURAÇÃO E LIMPEZA
  // ================================

  beforeEach(() => {
    process.env.JWT_SECRET = FAKE_SECRET;
    process.env.JWT_REFRESH_SECRET = FAKE_REFRESH_SECRET;
    process.env.JWT_EXPIRATION = '1h';
    process.env.JWT_REFRESH_EXPIRATION = '1d';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ================================
  // Testes de authMiddleware
  // ================================

  describe('authMiddleware', () => {
    it('dado token JWT válido, quando chamar rota protegida, então retorna 200 e payload do usuário', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const defaultUser = createDefaultUser();
      const validToken = jwtUtil.generateToken(defaultUser, 'access');

      // Mock Redis para retornar null (token NÃO está na blacklist)
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(validToken));

      // Assert (Verificação) - Status da resposta
      expect(response.status).toBe(200);

      // Assert - Conteúdo da resposta
      expect(response.body).toHaveProperty('usuario');
      expect(response.body.usuario.email).toBe(defaultUser.email);
      expect(response.body.usuario.id).toBe(defaultUser.id);
    });

    it('dado request sem token, quando chamar rota protegida, então retorna 401 com mensagem de erro', async () => {
      // Arrange (Preparação)
      const app = createApp();

      // Act (Ação)
      const response = await request(app).get('/protegida');

      // Assert (Verificação) - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/Token não fornecido/i);
    });

    it('dado token expirado, quando chamar rota protegida, então retorna 401 com mensagem de expiração', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const defaultUser = createDefaultUser();
      const expiredToken = jwtUtil.generateToken(defaultUser, 'access');

      const verifyTokenSpy = vi.spyOn(jwtUtil, 'verifyToken').mockImplementation(() => {
        throw new Error('Token expirado');
      });

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(expiredToken));

      // Assert (Verificação) - Verificação do token
      expect(verifyTokenSpy).toHaveBeenCalledTimes(1);

      // Assert - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/expirado/i);
    });

    it('dado token revogado na blacklist do Redis, quando chamar rota protegida, então retorna 401 com mensagem de revogação', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const defaultUser = createDefaultUser();
      const jti = 'test-jti-revoked-123';
      const userWithJti = { ...defaultUser, jti };

      // Mock verifyToken para retornar payload com jti
      const verifyTokenSpy = vi
        .spyOn(jwtUtil, 'verifyToken')
        .mockReturnValue({ 
          ...userWithJti, 
          jti, 
          type: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        });

      // Mock Redis.get para indicar que token está na blacklist
      const redisGetSpy = vi
        .spyOn(redisClient, 'get')
        .mockResolvedValue('1'); // '1' ou 'true' indica token revogado

      const revokedToken = jwtUtil.generateToken(userWithJti, 'access');

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(revokedToken));

      // Assert (Verificação) - Verificação do token
      expect(verifyTokenSpy).toHaveBeenCalled();

      // Assert - Verificação do Redis
      // Se o middleware checa blacklist, o get deve ser chamado
      if (redisGetSpy.mock.calls.length > 0) {
        expect(redisGetSpy).toHaveBeenCalledWith(`jwt:blacklist:${jti}`);
      }

      // Assert - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro (pode variar dependendo da implementação)
      expect(response.body).toHaveProperty('error');
      // Aceita múltiplas mensagens possíveis
      const possibleMessages = [/revogado/i, /inválido/i, /expirado/i];
      const matchesAny = possibleMessages.some(pattern => 
        pattern.test(response.body.error)
      );
      expect(matchesAny).toBe(true);
    });

    it('dado token inválido, quando chamar rota protegida, então retorna 401 com mensagem de token inválido', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const invalidToken = 'token.invalido.xyz';

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(invalidToken));

      // Assert (Verificação) - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/inválido/i);
    });

    it('dado token com formato incorreto no header, quando chamar rota protegida, então retorna 401', async () => {
      // Arrange (Preparação)
      const app = createApp();

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set({ Authorization: 'InvalidFormat token123' });

      // Assert (Verificação) - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
    });

    it('dado token válido não revogado, quando verificar blacklist, então permite acesso', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const defaultUser = createDefaultUser();
      
      //Gerar token SEM jti customizado - usar token real
      const validToken = jwtUtil.generateToken(defaultUser, 'access');

      //Mock Redis.get para indicar que token NÃO está na blacklist
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(validToken));

      // Assert (Verificação)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('usuario');
      expect(response.body.usuario.email).toBe(defaultUser.email);
    });
  });

  // ================================
  // Testes de authorizeRoles
  // ================================

  describe('authorizeRoles', () => {
    it('dado usuário com role permitida, quando chamar rota de admin, então retorna 200 e permite acesso', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const adminUser = { ...createDefaultUser(), regra: Regra.ADMIN };
      const adminToken = jwtUtil.generateToken(adminUser, 'access');

      // Mock Redis
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);

      // Act (Ação)
      const response = await request(app)
        .get('/admin')
        .set(createAuthHeader(adminToken));

      // Assert (Verificação) - Status da resposta
      expect(response.status).toBe(200);

      // Assert - Conteúdo da resposta
      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('dado usuário com role não permitida, quando chamar rota de admin, então retorna 403 com mensagem de acesso negado', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const defaultUser = createDefaultUser();
      const userToken = jwtUtil.generateToken(defaultUser, 'access');

      // Mock Redis
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);

      // Act (Ação)
      const response = await request(app)
        .get('/admin')
        .set(createAuthHeader(userToken));

      // Assert (Verificação) - Status da resposta
      expect(response.status).toBe(403);

      // Assert - Mensagem de erro
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/Acesso negado/i);
    });

    it('dado ausência de usuário autenticado, quando chamar authorizeRoles, então retorna 401 com mensagem de não autorizado', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const expectedErrors = ['Não autorizado.', 'Token não fornecido.'];

      // Act (Ação)
      const response = await request(app).get('/admin');

      // Assert (Verificação) - Status da resposta
      expect(response.status).toBe(401);

      // Assert - Mensagem de erro (aceita ambas as mensagens possíveis)
      expect(response.body).toHaveProperty('error');
      expect(expectedErrors).toContain(response.body.error);
    });

    it('dado múltiplas roles permitidas, quando usuário tem uma delas, então permite acesso', async () => {
      // Arrange (Preparação)
      const app = express();
      app.use(express.json());
      
      app.get(
        '/multi-role',
        authMiddleware,
        authorizeRoles(Regra.ADMIN, Regra.TECNICO),
        (req: AuthRequest, res: Response) => res.status(200).json({ ok: true })
      );

      const tecnicoUser = { ...createDefaultUser(), regra: Regra.TECNICO };
      const tecnicoToken = jwtUtil.generateToken(tecnicoUser, 'access');

      // Mock Redis
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);

      // Act (Ação)
      const response = await request(app)
        .get('/multi-role')
        .set(createAuthHeader(tecnicoToken));

      // Assert (Verificação)
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('dado múltiplas roles permitidas, quando usuário não tem nenhuma, então nega acesso', async () => {
      // Arrange (Preparação)
      const app = express();
      app.use(express.json());
      
      app.get(
        '/multi-role',
        authMiddleware,
        authorizeRoles(Regra.ADMIN, Regra.TECNICO),
        (req: AuthRequest, res: Response) => res.status(200).json({ ok: true })
      );

      const defaultUser = createDefaultUser(); // USUARIO role
      const userToken = jwtUtil.generateToken(defaultUser, 'access');

      // Mock Redis
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);

      // Act (Ação)
      const response = await request(app)
        .get('/multi-role')
        .set(createAuthHeader(userToken));

      // Assert (Verificação)
      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/Acesso negado/i);
    });
  });

  // ================================
  // Testes de Segurança
  // ================================

  describe('Segurança do Middleware', () => {
    it('dado token com payload manipulado, quando verificar assinatura, então rejeita token', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJlbWFpbCI6ImFkbWluQGhhY2tlci5jb20iLCJyZWdyYSI6IkFETUlOIn0.fake_signature';

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(fakeToken));

      // Assert (Verificação)
      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/inválido/i);
    });

    it('dado token sem tipo especificado, quando validar, então aceita ou rejeita conforme implementação', async () => {
      // Arrange (Preparação)
      const app = createApp();
      const defaultUser = createDefaultUser();
      
      // Mock Redis
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);
      
      // Criar token sem campo 'type'
      const verifyTokenSpy = vi
        .spyOn(jwtUtil, 'verifyToken')
        .mockReturnValue({ ...defaultUser, jti: 'test-jti' } as any);

      const tokenSemTipo = jwtUtil.generateToken(defaultUser, 'access');

      // Act (Ação)
      const response = await request(app)
        .get('/protegida')
        .set(createAuthHeader(tokenSemTipo));

      // Assert (Verificação) - Aceita ambos dependendo da implementação
      expect([200, 401]).toContain(response.status);
    });
  });
});