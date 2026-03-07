import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import type { Usuario, Regra } from '@prisma/client';

const prismaMock = {
  usuario: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  // $disconnect nunca é limpo pelo clearAllMocks — definido como constante
  $disconnect: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

const verifyPasswordMock = vi.fn();
vi.mock('@shared/config/password', () => ({
  verifyPassword: verifyPasswordMock,
}));

const generateTokenPairMock = vi.fn();
const verifyTokenMock = vi.fn();
vi.mock('@shared/config/jwt', () => ({
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
vi.mock('@infrastructure/database/redis/client', () => ({
  cacheSet: cacheSetMock,
  cacheGet: cacheGetMock,
}));

let authMiddlewareEnabled = true;
let currentUser: any = null;
vi.mock('@infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!authMiddlewareEnabled) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    if (currentUser) req.usuario = currentUser;
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
  nivel: null,
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

const TOKEN_RESPONSE = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  expiresIn: 3600,
};

let app: Express;
let authRouter: any;

beforeAll(async () => {
  const routerModule = await import('@presentation/http/routes/auth.routes');
  authRouter = routerModule.default || routerModule.router;
});

beforeEach(() => {
  authMiddlewareEnabled = true;
  currentUser = null;

  app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.session = { destroy: vi.fn((cb: any) => cb(null)) };
    next();
  });
  app.use('/auth', authRouter);

  // Limpa apenas os mocks de negócio, NÃO o $disconnect
  vi.clearAllMocks();

  // Restaura $disconnect após clearAllMocks para o afterEach não travar
  prismaMock.$disconnect.mockResolvedValue(undefined);

  // Defaults para cada teste
  cacheGetMock.mockResolvedValue(null);
  cacheSetMock.mockResolvedValue(undefined);
  verifyPasswordMock.mockReturnValue(true);
  verifyTokenMock.mockReturnValue({ id: '1', regra: 'USUARIO' });
  generateTokenPairMock.mockReturnValue(TOKEN_RESPONSE);
  jwtDecodeMock.mockReturnValue({
    jti: 'token-jti',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
});

afterEach(async () => {
  // $disconnect sempre é uma Promise resolvida graças à restauração no beforeEach
  await prismaMock.$disconnect();
});

describe('POST /auth/login', () => {
  describe('Validação de Entrada', () => {
    it.each([
      ['sem body', {}, 'Email e senha são obrigatórios'],
      ['apenas email', { email: 'test@example.com' }, 'Email e senha são obrigatórios'],
      ['apenas password', { password: 'senha123' }, 'Email e senha são obrigatórios'],
      ['email sem @', { email: 'emailinvalido', password: 'senha123' }, 'Email inválido'],
      ['email sem domínio', { email: 'test@', password: 'senha123' }, 'Email inválido'],
      ['email sem extensão', { email: 'test@domain', password: 'senha123' }, 'Email inválido'],
    ])('deve retornar 400 %s', async (_label, body, errorMsg) => {
      const res = await request(app).post('/auth/login').send(body);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: errorMsg });
    });
  });

  describe('Proteção Contra Força Bruta', () => {
    it('deve retornar 429 quando exceder máximo de tentativas', async () => {
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

    it('deve incrementar tentativas quando usuário não for encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      cacheGetMock.mockResolvedValue('2');

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'senha123' });

      expect(res.status).toBe(401);
      expect(res.body.tentativasRestantes).toBe(2);
      expect(cacheSetMock).toHaveBeenCalledWith('login:attempts:test@example.com', '3', 900);
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
      expect(cacheSetMock).toHaveBeenCalledWith('login:attempts:joao@example.com', '2', 900);
    });

    it('deve iniciar contador em 1 na primeira tentativa falhada', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      cacheGetMock.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'novo@example.com', password: 'senha' });

      expect(res.status).toBe(401);
      expect(cacheSetMock).toHaveBeenCalledWith('login:attempts:novo@example.com', '1', 900);
    });

    it('deve limpar tentativas após login bem-sucedido', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(cacheSetMock).toHaveBeenCalledWith('login:attempts:joao@example.com', '0', 1);
    });
  });

  describe('Autenticação', () => {
    it('deve retornar 401 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'inexistente@example.com', password: 'senha123' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: 'Credenciais inválidas', tentativasRestantes: 4 });
    });

    it.each([
      ['ativo=false', createUsuarioFixture({ ativo: false })],
      ['soft deleted', createUsuarioFixture({ deletadoEm: '2024-12-01T00:00:00.000Z' })],
    ])('deve retornar 401 quando conta estiver inativa (%s)', async (_label, fixture) => {
      prismaMock.usuario.findUnique.mockResolvedValue(fixture);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senha123' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Conta inativa. Entre em contato com o administrador.' });
    });

    it('deve retornar 401 quando senha estiver incorreta', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      verifyPasswordMock.mockReturnValue(false);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaErrada' });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: 'Credenciais inválidas', tentativasRestantes: 4 });
    });
  }, 20000);

  describe('Login Bem-Sucedido', () => {
    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioFixture,
        refreshToken: 'new-refresh-token',
      });
    });

    it('deve retornar 200 com tokens e dados do usuário', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(TOKEN_RESPONSE);
      expect(res.body.usuario.id).toBe('1');
      expect(res.body.usuario.email).toBe('joao@example.com');
    });

    it.each(['password', 'refreshToken'])(
      'não deve retornar campo sensível "%s" na resposta',
      async (campo) => {
        const res = await request(app)
          .post('/auth/login')
          .send({ email: 'joao@example.com', password: 'senhaCorreta' });

        expect(res.status).toBe(200);
        expect(res.body.usuario).not.toHaveProperty(campo);
      }
    );

    it('deve atualizar refreshToken no banco de dados', async () => {
      await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { refreshToken: 'new-refresh-token' },
      });
    });

    it('deve chamar generateTokenPair com dados do usuário', async () => {
      await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(generateTokenPairMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', email: 'joao@example.com' })
      );
    });

    it('deve chamar verifyPassword com senha e hash corretos', async () => {
      await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senhaCorreta' });

      expect(verifyPasswordMock).toHaveBeenCalledWith('senhaCorreta', 'HASHED_PASSWORD');
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando findUnique lançar erro', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'joao@example.com', password: 'senha123' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro interno ao realizar login.' });
    });

    it('deve retornar 500 quando update falhar ao salvar refreshToken', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioFixture);
      prismaMock.usuario.update.mockRejectedValue(new Error('Update failed'));

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
      currentUser = null;

      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado.' });
    });
  });

  describe('Logout Bem-Sucedido', () => {
    beforeEach(() => {
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

      const ttlCall = cacheSetMock.mock.calls.find(call => call[0] === 'jwt:blacklist:unique-jti');
      expect(ttlCall).toBeDefined();
      expect(ttlCall![1]).toBe('revogado');
      expect(ttlCall![2]).toBeGreaterThan(0);
    });

    it('deve invalidar refreshToken no banco', async () => {
      await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { refreshToken: null },
      });
    });

    it('deve destruir sessão', async () => {
      const destroyMock = vi.fn((cb: any) => cb(null));

      const customApp = express();
      customApp.use(express.json());
      customApp.use((req: any, _res: any, next: any) => {
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

  describe('Cenários Sem Token / Token Inválido', () => {
    beforeEach(() => {
      currentUser = { id: '1', email: 'joao@example.com', regra: 'USUARIO' };
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);
    });

    it.each([
      ['sem Authorization header', null, undefined],
      ['jwt.decode retorna null', null, jwtDecodeMock],
      ['decoded não é objeto', 'string-value', jwtDecodeMock],
      ['decoded sem jti', { exp: Math.floor(Date.now() / 1000) + 3600 }, jwtDecodeMock],
      ['decoded sem exp', { jti: 'jti-only' }, jwtDecodeMock],
    ])('deve processar logout quando %s', async (_label, mockValue, mockFn) => {
      if (mockFn) mockFn.mockReturnValue(mockValue);

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', mockValue === null && !mockFn ? '' : 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout realizado com sucesso.' });
    });

    it('não deve adicionar à blacklist quando TTL <= 0', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      jwtDecodeMock.mockReturnValue({ jti: 'expired-jti', exp: pastExp });
      cacheSetMock.mockClear();
      // Restaura $disconnect após mockClear localizado
      prismaMock.$disconnect.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(200);
      const blacklistCall = cacheSetMock.mock.calls.find(call =>
        call[0].startsWith('jwt:blacklist:')
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
      prismaMock.usuario.update.mockResolvedValue(usuarioFixture);

      const customApp = express();
      customApp.use(express.json());
      customApp.use((req: any, _res: any, next: any) => {
        req.usuario = currentUser;
        req.session = { destroy: (cb: any) => cb(new Error('Session error')) };
        next();
      });
      customApp.use('/auth', authRouter);

      const res = await request(customApp).post('/auth/logout');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao realizar logout.' });
    });
  });
});

