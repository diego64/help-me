import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ============================================================================
// MOCK DO PRISMA
// ============================================================================

const prismaMock = {
  usuario: {
    findUnique: vi.fn(),
    update: vi.fn(),
  }
};

vi.mock('../lib/prisma.js', () => ({
  prisma: prismaMock,
}));

// ============================================================================
// FIXTURES DE USUÁRIO
// ============================================================================

const usuarioBase = {
  id: '1',
  nome: 'Nome',
  sobrenome: 'Sobrenome',
  email: 'mail@x.com',
  password: 'HASHED',
  regra: 'ADMIN',
  refreshToken: 'refresh-token'
};

// ============================================================================
// MOCK DO BCRYPT
// ============================================================================

const bcryptCompareMock = vi.fn();

vi.mock('bcrypt', () => ({
  default: { compare: bcryptCompareMock },
  compare: bcryptCompareMock,
}));

// ============================================================================
// MOCKS DO JWT
// ============================================================================

const tokenPairMock = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
};

const generateTokenPairMock = vi.fn(() => tokenPairMock);
const verifyTokenMock = vi.fn();
const jwtDecodeMock = vi.fn();

vi.mock('../auth/jwt', () => ({
  generateTokenPair: generateTokenPairMock,
  verifyToken: verifyTokenMock,
}));

vi.mock('jsonwebtoken', () => ({
  default: { decode: jwtDecodeMock },
  decode: jwtDecodeMock,
}));

// ============================================================================
// MOCK DO CACHE
// ============================================================================

const cacheSetMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/redisClient', () => ({
  cacheSet: cacheSetMock,
}));

// ============================================================================
// MOCKS DE MÓDULOS
// ============================================================================

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; },
}));

// ============================================================================
// ESTADO DE AUTENTICAÇÃO
// ============================================================================

let deveAutenticar = true;
let usuarioMock: any = { ...usuarioBase };
let sessionDestroyCallback: ((err: any) => void) | null = null;
let sessionDestroyError: any = null;

vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!deveAutenticar) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    req.usuario = usuarioMock;
    // Não sobrescrever req.session se já foi definido pelo teste
    if (!req.session) {
      req.session = { 
        destroy: (cb: any) => {
          sessionDestroyCallback = cb;
          cb(sessionDestroyError);
        }
      };
    }
    next();
  },
}));

// ============================================================================
// SETUP E TEARDOWN
// ============================================================================

let authRouter: any;

beforeAll(async () => {
  authRouter = (await import('./auth.routes')).default;
});

beforeEach(() => {
  deveAutenticar = true;
  usuarioMock = { ...usuarioBase };
  sessionDestroyError = null;
  vi.clearAllMocks();
  
  bcryptCompareMock.mockImplementation(async (senha, hash) => 
    senha === 'senhaCorreta' && hash === 'HASHED'
  );
  
  verifyTokenMock.mockImplementation((token, type) => {
    if (token === 'refresh-token' && type === 'refresh') {
      return { id: '1', regra: 'ADMIN' };
    }
    throw new Error('Refresh token inválido');
  });
  
  generateTokenPairMock.mockReturnValue(tokenPairMock);
  
  jwtDecodeMock.mockReturnValue({ 
    jti: 'JTI', 
    exp: Math.floor(Date.now() / 1000) + 3600 
  });
});

afterEach(() => {
  vi.clearAllMocks();
  deveAutenticar = true;
  usuarioMock = { ...usuarioBase };
  sessionDestroyError = null;
});

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Middleware para garantir session nos testes
 */
function adicionarSessionMiddleware(req: any, res: any, next: any) {
  req.session = req.session || { destroy: (cb: any) => cb(null) };
  next();
}

/**
 * Factory para criar app sem autenticação
 */
function criarAppSemAuth() {
  const app = express();
  app.use(express.json());
  app.use(adicionarSessionMiddleware);
  app.use('/auth', authRouter);
  return app;
}

/**
 * Factory para criar app com autenticação padrão
 */
function criarAppComAuthPadrao() {
  deveAutenticar = true;
  usuarioMock = { ...usuarioBase };
  const app = express();
  app.use(express.json());
  app.use(adicionarSessionMiddleware);
  app.use('/auth', authRouter);
  return app;
}

