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

const prismaMock = {
  usuario: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  $disconnect: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

const bcryptHashMock = vi.fn().mockResolvedValue('HASHED');

vi.mock('bcrypt', () => ({
  default: { hash: bcryptHashMock },
  hash: bcryptHashMock,
}));

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { id: 'auth-user-id', regra: 'ADMIN' };
    next();
  },
  authorizeRoles: () => (req: any, res: any, next: any) => next(),
}));

const adminFixture = {
  id: '1',
  nome: 'Admin',
  sobrenome: 'Teste',
  email: 'admin@dom.com',
  regra: 'ADMIN',
  setor: null,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
};

const adminFixtureWithPassword = {
  ...adminFixture,
  password: 'HASHED',
  refreshToken: null,
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
  app.use('/api/admin', adminRouter);
  
  // Reset todos os mocks do Prisma
  Object.values(prismaMock.usuario).forEach(fn => (fn as any).mockReset());

  bcryptHashMock.mockClear();
  bcryptHashMock.mockResolvedValue('HASHED');
});

// ========================================
// TEST SUITES
// ========================================

describe('POST /api/admin (criar novo administrador)', () => {
  it('deve retornar status 400 quando campos obrigatórios não forem enviados', async () => {
    const res = await request(app)
      .post('/api/admin')
      .send({ email: 'admin@dom.com', password: 'senha123' });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ 
      error: 'Campos obrigatórios: nome, sobrenome, email, password' 
    });
  });

  it('deve retornar status 400 quando email for inválido', async () => {
    const res = await request(app)
      .post('/api/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'email-invalido',
        password: 'senha12345'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Email inválido' });
  });

  it('deve retornar status 400 quando senha tiver menos de 8 caracteres', async () => {
    const res = await request(app)
      .post('/api/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'curta'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ 
      error: 'Senha deve ter no mínimo 8 caracteres' 
    });
  });

  it('deve retornar status 400 quando email já estiver cadastrado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...adminFixtureWithPassword,
      deletadoEm: null,
    });
    
    const res = await request(app)
      .post('/api/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'senha12345'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Email já cadastrado' });
  });

  it('deve reativar administrador quando email existir com soft delete', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...adminFixtureWithPassword,
      deletadoEm: '2024-12-01T00:00:00.000Z',
      ativo: false,
    });
    
    prismaMock.usuario.update.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app)
      .post('/api/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'senha12345'
      });
    
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Administrador reativado com sucesso');
    expect(res.body.admin).not.toHaveProperty('password');
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { email: 'admin@dom.com' },
      data: expect.objectContaining({
        deletadoEm: null,
        ativo: true,
      }),
    });
  });

  it('deve criar um novo administrador com todos os dados válidos', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.create.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app)
      .post('/api/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'senha12345',
        setor: 'TECNOLOGIA_INFORMACAO',
        telefone: '(11) 99999-0001',
        ramal: '1000'
      });
    
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('refreshToken');
    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'HASHED',
        regra: 'ADMIN',
        setor: 'TECNOLOGIA_INFORMACAO',
        telefone: '(11) 99999-0001',
        ramal: '1000',
        avatarUrl: null,
        ativo: true,
      },
    });
    expect(bcryptHashMock).toHaveBeenCalledWith('senha12345', 10);
  });

  it('deve retornar status 500 quando ocorrer erro no banco de dados', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.create.mockRejectedValue(new Error('Database error'));
    
    const res = await request(app)
      .post('/api/admin')
      .send({
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@dom.com',
        password: 'senha12345'
      });
    
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao criar administrador' });
  });
});

describe('GET /api/admin (listar administradores)', () => {
  it('deve retornar lista paginada de administradores ativos', async () => {
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.findMany.mockResolvedValue(fakeAdmins);
    
    const res = await request(app).get('/api/admin');
    
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    expect(res.body.admins).toHaveLength(1);
    expect(res.body.admins[0]).toMatchObject({
      id: '1',
      nome: 'Admin',
      email: 'admin@dom.com',
      regra: 'ADMIN',
    });
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
      where: {
        regra: 'ADMIN',
        deletadoEm: null,
        ativo: true,
      },
      select: expect.any(Object),
      orderBy: { geradoEm: 'desc' },
      skip: 0,
      take: 10,
    });
  });

  it('deve respeitar parâmetros de paginação', async () => {
    prismaMock.usuario.count.mockResolvedValue(25);
    prismaMock.usuario.findMany.mockResolvedValue([]);
    
    const res = await request(app)
      .get('/api/admin')
      .query({ page: '2', limit: '5' });
    
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
    expect(res.body.totalPages).toBe(5);
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
      })
    );
  });

  it('deve incluir inativos quando solicitado', async () => {
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.findMany.mockResolvedValue(fakeAdmins);
    
    const res = await request(app)
      .get('/api/admin')
      .query({ incluirInativos: 'true' });
    
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { regra: 'ADMIN' },
      })
    );
  });

  it('deve retornar status 500 quando ocorrer erro no banco de dados', async () => {
    prismaMock.usuario.count.mockRejectedValue(new Error('Database error'));
    
    const res = await request(app).get('/api/admin');
    
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao listar administradores' });
  });
});

describe('GET /api/admin/:id (buscar administrador por ID)', () => {
  it('deve retornar administrador quando encontrado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(adminFixture);
    
    const res = await request(app).get('/api/admin/1');
    
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: '1',
      nome: 'Admin',
      email: 'admin@dom.com',
      regra: 'ADMIN',
    });
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      select: expect.any(Object),
    });
  });

  it('deve retornar 404 quando administrador não for encontrado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const res = await request(app).get('/api/admin/999');
    
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Administrador não encontrado' });
  });

  it('deve retornar 404 quando usuário não for ADMIN', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...adminFixture,
      regra: 'TECNICO',
    });
    
    const res = await request(app).get('/api/admin/1');
    
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Administrador não encontrado' });
  });

  it('deve retornar status 500 quando ocorrer erro no banco de dados', async () => {
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));
    
    const res = await request(app).get('/api/admin/1');
    
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao buscar administrador' });
  });
});

