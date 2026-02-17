import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import type { Usuario, Regra } from '@prisma/client';

const prismaMock = {
  usuario: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../../../infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

const verifyPasswordMock = vi.fn();

vi.mock('../../../../../shared/config/password', () => ({
  verifyPassword: verifyPasswordMock,
}));

const generateTokenPairMock = vi.fn();
const verifyTokenMock = vi.fn();

vi.mock('../../../../../shared/config/jwt', () => ({
  generateTokenPair: generateTokenPairMock,
  verifyToken: verifyTokenMock,
}));

const jwtDecodeMock = vi.fn();

vi.mock('jsonwebtoken', () => ({
  default: { decode: jwtDecodeMock },
  decode: jwtDecodeMock,
}));

const cacheSetMock = vi.fn();
const cacheGetMock = vi.fn();

vi.mock('../../../../../infrastructure/database/redis/client', () => ({
  cacheSet: cacheSetMock,
  cacheGet: cacheGetMock,
}));

let authMiddlewareEnabled = true;
let currentUser: any = null;

vi.mock('../../../../../infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!authMiddlewareEnabled) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    if (currentUser) {
      req.usuario = currentUser;
    }
    next();
  },
  AuthRequest: {} as any,
}));

interface UsuarioFixture extends Omit<Usuario, 'geradoEm' | 'atualizadoEm' | 'deletadoEm'> {
  geradoEm: string;
  atualizadoEm: string;
  deletadoEm: string | null;
}

const createUsuarioFixture = (overrides: Partial<UsuarioFixture> = {}): UsuarioFixture => ({
  id: '1',
  nome: 'João',
  sobrenome: 'Silva',
  email: 'joao@example.com',
  password: 'HASHED_PASSWORD',
  regra: 'USUARIO' as Regra,
  setor: null,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  refreshToken: 'valid-refresh-token',
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
  ...overrides,
});

const usuarioFixture = createUsuarioFixture();

let app: Express;
let authRouter: any;

beforeAll(async () => {
  const routerModule = await import('../../../../../presentation/http/routes/auth.routes');
  authRouter = routerModule.default || routerModule.router;
});

beforeEach(() => {
  authMiddlewareEnabled = true;
  currentUser = null;
  
  app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    req.session = {
      destroy: vi.fn((callback: any) => callback(null)),
    };
    next();
  });
  app.use('/auth', authRouter);

  // Reset all mocks
  vi.clearAllMocks();
  
  cacheGetMock.mockResolvedValue(null);
  cacheSetMock.mockResolvedValue(undefined);
  
  verifyPasswordMock.mockReturnValue(true);
  
  verifyTokenMock.mockReturnValue({ id: '1', regra: 'USUARIO' });
  
  generateTokenPairMock.mockReturnValue({
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    expiresIn: 3600,
  });
  
  jwtDecodeMock.mockReturnValue({
    jti: 'token-jti',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
});

afterEach(async () => {
  await prismaMock.$disconnect();
});

