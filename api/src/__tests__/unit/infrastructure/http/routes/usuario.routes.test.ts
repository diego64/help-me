import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const usuarioBase = {
  id: 'user1',
  nome: 'João',
  sobrenome: 'Silva',
  email: 'joao.silva@empresa.com',
  telefone: '11999999999',
  ramal: '1234',
  setor: 'TECNOLOGIA_INFORMACAO',
  regra: 'USUARIO',
  ativo: true,
  avatarUrl: null,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
  _count: {
    chamadoOS: 0,
  },
};

const usuarioInativo = {
  ...usuarioBase,
  id: 'user2',
  email: 'inativo@empresa.com',
  ativo: false,
};

const usuarioDeletado = {
  ...usuarioBase,
  id: 'user3',
  email: 'deletado@empresa.com',
  deletadoEm: '2025-01-03T00:00:00.000Z',
  ativo: false,
};

const prismaMock = {
  usuario: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const hashPasswordMock = vi.fn().mockReturnValue('HASHED_PASSWORD_PBKDF2');

const cacheSetMock = vi.fn().mockResolvedValue(undefined);
const cacheGetMock = vi.fn().mockResolvedValue(null);
const cacheDelMock = vi.fn().mockResolvedValue(undefined);

let consoleSpy: {
  log: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
};

let usuarioRegra = 'ADMIN';
let usuarioAtualId = 'admin1';

vi.mock('../../../../../infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../../../shared/config/password', () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock('../../../../../infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { id: usuarioAtualId, regra: usuarioRegra };
    next();
  },
  authorizeRoles:
    (...roles: string[]) =>
    (req: any, res: any, next: any) =>
      roles.includes(req.usuario.regra)
        ? next()
        : res.status(403).json({ error: 'Acesso negado.' }),
  AuthRequest: class {},
}));

vi.mock('../../../../../infrastructure/database/redis/client', () => ({
  cacheSet: cacheSetMock,
  cacheGet: cacheGetMock,
  cacheDel: cacheDelMock,
}));

vi.mock('multer', () => {
  const diskStorageMock = vi.fn().mockReturnValue({});

  const multerFactory: any = vi.fn(() => ({
    single: () => (req: any, res: any, next: any) => {
      req.file = req._mockFile || undefined;
      next();
    },
  }));

  multerFactory.diskStorage = diskStorageMock;

  return {
    default: multerFactory,
  };
});

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: function () {
    return prismaMock;
  },
  Setor: {
    TECNOLOGIA_INFORMACAO: 'TECNOLOGIA_INFORMACAO',
    ADMINISTRACAO: 'ADMINISTRACAO',
    ALMOXARIFADO: 'ALMOXARIFADO',
    CALL_CENTER: 'CALL_CENTER',
    COMERCIAL: 'COMERCIAL',
    DEPARTAMENTO_PESSOAL: 'DEPARTAMENTO_PESSOAL',
    FINANCEIRO: 'FINANCEIRO',
    JURIDICO: 'JURIDICO',
    LOGISTICA: 'LOGISTICA',
    MARKETING: 'MARKETING',
    QUALIDADE: 'QUALIDADE',
    RECURSOS_HUMANOS: 'RECURSOS_HUMANOS',
  },
  Regra: {
    ADMIN: 'ADMIN',
    TECNICO: 'TECNICO',
    USUARIO: 'USUARIO',
  },
}));

let router: any;

beforeAll(async () => {
  router = (await import('@presentation/http/routes/usuario.routes')).default;
});