describe('PUT /api/admin/:id (editar administrador)', () => {
  beforeEach(() => {
    // Limpa o bcrypt mock específico para este grupo
    bcryptHashMock.mockClear();
    // Configura mock padrão do findUnique
    prismaMock.usuario.findUnique.mockResolvedValue(adminFixtureWithPassword);
  });

  it('deve atualizar dados sem senha', async () => {
    const adminAtualizado = {
      ...adminFixture,
      nome: 'Admin Atualizado',
    };
    
    prismaMock.usuario.update.mockResolvedValue(adminAtualizado);
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        nome: 'Admin Atualizado',
        sobrenome: 'Teste',
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nome: 'Admin Atualizado',
    });
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        nome: 'Admin Atualizado',
        sobrenome: 'Teste',
      },
      select: expect.any(Object),
    });
    expect(bcryptHashMock).not.toHaveBeenCalled();
  });

  it('deve atualizar senha quando enviada', async () => {
    prismaMock.usuario.update.mockResolvedValue(adminFixture);
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        password: 'novaSenha123'
      });
    
    expect(res.status).toBe(200);
    expect(bcryptHashMock).toHaveBeenCalledWith('novaSenha123', 10);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        password: 'HASHED',
      },
      select: expect.any(Object),
    });
  });

  it('deve retornar 400 quando senha for curta', async () => {
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        password: 'curta'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ 
      error: 'Senha deve ter no mínimo 8 caracteres' 
    });
  });

  it('deve retornar 400 quando email for inválido', async () => {
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        email: 'email-invalido'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Email inválido' });
  });

  it('deve retornar 400 quando email já estiver em uso', async () => {
    prismaMock.usuario.findUnique
      .mockResolvedValueOnce(adminFixtureWithPassword)
      .mockResolvedValueOnce({ ...adminFixtureWithPassword, id: '2' });
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        email: 'outro@dom.com'
      });
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Email já cadastrado' });
  });

  it('deve retornar 404 quando administrador não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const res = await request(app)
      .put('/api/admin/999')
      .send({ nome: 'Teste' });
    
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Administrador não encontrado' });
  });

  it('deve retornar status 500 quando ocorrer erro no banco de dados', async () => {
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({ nome: 'Teste' });
    
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao atualizar administrador' });
  });
});

describe('DELETE /api/admin/:id (excluir administrador - soft delete)', () => {
  beforeEach(() => {
    prismaMock.usuario.findUnique.mockResolvedValue(adminFixtureWithPassword);
  });

  it('deve fazer soft delete do administrador', async () => {
    prismaMock.usuario.update.mockResolvedValue({
      ...adminFixture,
      deletadoEm: '2025-01-15T00:00:00.000Z',
      ativo: false,
    });
    
    const res = await request(app).delete('/api/admin/1');
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Administrador desativado com sucesso',
      id: '1',
    });
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        deletadoEm: expect.any(Date),
        ativo: false,
      },
    });
  });

  it('deve fazer delete permanente quando solicitado', async () => {
    prismaMock.usuario.delete.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app)
      .delete('/api/admin/1')
      .query({ permanente: 'true' });
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Administrador excluído permanentemente',
      id: '1',
    });
    expect(prismaMock.usuario.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('deve retornar 400 ao tentar deletar a própria conta', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...adminFixtureWithPassword,
      id: 'auth-user-id',
    });
    
    const res = await request(app).delete('/api/admin/auth-user-id');
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Não é possível deletar sua própria conta'
    });
  });

  it('deve retornar 404 quando administrador não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const res = await request(app).delete('/api/admin/999');
    
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Administrador não encontrado' });
  });

  it('deve retornar status 500 quando ocorrer erro no banco de dados', async () => {
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));
    
    const res = await request(app).delete('/api/admin/1');
    
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao deletar administrador' });
  });
});

describe('PATCH /api/admin/:id/reativar (reativar administrador)', () => {
  it('deve reativar administrador soft deleted', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...adminFixtureWithPassword,
      deletadoEm: '2024-12-01T00:00:00.000Z',
      ativo: false,
    });
    
    const adminReativado = {
      id: '1',
      nome: 'Admin',
      sobrenome: 'Teste',
      email: 'admin@dom.com',
      regra: 'ADMIN',
      ativo: true,
    };
    
    prismaMock.usuario.update.mockResolvedValue(adminReativado);
    
    const res = await request(app).patch('/api/admin/1/reativar');
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Administrador reativado com sucesso',
      admin: adminReativado,
    });
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        deletadoEm: null,
        ativo: true,
      },
      select: expect.any(Object),
    });
  });

  it('deve retornar 400 quando administrador já estiver ativo', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(adminFixtureWithPassword);
    
    const res = await request(app).patch('/api/admin/1/reativar');
    
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Administrador já está ativo' });
  });

  it('deve retornar 404 quando administrador não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const res = await request(app).patch('/api/admin/999/reativar');
    
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Administrador não encontrado' });
  });

  it('deve retornar status 500 quando ocorrer erro no banco de dados', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...adminFixtureWithPassword,
      deletadoEm: '2024-12-01T00:00:00.000Z',
      ativo: false,
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));
    
    const res = await request(app).patch('/api/admin/1/reativar');
    
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao reativar administrador' });
  });
});