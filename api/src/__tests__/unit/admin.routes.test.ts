import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  vi
} from 'vitest';
import express from 'express';
import request from 'supertest';

// ========================================
// PRISMA MOCK
// ========================================

const prismaMock = {
  usuario: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $disconnect: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; },
}));

// ========================================
// BCRYPT MOCK
// ========================================

const bcryptHashMock = vi.fn().mockResolvedValue('HASHED');

vi.mock('bcrypt', () => ({
  default: { hash: bcryptHashMock },
  hash: bcryptHashMock,
}));

// ========================================
// AUTH MOCK
// ========================================

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => next(),
  authorizeRoles: () => (req: any, res: any, next: any) => next(),
}));

// ========================================
// ADMIN FIXTURES
// ========================================

const adminFixture = {
  id: '1',
  nome: 'Admin',
  sobrenome: 'Teste',
  email: 'admin@dom.com',
  regra: 'ADMIN'
};

// Fixture com senha apenas para mock do Prisma (quando necessário)
const adminFixtureWithPassword = {
  ...adminFixture,
  password: 'HASHED'
};

const fakeAdmins = [adminFixture];

// ========================================
// SETUP & TEARDOWN
// ========================================

let adminRouter: any;
const app = express();

beforeAll(async () => {
  adminRouter = (await import('../../routes/admin.routes')).default;
});

beforeEach(() => {
  // Limpa o app para não empilhar múltiplas rotas
  // @ts-ignore
  if (app._router?.stack?.length) {
    app._router.stack.splice(0);
  }
  
  app.use(express.json());
  app.use('/admin', adminRouter);
  
  // Reset todos os mocks
  Object.values(prismaMock.usuario).forEach(fn => (fn as any).mockReset());
  bcryptHashMock.mockResolvedValue('HASHED');
});

// ========================================
// TEST SUITES
// ========================================

describe('POST /admin (criar novo administrador)', () => {
  it('deve retornar status 400 com mensagem de erro quando campos obrigatórios não forem enviados', async () => {
    const res = await request(app)
      .post('/admin')
      .send({ email: 'admin@dom.com', password: 'senha' });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Todos os campos são obrigatórios' });
  });

  it('deve retornar status 200 e criar um novo administrador quando todos os dados forem válidos', async () => {
    // Mock retorna com password, mas a API deve removê-la antes de enviar
    prismaMock.usuario.create.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app)
      .post('/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'senha'
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual(adminFixture);
    // Verifica que senha NÃO é retornada
    expect(res.body).not.toHaveProperty('password');
    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'HASHED',
        regra: 'ADMIN'
      },
    });
    expect(bcryptHashMock).toHaveBeenCalledWith('senha', 10);
  });

  it('deve retornar status 400 quando ocorrer um erro durante a criação no banco de dados', async () => {
    prismaMock.usuario.create.mockRejectedValue(new Error('Database connection failed'));
    
    const res = await request(app)
      .post('/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'senha'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Database connection failed' });
  });
});

describe('GET /admin (listar administradores)', () => {
  it('deve retornar status 200 e listar todos os administradores cadastrados', async () => {
    prismaMock.usuario.findMany.mockResolvedValue(fakeAdmins);
    
    const res = await request(app).get('/admin');
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeAdmins);
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
      where: { regra: 'ADMIN' }
    });
  });

  it('deve retornar status 500 quando ocorrer um erro durante a consulta ao banco de dados', async () => {
    prismaMock.usuario.findMany.mockRejectedValue(new Error('Database query failed'));
    
    const res = await request(app).get('/admin');
    
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Database query failed' });
  });
});

describe('PUT /admin/:id (editar administrador)', () => {
  it('deve retornar status 200 e atualizar os dados do administrador quando não enviar nova senha', async () => {
    prismaMock.usuario.update.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app)
      .put('/admin/1')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com'
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: '1',
      nome: 'Admin',
      sobrenome: 'Teste',
      email: 'admin@dom.com',
      regra: 'ADMIN'
    });
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com'
      },
    });
  });

  it('deve retornar status 200 e atualizar os dados incluindo a senha quando uma nova senha for enviada', async () => {
    prismaMock.usuario.update.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app)
      .put('/admin/1')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'novaSenha'
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: '1',
      nome: 'Admin',
      sobrenome: 'Teste',
      email: 'admin@dom.com',
      regra: 'ADMIN'
    });
    expect(bcryptHashMock).toHaveBeenCalledWith('novaSenha', 10);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'HASHED'
      },
    });
  });

  it('deve retornar status 400 quando ocorrer um erro durante a atualização no banco de dados', async () => {
    prismaMock.usuario.update.mockRejectedValue(new Error('Database update failed'));
    
    const res = await request(app)
      .put('/admin/1')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Database update failed' });
  });
});

describe('DELETE /admin/:id (excluir administrador)', () => {
  it('deve retornar status 200 e excluir o administrador quando a operação for bem-sucedida', async () => {
    prismaMock.usuario.delete.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app).delete('/admin/1');
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Admin excluído com sucesso' });
    expect(prismaMock.usuario.delete).toHaveBeenCalledWith({
      where: { id: '1' }
    });
  });

  it('deve retornar status 400 quando ocorrer um erro durante a exclusão no banco de dados', async () => {
    prismaMock.usuario.delete.mockRejectedValue(new Error('Database deletion failed'));
    
    const res = await request(app).delete('/admin/1');
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Database deletion failed' });
  });
});