beforeEach(() => {
  // 1. Limpar tudo primeiro
  vi.clearAllMocks();

  // 2. Recriar spies DEPOIS do clear
  consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  // 3. Configurar estado
  usuarioRegra = 'ADMIN';
  usuarioAtualId = 'admin1';

  // 4. Resetar mocks do Prisma com defaults seguros
  Object.values(prismaMock.usuario).forEach((mock: any) => mock.mockReset());
  prismaMock.usuario.findUnique.mockResolvedValue(null);
  prismaMock.usuario.findMany.mockResolvedValue([]);
  prismaMock.usuario.count.mockResolvedValue(0);
  prismaMock.usuario.create.mockResolvedValue(undefined as any);
  prismaMock.usuario.update.mockResolvedValue(undefined as any);
  prismaMock.usuario.delete.mockResolvedValue(undefined as any);

  // 5. Resetar demais mocks
  hashPasswordMock.mockReturnValue('HASHED_PASSWORD_PBKDF2');
  cacheSetMock.mockResolvedValue(undefined);
  cacheGetMock.mockResolvedValue(null);
  cacheDelMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function criarApp(mockFile?: any) {
  const app = express();
  app.use(express.json());
  if (mockFile) {
    app.use((req: any, res: any, next: any) => {
      req._mockFile = mockFile;
      next();
    });
  }
  app.use('/usuarios', router);
  return app;
}

function createPaginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

describe('POST /usuarios (criação de usuário)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 201 e criar usuário com sucesso', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao.silva@empresa.com',
          password: 'senha123456',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
      expect(resposta.body.nome).toBe('João');
      expect(resposta.body.sobrenome).toBe('Silva');
      expect(resposta.body.email).toBe('joao.silva@empresa.com');
      expect(resposta.body.regra).toBe('USUARIO');
      expect(hashPasswordMock).toHaveBeenCalledWith('senha123456');
      expect(cacheDelMock).toHaveBeenCalled();
    });

    it('deve criar usuário com telefone e ramal opcionais', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue({
        ...usuarioBase,
        telefone: '11999999999',
        ramal: '1234',
      });

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao.silva@empresa.com',
          password: 'senha123456',
          telefone: '11999999999',
          ramal: '1234',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
      expect(resposta.body.telefone).toBe('11999999999');
      expect(resposta.body.ramal).toBe('1234');
    });

    it('deve criar usuário sem telefone e ramal', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue({
        ...usuarioBase,
        telefone: null,
        ramal: null,
      });

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao.silva@empresa.com',
          password: 'senha123456',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
      expect(resposta.body.telefone).toBeNull();
      expect(resposta.body.ramal).toBeNull();
    });

    it('deve fazer trim de nome e sobrenome', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: '  João  ',
          sobrenome: '  Silva  ',
          email: 'joao.silva@empresa.com',
          password: 'senha123456',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
      expect(prismaMock.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nome: 'João',
            sobrenome: 'Silva',
          }),
        })
      );
    });

    it('deve converter email para lowercase', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'JOAO.SILVA@EMPRESA.COM',
          password: 'senha123456',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
      expect(prismaMock.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'joao.silva@empresa.com',
          }),
        })
      );
    });

    it('deve aceitar nome com 2 caracteres (limite mínimo)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'Jo',
          sobrenome: 'Silva',
          email: 'jo@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar nome com 100 caracteres (limite máximo)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'a'.repeat(100),
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar senha com 8 caracteres (limite mínimo)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: '12345678',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar todos os setores válidos', async () => {
      const setores = [
        'TECNOLOGIA_INFORMACAO',
        'ADMINISTRACAO',
        'ALMOXARIFADO',
        'CALL_CENTER',
        'COMERCIAL',
        'DEPARTAMENTO_PESSOAL',
        'FINANCEIRO',
        'JURIDICO',
        'LOGISTICA',
        'MARKETING',
        'QUALIDADE',
        'RECURSOS_HUMANOS',
      ];

      for (const setor of setores) {
        prismaMock.usuario.findUnique.mockResolvedValue(null);
        prismaMock.usuario.create.mockResolvedValue({ ...usuarioBase, setor });

        const resposta = await request(criarApp())
          .post('/usuarios')
          .send({
            nome: 'João',
            sobrenome: 'Silva',
            email: `joao${setor}@empresa.com`,
            password: 'senha123',
            setor,
          });

        expect(resposta.status).toBe(201);
      }
    });
  });

  describe('Validação de nome', () => {
    it('deve retornar status 400 quando nome não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for null', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: null,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for undefined', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: undefined,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for número', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 123,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: '',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for apenas espaços', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: '   ',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando nome tiver 1 caractere', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'J',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando nome tiver 101 caracteres', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'a'.repeat(101),
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando nome for boolean', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: true,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for objeto', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: {},
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for array', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: [],
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });
  });

  describe('Validação de sobrenome', () => {
    it('deve retornar status 400 quando sobrenome não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });

    it('deve retornar status 400 quando sobrenome for null', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: null,
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });

    it('deve retornar status 400 quando sobrenome for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: '',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });

    it('deve retornar status 400 quando sobrenome tiver 1 caractere', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'S',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 101 caracteres', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'a'.repeat(101),
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando sobrenome for apenas espaços', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: '   ',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome for número', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 123,
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });
  });

  describe('Validação de email', () => {
    it('deve retornar status 400 quando email não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for inválido - sem @', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'emailinvalido.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    }, 20000);

    it('deve retornar status 400 quando email for inválido - sem domínio', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for inválido - sem local part', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: '@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for null', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: null,
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for número', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 123,
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: '',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email tiver espaços', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao silva@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });
  });

  describe('Validação de senha', () => {
    it('deve retornar status 400 quando senha não for enviada', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for null', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: null,
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for número', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 12345678,
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: '',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha tiver 7 caracteres', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: '1234567',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });
  });

  describe('Validação de setor', () => {
    it('deve retornar status 400 quando setor não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Setor inválido');
    });

    it('deve retornar status 400 quando setor for inválido', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'SETOR_INEXISTENTE',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Setor inválido');
    });
  });

  describe('Validação de duplicação', () => {
    it('deve retornar status 409 quando email já estiver cadastrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user2',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já cadastrado');
    });

    it('deve retornar status 409 quando existir usuário deletado com mesmo email', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user2',
        email: 'joao@empresa.com',
        deletadoEm: new Date(),
      });

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('usuário deletado com este email');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      usuarioRegra = 'TECNICO';

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      usuarioRegra = 'USUARIO';

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro no banco ao verificar email', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao criar usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao criar usuário', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao criar usuário');
    });

    it('deve continuar criação quando cacheDel falhar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase);
      cacheDelMock.mockRejectedValue(new Error('Cache error'));

      const resposta = await request(criarApp())
        .post('/usuarios')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao.silva@empresa.com',
          password: 'senha123456',
          setor: 'TECNOLOGIA_INFORMACAO',
        });

      expect(resposta.status).toBe(201);
    });
  });
});

