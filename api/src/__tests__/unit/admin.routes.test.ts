import { describe, it, expect, beforeEach, beforeAll, afterAll, vi, MockedFunction } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import type { Usuario, Regra, Setor } from '@prisma/client';

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

vi.mock('../../infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

const hashPasswordMock = vi.fn().mockReturnValue('HASHED_PASSWORD_PBKDF2');

vi.mock('../../shared/config/password', () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock('../../infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { id: 'auth-user-id', regra: 'ADMIN' };
    next();
  },
  authorizeRoles: (...roles: string[]) => (req: any, res: any, next: any) => {
    next();
  },
}));

interface UsuarioFixture extends Omit<Usuario, 'geradoEm' | 'atualizadoEm' | 'deletadoEm'> {
  geradoEm: string;
  atualizadoEm: string;
  deletadoEm: string | null;
}

const createAdminFixture = (overrides: Partial<UsuarioFixture> = {}): UsuarioFixture => ({
  id: '1',
  nome: 'Admin',
  sobrenome: 'Teste',
  email: 'admin@example.com',
  password: 'HASHED_PASSWORD_PBKDF2',
  regra: 'ADMIN' as Regra,
  setor: null,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  refreshToken: null,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
  ...overrides,
});

const adminFixture = createAdminFixture();

let app: Express;
let adminRouter: any;

beforeAll(async () => {
  const routerModule = await import('../../presentation/http/routes/admin.routes');
  adminRouter = routerModule.default || routerModule.router;
});

beforeEach(() => {
  app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);

  // Reset all mocks
  Object.values(prismaMock.usuario).forEach(fn => (fn as MockedFunction<any>).mockReset());
  hashPasswordMock.mockClear();
  hashPasswordMock.mockReturnValue('HASHED_PASSWORD_PBKDF2');
});

afterAll(async () => {
  await prismaMock.$disconnect();
});