describe('POST /auth/login', () => {
  describe('Validação de Entrada', () => {
    it('deve retornar 400 quando email e password não forem enviados', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email e senha são obrigatórios' });
    });

    it('deve retornar 400 quando apenas email for enviado', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email e senha são obrigatórios' });
    });

    it('deve retornar 400 quando apenas password for enviado', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ password: 'senha123' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email e senha são obrigatórios' });
    });

    it('deve retornar 400 quando email for inválido (sem @)', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'emailinvalido', password: 'senha123' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });

    it('deve retornar 400 quando email for inválido (sem domínio)', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@', password: 'senha123' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });

    it('deve retornar 400 quando email for inválido (sem extensão)', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@domain', password: 'senha123' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });
  });

  describe('Proteção Contra Força Bruta', () => {
    it('deve retornar 429 quando exceder máximo de tentativas de login', async () => {
      cacheGetMock.mockResolvedValue('5');

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'senha123' });

      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
        tentativasRestantes: 0,
      });
      expect(res.body.bloqueadoAte).toBeDefined();
    });

    it('deve incrementar tentativas quando login falhar - usuário não encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      cacheGetMock.mockResolvedValue('2');

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'senha123' });

      expect(res.status).toBe(401);
      expect(res.body.tentativasRestantes).toBe(2);
      expect(cacheSetMock).toHaveBeenCalledWith(
        'login:attempts:test@example.com',
        '3',
        900
      );
    });

    it('deve incrementar tentativas quando senha estiver incorreta', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      verifyPasswordMock.mockReturnValue(false);
      cacheGetMock.mockResolvedValue('1');

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaErrada' });

      expect(res.status).toBe(401);
      expect(res.body.tentativasRestantes).toBe(3);
      expect(cacheSetMock).toHaveBeenCalledWith(
        'login:attempts:joao@example.com',
        '2',
        900
      );
    });

    it('deve limpar tentativas quando login for bem-sucedido', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);
      verifyPasswordMock.mockReturnValue(true);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(cacheSetMock).toHaveBeenCalledWith(
        'login:attempts:joao@example.com',
        '0',
        1
      );
    });

    it('deve iniciar contador em 1 na primeira tentativa falhada', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      cacheGetMock.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'novo@example.com', password: 'senha' });

      expect(res.status).toBe(401);
      expect(cacheSetMock).toHaveBeenCalledWith(
        'login:attempts:novo@example.com',
        '1',
        900
      );
    });
  });

  describe('Autenticação', () => {
    it('deve retornar 401 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'inexistente@example.com', password: 'senha123' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: 'Credenciais inválidas',
        tentativasRestantes: 4,
      });
    });

    it('deve retornar 401 quando conta estiver inativa (ativo=false)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(
        createUsuarioFixture({ ativo: false })
      );

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senha123' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: 'Conta inativa. Entre em contato com o administrador.',
      });
    });

    it('deve retornar 401 quando conta estiver soft deleted', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(
        createUsuarioFixture({ deletadoEm: '2024-12-01T00:00:00.000Z' })
      );

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senha123' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: 'Conta inativa. Entre em contato com o administrador.',
      });
    });

    it('deve retornar 401 quando senha estiver incorreta', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      verifyPasswordMock.mockReturnValue(false);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaErrada' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        error: 'Credenciais inválidas',
        tentativasRestantes: 4,
      });
    });
  });

  describe('Login Bem-Sucedido', () => {
    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioFixture,
        refreshToken: 'new-refresh-token',
      });
      verifyPasswordMock.mockReturnValue(true);
    });

    it('deve retornar 200 com tokens e dados do usuário', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      });
      expect(res.body.usuario).toBeDefined();
      expect(res.body.usuario.id).toBe('1');
      expect(res.body.usuario.email).toBe('joao@example.com');
    });

    it('não deve retornar password nos dados do usuário', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(res.body.usuario).not.toHaveProperty('password');
    });

    it('não deve retornar refreshToken nos dados do usuário', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(res.body.usuario).not.toHaveProperty('refreshToken');
    });

    it('deve atualizar refreshToken no banco de dados', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { refreshToken: 'new-refresh-token' },
      });
    });

    it('deve chamar generateTokenPair com dados do usuário', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(generateTokenPairMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          email: 'joao@example.com',
        })
      );
    });

    it('deve chamar verifyPassword com senha e hash corretos', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(verifyPasswordMock).toHaveBeenCalledWith(
        'senhaCorreta',
        'HASHED_PASSWORD'
      );
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando findUnique lançar erro', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senha123' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro interno ao realizar login.' });
    });

    it('deve retornar 500 quando update falhar ao salvar refreshToken', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      prismaMock.usuario.update.mockRejectedValue(new Error('Update failed'));
      verifyPasswordMock.mockReturnValue(true);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro interno ao realizar login.' });
    });

    it('deve retornar 500 quando cacheSet falhar', async () => {
      cacheSetMock.mockRejectedValue(new Error('Redis error'));
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senha123' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro interno ao realizar login.' });
    });
  });
});