describe('GET /usuarios (listagem de usuários)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 com lista vazia quando não houver usuários', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(0);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(0);
      expect(resposta.body.pagination.total).toBe(0);
    });

    it('deve retornar status 200 com lista paginada de usuários', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(1);
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('deve retornar múltiplos usuários ordenados por nome e sobrenome', async () => {
      cacheGetMock.mockResolvedValue(null);
      const usuarios = [
        { ...usuarioBase, id: 'user1', nome: 'Ana', sobrenome: 'Silva' },
        { ...usuarioBase, id: 'user2', nome: 'Bruno', sobrenome: 'Costa' },
        { ...usuarioBase, id: 'user3', nome: 'Carlos', sobrenome: 'Souza' },
      ];
      prismaMock.usuario.count.mockResolvedValue(3);
      prismaMock.usuario.findMany.mockResolvedValue(usuarios);

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(3);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        })
      );
    });

    it('deve retornar usuários com todos os campos necessários', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data[0]).toHaveProperty('id');
      expect(resposta.body.data[0]).toHaveProperty('nome');
      expect(resposta.body.data[0]).toHaveProperty('sobrenome');
      expect(resposta.body.data[0]).toHaveProperty('email');
      expect(resposta.body.data[0]).toHaveProperty('setor');
      expect(resposta.body.data[0]).toHaveProperty('regra');
      expect(resposta.body.data[0]).toHaveProperty('ativo');
      expect(resposta.body.data[0]).toHaveProperty('_count');
    });

    it('deve retornar dados do cache quando disponível', async () => {
      const cachedData = createPaginatedResponse([usuarioBase], 1, 1, 20);
      cacheGetMock.mockResolvedValue(JSON.stringify(cachedData));

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(1);
      expect(prismaMock.usuario.findMany).not.toHaveBeenCalled();
      expect(prismaMock.usuario.count).not.toHaveBeenCalled();
    });

    it('deve salvar resultado no cache quando buscar do banco', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios');

      expect(cacheSetMock).toHaveBeenCalled();
      const cacheKey = cacheSetMock.mock.calls[0][0];
      expect(cacheKey).toContain('usuarios:list');
    });
  });

  describe('Filtros', () => {
    it('deve filtrar apenas usuários ativos por padrão', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            regra: 'USUARIO',
            ativo: true,
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve incluir usuários inativos quando solicitado', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(2);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase, usuarioInativo]);

      const resposta = await request(criarApp()).get('/usuarios?incluirInativos=true');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            regra: 'USUARIO',
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve incluir usuários deletados quando solicitado', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(2);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase, usuarioDeletado]);

      const resposta = await request(criarApp()).get('/usuarios?incluirDeletados=true');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            regra: 'USUARIO',
            ativo: true,
          }),
        })
      );
    });

    it('deve incluir todos usuários quando ambas flags forem true', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(3);
      prismaMock.usuario.findMany.mockResolvedValue([
        usuarioBase,
        usuarioInativo,
        usuarioDeletado,
      ]);

      const resposta = await request(criarApp()).get(
        '/usuarios?incluirInativos=true&incluirDeletados=true'
      );

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            regra: 'USUARIO',
          }),
        })
      );
    });

    it('deve filtrar por setor específico', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?setor=TECNOLOGIA_INFORMACAO');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            setor: 'TECNOLOGIA_INFORMACAO',
          }),
        })
      );
    });

    it('deve buscar por nome quando fornecido termo', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?busca=João');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { nome: { contains: 'João', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('deve buscar por sobrenome quando fornecido termo', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?busca=Silva');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { sobrenome: { contains: 'Silva', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('deve buscar por email quando fornecido termo', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?busca=joao.silva');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: 'joao.silva', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('deve buscar case-insensitive', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?busca=JOÃO');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { nome: { contains: 'JOÃO', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('deve combinar busca com filtro de setor', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?busca=João&setor=TECNOLOGIA_INFORMACAO');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            setor: 'TECNOLOGIA_INFORMACAO',
            OR: expect.any(Array),
          }),
        })
      );
    });

    it('deve combinar todos os filtros simultaneamente', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get(
        '/usuarios?busca=João&setor=TECNOLOGIA_INFORMACAO&incluirInativos=true&incluirDeletados=true'
      );

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            regra: 'USUARIO',
            setor: 'TECNOLOGIA_INFORMACAO',
            OR: expect.any(Array),
          }),
        })
      );
    });
  });

  describe('Paginação', () => {
    it('deve aplicar paginação padrão (página 1, 20 itens)', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        })
      );
    });

    it('deve aplicar paginação personalizada', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios?page=2&limit=10');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });

    it('deve calcular skip corretamente para página 3', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(100);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?page=3&limit=15');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 30,
          take: 15,
        })
      );
    });

    it('deve limitar paginação ao máximo de 100 itens', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(200);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?limit=999');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('deve usar página 1 quando page for 0', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?page=0');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
        })
      );
    });

    it('deve usar página 1 quando page for negativo', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?page=-5');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
        })
      );
    });

    it('deve usar limit 1 quando limit for 0', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?limit=0');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        })
      );
    });

    it('deve usar limit 1 quando limit for negativo', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      await request(criarApp()).get('/usuarios?limit=-10');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        })
      );
    });

    it('deve indicar hasNext=true quando houver próxima página', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios?page=1&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasNext).toBe(true);
    });

    it('deve indicar hasNext=false quando for última página', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios?page=5&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasNext).toBe(false);
    });

    it('deve indicar hasPrev=true quando houver página anterior', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios?page=2&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasPrev).toBe(true);
    });

    it('deve indicar hasPrev=false quando for primeira página', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios?page=1&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasPrev).toBe(false);
    });

    it('deve calcular totalPages corretamente', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(47);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios?limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.totalPages).toBe(5);
    });

    it('deve retornar totalPages=0 quando não houver resultados', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(0);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.totalPages).toBe(0);
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      usuarioRegra = 'ADMIN';
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      usuarioRegra = 'TECNICO';

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      usuarioRegra = 'USUARIO';

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao contar', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao listar usuários');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao buscar', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao listar usuários');
    });

    it('deve retornar status 500 quando cacheGet falhar', async () => {
      cacheGetMock.mockRejectedValue(new Error('Cache error'));

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao listar usuários');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando cacheSet falhar', async () => {
      cacheGetMock.mockResolvedValue(null);
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);
      cacheSetMock.mockRejectedValue(new Error('Cache error'));

      const resposta = await request(criarApp()).get('/usuarios');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao listar usuários');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('GET /usuarios/:id (buscar usuário específico)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 com dados do usuário quando encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe('user1');
      expect(resposta.body.nome).toBe('João');
      expect(resposta.body.regra).toBe('USUARIO');
    });

    it('deve retornar usuário com contagem de chamados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(resposta.body._count).toBeDefined();
      expect(resposta.body._count.chamadoOS).toBe(0);
    });

    it('deve retornar usuário inativo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioInativo);

      const resposta = await request(criarApp()).get('/usuarios/user2');

      expect(resposta.status).toBe(200);
      expect(resposta.body.ativo).toBe(false);
    });

    it('deve retornar usuário deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioDeletado);

      const resposta = await request(criarApp()).get('/usuarios/user3');

      expect(resposta.status).toBe(200);
      expect(resposta.body.deletadoEm).toBeDefined();
    });

    it('deve retornar todos os campos do usuário', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('id');
      expect(resposta.body).toHaveProperty('nome');
      expect(resposta.body).toHaveProperty('sobrenome');
      expect(resposta.body).toHaveProperty('email');
      expect(resposta.body).toHaveProperty('telefone');
      expect(resposta.body).toHaveProperty('ramal');
      expect(resposta.body).toHaveProperty('setor');
      expect(resposta.body).toHaveProperty('regra');
      expect(resposta.body).toHaveProperty('ativo');
      expect(resposta.body).toHaveProperty('avatarUrl');
      expect(resposta.body).toHaveProperty('geradoEm');
      expect(resposta.body).toHaveProperty('atualizadoEm');
      expect(resposta.body).toHaveProperty('deletadoEm');
      expect(resposta.body).toHaveProperty('_count');
    });

    it('deve permitir USUARIO visualizar próprio perfil', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user1';
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(200);
    });
  });

  describe('Casos de erro', () => {
    it('deve retornar status 404 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp()).get('/usuarios/user999');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário não for USUARIO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...usuarioBase,
        regra: 'TECNICO',
      });

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...usuarioBase,
        regra: 'ADMIN',
      });

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });

  describe('Autorização', () => {
    it('deve permitir ADMIN visualizar qualquer perfil', async () => {
      usuarioRegra = 'ADMIN';
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar ver perfil de outro', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user2';

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode visualizar seu próprio perfil');
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro no banco', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/usuarios/user1');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao buscar usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('POST /usuarios/email (buscar por email)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 com dados do usuário quando encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'joao.silva@empresa.com' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.email).toBe('joao.silva@empresa.com');
    });

    it('deve converter email para lowercase antes de buscar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'JOAO.SILVA@EMPRESA.COM' });

      expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'joao.silva@empresa.com' },
        select: expect.any(Object),
      });
    });

    it('deve retornar usuário com todos os campos', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'joao.silva@empresa.com' });

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('id');
      expect(resposta.body).toHaveProperty('nome');
      expect(resposta.body).toHaveProperty('sobrenome');
      expect(resposta.body).toHaveProperty('email');
    });
  });

  describe('Validações', () => {
    it('deve retornar status 400 quando email não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for null', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: null });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for undefined', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: undefined });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for número', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 123 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: '' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for inválido - sem @', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'emailinvalido.com' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for inválido - sem domínio', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'email@' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for inválido - sem local part', async () => {
      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: '@empresa.com' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 404 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'naoexiste@empresa.com' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      usuarioRegra = 'ADMIN';
      prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'joao.silva@empresa.com' });

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      usuarioRegra = 'TECNICO';

      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'joao@empresa.com' });

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      usuarioRegra = 'USUARIO';

      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'joao@empresa.com' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro no banco', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp())
        .post('/usuarios/email')
        .send({ email: 'joao@empresa.com' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao buscar usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /usuarios/:id (edição de usuário)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 e atualizar usuário com sucesso', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        nome: 'João Atualizado',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'João Atualizado' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe('João Atualizado');
      expect(cacheDelMock).toHaveBeenCalled();
    });

    it('deve permitir ADMIN atualizar setor', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        setor: 'FINANCEIRO',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ setor: 'FINANCEIRO' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            setor: 'FINANCEIRO',
          }),
        })
      );
    });

    it('deve atualizar apenas nome', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        nome: 'Maria',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Maria' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nome: 'Maria' },
        })
      );
    });

    it('deve atualizar apenas sobrenome', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        sobrenome: 'Santos',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ sobrenome: 'Santos' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar telefone e ramal', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        telefone: '21888888888',
        ramal: '9999',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ telefone: '21888888888', ramal: '9999' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar email quando não estiver em uso', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'user1',
          regra: 'USUARIO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        email: 'novoemail@empresa.com',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ email: 'novoemail@empresa.com' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar múltiplos campos simultaneamente', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        nome: 'Carlos',
        sobrenome: 'Santos',
        telefone: '21999999999',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({
          nome: 'Carlos',
          sobrenome: 'Santos',
          telefone: '21999999999',
        });

      expect(resposta.status).toBe(200);
    });

    it('não deve permitir USUARIO atualizar setor', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'user1',
          regra: 'USUARIO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ setor: 'FINANCEIRO' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve retornar usuário atual quando nenhum dado for fornecido', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'user1',
          regra: 'USUARIO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({});

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve fazer trim de nome e sobrenome', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: '  Maria  ', sobrenome: '  Santos  ' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nome: 'Maria',
            sobrenome: 'Santos',
          }),
        })
      );
    });

    it('deve permitir atualizar com mesmo email', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ email: 'joao@empresa.com' });

      expect(resposta.status).toBe(200);
    });

    it.todo('deve permitir atualizar usuário inativo', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user2',
        regra: 'USUARIO',
        email: 'inativo@empresa.com',
        deletadoEm: null,
        ativo: false,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioInativo);

      const resposta = await request(criarApp())
        .put('/usuarios/user2')
        .send({ nome: 'Atualizado' });

      expect(resposta.status).toBe(200);
    });

    it('deve remover telefone quando definido como null', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        telefone: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ telefone: null });

      expect(resposta.status).toBe(200);
      expect(resposta.body.telefone).toBeNull();
    });

    it('deve remover ramal quando definido como null', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        ramal: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ ramal: null });

      expect(resposta.status).toBe(200);
      expect(resposta.body.ramal).toBeNull();
    });

    it('deve remover telefone quando string vazia', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        telefone: null,
      });

      await request(criarApp())
        .put('/usuarios/user1')
        .send({ telefone: '' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            telefone: null,
          }),
        })
      );
    });

    it('deve remover ramal quando string vazia', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        ramal: null,
      });

      await request(criarApp())
        .put('/usuarios/user1')
        .send({ ramal: '' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ramal: null,
          }),
        })
      );
    });
  });

  describe('Validações de campos', () => {
    it('deve retornar status 400 quando nome tiver 1 caractere', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'A' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando nome tiver 101 caracteres', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'a'.repeat(101) });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 1 caractere', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ sobrenome: 'S' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 101 caracteres', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ sobrenome: 'a'.repeat(101) });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando email for inválido - sem @', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ email: 'emailinvalido.com' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for inválido - sem domínio', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ email: 'email@' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando nome for apenas espaços', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: '   ' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome for apenas espaços', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ sobrenome: '   ' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve aceitar nome com 2 caracteres (limite mínimo)', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Jo' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar nome com 100 caracteres (limite máximo)', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'a'.repeat(100) });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações de estado', () => {
    it('deve retornar status 404 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/usuarios/user999')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário não for USUARIO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'ADMIN',
        email: 'admin@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 400 quando tentar editar usuário deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: new Date(),
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Não é possível editar um usuário deletado');
    });

    it('deve retornar status 409 quando email já estiver em uso', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'user1',
          regra: 'USUARIO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce({
          id: 'user2',
          email: 'outro@empresa.com',
        });

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ email: 'outro@empresa.com' });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já está em uso');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando USUARIO tentar editar outro perfil', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user2';

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode editar seu próprio perfil');
    });

    it('deve permitir ADMIN editar qualquer usuário', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(200);
    });

    it('deve permitir USUARIO editar próprio perfil', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user1';

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar usuário', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });
      prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar usuário');
    });

    it('deve retornar status 500 quando verificação de email duplicado falhar', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'user1',
          regra: 'USUARIO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockRejectedValueOnce(new Error('Database error'));

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ email: 'novo@empresa.com' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve continuar atualização quando cacheDel falhar', async () => {
      usuarioRegra = 'ADMIN';
      cacheDelMock.mockRejectedValue(new Error('Cache error'));

      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(200);
    });
  });
});

