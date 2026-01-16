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

const hashPasswordMock = vi.fn().mockReturnValue('HASHED_PASSWORD_PBKDF2');

vi.mock('../../utils/password', () => ({
  hashPassword: hashPasswordMock,
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
  password: 'HASHED_PASSWORD_PBKDF2',
  refreshToken: null,
};

const fakeAdmins = [adminFixture];

let adminRouter: any;
const app = express();

beforeAll(async () => {
  adminRouter = (await import('../../routes/admin.routes')).default;
});

beforeEach(() => {
  if (app._router?.stack?.length) {
    app._router.stack.splice(0);
  }
  
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  
  Object.values(prismaMock.usuario).forEach(fn => (fn as any).mockReset());

  hashPasswordMock.mockClear();
  hashPasswordMock.mockReturnValue('HASHED_PASSWORD_PBKDF2');
});

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
        password: 'HASHED_PASSWORD_PBKDF2',
        regra: 'ADMIN',
        setor: 'TECNOLOGIA_INFORMACAO',
        telefone: '(11) 99999-0001',
        ramal: '1000',
        avatarUrl: null,
        ativo: true,
      },
    });
    expect(hashPasswordMock).toHaveBeenCalledWith('senha12345');
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
    hashPasswordMock.mockClear();
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
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it('deve atualizar senha quando enviada', async () => {
    prismaMock.usuario.update.mockResolvedValue(adminFixture);
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        password: 'novaSenha123'
      });
    
    expect(res.status).toBe(200);
    expect(hashPasswordMock).toHaveBeenCalledWith('novaSenha123');
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        password: 'HASHED_PASSWORD_PBKDF2',
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

  it('deve atualizar todos os campos opcionais quando enviados', async () => {
    const adminAtualizado = {
      ...adminFixture,
      nome: 'Novo Nome',
      sobrenome: 'Novo Sobrenome',
      email: 'novo@email.com',
      setor: 'FINANCEIRO',
      telefone: '(11) 98888-7777',
      ramal: '2000',
      avatarUrl: 'https://exemplo.com/avatar.jpg',
      ativo: false,
    };
    
    prismaMock.usuario.update.mockResolvedValue(adminAtualizado);
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        nome: 'Novo Nome',
        sobrenome: 'Novo Sobrenome',
        email: 'novo@email.com',
        setor: 'FINANCEIRO',
        telefone: '(11) 98888-7777',
        ramal: '2000',
        avatarUrl: 'https://exemplo.com/avatar.jpg',
        ativo: false,
      });
    
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        nome: 'Novo Nome',
        sobrenome: 'Novo Sobrenome',
        email: 'novo@email.com',
        setor: 'FINANCEIRO',
        telefone: '(11) 98888-7777',
        ramal: '2000',
        avatarUrl: 'https://exemplo.com/avatar.jpg',
        ativo: false,
      },
      select: expect.any(Object),
    });
  });

  it('deve permitir atualizar email do mesmo usuário', async () => {
    prismaMock.usuario.findUnique
      .mockResolvedValueOnce(adminFixtureWithPassword)
      .mockResolvedValueOnce(adminFixtureWithPassword);
    
    prismaMock.usuario.update.mockResolvedValue({
      ...adminFixture,
      email: 'admin@dom.com',
    });
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        email: 'admin@dom.com',
      });
    
    expect(res.status).toBe(200);
  });

  it('deve ignorar campos undefined e atualizar apenas campos definidos', async () => {
    prismaMock.usuario.update.mockResolvedValue(adminFixture);
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        nome: 'Atualizado',
        sobrenome: undefined,
        email: undefined,
      });
    
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        nome: 'Atualizado',
      },
      select: expect.any(Object),
    });
  });

  it('deve atualizar setor para null quando enviado null', async () => {
    prismaMock.usuario.update.mockResolvedValue({
      ...adminFixture,
      setor: null,
    });
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        setor: null,
      });
    
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        setor: null,
      },
      select: expect.any(Object),
    });
  });

  it('deve atualizar telefone e ramal quando enviados', async () => {
    prismaMock.usuario.update.mockResolvedValue({
      ...adminFixture,
      telefone: '(11) 91111-2222',
      ramal: '3000',
    });
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        telefone: '(11) 91111-2222',
        ramal: '3000',
      });
    
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        telefone: '(11) 91111-2222',
        ramal: '3000',
      },
      select: expect.any(Object),
    });
  });

  it('deve atualizar avatarUrl quando enviado', async () => {
    prismaMock.usuario.update.mockResolvedValue({
      ...adminFixture,
      avatarUrl: 'https://exemplo.com/novo-avatar.png',
    });
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        avatarUrl: 'https://exemplo.com/novo-avatar.png',
      });
    
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        avatarUrl: 'https://exemplo.com/novo-avatar.png',
      },
      select: expect.any(Object),
    });
  });

  it('deve atualizar campo ativo quando enviado', async () => {
    prismaMock.usuario.update.mockResolvedValue({
      ...adminFixture,
      ativo: false,
    });
    
    const res = await request(app)
      .put('/api/admin/1')
      .send({
        ativo: false,
      });
    
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        ativo: false,
      },
      select: expect.any(Object),
    });
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