describe('POST /auth/logout', () => {
  describe('Autorização', () => {
    it('deve retornar 401 quando middleware bloquear', async () => {
      authMiddlewareEnabled = false;

      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado.' });
    });

    it('deve retornar 401 quando req.usuario for null', async () => {
      authMiddlewareEnabled = true;
      currentUser = null;

      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado.' });
    });
  });

  describe('Logout Bem-Sucedido', () => {
    beforeEach(() => {
      authMiddlewareEnabled = true;
      currentUser = { id: '1', email: 'joao@example.com', regra: 'USUARIO' };
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);
    });

    it('deve retornar 200 e mensagem de sucesso', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout realizado com sucesso.' });
    });

    it('deve adicionar token à blacklist com TTL correto', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 7200;
      jwtDecodeMock.mockReturnValue({ jti: 'unique-jti', exp: futureExp });

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(cacheSetMock).toHaveBeenCalledWith(
        'jwt:blacklist:unique-jti',
        'revogado',
        expect.any(Number)
      );
      
      const ttlCall = cacheSetMock.mock.calls.find(
        call => call[0] === 'jwt:blacklist:unique-jti'
      );
      expect(ttlCall![2]).toBeGreaterThan(0);
    });

    it('deve invalidar refreshToken no banco', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { refreshToken: null },
      });
    });

    it('deve destruir sessão', async () => {
      const destroyMock = vi.fn((cb: any) => cb(null));
      
      const customApp = express();
      customApp.use(express.json());
      customApp.use((req: any, res: any, next: any) => {
        req.usuario = currentUser;
        req.session = { destroy: destroyMock };
        next();
      });
      customApp.use('/auth', authRouter);

      const res = await request(customApp).post('/auth/logout');

      expect(res.status).toBe(200);
      expect(destroyMock).toHaveBeenCalled();
    });
  });

  describe('Cenários Sem Token', () => {
    beforeEach(() => {
      currentUser = { id: '1', email: 'joao@example.com', regra: 'USUARIO' };
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);
    });

    it('deve processar logout quando não houver Authorization header', async () => {
      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout realizado com sucesso.' });
    });

    it('deve processar logout quando jwt.decode retornar null', async () => {
      jwtDecodeMock.mockReturnValue(null);

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout realizado com sucesso.' });
    });

    it('deve processar logout quando decoded não for objeto', async () => {
      jwtDecodeMock.mockReturnValue('string-value');

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(200);
    });

    it('deve processar logout quando decoded não tiver jti', async () => {
      jwtDecodeMock.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer no-jti-token');

      expect(res.status).toBe(200);
    });

    it('deve processar logout quando decoded não tiver exp', async () => {
      jwtDecodeMock.mockReturnValue({ jti: 'jti-only' });

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer no-exp-token');

      expect(res.status).toBe(200);
    });

    it('não deve adicionar à blacklist quando ttl <= 0', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      jwtDecodeMock.mockReturnValue({ jti: 'expired-jti', exp: pastExp });
      cacheSetMock.mockClear();

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(200);
      
      const blacklistCall = cacheSetMock.mock.calls.find(
        call => call[0].startsWith('jwt:blacklist:')
      );
      expect(blacklistCall).toBeUndefined();
    });
  });

  describe('Tratamento de Erros', () => {
    beforeEach(() => {
      currentUser = { id: '1', email: 'joao@example.com', regra: 'USUARIO' };
    });

    it('deve retornar 500 quando update falhar', async () => {
      prismaMock.usuario.update.mockRejectedValue(new Error('DB error'));

      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao realizar logout.' });
    });

    it('deve retornar 500 quando session.destroy falhar', async () => {
      const customApp = express();
      customApp.use(express.json());
      customApp.use((req: any, res: any, next: any) => {
        req.usuario = currentUser;
        req.session = {
          destroy: (cb: any) => cb(new Error('Session error')),
        };
        next();
      });
      customApp.use('/auth', authRouter);
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);

      const res = await request(customApp).post('/auth/logout');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao realizar logout.' });
    });
  });
});

describe('POST /auth/refresh-token', () => {
  describe('Validação de Entrada', () => {
    it('deve retornar 400 quando refreshToken não for enviado', async () => {
      const res = await request(app).post('/auth/refresh-token').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Refresh token é obrigatório.' });
    });

    it('deve retornar 400 quando refreshToken for string vazia', async () => {
      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: '' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Refresh token é obrigatório.' });
    });
  });

  describe('Validação de Token', () => {
    it('deve retornar 401 quando token for inválido', async () => {
      verifyTokenMock.mockImplementation(() => {
        throw new Error('Token inválido');
      });

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Token inválido' });
    });

    it('deve retornar 401 quando verifyToken lançar erro sem mensagem', async () => {
      verifyTokenMock.mockImplementation(() => {
        const error: any = new Error();
        error.message = '';
        throw error;
      });

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'bad-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Refresh token inválido.' });
    });
  });

  describe('Validação de Usuário', () => {
    beforeEach(() => {
      verifyTokenMock.mockReturnValue({ id: '1', regra: 'USUARIO' });
    });

    it('deve retornar 401 quando usuário não for encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Usuário não encontrado.' });
    });

    it('deve retornar 401 quando conta estiver inativa', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(
        createUsuarioFixture({ ativo: false })
      );

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Conta inativa.' });
    });

    it('deve retornar 401 quando conta estiver soft deleted', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(
        createUsuarioFixture({ deletadoEm: '2024-12-01T00:00:00.000Z' })
      );

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Conta inativa.' });
    });

    it('deve retornar 401 quando refreshToken não corresponder ao armazenado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(
        createUsuarioFixture({ refreshToken: 'different-token' })
      );

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Refresh token inválido ou expirado.' });
    });
  });

  describe('Renovação Bem-Sucedida', () => {
    beforeEach(() => {
      verifyTokenMock.mockReturnValue({ id: '1', regra: 'USUARIO' });
      prismaMock.usuario.findUnique.mockResolvedValue(
        createUsuarioFixture({ refreshToken: 'valid-refresh-token' })
      );
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);
    });

    it('deve retornar 200 com novos tokens', async () => {
      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      });
    });

    it('deve atualizar refreshToken no banco', async () => {
      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { refreshToken: 'new-refresh-token' },
      });
    });

    it('deve chamar generateTokenPair com usuário correto', async () => {
      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(generateTokenPairMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          email: 'joao@example.com',
        })
      );
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 401 quando findUnique lançar erro', async () => {
      verifyTokenMock.mockReturnValue({ id: '1', regra: 'USUARIO' });
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-token' });

      expect(res.status).toBe(401);
    });
  });
});