describe('PUT /usuarios/:id/senha (alteração de senha)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 e alterar senha com sucesso', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Senha alterada com sucesso');
      expect(hashPasswordMock).toHaveBeenCalledWith('novasenha123');
    });

    it('deve permitir ADMIN alterar senha de qualquer usuário', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar senha com 8 caracteres (limite mínimo)', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: '12345678' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar senha com caracteres especiais', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'S3nh@!F0rt3' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar senha longa', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'a'.repeat(100) });

      expect(resposta.status).toBe(200);
    });

    it('deve fazer hash da nova senha antes de salvar', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(hashPasswordMock).toHaveBeenCalledWith('novasenha123');
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { password: 'HASHED_PASSWORD_PBKDF2' },
      });
    });
  });

  describe('Validações', () => {
    it('deve retornar status 400 quando senha não for enviada', async () => {
      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for null', async () => {
      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: null });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for undefined', async () => {
      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: undefined });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for número', async () => {
      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 12345678 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for string vazia', async () => {
      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: '' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha tiver 7 caracteres', async () => {
      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: '1234567' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve retornar status 400 quando senha tiver 1 caractere', async () => {
      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'a' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve retornar status 404 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/usuarios/user999/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário não for USUARIO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'TECNICO',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'ADMIN',
      });

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando USUARIO tentar alterar senha de outro', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user2';

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode alterar sua própria senha');
    });

    it('deve permitir USUARIO alterar própria senha', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar usuário', async () => {
      prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao alterar senha');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar senha', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp())
        .put('/usuarios/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao alterar senha');
    });
  });
});

