import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  vi,
  afterEach
} from 'vitest';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  usuario: {
    findUnique: vi.fn(),
    update: vi.fn(),
  }
};

vi.mock('../../lib/prisma.ts', () => ({
  prisma: prismaMock,
}));

const usuarioBase = {
  id: '1',
  nome: 'Nome',
  sobrenome: 'Sobrenome',
  email: 'mail@x.com',
  password: 'HASHED_PASSWORD_PBKDF2',
  regra: 'ADMIN',
  refreshToken: 'refresh-token',
  ativo: true,
  deletadoEm: null,
  setor: 'TECNOLOGIA_INFORMACAO',
  telefone: '(11) 99999-0001',
  ramal: '1000',
  avatarUrl: null,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
};

const usuarioSemSenha = {
  id: '1',
  nome: 'Nome',
  sobrenome: 'Sobrenome',
  email: 'mail@x.com',
  regra: 'ADMIN',
  ativo: true,
  setor: 'TECNOLOGIA_INFORMACAO',
  telefone: '(11) 99999-0001',
  ramal: '1000',
  avatarUrl: null,
  geradoEm: '2025-01-01T00:00:00.000Z',
};

const verifyPasswordMock = vi.fn();

vi.mock('../../utils/password', () => ({
  verifyPassword: verifyPasswordMock,
}));

const tokenPairMock = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
};

const generateTokenPairMock = vi.fn(() => tokenPairMock);
const verifyTokenMock = vi.fn();
const jwtDecodeMock = vi.fn();

vi.mock('../../auth/jwt', () => ({
  generateTokenPair: generateTokenPairMock,
  verifyToken: verifyTokenMock,
}));

vi.mock('jsonwebtoken', () => ({
  default: { decode: jwtDecodeMock },
  decode: jwtDecodeMock,
}));

const cacheSetMock = vi.fn().mockResolvedValue(undefined);
const cacheGetMock = vi.fn().mockResolvedValue(null);

vi.mock('../../services/redisClient', () => ({
  cacheSet: cacheSetMock,
  cacheGet: cacheGetMock,
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; },
}));

let deveAutenticar = true;
let usuarioMock: any = { ...usuarioBase };

const extractTokenFromHeaderMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!deveAutenticar) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    req.usuario = usuarioMock;
    if (!req.session) {
      req.session = { 
        destroy: (cb: any) => cb(null)
      };
    }
    next();
  },
  extractTokenFromHeader: extractTokenFromHeaderMock,
}));

let authRouter: any;

beforeAll(async () => {
  authRouter = (await import('../../routes/auth.routes')).default;
});