describe('POST /api/admin - Criar Administrador', () => {
  describe('Validação de Campos Obrigatórios', () => {
    it('deve retornar 400 quando nome não for enviado', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Campos obrigatórios: nome, sobrenome, email, password'
      });
    });

    it('deve retornar 400 quando sobrenome não for enviado', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Campos obrigatórios: nome, sobrenome, email, password'
      });
    });

    it('deve retornar 400 quando email não for enviado', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Campos obrigatórios: nome, sobrenome, email, password'
      });
    });

    it('deve retornar 400 quando password não for enviado', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Campos obrigatórios: nome, sobrenome, email, password'
      });
    });

    it('deve retornar 400 quando todos os campos obrigatórios forem vazios', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: '',
          sobrenome: '',
          email: '',
          password: ''
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Campos obrigatórios: nome, sobrenome, email, password'
      });
    });
  });

  describe('Validação de Email', () => {
    it('deve retornar 400 quando email for inválido (sem @)', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'emailinvalido',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });

    it('deve retornar 400 quando email for inválido (sem domínio)', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });

    it('deve retornar 400 quando email for inválido (sem extensão)', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@domain',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });

    it('deve retornar 400 quando email contiver espaços', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin @example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });
  });

  describe('Validação de Senha', () => {
    it('deve retornar 400 quando senha tiver menos de 8 caracteres', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'curta'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Senha deve ter no mínimo 8 caracteres'
      });
    });

    it('deve retornar 400 quando senha tiver exatamente 7 caracteres', async () => {
      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: '1234567'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Senha deve ter no mínimo 8 caracteres'
      });
    });

    it('deve aceitar senha com exatamente 8 caracteres', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(adminFixture);

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: '12345678'
        });

      expect(res.status).toBe(201);
    });
  });

  describe('Email Já Cadastrado', () => {
    it('deve retornar 400 quando email já estiver cadastrado e ativo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(adminFixture);

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email já cadastrado' });
      expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' }
      });
    });
  });

  describe('Reativação de Administrador', () => {
    it('deve reativar administrador quando email existir com soft delete', async () => {
      const adminDeletado = createAdminFixture({
        deletadoEm: '2024-12-01T00:00:00.000Z',
        ativo: false,
      });

      prismaMock.usuario.findUnique.mockResolvedValue(adminDeletado);
      prismaMock.usuario.update.mockResolvedValue(adminFixture);

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Administrador reativado com sucesso');
      expect(res.body.admin).not.toHaveProperty('password');
      expect(res.body.admin).not.toHaveProperty('refreshToken');
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
        data: expect.objectContaining({
          nome: 'Admin',
          sobrenome: 'Teste',
          password: 'HASHED_PASSWORD_PBKDF2',
          regra: 'ADMIN',
          deletadoEm: null,
          ativo: true,
        }),
      });
    });

    it('deve reativar com todos os campos opcionais quando enviados', async () => {
      const adminDeletado = createAdminFixture({
        deletadoEm: '2024-12-01T00:00:00.000Z',
        ativo: false,
      });

      prismaMock.usuario.findUnique.mockResolvedValue(adminDeletado);
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        setor: 'TECNOLOGIA_INFORMACAO' as Setor,
        telefone: '(11) 99999-0001',
        ramal: '1000',
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345',
          setor: 'TECNOLOGIA_INFORMACAO',
          telefone: '(11) 99999-0001',
          ramal: '1000',
          avatarUrl: 'https://example.com/avatar.jpg'
        });

      expect(res.status).toBe(201);
      expect(res.body.admin.setor).toBe('TECNOLOGIA_INFORMACAO');
      expect(res.body.admin.telefone).toBe('(11) 99999-0001');
    });
  });

  describe('Criação com Sucesso', () => {
    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
    });

    it('deve criar administrador com campos obrigatórios apenas', async () => {
      prismaMock.usuario.create.mockResolvedValue(adminFixture);

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.body.regra).toBe('ADMIN');
      expect(res.body.ativo).toBe(true);

      expect(hashPasswordMock).toHaveBeenCalledWith('senha12345');
      expect(prismaMock.usuario.create).toHaveBeenCalledWith({
        data: {
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'HASHED_PASSWORD_PBKDF2',
          regra: 'ADMIN',
          setor: null,
          telefone: null,
          ramal: null,
          avatarUrl: null,
          ativo: true,
        },
      });
    });

    it('deve criar administrador com todos os campos opcionais', async () => {
      const adminCompleto = createAdminFixture({
        setor: 'TECNOLOGIA_INFORMACAO' as Setor,
        telefone: '(11) 99999-0001',
        ramal: '1000',
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      prismaMock.usuario.create.mockResolvedValue(adminCompleto);

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345',
          setor: 'TECNOLOGIA_INFORMACAO',
          telefone: '(11) 99999-0001',
          ramal: '1000',
          avatarUrl: 'https://example.com/avatar.jpg'
        });

      expect(res.status).toBe(201);
      expect(res.body.setor).toBe('TECNOLOGIA_INFORMACAO');
      expect(res.body.telefone).toBe('(11) 99999-0001');
      expect(res.body.ramal).toBe('1000');
      expect(res.body.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('deve criar com campos opcionais como null quando não enviados', async () => {
      prismaMock.usuario.create.mockResolvedValue(adminFixture);

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(201);
      expect(prismaMock.usuario.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          setor: null,
          telefone: null,
          ramal: null,
          avatarUrl: null,
        }),
      });
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando ocorrer erro no findUnique', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao criar administrador' });
    });

    it('deve retornar 500 quando ocorrer erro no create', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao criar administrador' });
    });

    it('deve retornar 500 quando ocorrer erro no update (reativação)', async () => {
      const adminDeletado = createAdminFixture({
        deletadoEm: '2024-12-01T00:00:00.000Z',
        ativo: false,
      });

      prismaMock.usuario.findUnique.mockResolvedValue(adminDeletado);
      prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .post('/api/admin')
        .send({
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          password: 'senha12345'
        });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao criar administrador' });
    });
  });
});

