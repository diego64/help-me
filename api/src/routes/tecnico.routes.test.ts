import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const tecnicoMock = {
  id: 'tec1',
  nome: 'Técnico',
  sobrenome: 'Teste',
  email: 'tecnico@test.com',
  password: 'hashed_mock',
  telefone: '11999999999',
  ramal: '1234',
  regra: 'TECNICO',
  avatarUrl: '/uploads/tec1.jpg',
  setor: 'TECNOLOGIA_INFORMACAO',
};

const expedienteMock = {
  id: 'exp1',
  usuarioId: 'tec1',
  entrada: '08:00',
  saida: '16:00'
};

const prismaMock = {
  usuario: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  expediente: {
    create: vi.fn(),
    deleteMany: vi.fn()
  }
};

let Regra = 'ADMIN';
let UsuarioAtual = { id: 'admin', regra: Regra };

// Mock do bcrypt default export
const bcryptMock = {
  hash: vi.fn()
};

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; }
}));

// Mock correto do bcrypt usando default export
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
  router = (await import('./tecnico.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  Regra = 'ADMIN';
  UsuarioAtual = { id: 'admin', regra: 'ADMIN' };
  bcryptMock.hash.mockResolvedValue('hashed_mock'); // Resetar mock do bcrypt.hash em cada teste
});

function getApp(mockFile?: any) {
  const app = express();
  app.use(express.json());
  if (mockFile) {
    app.use((req: any, res: any, next: any) => { req._mockFile = mockFile; next(); });
  }
  app.use(router);
  return app;
}

describe('POST / (criar técnico)', () => {
  it('deve retornar status 200 e criar um novo técnico com expediente padrão quando receber dados e senha válidos', async () => {
    prismaMock.usuario.create.mockResolvedValueOnce({ ...tecnicoMock, id: 'tec1' });
    prismaMock.expediente.create.mockResolvedValueOnce(expedienteMock);
    const res = await request(getApp()).post('/').send({ ...tecnicoMock, password: '123' });
    console.log('TESTE [cria técnico]:', { status: res.status, body: res.body });
    expect(res.status).toBe(200);
    expect(res.body.regra).toBe('TECNICO');
    expect(bcryptMock.hash).toHaveBeenCalledWith('123', 10);
  });

  it('deve retornar status 400 com mensagem de erro quando a senha não for enviada ao cadastrar técnico', async () => {
    const res = await request(getApp()).post('/').send({ ...tecnicoMock, password: undefined });
    console.log('TESTE [senha faltando]:', { status: res.status, body: res.body });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Senha obrigatória');
  });

  it('deve retornar status 400 quando ocorrer um erro inesperado durante o processo de criação', async () => {
    prismaMock.usuario.create.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).post('/').send({ ...tecnicoMock, password: '123' });
    console.log('TESTE [erro criação técnico]:', { status: res.status, body: res.body });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('fail');
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tecx', regra: 'TECNICO' };
    const res = await request(getApp()).post('/').send({ ...tecnicoMock, password: '123' });
    console.log('TESTE [sem permissão ADMIN]:', { status: res.status, body: res.body });
    expect(res.status).toBe(403);
  });
});

describe('GET / (listar técnicos)', () => {
  it('deve retornar status 200 e listar todos os técnicos quando o usuário for ADMIN', async () => {
    prismaMock.usuario.findMany.mockResolvedValueOnce([tecnicoMock]);
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].regra).toBe('TECNICO');
  });

  it('deve retornar status 403 e negar acesso quando o usuário não for ADMIN ao tentar listar técnicos', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tecx', regra: 'TECNICO' };
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(403);
  });
});

describe('PUT /:id (editar técnico)', () => {
  it('deve retornar status 200 e atualizar o perfil do técnico quando o usuário for ADMIN ou TECNICO', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tec1', regra: 'TECNICO' };
    prismaMock.usuario.update.mockResolvedValueOnce(tecnicoMock);
    const res = await request(getApp()).put('/tec1').send(tecnicoMock);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('tecnico@test.com');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a atualização no banco de dados', async () => {
    prismaMock.usuario.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).put('/tec1').send(tecnicoMock);
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão ADMIN ou TECNICO', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'usrx', regra: 'USUARIO' };
    const res = await request(getApp()).put('/tec1').send(tecnicoMock);
    expect(res.status).toBe(403);
  });
});