beforeEach(() => {
  deveAutenticar = true;
  usuarioMock = { ...usuarioBase };
  vi.clearAllMocks();
  
  cacheGetMock.mockResolvedValue(null);
  cacheSetMock.mockResolvedValue(undefined);
  
  verifyPasswordMock.mockImplementation((senha, hash) => 
    senha === 'senhaCorreta' && hash === 'HASHED_PASSWORD_PBKDF2'
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
});

function adicionarSessionMiddleware(req: any, res: any, next: any) {
  req.session = req.session || { destroy: (cb: any) => cb(null) };
  next();
}

function criarAppSemAuth() {
  const app = express();
  app.use(express.json());
  app.use(adicionarSessionMiddleware);
  app.use('/auth', authRouter);
  return app;
}

function criarAppComAuthPadrao() {
  deveAutenticar = true;
  usuarioMock = { ...usuarioBase };
  const app = express();
  app.use(express.json());
  app.use(adicionarSessionMiddleware);
  app.use('/auth', authRouter);
  return app;
}

function criarAppComAuthDesabilitada() {
  deveAutenticar = false;
  const app = express();
  app.use(express.json());
  app.use(adicionarSessionMiddleware);
  app.use('/auth', authRouter);
  return app;
}

describe('POST /auth/login', () => {
  it('deve retornar status 400 quando campos email ou senha não forem enviados', async () => {
    const app = criarAppSemAuth();
    const resposta = await request(app).post('/auth/login').send({});
    
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Email e senha são obrigatórios' });
  });

  it('deve retornar status 400 quando apenas email for enviado', async () => {
    const app = criarAppSemAuth();
    const resposta = await request(app).post('/auth/login').send({ email: 'mail@x.com' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Email e senha são obrigatórios' });
  });

  it('deve retornar status 400 quando apenas senha for enviada', async () => {
    const app = criarAppSemAuth();
    const resposta = await request(app).post('/auth/login').send({ password: 'senhaCorreta' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Email e senha são obrigatórios' });
  });

  it('deve retornar status 400 quando email for inválido', async () => {
    const app = criarAppSemAuth();
    const resposta = await request(app).post('/auth/login').send({
      email: 'email-invalido',
      password: 'senhaCorreta'
    });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Email inválido' });
  });

  it('deve retornar status 429 quando exceder tentativas de login', async () => {
    const app = criarAppSemAuth();
    cacheGetMock.mockResolvedValue('5');
    
    const resposta = await request(app).post('/auth/login').send({
      email: 'mail@x.com',
      password: 'senhaCorreta'
    });
    
    expect(resposta.status).toBe(429);
    expect(resposta.body).toHaveProperty('error');
    expect(resposta.body).toHaveProperty('tentativasRestantes', 0);
    expect(resposta.body).toHaveProperty('bloqueadoAte');
  });

  it('deve retornar status 401 quando usuário não for encontrado no banco', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const resposta = await request(app).post('/auth/login').send({
      email: 'inexistente@email.com',
      password: 'qualquerSenha'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ 
      error: 'Credenciais inválidas',
      tentativasRestantes: 4
    });
    expect(cacheSetMock).toHaveBeenCalledWith(
      'login:attempts:inexistente@email.com',
      '1',
      900
    );
  });

  it('deve retornar status 401 quando conta estiver inativa', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...usuarioBase,
      ativo: false
    });
    
    const resposta = await request(app).post('/auth/login').send({
      email: 'mail@x.com',
      password: 'senhaCorreta'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ 
      error: 'Conta inativa. Entre em contato com o administrador.' 
    });
  });

  it('deve retornar status 401 quando conta estiver soft deleted', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...usuarioBase,
      deletadoEm: '2024-12-01T00:00:00.000Z'
    });
    
    const resposta = await request(app).post('/auth/login').send({
      email: 'mail@x.com',
      password: 'senhaCorreta'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ 
      error: 'Conta inativa. Entre em contato com o administrador.' 
    });
  });

  it('deve retornar status 401 quando senha fornecida estiver incorreta', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    verifyPasswordMock.mockReturnValue(false);
    
    const resposta = await request(app).post('/auth/login').send({
      email: 'mail@x.com',
      password: 'senhaIncorreta'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ 
      error: 'Credenciais inválidas',
      tentativasRestantes: 4
    });
    expect(cacheSetMock).toHaveBeenCalled();
  });

  it('deve retornar status 200 com dados do usuário e tokens quando credenciais forem válidas', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    prismaMock.usuario.update.mockResolvedValue({ 
      ...usuarioBase, 
      refreshToken: 'refresh-token' 
    });
    verifyPasswordMock.mockReturnValue(true);

    const resposta = await request(app).post('/auth/login').send({
      email: usuarioBase.email,
      password: 'senhaCorreta'
    });

    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toMatchObject({
      id: usuarioBase.id,
      nome: usuarioBase.nome,
      sobrenome: usuarioBase.sobrenome,
      email: usuarioBase.email,
      regra: usuarioBase.regra,
    });
    expect(resposta.body.usuario).not.toHaveProperty('password');
    expect(resposta.body.usuario).not.toHaveProperty('refreshToken');
    expect(resposta.body.accessToken).toBe('access-token');
    expect(resposta.body.refreshToken).toBe('refresh-token');
    expect(resposta.body.expiresIn).toBe(3600);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: usuarioBase.id },
      data: { refreshToken: 'refresh-token' }
    });
    expect(cacheSetMock).toHaveBeenCalledWith(
      'login:attempts:mail@x.com',
      '0',
      1
    );
  });

  it('deve incrementar tentativas quando houver tentativas anteriores', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    cacheGetMock.mockResolvedValue('2');
    
    const resposta = await request(app).post('/auth/login').send({
      email: 'mail@x.com',
      password: 'senhaErrada'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body.tentativasRestantes).toBe(2);
    expect(cacheSetMock).toHaveBeenCalledWith(
      'login:attempts:mail@x.com',
      '3',
      900
    );
  });

  it('deve retornar status 500 quando ocorrer erro inesperado no login', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database connection failed'));
    
    const resposta = await request(app).post('/auth/login').send({
      email: 'mail@x.com',
      password: 'senhaCorreta'
    });
    
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro interno ao realizar login.' });
  });

  it('deve retornar status 500 quando falhar ao atualizar refreshToken no banco', async () => {
    const app = criarAppSemAuth();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    prismaMock.usuario.update.mockRejectedValue(new Error('Update failed'));
    verifyPasswordMock.mockReturnValue(true);

    const resposta = await request(app).post('/auth/login').send({
      email: usuarioBase.email,
      password: 'senhaCorreta'
    });

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro interno ao realizar login.' });
  });
});

