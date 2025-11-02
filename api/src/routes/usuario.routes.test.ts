import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

declare global {
  namespace Express {
    interface Request {
      _mockFile?: any;
      usuario?: any;
    }
  }
}

// Mock Setor enum (se precisar)
const Setor = { ADMINISTRATIVO: 'ADMINISTRATIVO', TECNOLOGIA_INFORMACAO: 'TECNOLOGIA_INFORMACAO' };

const usuarioMock = {
  id: 'user1',
  nome: 'Teste',
  sobrenome: 'Usuário',
  email: 'teste@teste.com',
  password: 'hashed_mock',
  telefone: '111111111',
  ramal: '5123',
  setor: Setor.TECNOLOGIA_INFORMACAO,
  avatarUrl: '/uploads/user1.jpg',
  geradoEm: new Date().toISOString(),
  regra: 'USUARIO'
};

const prismaMock = {
  usuario: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  chamado: {
    deleteMany: vi.fn()
  }
};

const cacheSetMock = vi.fn();
const cacheGetMock = vi.fn();

let Regra = 'ADMIN';
let UsuarioAtual = { id: 'admin', regra: 'ADMIN' };

// ✅ CORREÇÃO 1: Mock do bcrypt com default export
const bcryptMock = {
  hash: vi.fn()
};

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; },
  Setor
}));

// ✅ CORREÇÃO 2: Mock correto do bcrypt usando default export
vi.mock('bcrypt', () => ({
  default: bcryptMock
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { ...UsuarioAtual, regra: Regra };
    next();
  },
  authorizeRoles: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.usuario.regra) ? next() : res.status(403).json({ error: 'Forbidden' }),
}));

vi.mock('../services/redisClient', () => ({
  cacheSet: cacheSetMock,
  cacheGet: cacheGetMock
}));

vi.mock('multer', () => ({
  default: () => ({
    single: () => (req: any, res: any, next: any) => {
      req.file = req._mockFile || undefined;
      next();
    }
  })
}));

let router: any;
beforeAll(async () => {
  router = (await import('./usuario.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  Regra = 'ADMIN';
  UsuarioAtual = { id: 'admin', regra: 'ADMIN' };
  cacheSetMock.mockResolvedValue(undefined);
  cacheGetMock.mockResolvedValue(undefined);
  // ✅ CORREÇÃO 3: Reset do mock do bcrypt.hash
  bcryptMock.hash.mockResolvedValue('hashed_mock');
});

function getApp(mockFile?: any) {
  const app = express();
  app.use(express.json());
  if (mockFile) app.use((req, res, next) => { req._mockFile = mockFile; next(); });
  app.use(router);
  return app;
}

describe('POST / (criar usuário)', () => {
  it('deve retornar status 201 e criar um novo usuário quando receber dados válidos com senha', async () => {
    prismaMock.usuario.create.mockResolvedValueOnce(usuarioMock);
    const res = await request(getApp()).post('/').send({ ...usuarioMock, password: '123', setor: usuarioMock.setor });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(usuarioMock.email);
    expect(res.body.regra).toBe('USUARIO');
    expect(bcryptMock.hash).toHaveBeenCalledWith('123', 10);
  });

  it('deve retornar status 400 com mensagem de erro quando a senha não for enviada', async () => {
    const res = await request(getApp()).post('/').send({ ...usuarioMock, password: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Senha obrigatória');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a criação no banco de dados', async () => {
    prismaMock.usuario.create.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).post('/').send({ ...usuarioMock, password: '123' });
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'user2', regra: 'USUARIO' };
    const res = await request(getApp()).post('/').send({ ...usuarioMock, password: '123' });
    expect(res.status).toBe(403);
  });
});

describe('GET / (listar usuários) - cache & banco', () => {
  it('deve retornar status 200 e buscar os usuários do cache quando os dados estiverem armazenados', async () => {
    cacheGetMock.mockResolvedValueOnce(JSON.stringify([usuarioMock]));
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].email).toBe(usuarioMock.email);
  });

  it('deve retornar status 200 e buscar os usuários do banco de dados quando o cache estiver vazio', async () => {
    cacheGetMock.mockResolvedValueOnce(undefined);
    prismaMock.usuario.findMany.mockResolvedValueOnce([usuarioMock]);
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(cacheSetMock).toHaveBeenCalled();
  });

  it('deve retornar status 500 quando ocorrer um erro durante a consulta ao banco (findMany)', async () => {
    cacheGetMock.mockResolvedValueOnce(undefined);
    prismaMock.usuario.findMany.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(500);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'user2', regra: 'USUARIO' };
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(403);
  });
});