describe('GET /api/admin - Listar Administradores', () => {
  describe('Listagem Padrão', () => {
    it('deve retornar lista paginada de administradores ativos', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([adminFixture]);

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
        email: 'admin@example.com',
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

    it('deve retornar lista vazia quando não houver administradores', async () => {
      prismaMock.usuario.count.mockResolvedValue(0);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/admin');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.admins).toEqual([]);
    });
  });

  describe('Paginação', () => {
    it('deve respeitar parâmetro page', async () => {
      prismaMock.usuario.count.mockResolvedValue(25);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin')
        .query({ page: '2' });

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });

    it('deve respeitar parâmetro limit', async () => {
      prismaMock.usuario.count.mockResolvedValue(25);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin')
        .query({ limit: '5' });

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
      expect(res.body.totalPages).toBe(5);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 5,
        })
      );
    });

    it('deve combinar page e limit corretamente', async () => {
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin')
        .query({ page: '3', limit: '20' });

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(3);
      expect(res.body.limit).toBe(20);
      expect(res.body.totalPages).toBe(3);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
        })
      );
    });

    it('deve limitar limit máximo a 100', async () => {
      prismaMock.usuario.count.mockResolvedValue(200);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin')
        .query({ limit: '200' });

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('deve usar page padrão 1 quando valor inválido', async () => {
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin')
        .query({ page: '0' });

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
    });

    it('deve usar limit padrão quando valor inválido', async () => {
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/admin')
        .query({ limit: '0' });

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(1);
    });
  });

  describe('Incluir Inativos', () => {
    it('deve incluir administradores inativos quando solicitado', async () => {
      prismaMock.usuario.count.mockResolvedValue(2);
      prismaMock.usuario.findMany.mockResolvedValue([
        adminFixture,
        createAdminFixture({ id: '2', deletadoEm: '2024-12-01T00:00:00.000Z', ativo: false })
      ]);

      const res = await request(app)
        .get('/api/admin')
        .query({ incluirInativos: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { regra: 'ADMIN' },
        })
      );
    });

    it('deve excluir inativos por padrão', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([adminFixture]);

      const res = await request(app).get('/api/admin');

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            regra: 'ADMIN',
            deletadoEm: null,
            ativo: true,
          },
        })
      );
    });

    it('deve excluir inativos quando incluirInativos=false', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([adminFixture]);

      const res = await request(app)
        .get('/api/admin')
        .query({ incluirInativos: 'false' });

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            regra: 'ADMIN',
            deletadoEm: null,
            ativo: true,
          },
        })
      );
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando ocorrer erro no count', async () => {
      prismaMock.usuario.count.mockRejectedValue(new Error('Database error'));

      const res = await request(app).get('/api/admin');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao listar administradores' });
    });

    it('deve retornar 500 quando ocorrer erro no findMany', async () => {
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockRejectedValue(new Error('Database error'));

      const res = await request(app).get('/api/admin');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao listar administradores' });
    });
  });

  describe('Ordenação', () => {
    it('deve ordenar por geradoEm desc', async () => {
      prismaMock.usuario.count.mockResolvedValue(2);
      prismaMock.usuario.findMany.mockResolvedValue([
        createAdminFixture({ id: '2', geradoEm: '2025-01-02T00:00:00.000Z' }),
        createAdminFixture({ id: '1', geradoEm: '2025-01-01T00:00:00.000Z' }),
      ]);

      const res = await request(app).get('/api/admin');

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { geradoEm: 'desc' },
        })
      );
    });
  });
});

describe('GET /api/admin/:id - Buscar Administrador', () => {
  describe('Busca com Sucesso', () => {
    it('deve retornar administrador quando encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(adminFixture);

      const res = await request(app).get('/api/admin/1');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: '1',
        nome: 'Admin',
        email: 'admin@example.com',
        regra: 'ADMIN',
      });
      expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        select: expect.any(Object),
      });
    });

    it('deve retornar administrador com todos os campos', async () => {
      const adminCompleto = createAdminFixture({
        setor: 'TECNOLOGIA_INFORMACAO' as Setor,
        telefone: '(11) 99999-0001',
        ramal: '1000',
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      prismaMock.usuario.findUnique.mockResolvedValue(adminCompleto);

      const res = await request(app).get('/api/admin/1');

      expect(res.status).toBe(200);
      expect(res.body.setor).toBe('TECNOLOGIA_INFORMACAO');
      expect(res.body.telefone).toBe('(11) 99999-0001');
      expect(res.body.ramal).toBe('1000');
      expect(res.body.avatarUrl).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('Administrador Não Encontrado', () => {
    it('deve retornar 404 quando administrador não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/admin/999');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });

    it('deve retornar 404 quando usuário não for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...adminFixture,
        regra: 'TECNICO' as Regra,
      });

      const res = await request(app).get('/api/admin/1');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });

    it('deve retornar 404 quando usuário for USUARIO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...adminFixture,
        regra: 'USUARIO' as Regra,
      });

      const res = await request(app).get('/api/admin/1');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando ocorrer erro no banco de dados', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const res = await request(app).get('/api/admin/1');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao buscar administrador' });
    });
  });
});