describe('POST /auth/logout', () => {
  it('deve retornar status 401 quando usuário não estiver autenticado', async () => {
    const app = criarAppComAuthDesabilitada();
    const resposta = await request(app).post('/auth/logout');
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  it('deve retornar status 401 quando req.usuario for null no handler do logout', async () => {
    deveAutenticar = true;
    usuarioMock = null;
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    
    const resposta = await request(app).post('/auth/logout');
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  it('deve retornar status 200 e realizar logout com sucesso', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
    expect(cacheSetMock).toHaveBeenCalledWith(
      'jwt:blacklist:JTI',
      'revogado',
      expect.any(Number)
    );
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: usuarioBase.id },
      data: { refreshToken: null }
    });
  });

  it('deve retornar status 500 quando falhar ao invalidar refresh token', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro ao realizar logout.' });
  });

  it('deve retornar status 500 quando session.destroy retornar erro', async () => {
    const erroSession = new Error('Session destroy failed');
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.session = { 
        destroy: (cb: any) => cb(erroSession)
      };
      next();
    });
    app.use('/auth', authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro ao realizar logout.' });
  });

  it('deve processar logout quando não houver authorization header', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      delete req.headers.authorization;
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });

    const resposta = await request(app).post('/auth/logout');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('deve processar logout quando jwt.decode retornar null', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce(null);

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer dummy-token');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('deve adicionar token à blacklist com TTL correto quando exp for válido', async () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 7200;
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

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer valid-token');

    expect(resposta.status).toBe(200);
    const ttlCall = cacheSetMock.mock.calls.find(
      call => call[0] === 'jwt:blacklist:UNIQUE-JTI'
    );
    expect(ttlCall).toBeDefined();
    expect(ttlCall![2]).toBeGreaterThan(0);
  });

  it('deve processar logout quando token já estiver expirado (ttl <= 0)', async () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce({ 
      jti: 'EXPIRED-JTI', 
      exp: expiredTimestamp
    });
    cacheSetMock.mockClear();

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer expired-token');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
    
    const blacklistCall = cacheSetMock.mock.calls.find(
      call => call[0].startsWith('jwt:blacklist:')
    );
    expect(blacklistCall).toBeUndefined();
  });

  it('deve processar logout quando decoded não tiver jti', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce({ 
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer token-sem-jti');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('deve processar logout quando decoded não tiver exp', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce({ 
      jti: 'JTI-SEM-EXP'
    });

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer token-sem-exp');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });

  it('deve processar logout quando decoded não for um objeto', async () => {
    const app = express();
    app.use(express.json());
    app.use('/auth', (req: any, _res: any, next: any) => {
      req.usuario = { ...usuarioBase };
      req.session = { destroy: (cb: any) => cb(null) };
      next();
    }, authRouter);
    prismaMock.usuario.update.mockResolvedValue({ ...usuarioBase, refreshToken: null });
    jwtDecodeMock.mockReturnValueOnce('string-value');

    const resposta = await request(app)
      .post('/auth/logout')
      .set('authorization', 'Bearer invalid-decoded');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ message: 'Logout realizado com sucesso.' });
  });
});