/**
 * Factory para criar app com autenticação desabilitada
 */
function criarAppComAuthDesabilitada() {
  deveAutenticar = false;
  const app = express();
  app.use(express.json());
  app.use(adicionarSessionMiddleware);
  app.use('/auth', authRouter);
  return app;
}

// ============================================================================
// SUITES DE TESTES
// ============================================================================

describe('POST /auth/login', () => {
  it('Deve retornar status 400 quando campos email ou senha não forem enviados', async () => {
    // Arrange
    const app = criarAppSemAuth();
    const dadosIncompletos = {};
    
    // Act
    const resposta = await request(app).post('/auth/login').send(dadosIncompletos);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Email e senha são obrigatórios' });
  });

  it('Deve retornar status 400 quando apenas email for enviado', async () => {
    // Arrange
    const app = criarAppSemAuth();
    const dadosSemSenha = { email: 'mail@x.com' };
    
    // Act
    const resposta = await request(app).post('/auth/login').send(dadosSemSenha);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Email e senha são obrigatórios' });
  });

  it('Deve retornar status 400 quando apenas senha for enviada', async () => {
    // Arrange
    const app = criarAppSemAuth();
    const dadosSemEmail = { password: 'senhaCorreta' };
    
    // Act
    const resposta = await request(app).post('/auth/login').send(dadosSemEmail);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Email e senha são obrigatórios' });
  });

  it('Deve retornar status 401 quando usuário não for encontrado no banco', async () => {
    // Arrange
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    const credenciaisInexistentes = { email: 'inexistente@email.com', password: 'qualquerSenha' };
    
    // Act
    const resposta = await request(app).post('/auth/login').send(credenciaisInexistentes);
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Usuário não encontrado' });
  });

  it('Deve retornar status 401 quando senha fornecida estiver incorreta', async () => {
    // Arrange
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    bcryptCompareMock.mockResolvedValue(false);
    const credenciaisComSenhaErrada = { email: 'mail@x.com', password: 'senhaIncorreta' };
    
    // Act
    const resposta = await request(app).post('/auth/login').send(credenciaisComSenhaErrada);
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Senha incorreta' });
  });

  it('Deve retornar status 200 com dados do usuário e tokens quando credenciais forem válidas', async () => {
    // Arrange
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: 'refresh-token' });
    bcryptCompareMock.mockResolvedValue(true);
    const credenciaisValidas = { email: usuarioBase.email, password: 'senhaCorreta' };

    // Act
    const resposta = await request(app).post('/auth/login').send(credenciaisValidas);

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toMatchObject({
      id: usuarioBase.id,
      nome: usuarioBase.nome,
      sobrenome: usuarioBase.sobrenome,
      email: usuarioBase.email,
      regra: usuarioBase.regra,
    });
    expect(resposta.body.accessToken).toBe('access-token');
    expect(resposta.body.refreshToken).toBe('refresh-token');
    expect(resposta.body.expiresIn).toBe(3600);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: usuarioBase.id },
      data: { refreshToken: 'refresh-token' }
    });
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado no login', async () => {
    // Arrange
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database connection failed'));
    const credenciaisValidas = { email: 'mail@x.com', password: 'senhaCorreta' };
    
    // Act
    const resposta = await request(app).post('/auth/login').send(credenciaisValidas);
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro interno ao realizar login.' });
  });

  it('Deve retornar status 500 quando falhar ao atualizar refreshToken no banco durante login', async () => {
    // Arrange
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    prismaMock.usuario.update.mockRejectedValue(new Error('Update failed'));
    bcryptCompareMock.mockResolvedValue(true);
    const credenciaisValidas = { email: usuarioBase.email, password: 'senhaCorreta' };

    // Act
    const resposta = await request(app).post('/auth/login').send(credenciaisValidas);

    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro interno ao realizar login.' });
  });

  it('Deve retornar status 500 quando bcrypt.compare lançar exceção', async () => {
    // Arrange
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    bcryptCompareMock.mockRejectedValue(new Error('Bcrypt error'));
    const credenciaisValidas = { email: usuarioBase.email, password: 'senhaCorreta' };

    // Act
    const resposta = await request(app).post('/auth/login').send(credenciaisValidas);

    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro interno ao realizar login.' });
  });
});