describe('POST /email (buscar usuário por email)', () => {
  it('deve retornar status 200 e os dados do usuário quando buscar por um email existente', async () => {
    prismaMock.usuario.findUnique.mockResolvedValueOnce(usuarioMock);
    const res = await request(getApp()).post('/email').send({ email: usuarioMock.email });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(usuarioMock.email);
    expect(res.body.regra).toBe('USUARIO');
  });

  it('deve retornar status 400 com mensagem de erro quando o email não for enviado', async () => {
    const res = await request(getApp()).post('/email').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('E-mail');
  });

  it('deve retornar status 404 com mensagem de erro quando o usuário não for encontrado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValueOnce(null);
    const res = await request(getApp()).post('/email').send({ email: "notfound@x.com" });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Usuário não encontrado');
  });

  it('deve retornar status 500 quando ocorrer um erro durante a busca no banco (findUnique)', async () => {
    prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).post('/email').send({ email: usuarioMock.email });
    expect(res.status).toBe(500);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'user2', regra: 'USUARIO' };
    const res = await request(getApp()).post('/email').send({ email: usuarioMock.email });
    expect(res.status).toBe(403);
  });
});

describe('PUT /:id (editar usuário)', () => {
  it('deve retornar status 200 e atualizar os dados do usuário quando editar com sucesso', async () => {
    prismaMock.usuario.update.mockResolvedValueOnce(usuarioMock);
    const res = await request(getApp()).put('/user1').send(usuarioMock);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(usuarioMock.email);
  });

  it('deve retornar status 400 quando ocorrer um erro durante a atualização no banco (update)', async () => {
    prismaMock.usuario.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).put('/user1').send(usuarioMock);
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão para editar', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tecx', regra: 'TECNICO' };
    const res = await request(getApp()).put('/user1').send(usuarioMock);
    expect(res.status).toBe(403);
  });
});

describe('PUT /:id/senha (alterar senha usuário)', () => {
  it('deve retornar status 200 e alterar a senha do usuário quando receber nova senha válida', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'user1', regra: 'USUARIO' };
    prismaMock.usuario.update.mockResolvedValueOnce({ ...usuarioMock, password: 'hashed_mock2' });
    const res = await request(getApp()).put('/user1/senha').send({ password: 'nova123' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Senha alterada');
    expect(bcryptMock.hash).toHaveBeenCalledWith('nova123', 10);
  });

  it('deve retornar status 400 com mensagem de erro quando a senha não for enviada', async () => {
    const res = await request(getApp()).put('/user1/senha').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('A nova senha é obrigatória');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a atualização da senha', async () => {
    prismaMock.usuario.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).put('/user1/senha').send({ password: 'nova123' });
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão para alterar senha', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tecx', regra: 'TECNICO' };
    const res = await request(getApp()).put('/user1/senha').send({ password: 'nova123' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /:id (excluir usuário)', () => {
  it('deve retornar status 200 e excluir o usuário com seus chamados associados quando executado com sucesso', async () => {
    prismaMock.chamado.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.usuario.delete.mockResolvedValueOnce(usuarioMock);
    const res = await request(getApp()).delete('/user1');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('chamados');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a exclusão do usuário', async () => {
    prismaMock.chamado.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.usuario.delete.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).delete('/user1');
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão para excluir', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tecx', regra: 'TECNICO' };
    const res = await request(getApp()).delete('/user1');
    expect(res.status).toBe(403);
  });
});

describe('POST /:id/avatar (upload avatar)', () => {
  it('deve retornar status 200 e atualizar o avatar do usuário quando o arquivo for enviado corretamente', async () => {
    prismaMock.usuario.update.mockResolvedValueOnce({ ...usuarioMock, avatarUrl: '/uploads/user1.jpg' });
    const res = await request(getApp({ path: '/uploads/user1.jpg' })).post('/user1/avatar').send();
    expect(res.status).toBe(200);
    expect(res.body.usuario.avatarUrl).toContain('/uploads');
    expect(res.body.message).toContain('Imagem');
  });

  it('deve retornar status 400 com mensagem de erro quando o arquivo não for enviado', async () => {
    const res = await request(getApp(undefined)).post('/user1/avatar').send();
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Arquivo não enviado');
  });

  it('deve retornar status 400 quando ocorrer um erro durante o upload do avatar', async () => {
    prismaMock.usuario.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp({ path: '/uploads/user1.jpg' })).post('/user1/avatar').send();
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão para fazer upload', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tecx', regra: 'TECNICO' };
    const res = await request(getApp({ path: '/uploads/user1.jpg' })).post('/user1/avatar').send();
    expect(res.status).toBe(403);
  });
});