describe('POST /usuarios/:id/avatar (upload de avatar)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 e fazer upload do avatar com sucesso', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar-123.jpg',
      });

      const mockFile = {
        filename: 'avatar-123.jpg',
        path: '/uploads/avatars/avatar-123.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('enviado com sucesso');
      expect(resposta.body.avatarUrl).toBeDefined();
      expect(cacheDelMock).toHaveBeenCalled();
    });

    it('deve permitir ADMIN fazer upload de avatar para qualquer usuário', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar-456.jpg',
      });

      const mockFile = {
        filename: 'avatar-456.jpg',
        path: '/uploads/avatars/avatar-456.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar arquivo JPG', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar.jpg',
      });

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
        mimetype: 'image/jpeg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar arquivo PNG', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar.png',
      });

      const mockFile = {
        filename: 'avatar.png',
        path: '/uploads/avatars/avatar.png',
        mimetype: 'image/png',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar arquivo WEBP', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar.webp',
      });

      const mockFile = {
        filename: 'avatar.webp',
        path: '/uploads/avatars/avatar.webp',
        mimetype: 'image/webp',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve substituir avatar existente', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        avatarUrl: '/uploads/avatars/avatar-antigo.jpg',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar-novo.jpg',
      });

      const mockFile = {
        filename: 'avatar-novo.jpg',
        path: '/uploads/avatars/avatar-novo.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
      expect(resposta.body.avatarUrl).toBe('/uploads/avatars/avatar-novo.jpg');
    });

    it('deve retornar caminho relativo do avatar', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/123456.jpg',
      });

      const mockFile = {
        filename: '123456.jpg',
        path: '/uploads/avatars/123456.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
      expect(resposta.body.avatarUrl).toMatch(/^\/uploads\/avatars\//);
    });

    it('deve permitir USUARIO fazer upload do próprio avatar', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar-123.jpg',
      });

      const mockFile = {
        filename: 'avatar-123.jpg',
        path: '/uploads/avatars/avatar-123.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações', () => {
    it('deve retornar status 400 quando arquivo não for enviado', async () => {
      usuarioRegra = 'ADMIN';

      const resposta = await request(criarApp())
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });

    it('deve retornar status 400 quando req.file for undefined', async () => {
      usuarioRegra = 'ADMIN';

      const resposta = await request(criarApp())
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });

    it('deve retornar status 400 quando req.file for null', async () => {
      usuarioRegra = 'ADMIN';

      const mockFile = null;

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });

    it('deve retornar status 404 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user999/avatar')
        .send();

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário não for USUARIO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'TECNICO',
      });

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it.todo('deve retornar status 404 quando usuário for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'ADMIN',
      });

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando USUARIO tentar fazer upload para outro', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user2';

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode fazer upload do seu próprio avatar');
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar usuário', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao fazer upload do avatar');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar avatar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao fazer upload do avatar');
    });

    it('deve continuar upload quando cacheDel falhar', async () => {
      usuarioRegra = 'ADMIN';
      cacheDelMock.mockRejectedValue(new Error('Cache error'));

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'user1',
        avatarUrl: '/uploads/avatars/avatar-123.jpg',
      });

      const mockFile = {
        filename: 'avatar-123.jpg',
        path: '/uploads/avatars/avatar-123.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/usuarios/user1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });
  });
});