describe('POST /auth/logout', () => {
  it('Deve retornar status 401 quando usuário não estiver autenticado', async () => {
    // Arrange
    const app = criarAppComAuthDesabilitada();
    
    // Act
    const resposta = await request(app).post('/auth/logout');
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  // -------------------------------------------------------------------------
  // TESTE ESPECÍFICO PARA LINHA 72 - req.usuario null dentro do handler
  // -------------------------------------------------------------------------
  it('Deve retornar status 401 quando req.usuario for null no handler do logout (linha 72)', async () => {
    // Arrange
    deveAutenticar = true;
    usuarioMock = null; // Simula req.usuario = null
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    
    // Act
    const resposta = await request(app).post('/auth/logout');
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  it('Deve retornar status 200 e realizar logout adicionando token à blacklist', async () => {
    // Arrange
    deveAutenticar = true;
    usuarioMock = { ...usuarioBase };
    sessionDestroyError = null;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
    expect(cacheSetMock).toHaveBeenCalled();
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: usuarioBase.id },
      data: { refreshToken: null }
    });
  });

  it('Deve retornar status 500 quando ocorrer erro ao invalidar refresh token no banco', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 500 quando falhar ao adicionar token na blacklist', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    cacheSetMock.mockRejectedValueOnce(new Error('Redis error'));

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });

  // -------------------------------------------------------------------------
  // TESTE ESPECÍFICO PARA LINHAS 96-97 - session.destroy com erro
  // -------------------------------------------------------------------------
  it('Deve retornar status 500 quando session.destroy retornar erro (linhas 96-97)', async () => {
    // Arrange
    deveAutenticar = true;
    usuarioMock = { ...usuarioBase };
    const erroSession = new Error('Session destroy failed');
    const app = express();
    app.use(express.json());
    // Define session ANTES do authRouter para que o mock não sobrescreva
    app.use((req: any, _res: any, next: any) => {
      req.session = { 
        destroy: (cb: any) => cb(erroSession)
      };
      next();
    });
    app.use('/auth', authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValue(null); // Sem token para blacklist

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro ao encerrar a sessão.' });
  });

  it('Deve retornar status 500 quando session.destroy falhar com erro string', async () => {
    // Arrange
    deveAutenticar = true;
    usuarioMock = { ...usuarioBase };
    const app = express();
    app.use(express.json());
    // Define session ANTES do authRouter para que o mock não sobrescreva
    app.use((req: any, _res: any, next: any) => {
      req.session = { 
        destroy: (cb: any) => cb('Erro como string')
      };
      next();
    });
    app.use('/auth', authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValue(null);

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro ao encerrar a sessão.' });
  });

  it('Deve processar logout mesmo quando header authorization estiver em formato diferente', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      req.headers.authorization = 'bearer token-lowercase';
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce({ 
      jti: 'TEST-JTI', 
      exp: Math.floor(Date.now() / 1000) + 7200 
    });

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'bearer token-lowercase');

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('Deve retornar status 200 e realizar logout mesmo sem JTI no token', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce({ exp: Math.floor(Date.now() / 1000) + 3600 });

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('Deve retornar status 200 mesmo quando jwt.decode retornar null', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce(null);

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('Deve retornar status 200 mesmo quando decoded não for objeto', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce('string-invalida');

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('Deve retornar status 200 quando token não tiver exp', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce({ jti: 'JTI' });

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('Deve retornar status 200 quando não houver authorization header', async () => {
    // Arrange
    deveAutenticar = true;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      delete req.headers.authorization;
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });

    // Act
    const resposta = await request(app).post('/auth/logout');

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it('Deve adicionar token à blacklist com TTL correto', async () => {
    // Arrange
    deveAutenticar = true;
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce({ 
      jti: 'UNIQUE-JTI', 
      exp: futureTimestamp
    });
    cacheSetMock.mockClear();

    // Act
    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer valid-token');

    // Assert
    expect(resposta.status).toBe(200);
    expect(cacheSetMock).toHaveBeenCalledWith(
      'jwt:blacklist:UNIQUE-JTI',
      'revogado',
      expect.any(Number)
    );
  });
});

describe('POST /auth/refresh-token', () => {
  it('Deve retornar status 400 quando refreshToken não for enviado', async () => {
    // Arrange
    const app = criarAppSemAuth();
    const dadosSemToken = {};
    
    // Act
    const resposta = await request(app).post('/auth/refresh-token').send(dadosSemToken);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Refresh token é obrigatório.' });
  });

  it('Deve retornar status 401 quando refreshToken for inválido', async () => {
    // Arrange
    const app = criarAppSemAuth();
    verifyTokenMock.mockImplementation(() => { 
      throw new Error('Refresh token inválido.'); 
    });
    const dadosComTokenInvalido = { refreshToken: 'token-invalido' };
    
    // Act
    const resposta = await request(app).post('/auth/refresh-token').send(dadosComTokenInvalido);
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Refresh token inválido.' });
  });

  it('Deve retornar status 401 quando verifyToken lançar erro sem mensagem', async () => {
    // Arrange
    const app = criarAppSemAuth();
    verifyTokenMock.mockImplementation(() => { 
      const error: any = new Error();
      error.message = '';
      throw error;
    });
    const dadosComTokenInvalido = { refreshToken: 'token-invalido' };
    
    // Act
    const resposta = await request(app).post('/auth/refresh-token').send(dadosComTokenInvalido);
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Refresh token inválido.' });
  });

  it('Deve retornar status 401 quando usuário do refreshToken não for encontrado', async () => {
    // Arrange
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    const dadosComToken = { refreshToken: 'refresh-token' };
    
    // Act
    const resposta = await request(app).post('/auth/refresh-token').send(dadosComToken);
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Refresh token inválido ou expirado.' });
  });

  it('Deve retornar status 401 quando refreshToken não corresponder ao armazenado', async () => {
    // Arrange
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue({ 
      ...usuarioBase, 
      refreshToken: 'token-diferente' 
    });
    const dadosComTokenDiferente = { refreshToken: 'refresh-token' };
    
    // Act
    const resposta = await request(app).post('/auth/refresh-token').send(dadosComTokenDiferente);
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Refresh token inválido ou expirado.' });
  });

  it('Deve retornar status 200 com novos tokens quando refreshToken for válido', async () => {
    // Arrange
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    prismaMock.usuario.update.mockResolvedValue({ 
      ...usuarioBase, 
      refreshToken: 'refresh-token' 
    });
    const dadosComTokenValido = { refreshToken: 'refresh-token' };
    
    // Act
    const resposta = await request(app).post('/auth/refresh-token').send(dadosComTokenValido);
    
    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });
    expect(prismaMock.usuario.update).toHaveBeenCalled();
  });
});

describe('GET /auth/me', () => {
  it('Deve retornar status 401 quando usuário não estiver autenticado', async () => {
    // Arrange
    const app = criarAppComAuthDesabilitada();
    
    // Act
    const resposta = await request(app).get('/auth/me');
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  // -------------------------------------------------------------------------
  // TESTE ESPECÍFICO PARA LINHA 145 - req.usuario null no /me
  // -------------------------------------------------------------------------
  it('Deve retornar status 401 quando req.usuario for null no handler do /me (linha 145)', async () => {
    // Arrange
    deveAutenticar = true;
    usuarioMock = null; // Simula req.usuario = null
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    
    // Act
    const resposta = await request(app).get('/auth/me');
    
    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  it('Deve retornar status 404 quando usuário autenticado não for encontrado no banco', async () => {
    // Arrange
    const app = criarAppComAuthPadrao();
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    // Act
    const resposta = await request(app).get('/auth/me');
    
    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ error: 'Usuário não encontrado.' });
  });

  it('Deve retornar status 200 com dados do usuário quando autenticado corretamente', async () => {
    // Arrange
    const app = criarAppComAuthPadrao();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    
    // Act
    const resposta = await request(app).get('/auth/me');
    
    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      id: usuarioBase.id,
      nome: usuarioBase.nome,
      email: usuarioBase.email,
    });
  });

  it('Deve retornar status 500 quando ocorrer erro ao buscar dados do usuário', async () => {
    // Arrange
    const app = criarAppComAuthPadrao();
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database connection failed'));
    
    // Act
    const resposta = await request(app).get('/auth/me');
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro ao buscar perfil do usuário.' });
  });
});