describe('PUT /:id/password (alterar senha técnico)', () => {
  it('deve retornar status 200 e alterar a senha do técnico quando o usuário for ADMIN ou TECNICO', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tec1', regra: 'TECNICO' };
    prismaMock.usuario.update.mockResolvedValueOnce({ ...tecnicoMock, password: 'hashed_mock' });
    const res = await request(getApp()).put('/tec1/password').send({ password: 'newpass' });
    console.log('TESTE [alterar senha técnico]:', { status: res.status, body: res.body });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Senha alterada');
    expect(bcryptMock.hash).toHaveBeenCalledWith('newpass', 10);
  });

  it('deve retornar status 400 com mensagem de erro quando a senha não for informada', async () => {
    const res = await request(getApp()).put('/tec1/password').send({});
    console.log('TESTE [senha não informada]:', { status: res.status, body: res.body });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Senha obrigatória');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a atualização da senha', async () => {
    prismaMock.usuario.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).put('/tec1/password').send({ password: 'newpass' });
    console.log('TESTE [erro update senha]:', { status: res.status, body: res.body });
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão para alterar senha', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'usrx', regra: 'USUARIO' };
    const res = await request(getApp()).put('/tec1/password').send({ password: 'newpass' });
    console.log('TESTE [sem permissão senha]:', { status: res.status, body: res.body });
    expect(res.status).toBe(403);
  });
});

describe('PUT /:id/horarios (modificar disponibilidade técnico)', () => {
  it('deve retornar status 200 e atualizar os horários do técnico quando o usuário for ADMIN ou TECNICO', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tec1', regra: 'TECNICO' };
    prismaMock.expediente.deleteMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.expediente.create.mockResolvedValueOnce(expedienteMock);
    const res = await request(getApp()).put('/tec1/horarios').send({ entrada: '09:00', saida: '18:00' });
    console.log('TESTE [atualiza horários]:', { status: res.status, body: res.body });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Horário');
    expect(res.body.horario).toBeDefined();
  });

  it('deve retornar status 400 com mensagem de erro quando não enviar entrada ou saída', async () => {
    const res = await request(getApp()).put('/tec1/horarios').send({ entrada: '', saida: '' });
    console.log('TESTE [horários faltando]:', { status: res.status, body: res.body });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('obrigatórios');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a criação do novo horário', async () => {
    prismaMock.expediente.deleteMany.mockResolvedValueOnce({ count: 1 }); // Garantir que deleteMany seja bem-sucedido antes do create falhar
    prismaMock.expediente.create.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).put('/tec1/horarios').send({ entrada: '09:00', saida: '18:00' });
    console.log('TESTE [erro update horários]:', { status: res.status, body: res.body });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão para alterar horários', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'usrx', regra: 'USUARIO' };
    const res = await request(getApp()).put('/tec1/horarios').send({ entrada: '09:00', saida: '18:00' });
    console.log('TESTE [sem permissão horários]:', { status: res.status, body: res.body });
    expect(res.status).toBe(403);
  });
});

describe('POST /:id/avatar (upload avatar técnico)', () => {
  it('deve retornar status 200 e atualizar o avatar do técnico quando o arquivo for enviado corretamente', async () => {
    Regra = 'ADMIN';
    UsuarioAtual = { id: 'admin', regra: 'ADMIN' };
    prismaMock.usuario.update.mockResolvedValueOnce({ ...tecnicoMock, avatarUrl: '/uploads/tec1.jpg' });
    const res = await request(getApp({ path: '/uploads/tec1.jpg' })).post('/tec1/avatar').send();
    expect(res.status).toBe(200);
    expect(res.body.tecnico.avatarUrl).toContain('/uploads');
    expect(res.body.message).toContain('Imagem');
  });

  it('deve retornar status 400 com mensagem de erro quando o arquivo não for enviado', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tec1', regra: 'TECNICO' };
    const res = await request(getApp(undefined)).post('/tec1/avatar').send();
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Arquivo não enviado');
  });

  it('deve retornar status 400 quando ocorrer um erro durante o upload do avatar', async () => {
    prismaMock.usuario.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp({ path: '/uploads/tec1.jpg' })).post('/tec1/avatar').send();
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão para fazer upload', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = { id: 'usrx', regra: 'USUARIO' };
    const res = await request(getApp({ path: '/uploads/tec1.jpg' })).post('/tec1/avatar').send();
    expect(res.status).toBe(403);
  });
});

describe('DELETE /:id (exclusão técnico)', () => {
  it('deve retornar status 200 e excluir o técnico com seus horários associados quando executado com sucesso', async () => {
    prismaMock.expediente.deleteMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.usuario.delete.mockResolvedValueOnce(tecnicoMock);
    const res = await request(getApp()).delete('/tec1');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('excluídos');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a exclusão', async () => {
    prismaMock.expediente.deleteMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.usuario.delete.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).delete('/tec1');
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão ADMIN para excluir técnico', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = { id: 'tecx', regra: 'TECNICO' };
    const res = await request(getApp()).delete('/tec1');
    expect(res.status).toBe(403);
  });
});