describe('DELETE /usuarios/:id (deleção de usuário)', () => {
  describe('Soft delete', () => {
    it('deve retornar status 200 e fazer soft delete com sucesso', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('deletado com sucesso');
      expect(cacheDelMock).toHaveBeenCalled();
    });

    it('deve fazer soft delete mesmo com chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 10 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
      expect(prismaMock.usuario.delete).not.toHaveBeenCalled();
    });

    it('deve definir deletadoEm e ativo=false ao fazer soft delete', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      await request(criarApp()).delete('/usuarios/user1');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { deletadoEm: expect.any(Date), ativo: false },
      });
    });

    it('deve fazer soft delete de usuário com 1 chamado vinculado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 1 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
    });

    it('deve fazer soft delete de usuário com 100 chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 100 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
    });
  });

  describe('Hard delete', () => {
    it('deve retornar status 200 e fazer hard delete quando solicitado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.delete.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=true');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('removido permanentemente');
      expect(cacheDelMock).toHaveBeenCalled();
    });

    it('deve retornar status 400 quando tentar hard delete com chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 5 },
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=true');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('5 chamados vinculados');
    });

    it('deve retornar status 400 quando tentar hard delete com 1 chamado vinculado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 1 },
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=true');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('1 chamado');
    });

    it('deve retornar status 400 quando tentar hard delete com 100 chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 100 },
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=true');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('100 chamados vinculados');
    });

    it('deve aceitar query param permanente=1', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.delete.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=1');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('removido permanentemente');
    });

    it('deve aceitar query param permanente=yes', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.delete.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=yes');

      expect(resposta.status).toBe(200);
    });

    it('deve fazer soft delete quando permanente=false', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=false');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
      expect(prismaMock.usuario.delete).not.toHaveBeenCalled();
    });

    it('deve fazer soft delete quando permanente não for enviado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
    });
  });

  describe('Validações', () => {
    it('deve retornar status 404 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp()).delete('/usuarios/user999');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário não for USUARIO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'TECNICO',
        email: 'tecnico@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'ADMIN',
        email: 'admin@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando USUARIO tentar deletar outra conta', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user2';

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode deletar sua própria conta');
    });

    it('deve permitir ADMIN deletar usuário (soft delete)', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir ADMIN deletar usuário (hard delete)', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.delete.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=true');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir USUARIO deletar própria conta (soft delete)', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir USUARIO deletar própria conta (hard delete)', async () => {
      usuarioRegra = 'USUARIO';
      usuarioAtualId = 'user1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.delete.mockResolvedValue(usuarioBase);

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=true');

      expect(resposta.status).toBe(200);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar usuário', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao deletar usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro no soft delete', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao deletar usuário');
    });

    it('deve retornar status 500 quando ocorrer erro no hard delete', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.delete.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).delete('/usuarios/user1?permanente=true');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao deletar usuário');
    });

    it('deve continuar deleção quando cacheDel falhar', async () => {
      cacheDelMock.mockRejectedValue(new Error('Cache error'));

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { chamadoOS: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/usuarios/user1');

      expect(resposta.status).toBe(200);
    });
  });
});