describe('POST /auth/refresh-token', () => {
  describe('Validação de Entrada', () => {
    it.each([
      ['sem body', {}],
      ['refreshToken vazio', { refreshToken: '' }],
    ])('deve retornar 400 %s', async (_label, body) => {
      const res = await request(app).post('/auth/refresh-token').send(body);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Refresh token é obrigatório.' });
    });
  });

  describe('Validação de Token', () => {
    it('deve retornar 401 quando token for inválido', async () => {
      verifyTokenMock.mockImplementation(() => { throw new Error('Token inválido'); });

      const res = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Token inválido' });
    });

    it('deve retornar 401 com mensagem padrão quando erro não tiver mensagem', async () => {
      verifyTokenMock.mockImplementation(() => {
        const err: any = new Error();
        err.message = '';
        throw err;
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

    it.each([
      ['ativo=false', createUsuarioFixture({ ativo: false })],
      ['soft deleted', createUsuarioFixture({ deletadoEm: '2024-12-01T00:00:00.000Z' })],
    ])('deve retornar 401 quando conta estiver inativa (%s)', async (_label, fixture) => {
      prismaMock.usuario.findUnique.mockResolvedValue(fixture);

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
      expect(res.body).toEqual(TOKEN_RESPONSE);
    });

    it('deve atualizar refreshToken no banco', async () => {
      await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { refreshToken: 'new-refresh-token' },
      });
    });

    it('deve chamar generateTokenPair com usuário correto', async () => {
      await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(generateTokenPairMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', email: 'joao@example.com' })
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
      currentUser = null;

      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado.' });
    });
  });

  describe('Busca de Perfil', () => {
    beforeEach(() => {
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

    it.each(['password', 'refreshToken'])(
      'não deve retornar campo sensível "%s" no perfil',
      async (campo) => {
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
        expect(res.body).not.toHaveProperty(campo);
      }
    );
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
  it('deve retornar 401 quando middleware bloquear', async () => {
    authMiddlewareEnabled = false;

    const res = await request(app).get('/auth/status');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Não autorizado.' });
  });

  it('deve retornar 401 com autenticado=false quando req.usuario for null', async () => {
    currentUser = null;

    const res = await request(app).get('/auth/status');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ autenticado: false });
  });

  it('deve retornar 200 com informações quando autenticado', async () => {
    currentUser = { id: '1', email: 'joao@example.com', regra: 'USUARIO' };

    const res = await request(app).get('/auth/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      autenticado: true,
      usuario: { id: '1', email: 'joao@example.com', regra: 'USUARIO' },
    });
  });

  it('deve retornar status correto para todas as regras', async () => {
    const regras: Regra[] = ['ADMIN', 'USUARIO', 'TECNICO'];

    for (const regra of regras) {
      currentUser = { id: '1', email: 'test@example.com', regra };

      const res = await request(app).get('/auth/status');

      expect(res.status).toBe(200);
      expect(res.body.usuario.regra).toBe(regra);
    }
  });
});