describe('PUT /api/admin/:id - Atualizar Administrador', () => {
  beforeEach(() => {
    prismaMock.usuario.findUnique.mockResolvedValue(adminFixture);
  });

  describe('Atualização de Campos Básicos', () => {
    it('deve atualizar nome', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        nome: 'Novo Nome',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ nome: 'Novo Nome' });

      expect(res.status).toBe(200);
      expect(res.body.nome).toBe('Novo Nome');
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { nome: 'Novo Nome' },
        select: expect.any(Object),
      });
    });

    it('deve atualizar sobrenome', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        sobrenome: 'Novo Sobrenome',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ sobrenome: 'Novo Sobrenome' });

      expect(res.status).toBe(200);
      expect(res.body.sobrenome).toBe('Novo Sobrenome');
    });

    it('deve atualizar múltiplos campos simultaneamente', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        nome: 'Novo Nome',
        sobrenome: 'Novo Sobrenome',
        telefone: '(11) 98888-7777',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({
          nome: 'Novo Nome',
          sobrenome: 'Novo Sobrenome',
          telefone: '(11) 98888-7777',
        });

      expect(res.status).toBe(200);
      expect(res.body.nome).toBe('Novo Nome');
      expect(res.body.sobrenome).toBe('Novo Sobrenome');
      expect(res.body.telefone).toBe('(11) 98888-7777');
    });

    it('deve ignorar campos undefined', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        nome: 'Novo Nome',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({
          nome: 'Novo Nome',
          sobrenome: undefined,
        });

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { nome: 'Novo Nome' },
        select: expect.any(Object),
      });
    });
  });

  describe('Atualização de Email', () => {
    it('deve atualizar email quando válido e não em uso', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(adminFixture)
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        email: 'novo@example.com',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ email: 'novo@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('novo@example.com');
    });

    it('deve retornar 400 quando email for inválido', async () => {
      const res = await request(app)
        .put('/api/admin/1')
        .send({ email: 'email-invalido' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email inválido' });
    });

    it('deve retornar 400 quando email já estiver em uso por outro admin', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(adminFixture)
        .mockResolvedValueOnce({ ...adminFixture, id: '2' });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ email: 'outro@example.com' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email já cadastrado' });
    });

    it('deve permitir atualizar com o mesmo email do usuário', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(adminFixture)
        .mockResolvedValueOnce(adminFixture);

      prismaMock.usuario.update.mockResolvedValue(adminFixture);

      const res = await request(app)
        .put('/api/admin/1')
        .send({ email: 'admin@example.com' });

      expect(res.status).toBe(200);
    });
  });

  describe('Atualização de Senha', () => {
    it('deve atualizar senha quando válida', async () => {
      prismaMock.usuario.update.mockResolvedValue(adminFixture);

      const res = await request(app)
        .put('/api/admin/1')
        .send({ password: 'novaSenha123' });

      expect(res.status).toBe(200);
      expect(hashPasswordMock).toHaveBeenCalledWith('novaSenha123');
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { password: 'HASHED_PASSWORD_PBKDF2' },
        select: expect.any(Object),
      });
    });

    it('deve retornar 400 quando senha for curta', async () => {
      const res = await request(app)
        .put('/api/admin/1')
        .send({ password: 'curta' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Senha deve ter no mínimo 8 caracteres'
      });
      expect(hashPasswordMock).not.toHaveBeenCalled();
    });

    it('deve permitir atualizar outros campos sem senha', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        nome: 'Novo Nome',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ nome: 'Novo Nome' });

      expect(res.status).toBe(200);
      expect(hashPasswordMock).not.toHaveBeenCalled();
    });
  });

  describe('Atualização de Campos Opcionais', () => {
    it('deve atualizar setor', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        setor: 'FINANCEIRO' as Setor,
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ setor: 'FINANCEIRO' });

      expect(res.status).toBe(200);
      expect(res.body.setor).toBe('FINANCEIRO');
    });

    it('deve atualizar telefone', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        telefone: '(11) 91111-2222',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ telefone: '(11) 91111-2222' });

      expect(res.status).toBe(200);
      expect(res.body.telefone).toBe('(11) 91111-2222');
    });

    it('deve atualizar ramal', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        ramal: '3000',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ ramal: '3000' });

      expect(res.status).toBe(200);
      expect(res.body.ramal).toBe('3000');
    });

    it('deve atualizar avatarUrl', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        avatarUrl: 'https://example.com/novo-avatar.png',
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ avatarUrl: 'https://example.com/novo-avatar.png' });

      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toBe('https://example.com/novo-avatar.png');
    });

    it('deve atualizar ativo', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        ativo: false,
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ ativo: false });

      expect(res.status).toBe(200);
      expect(res.body.ativo).toBe(false);
    });

    it('deve atualizar todos os campos opcionais simultaneamente', async () => {
      const adminAtualizado = createAdminFixture({
        setor: 'MARKETING' as Setor,
        telefone: '(11) 95555-6666',
        ramal: '4000',
        avatarUrl: 'https://example.com/avatar-completo.jpg',
        ativo: false,
      });

      prismaMock.usuario.update.mockResolvedValue(adminAtualizado);

      const res = await request(app)
        .put('/api/admin/1')
        .send({
          setor: 'MARKETING',
          telefone: '(11) 95555-6666',
          ramal: '4000',
          avatarUrl: 'https://example.com/avatar-completo.jpg',
          ativo: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.setor).toBe('MARKETING');
      expect(res.body.telefone).toBe('(11) 95555-6666');
      expect(res.body.ramal).toBe('4000');
      expect(res.body.avatarUrl).toBe('https://example.com/avatar-completo.jpg');
      expect(res.body.ativo).toBe(false);
    });

    it('deve permitir setar campos opcionais para null', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        setor: null,
        telefone: null,
        ramal: null,
        avatarUrl: null,
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({
          setor: null,
          telefone: null,
          ramal: null,
          avatarUrl: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.setor).toBeNull();
      expect(res.body.telefone).toBeNull();
      expect(res.body.ramal).toBeNull();
      expect(res.body.avatarUrl).toBeNull();
    });
  });

  describe('Administrador Não Encontrado', () => {
    it('deve retornar 404 quando administrador não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/admin/999')
        .send({ nome: 'Teste' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });

    it('deve retornar 404 quando usuário não for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...adminFixture,
        regra: 'TECNICO' as Regra,
      });

      const res = await request(app)
        .put('/api/admin/1')
        .send({ nome: 'Teste' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando ocorrer erro no findUnique', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .put('/api/admin/1')
        .send({ nome: 'Teste' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao atualizar administrador' });
    });

    it('deve retornar 500 quando ocorrer erro no update', async () => {
      prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .put('/api/admin/1')
        .send({ nome: 'Teste' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao atualizar administrador' });
    });
  });
});

describe('DELETE /api/admin/:id - Deletar Administrador', () => {
  beforeEach(() => {
    prismaMock.usuario.findUnique.mockResolvedValue(adminFixture);
  });

  describe('Soft Delete', () => {
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

    it('não deve chamar delete permanente sem flag', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        deletadoEm: '2025-01-15T00:00:00.000Z',
        ativo: false,
      });

      await request(app).delete('/api/admin/1');

      expect(prismaMock.usuario.delete).not.toHaveBeenCalled();
    });
  });

  describe('Delete Permanente', () => {
    it('deve deletar permanentemente quando solicitado', async () => {
      prismaMock.usuario.delete.mockResolvedValue(adminFixture);

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
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('não deve fazer soft delete quando permanente=true', async () => {
      prismaMock.usuario.delete.mockResolvedValue(adminFixture);

      await request(app)
        .delete('/api/admin/1')
        .query({ permanente: 'true' });

      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve fazer soft delete quando permanente=false', async () => {
      prismaMock.usuario.update.mockResolvedValue({
        ...adminFixture,
        deletadoEm: '2025-01-15T00:00:00.000Z',
        ativo: false,
      });

      const res = await request(app)
        .delete('/api/admin/1')
        .query({ permanente: 'false' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Administrador desativado com sucesso');
      expect(prismaMock.usuario.update).toHaveBeenCalled();
      expect(prismaMock.usuario.delete).not.toHaveBeenCalled();
    });
  });

  describe('Proteção Contra Auto-Exclusão', () => {
    it('deve retornar 400 ao tentar deletar a própria conta', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...adminFixture,
        id: 'auth-user-id',
      });

      const res = await request(app).delete('/api/admin/auth-user-id');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Não é possível deletar sua própria conta'
      });
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
      expect(prismaMock.usuario.delete).not.toHaveBeenCalled();
    });

    it('deve bloquear auto-exclusão mesmo com permanente=true', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...adminFixture,
        id: 'auth-user-id',
      });

      const res = await request(app)
        .delete('/api/admin/auth-user-id')
        .query({ permanente: 'true' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Não é possível deletar sua própria conta'
      });
      expect(prismaMock.usuario.delete).not.toHaveBeenCalled();
    });
  });

  describe('Administrador Não Encontrado', () => {
    it('deve retornar 404 quando administrador não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app).delete('/api/admin/999');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });

    it('deve retornar 404 quando usuário não for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...adminFixture,
        regra: 'TECNICO' as Regra,
      });

      const res = await request(app).delete('/api/admin/1');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando ocorrer erro no findUnique', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const res = await request(app).delete('/api/admin/1');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao deletar administrador' });
    });

    it('deve retornar 500 quando ocorrer erro no update (soft delete)', async () => {
      prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

      const res = await request(app).delete('/api/admin/1');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao deletar administrador' });
    });

    it('deve retornar 500 quando ocorrer erro no delete permanente', async () => {
      prismaMock.usuario.delete.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .delete('/api/admin/1')
        .query({ permanente: 'true' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao deletar administrador' });
    });
  });
});