describe('GET /auth/me', () => {
  describe('Autorização', () => {
    it('deve retornar 401 quando middleware bloquear', async () => {
      authMiddlewareEnabled = false;

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado.' });
    });

    it('deve retornar 401 quando req.usuario for null', async () => {
      authMiddlewareEnabled = true;
      currentUser = null;

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado.' });
    });
  });

  describe('Busca de Perfil', () => {
    beforeEach(() => {
      authMiddlewareEnabled = true;
      currentUser = { id: '1', email: 'joao@example.com', regra: 'USUARIO' };
    });

    it('deve retornar 404 quando usuário não for encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Usuário não encontrado.' });
    });

    it('deve retornar 200 com dados do usuário', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: '1',
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@example.com',
        telefone: '(11) 98765-4321',
        ramal: '1234',
        setor: 'TI',
        regra: 'USUARIO',
        avatarUrl: 'https://avatar.url',
        geradoEm: '2025-01-01T00:00:00.000Z',
        ativo: true,
      });

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: '1',
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@example.com',
        regra: 'USUARIO',
      });
    });

    it('não deve retornar password no perfil', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: '1',
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@example.com',
        regra: 'USUARIO',
        ativo: true,
        geradoEm: '2025-01-01T00:00:00.000Z',
      });

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('password');
    });

    it('não deve retornar refreshToken no perfil', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: '1',
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@example.com',
        regra: 'USUARIO',
        ativo: true,
        geradoEm: '2025-01-01T00:00:00.000Z',
      });

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('refreshToken');
    });
  });

  describe('Tratamento de Erros', () => {
    beforeEach(() => {
      currentUser = { id: '1', email: 'joao@example.com', regra: 'USUARIO' };
    });

    it('deve retornar 500 quando findUnique lançar erro', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao buscar perfil do usuário.' });
    });
  });
});

describe('GET /auth/status', () => {
  describe('Status de Autenticação', () => {
    it('deve retornar 401 quando middleware bloquear', async () => {
      authMiddlewareEnabled = false;

      const res = await request(app).get('/auth/status');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado.' });
    });

    it('deve retornar 401 com autenticado false quando req.usuario for null', async () => {
      authMiddlewareEnabled = true;
      currentUser = null;

      const res = await request(app).get('/auth/status');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ autenticado: false });
    });

    it('deve retornar 200 com informações quando autenticado', async () => {
      authMiddlewareEnabled = true;
      currentUser = {
        id: '1',
        email: 'joao@example.com',
        regra: 'USUARIO',
      };

      const res = await request(app).get('/auth/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        autenticado: true,
        usuario: {
          id: '1',
          email: 'joao@example.com',
          regra: 'USUARIO',
        },
      });
    });

    it('deve retornar status para diferentes regras de usuário', async () => {
      const regras: Regra[] = ['ADMIN', 'USUARIO', 'TECNICO'];

      for (const regra of regras) {
        currentUser = {
          id: '1',
          email: 'test@example.com',
          regra,
        };

        const res = await request(app).get('/auth/status');

        expect(res.status).toBe(200);
        expect(res.body.usuario.regra).toBe(regra);
      }
    });
  });
});