describe('POST /auth/refresh-token', () => {
  it('deve retornar status 400 quando refreshToken não for enviado', async () => {
    const app = criarAppSemAuth();
    const resposta = await request(app).post('/auth/refresh-token').send({});
    
    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ error: 'Refresh token é obrigatório.' });
  });

  it('deve retornar status 401 quando refreshToken for inválido', async () => {
    const app = criarAppSemAuth();
    verifyTokenMock.mockImplementation(() => { 
      throw new Error('Refresh token inválido.'); 
    });
    
    const resposta = await request(app).post('/auth/refresh-token').send({
      refreshToken: 'token-invalido'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Refresh token inválido.' });
  });

  it('deve retornar status 401 quando usuário não for encontrado', async () => {
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const resposta = await request(app).post('/auth/refresh-token').send({
      refreshToken: 'refresh-token'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Usuário não encontrado.' });
  });

  it('deve retornar status 401 quando conta estiver inativa', async () => {
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue({ 
      ...usuarioBase, 
      ativo: false 
    });
    
    const resposta = await request(app).post('/auth/refresh-token').send({
      refreshToken: 'refresh-token'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Conta inativa.' });
  });

  it('deve retornar status 401 quando conta estiver soft deleted', async () => {
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue({ 
      ...usuarioBase, 
      deletadoEm: '2024-12-01T00:00:00.000Z'
    });
    
    const resposta = await request(app).post('/auth/refresh-token').send({
      refreshToken: 'refresh-token'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Conta inativa.' });
  });

  it('deve retornar status 401 quando refreshToken não corresponder ao armazenado', async () => {
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue({ 
      ...usuarioBase, 
      refreshToken: 'token-diferente' 
    });
    
    const resposta = await request(app).post('/auth/refresh-token').send({
      refreshToken: 'refresh-token'
    });
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Refresh token inválido ou expirado.' });
  });

  it('deve retornar status 200 com novos tokens quando refreshToken for válido', async () => {
    const app = criarAppSemAuth();
    verifyTokenMock.mockReturnValue({ id: '1' });
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);
    prismaMock.usuario.update.mockResolvedValue({ 
      ...usuarioBase, 
      refreshToken: 'refresh-token' 
    });
    
    const resposta = await request(app).post('/auth/refresh-token').send({
      refreshToken: 'refresh-token'
    });
    
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    });
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { refreshToken: 'refresh-token' }
    });
  });
});

describe('GET /auth/me', () => {
  it('deve retornar status 401 quando usuário não estiver autenticado', async () => {
    const app = criarAppComAuthDesabilitada();
    const resposta = await request(app).get('/auth/me');
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  it('deve retornar status 401 quando req.usuario for null', async () => {
    deveAutenticar = true;
    usuarioMock = null;
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    
    const resposta = await request(app).get('/auth/me');
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  it('deve retornar status 404 quando usuário não for encontrado no banco', async () => {
    const app = criarAppComAuthPadrao();
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const resposta = await request(app).get('/auth/me');
    
    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ error: 'Usuário não encontrado.' });
  });

  it('deve retornar status 200 com dados do usuário quando autenticado', async () => {
    const app = criarAppComAuthPadrao();
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioSemSenha);
    
    const resposta = await request(app).get('/auth/me');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      id: usuarioBase.id,
      nome: usuarioBase.nome,
      email: usuarioBase.email,
      regra: usuarioBase.regra,
    });
    expect(resposta.body).not.toHaveProperty('password');
    expect(resposta.body).not.toHaveProperty('refreshToken');
  });

  it('deve retornar status 500 quando ocorrer erro ao buscar dados do usuário', async () => {
    const app = criarAppComAuthPadrao();
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database connection failed'));
    
    const resposta = await request(app).get('/auth/me');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({ error: 'Erro ao buscar perfil do usuário.' });
  });
});

describe('GET /auth/status', () => {
  it('deve retornar status 401 com erro quando middleware bloqueia', async () => {
    const app = criarAppComAuthDesabilitada();
    const resposta = await request(app).get('/auth/status');
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ error: 'Não autorizado.' });
  });

  it('deve retornar status 401 com autenticado false quando req.usuario for null no handler', async () => {
    deveAutenticar = true;
    usuarioMock = null;
    
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    
    const resposta = await request(app).get('/auth/status');
    
    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ autenticado: false });
  });

  it('deve retornar status 200 com informações quando autenticado', async () => {
    const app = criarAppComAuthPadrao();
    
    const resposta = await request(app).get('/auth/status');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      autenticado: true,
      usuario: {
        id: usuarioBase.id,
        email: usuarioBase.email,
        regra: usuarioBase.regra,
      },
    });
  });

  it('deve retornar dados corretos quando todos os campos do usuário estiverem presentes', async () => {
    deveAutenticar = true;
    usuarioMock = {
      id: '123',
      email: 'test@example.com',
      regra: 'USUARIO',
      nome: 'Test',
      sobrenome: 'User'
    };
    
    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    
    const resposta = await request(app).get('/auth/status');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      autenticado: true,
      usuario: {
        id: '123',
        email: 'test@example.com',
        regra: 'USUARIO',
      },
    });
  });
});