describe('PATCH /api/admin/:id/reativar - Reativar Administrador', () => {
  describe('Reativação com Sucesso', () => {
    it('deve reativar administrador com deletadoEm preenchido', async () => {
      const adminDeletado = createAdminFixture({
        deletadoEm: '2024-12-01T00:00:00.000Z',
        ativo: false,
      });

      prismaMock.usuario.findUnique.mockResolvedValue(adminDeletado);
      prismaMock.usuario.update.mockResolvedValue({
        id: '1',
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@example.com',
        regra: 'ADMIN' as Regra,
        ativo: true,
      });

      const res = await request(app).patch('/api/admin/1/reativar');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Administrador reativado com sucesso',
        admin: {
          id: '1',
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@example.com',
          regra: 'ADMIN',
          ativo: true,
        },
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

    it('deve reativar administrador inativo sem deletadoEm', async () => {
      const adminInativo = createAdminFixture({
        deletadoEm: null,
        ativo: false,
      });

      const adminInativos = {
        ...adminInativo,
        deletadoEm: '2024-01-01T00:00:00.000Z' as any,
      };

      prismaMock.usuario.findUnique.mockResolvedValue(adminInativos);
      prismaMock.usuario.update.mockResolvedValue({
        id: '1',
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@example.com',
        regra: 'ADMIN' as Regra,
        ativo: true,
      });

      const res = await request(app).patch('/api/admin/1/reativar');

      expect(res.status).toBe(200);
    });
  });

  describe('Administrador Já Ativo', () => {
    it('deve retornar 400 quando administrador já estiver ativo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(adminFixture);

      const res = await request(app).patch('/api/admin/1/reativar');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Administrador já está ativo' });
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando deletadoEm for null e ativo for true', async () => {
      const adminAtivo = createAdminFixture({
        deletadoEm: null,
        ativo: true,
      });

      prismaMock.usuario.findUnique.mockResolvedValue(adminAtivo);

      const res = await request(app).patch('/api/admin/1/reativar');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Administrador já está ativo' });
    });
  });

  describe('Administrador Não Encontrado', () => {
    it('deve retornar 404 quando administrador não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const res = await request(app).patch('/api/admin/999/reativar');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });

    it('deve retornar 404 quando usuário não for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...adminFixture,
        regra: 'TECNICO' as Regra,
        deletadoEm: '2024-12-01T00:00:00.000Z',
        ativo: false,
      });

      const res = await request(app).patch('/api/admin/1/reativar');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Administrador não encontrado' });
    });
  });

  describe('Tratamento de Erros', () => {
    it('deve retornar 500 quando ocorrer erro no findUnique', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const res = await request(app).patch('/api/admin/1/reativar');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao reativar administrador' });
    });

    it('deve retornar 500 quando ocorrer erro no update', async () => {
      const adminDeletado = createAdminFixture({
        deletadoEm: '2024-12-01T00:00:00.000Z',
        ativo: false,
      });

      prismaMock.usuario.findUnique.mockResolvedValue(adminDeletado);
      prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

      const res = await request(app).patch('/api/admin/1/reativar');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erro ao reativar administrador' });
    });
  });
});