describe('PATCH /usuarios/:id/restaurar (restauração de usuário)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 e restaurar usuário deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('restaurado com sucesso');
      expect(resposta.body.usuario.deletadoEm).toBeNull();
      expect(resposta.body.usuario.ativo).toBe(true);
      expect(cacheDelMock).toHaveBeenCalled();
    });

    it('deve restaurar usuário que estava inativo antes de ser deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        ativo: false,
        deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.usuario.ativo).toBe(true);
    });

    it('deve definir deletadoEm como null', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        deletadoEm: '2025-01-03T00:00:00.000Z',
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: null,
        ativo: true,
      });

      await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve retornar usuário com todos os campos após restauração', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.usuario).toHaveProperty('id');
      expect(resposta.body.usuario).toHaveProperty('nome');
      expect(resposta.body.usuario).toHaveProperty('email');
      expect(resposta.body.usuario).toHaveProperty('regra');
      expect(resposta.body.usuario).toHaveProperty('ativo');
      expect(resposta.body.usuario).toHaveProperty('deletadoEm');
    });

    it('deve restaurar usuário deletado há muito tempo', async () => {
      const dataAntigaDeletado = '2020-01-01T00:00:00.000Z';
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        deletadoEm: dataAntigaDeletado,
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações', () => {
    it('deve retornar status 404 quando usuário não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp()).patch('/usuarios/user999/restaurar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário não for USUARIO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'TECNICO',
        email: 'tecnico@empresa.com',
        deletadoEm: new Date(),
      });

      const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'ADMIN',
        email: 'admin@empresa.com',
        deletadoEm: new Date(),
      });

      const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve retornar status 400 quando usuário não estiver deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não está deletado');
    });

    it('deve retornar status 400 quando deletadoEm for null', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não está deletado');
    });

    it('deve retornar status 400 para usuário ativo não deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        ativo: true,
        deletadoEm: null,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

      expect(resposta.status).toBe(400);
    });

    it('deve retornar status 400 para usuário inativo não deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user2',
        regra: 'USUARIO',
        email: 'inativo@empresa.com',
        ativo: false,
        deletadoEm: null,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user2/restaurar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não está deletado');
    });
  });

  describe('Autorização', () => {
    it('deve permitir ADMIN restaurar usuário', async () => {
      usuarioRegra = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      usuarioRegra = 'TECNICO';

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      usuarioRegra = 'USUARIO';

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar usuário', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao restaurar usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao restaurar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao restaurar usuário');
    });

    it('deve continuar restauração quando cacheDel falhar', async () => {
      cacheDelMock.mockRejectedValue(new Error('Cache error'));

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user3',
        regra: 'USUARIO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...usuarioBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp()).patch('/usuarios/user3/restaurar');

      expect(resposta.status).toBe(200);
    });
  });
});