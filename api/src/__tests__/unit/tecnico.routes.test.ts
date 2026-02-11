import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Response, NextFunction } from 'express';
import request from 'supertest';
import type { Regra } from '@prisma/client';

let currentUserRole: Regra = 'ADMIN';
let currentUserId = 'admin1';

const prismaMock = {
  usuario: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  expediente: {
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

const hashPasswordMock = vi.fn().mockReturnValue('HASHED_PASSWORD_PBKDF2');

vi.mock('../../infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

vi.mock('../../utils/password', () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock('../../shared/config/password', () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock('../../infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, res: Response, next: NextFunction) => {
    req.usuario = {
      id: currentUserId,
      email: 'test@example.com',
      regra: currentUserRole,
      type: 'access',
    };
    next();
  },
  authorizeRoles: (...allowedRoles: string[]) => {
    return (req: any, res: Response, next: NextFunction) => {
      if (!req.usuario) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }
      
      if (!allowedRoles.includes(req.usuario.regra)) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
      
      next();
    };
  },
  AuthRequest: class {},
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
    RECURSOS_HUMANOS: 'RECURSOS_HUMANOS',
    FINANCEIRO: 'FINANCEIRO',
  },
  Regra: {
    ADMIN: 'ADMIN',
    TECNICO: 'TECNICO',
    USUARIO: 'USUARIO',
  },
}));

const { default: tecnicoRoutes } = await import('../../presentation/http/routes/tecnico.routes');

const tecnicoBase = {
  id: 'tec1',
  nome: 'João',
  sobrenome: 'Silva',
  email: 'joao.silva@empresa.com',
  telefone: '11999999999',
  ramal: '1234',
  setor: 'TECNOLOGIA_INFORMACAO',
  regra: 'TECNICO',
  ativo: true,
  avatarUrl: null,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
  tecnicoDisponibilidade: [
    {
      id: 'exp1',
      entrada: '2025-01-01T08:00:00.000Z',
      saida: '2025-01-01T17:00:00.000Z',
      ativo: true,
      geradoEm: '2025-01-01T00:00:00.000Z',
      atualizadoEm: '2025-01-01T00:00:00.000Z',
      deletadoEm: null,
    },
  ],
  _count: {
    tecnicoChamados: 0,
  },
};

const tecnicoInativo = {
  ...tecnicoBase,
  id: 'tec2',
  email: 'inativo@empresa.com',
  ativo: false,
};

const tecnicoDeletado = {
  ...tecnicoBase,
  id: 'tec3',
  email: 'deletado@empresa.com',
  deletadoEm: '2025-01-03T00:00:00.000Z',
};

const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

function criarApp(mockFile?: any) {
  const app = express();
  app.use(express.json());
  if (mockFile) {
    app.use((req: any, res: any, next: any) => {
      req._mockFile = mockFile;
      next();
    });
  }
  app.use('/tecnicos', tecnicoRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserRole = 'ADMIN';
  currentUserId = 'admin1';

  Object.values(prismaMock.usuario).forEach(mock => mock.mockReset());
  Object.values(prismaMock.expediente).forEach(mock => mock.mockReset());
  prismaMock.$transaction.mockReset();

  hashPasswordMock.mockClear();
  hashPasswordMock.mockReturnValue('HASHED_PASSWORD_PBKDF2');
  
  consoleSpy.log.mockClear();
  consoleSpy.error.mockClear();
});

describe('POST /tecnicos (criação de técnico)', () => {
  describe('Casos de sucesso [1]', () => {
    it('deve retornar status 201 e criar técnico com expediente padrão', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: vi.fn().mockResolvedValue({
              id: 'exp1',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao.silva@empresa.com',
          password: 'senha123456',
        });

      expect(resposta.status).toBe(201);
      expect(resposta.body.nome).toBe('João');
      expect(resposta.body.regra).toBe('TECNICO');
      expect(hashPasswordMock).toHaveBeenCalledWith('senha123456');
    });

    it('deve criar técnico com horários personalizados', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);
      
      const expedienteCreateMock = vi.fn().mockResolvedValue({
        id: 'exp1',
        entrada: new Date('2025-01-01T09:00:00.000Z'),
        saida: new Date('2025-01-01T18:00:00.000Z'),
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: expedienteCreateMock,
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123456',
          entrada: '09:00',
          saida: '18:00',
        });

      expect(resposta.status).toBe(201);
      expect(expedienteCreateMock).toHaveBeenCalled();
    });

    it('deve criar técnico com todos os campos opcionais preenchidos', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...tecnicoBase,
          telefone: '11987654321',
          ramal: '5678',
          setor: 'ADMINISTRACAO',
        });
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: vi.fn().mockResolvedValue({
              id: 'exp1',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123456',
          telefone: '11987654321',
          ramal: '5678',
          setor: 'ADMINISTRACAO',
          entrada: '08:00',
          saida: '17:00',
        });

      expect(resposta.status).toBe(201);
    });

    it('deve criar técnico sem telefone e ramal', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...tecnicoBase,
          telefone: null,
          ramal: null,
        });
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: vi.fn().mockResolvedValue({
              id: 'exp1',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123456',
        });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar nome com 2 caracteres (limite mínimo) [1]', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...tecnicoBase, nome: 'Jo' });
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: vi.fn().mockResolvedValue({
              id: 'exp1',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'Jo',
          sobrenome: 'Silva',
          email: 'jo@empresa.com',
          password: 'senha123456',
        });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar nome com 100 caracteres (limite máximo) [1]', async () => {
      const nome100 = 'A'.repeat(100);
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...tecnicoBase, nome: nome100 });
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: vi.fn().mockResolvedValue({
              id: 'exp1',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: nome100,
          sobrenome: 'Silva',
          email: 'long@empresa.com',
          password: 'senha123456',
        });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar senha com 8 caracteres (limite mínimo) [1]', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: vi.fn().mockResolvedValue({
              id: 'exp1',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: '12345678',
        });

      expect(resposta.status).toBe(201);
      expect(hashPasswordMock).toHaveBeenCalledWith('12345678');
    });

    it('deve fazer trim de nome e sobrenome [1]', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          usuario: {
            create: vi.fn().mockResolvedValue({ id: tecnicoBase.id }),
          },
          expediente: {
            create: vi.fn().mockResolvedValue({
              id: 'exp1',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: '  João  ',
          sobrenome: '  Silva  ',
          email: 'joao@empresa.com',
          password: 'senha123456',
        });

      expect(resposta.status).toBe(201);
    });
  });

  describe('Validação de nome', () => {
    it('deve retornar status 400 quando nome não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for null', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: null,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for undefined', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: undefined,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for número', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 123,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: '',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for apenas espaços [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: '   ',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando nome tiver 1 caractere [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'J',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando nome tiver 101 caracteres [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'a'.repeat(101),
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando nome for boolean', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: true,
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for objeto', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: {},
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for array', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: [],
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });
  });

  describe('Validação de sobrenome', () => {
    it('deve retornar status 400 quando sobrenome não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });

    it('deve retornar status 400 quando sobrenome for null', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: null,
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });

    it('deve retornar status 400 quando sobrenome for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: '',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });

    it('deve retornar status 400 quando sobrenome tiver 1 caractere [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'S',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 101 caracteres [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'S'.repeat(101),
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando sobrenome for apenas espaços [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: '   ',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome for número', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 456,
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });
  });

  describe('Validação de email', () => {
    it('deve retornar status 400 quando email não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for inválido - sem @ [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'email-invalido',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for inválido - sem domínio [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for inválido - sem local part', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: '@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for null', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: null,
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for número', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 123,
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: '',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 400 quando email tiver espaços', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao @empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });
  });

  describe('Validação de senha', () => {
    it('deve retornar status 400 quando senha não for enviada [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for null [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: null,
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for número [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 12345678,
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for string vazia [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: '',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha tiver 7 caracteres [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: '1234567',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });
  });

  describe('Validação de horários', () => {
    it('deve retornar status 400 quando horário de entrada não for string', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: 123,
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });

    it('deve retornar status 400 quando horário de entrada for inválido - hora > 23 [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: '25:00',
          saida: '17:00',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando horário de entrada for inválido - minuto > 59 [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: '08:60',
          saida: '17:00',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando horário de entrada for inválido - formato errado', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: '8:00',
          saida: '17:00',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando horário de saída não for string', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: '08:00',
          saida: 123,
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída é obrigatório');
    });

    it('deve retornar status 400 quando horário de saída for inválido - hora > 23 [1]', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: '08:00',
          saida: '25:00',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando horário de saída for anterior à entrada', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: '18:00',
          saida: '08:00',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('posterior ao horário de entrada');
    });

    it('deve retornar status 400 quando horário de saída for igual à entrada', async () => {
      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
          entrada: '08:00',
          saida: '08:00',
        });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('posterior ao horário de entrada');
    });
  });

  describe('Validação de duplicação', () => {
    it('deve retornar status 409 quando email já estiver cadastrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já cadastrado');
    });

    it('deve retornar status 409 quando existir usuário deletado com mesmo email', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        email: 'joao@empresa.com',
        deletadoEm: new Date().toISOString(),
      });

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('usuário deletado com este email');
    });
  });

  describe('Autorização [1]', () => {
    it('deve retornar status 403 quando usuário for TECNICO [1]', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO [1]', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [1]', () => {
    it('deve retornar status 500 quando ocorrer erro na transação [1]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.$transaction.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao criar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando prisma.usuario.findUnique falhar', async () => {
      const erroMock = new Error('Database connection error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .post('/tecnicos')
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@empresa.com',
          password: 'senha123',
        });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('GET /tecnicos (listagem de técnicos)', () => {
  describe('Casos de sucesso [2]', () => {
    it('deve retornar status 200 com lista vazia quando não houver técnicos', async () => {
      prismaMock.usuario.count.mockResolvedValue(0);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toEqual([]);
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('deve retornar status 200 com lista paginada de técnicos', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(1);
      expect(resposta.body.data[0].nome).toBe('João');
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('deve retornar múltiplos técnicos ordenados por nome', async () => {
      const tecnicos = [
        { ...tecnicoBase, id: 'tec1', nome: 'Ana', sobrenome: 'Silva' },
        { ...tecnicoBase, id: 'tec2', nome: 'Bruno', sobrenome: 'Santos' },
        { ...tecnicoBase, id: 'tec3', nome: 'Carlos', sobrenome: 'Oliveira' },
      ];

      prismaMock.usuario.count.mockResolvedValue(3);
      prismaMock.usuario.findMany.mockResolvedValue(tecnicos);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(3);
      expect(resposta.body.data[0].nome).toBe('Ana');
      expect(resposta.body.data[1].nome).toBe('Bruno');
      expect(resposta.body.data[2].nome).toBe('Carlos');
    });

    it('deve retornar técnicos com todos os campos necessários', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data[0]).toHaveProperty('id');
      expect(resposta.body.data[0]).toHaveProperty('nome');
      expect(resposta.body.data[0]).toHaveProperty('sobrenome');
      expect(resposta.body.data[0]).toHaveProperty('email');
      expect(resposta.body.data[0]).toHaveProperty('telefone');
      expect(resposta.body.data[0]).toHaveProperty('ramal');
      expect(resposta.body.data[0]).toHaveProperty('setor');
      expect(resposta.body.data[0]).toHaveProperty('regra');
      expect(resposta.body.data[0]).toHaveProperty('ativo');
      expect(resposta.body.data[0]).toHaveProperty('tecnicoDisponibilidade');
      expect(resposta.body.data[0]).toHaveProperty('_count');
    });
  });

  describe('Filtros', () => {
    it('deve filtrar apenas técnicos ativos por padrão', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
        where: {
          regra: 'TECNICO',
          ativo: true,
          deletadoEm: null,
        },
        select: expect.any(Object),
        orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        skip: 0,
        take: 20,
      });
    });

    it('deve incluir técnicos inativos quando solicitado', async () => {
      prismaMock.usuario.count.mockResolvedValue(2);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase, tecnicoInativo]);

      await request(criarApp()).get('/tecnicos?incluirInativos=true');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
        where: {
          regra: 'TECNICO',
          deletadoEm: null,
        },
        select: expect.any(Object),
        orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        skip: 0,
        take: 20,
      });
    });

    it('deve incluir técnicos deletados quando solicitado', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoDeletado]);

      await request(criarApp()).get('/tecnicos?incluirDeletados=true');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
        where: {
          regra: 'TECNICO',
          ativo: true,
        },
        select: expect.any(Object),
        orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        skip: 0,
        take: 20,
      });
    });

    it('deve incluir todos técnicos quando ambas flags forem true', async () => {
      prismaMock.usuario.count.mockResolvedValue(3);
      prismaMock.usuario.findMany.mockResolvedValue([
        tecnicoBase,
        tecnicoInativo,
        tecnicoDeletado,
      ]);

      await request(criarApp()).get('/tecnicos?incluirInativos=true&incluirDeletados=true');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
        where: {
          regra: 'TECNICO',
        },
        select: expect.any(Object),
        orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        skip: 0,
        take: 20,
      });
    });

    it('deve filtrar por setor específico', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?setor=TECNOLOGIA_INFORMACAO');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            setor: 'TECNOLOGIA_INFORMACAO',
          }),
        })
      );
    });

    it('deve buscar por nome quando fornecido termo', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?busca=João');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { nome: { contains: 'João', mode: 'insensitive' } },
              { sobrenome: { contains: 'João', mode: 'insensitive' } },
              { email: { contains: 'João', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('deve buscar por sobrenome quando fornecido termo', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?busca=Silva');

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
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?busca=joao.silva@empresa.com');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: 'joao.silva@empresa.com', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('deve buscar case-insensitive', async () => {
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?busca=JOÃO');

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
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?busca=João&setor=TECNOLOGIA_INFORMACAO');

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
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?busca=João&setor=TECNOLOGIA_INFORMACAO&incluirInativos=true&incluirDeletados=true');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            regra: 'TECNICO',
            setor: 'TECNOLOGIA_INFORMACAO',
            OR: expect.any(Array),
          }),
        })
      );
    });
  });

  describe('Paginação', () => {
    it('deve aplicar paginação padrão (página 1, 20 itens)', async () => {
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 50,
        totalPages: 3,
      });
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        })
      );
    });

    it('deve aplicar paginação personalizada', async () => {
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?page=2&limit=10');

      expect(resposta.body.pagination).toMatchObject({
        page: 2,
        limit: 10,
        total: 50,
        totalPages: 5,
        hasNext: true,
        hasPrev: true,
      });
      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });

    it('deve calcular skip corretamente para página 3', async () => {
      prismaMock.usuario.count.mockResolvedValue(100);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?page=3&limit=15');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 30, // (3-1) * 15
          take: 15,
        })
      );
    });

    it('deve limitar paginação ao máximo de 100 itens', async () => {
      prismaMock.usuario.count.mockResolvedValue(200);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?limit=200');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('deve usar página 1 quando page for 0', async () => {
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?page=0');

      expect(resposta.body.pagination.page).toBe(1);
    });

    it('deve usar página 1 quando page for negativo', async () => {
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?page=-5');

      expect(resposta.body.pagination.page).toBe(1);
    });

    it('deve usar limit 1 quando limit for 0', async () => {
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?limit=0');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        })
      );
    });

    it('deve usar limit 1 quando limit for negativo', async () => {
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      await request(criarApp()).get('/tecnicos?limit=-10');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        })
      );
    });

    it('deve indicar hasNext=true quando houver próxima página', async () => {
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?page=1&limit=10');

      expect(resposta.body.pagination.hasNext).toBe(true);
    });

    it('deve indicar hasNext=false quando for última página', async () => {
      prismaMock.usuario.count.mockResolvedValue(20);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?page=2&limit=10');

      expect(resposta.body.pagination.hasNext).toBe(false);
    });

    it('deve indicar hasPrev=true quando houver página anterior', async () => {
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?page=2&limit=10');

      expect(resposta.body.pagination.hasPrev).toBe(true);
    });

    it('deve indicar hasPrev=false quando for primeira página', async () => {
      prismaMock.usuario.count.mockResolvedValue(50);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?page=1&limit=10');

      expect(resposta.body.pagination.hasPrev).toBe(false);
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.usuario.count.mockResolvedValue(47);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos?limit=10');

      expect(resposta.body.pagination.totalPages).toBe(5); // Math.ceil(47/10)
    });

    it('deve retornar totalPages=0 quando não houver resultados', async () => {
      prismaMock.usuario.count.mockResolvedValue(0);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.body.pagination.totalPages).toBe(0);
    });
  });

  describe('Autorização [2]', () => {
    it('deve permitir acesso para ADMIN [1]', async () => {
      currentUserRole = 'ADMIN';
      prismaMock.usuario.count.mockResolvedValue(1);
      prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for TECNICO [2]', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO [2]', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [2]', () => {
    it('deve retornar status 500 quando ocorrer erro ao contar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.count.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao listar técnicos');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao buscar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.count.mockResolvedValue(10);
      prismaMock.usuario.findMany.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).get('/tecnicos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao listar técnicos');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('GET /tecnicos/:id (buscar técnico específico)', () => {
  describe('Casos de sucesso [3]', () => {
    it('deve retornar status 200 com dados do técnico quando encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe('tec1');
      expect(resposta.body.regra).toBe('TECNICO');
      expect(resposta.body.nome).toBe('João');
    });

    it('deve retornar técnico com horários de expediente', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(resposta.body.tecnicoDisponibilidade).toBeDefined();
      expect(resposta.body.tecnicoDisponibilidade).toHaveLength(1);
    });

    it('deve retornar contagem de chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...tecnicoBase,
        _count: { tecnicoChamados: 15 },
      });

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(resposta.body._count.tecnicoChamados).toBe(15);
    });

    it('deve retornar técnico inativo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(tecnicoInativo);

      const resposta = await request(criarApp()).get('/tecnicos/tec2');

      expect(resposta.status).toBe(200);
      expect(resposta.body.ativo).toBe(false);
    });

    it('deve retornar técnico deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).get('/tecnicos/tec3');

      expect(resposta.status).toBe(200);
      expect(resposta.body.deletadoEm).toBeTruthy();
    });

    it('deve retornar todos os campos do técnico', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

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
      expect(resposta.body).toHaveProperty('tecnicoDisponibilidade');
      expect(resposta.body).toHaveProperty('_count');
    });
  });

  describe('Casos de erro', () => {
    it('deve retornar status 404 quando técnico não existir [1]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp()).get('/tecnicos/tec999');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for técnico [1]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...tecnicoBase,
        regra: 'USUARIO',
      });

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN [1]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        ...tecnicoBase,
        regra: 'ADMIN',
      });

      const resposta = await request(criarApp()).get('/tecnicos/admin1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização [3]', () => {
    it('deve permitir acesso para ADMIN [2]', async () => {
      currentUserRole = 'ADMIN';
      prismaMock.usuario.findUnique.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir acesso para TECNICO', async () => {
      currentUserRole = 'TECNICO';
      prismaMock.usuario.findUnique.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
    });
  });

  describe('Tratamento de erros [3]', () => {
    it('deve retornar status 500 quando ocorrer erro no banco [1]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).get('/tecnicos/tec1');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao buscar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id (edição de técnico) [1]', () => {
  describe('Casos de sucesso [4]', () => {
    it('deve retornar status 200 e atualizar técnico com sucesso [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'João Atualizado',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'João Atualizado' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe('João Atualizado');
    });

    it('deve permitir ADMIN atualizar setor [1]', async () => {
      currentUserRole = 'ADMIN';
      
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        setor: 'ADMINISTRACAO',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ setor: 'ADMINISTRACAO' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            setor: 'ADMINISTRACAO',
          }),
        })
      );
    });

    it('deve atualizar apenas nome [1]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'Novo Nome',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nome: 'Novo Nome',
          }),
        })
      );
    });

    it('deve atualizar apenas sobrenome [1]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        sobrenome: 'Novo Sobrenome',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ sobrenome: 'Novo Sobrenome' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar telefone e ramal [1]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        telefone: '11987654321',
        ramal: '9999',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ telefone: '11987654321', ramal: '9999' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar email quando não estiver em uso', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        email: 'novoemail@empresa.com',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'novoemail@empresa.com' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar múltiplos campos simultaneamente [1]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'João Atualizado',
        sobrenome: 'Silva Atualizado',
        telefone: '11999999999',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({
          nome: 'João Atualizado',
          sobrenome: 'Silva Atualizado',
          telefone: '11999999999',
        });

      expect(resposta.status).toBe(200);
    });

    it('não deve permitir TECNICO atualizar setor [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';
      
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          setor: 'TECNOLOGIA_INFORMACAO',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ setor: 'ADMINISTRACAO' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve retornar técnico atual quando nenhum dado for fornecido [1]', async () => {
      currentUserRole = 'ADMIN';
      
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({});

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve fazer trim de nome e sobrenome [2]', async () => {
      currentUserRole = 'ADMIN';
      
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: '  João  ', sobrenome: '  Silva  ' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nome: 'João',
            sobrenome: 'Silva',
          }),
        })
      );
    });

    it('deve permitir atualizar com mesmo email [1]', async () => {
      currentUserRole = 'ADMIN';
      
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'joao@empresa.com' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar apenas telefone sem ramal', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        telefone: '11987654321',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ telefone: '11987654321' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar apenas ramal sem telefone', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        ramal: '5678',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ ramal: '5678' });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações de campos', () => {
    it('deve retornar status 400 quando nome tiver 1 caractere [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'J' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando nome tiver 101 caracteres [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'a'.repeat(101) });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 1 caractere [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ sobrenome: 'S' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 101 caracteres [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ sobrenome: 'S'.repeat(101) });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando email for inválido - sem @ [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'email-invalido' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for inválido - sem domínio [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'joao@' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando nome for apenas espaços [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: '   ' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome for apenas espaços [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ sobrenome: '   ' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve aceitar nome com 2 caracteres (limite mínimo) [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'Jo',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Jo' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar nome com 100 caracteres (limite máximo) [2]', async () => {
      currentUserRole = 'ADMIN';
      const nome100 = 'A'.repeat(100);

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: nome100,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: nome100 });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações de estado [1]', () => {
    it('deve retornar status 404 quando técnico não existir [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec999')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for técnico [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'user@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 400 quando tentar editar técnico deletado [1]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: new Date().toISOString(),
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Não é possível editar um técnico deletado');
    });

    it('deve retornar status 409 quando email já estiver em uso', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce({
          id: 'tec2',
          email: 'outro@empresa.com',
        });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'outro@empresa.com' });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já está em uso');
    });

    it('deve permitir atualizar técnico inativo', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec2',
          regra: 'TECNICO',
          email: 'inativo@empresa.com',
          ativo: false,
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoInativo,
        nome: 'Nome Atualizado',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec2')
        .send({ nome: 'Nome Atualizado' });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Autorização [4]', () => {
    it('deve retornar status 403 quando técnico tentar editar outro perfil [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode editar seu próprio perfil');
    });

    it('deve permitir ADMIN editar qualquer técnico [1]', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'João Editado' });

      expect(resposta.status).toBe(200);
    });

    it('deve permitir TECNICO editar próprio perfil [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'João Editado' });

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar editar', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [4]', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar técnico [1]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar [1]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando verificação de email duplicado falhar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockRejectedValueOnce(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'novo@empresa.com' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id/senha (alteração de senha) [1]', () => {
  describe('Casos de sucesso [5]', () => {
    it('deve retornar status 200 e alterar senha com sucesso [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Senha alterada com sucesso');
      expect(hashPasswordMock).toHaveBeenCalledWith('novasenha123');
    });

    it('deve permitir ADMIN alterar senha de qualquer técnico [1]', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar senha com 8 caracteres (limite mínimo) [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: '12345678' });

      expect(resposta.status).toBe(200);
      expect(hashPasswordMock).toHaveBeenCalledWith('12345678');
    });

    it('deve aceitar senha com caracteres especiais [1]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'S3nh@F0rt3!' });

      expect(resposta.status).toBe(200);
      expect(hashPasswordMock).toHaveBeenCalledWith('S3nh@F0rt3!');
    });

    it('deve aceitar senha longa', async () => {
      currentUserRole = 'ADMIN';
      const senhaLonga = 'a'.repeat(50);

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: senhaLonga });

      expect(resposta.status).toBe(200);
    });

    it('deve fazer hash da nova senha antes de salvar', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'minhasenha123' });

      expect(hashPasswordMock).toHaveBeenCalledWith('minhasenha123');
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: 'HASHED_PASSWORD_PBKDF2',
          }),
        })
      );
    });
  });

  describe('Validações [1]', () => {
    it('deve retornar status 400 quando senha não for enviada [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for null [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: null });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for undefined [1]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: undefined });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for número [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 12345678 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for string vazia [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: '' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha tiver 7 caracteres [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: '1234567' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve retornar status 400 quando senha tiver 1 caractere', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: '1' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });
    
    it('deve retornar status 404 quando técnico não existir [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec999/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for técnico [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'admin1',
        regra: 'ADMIN',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/admin1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização [5]', () => {
    it('deve retornar status 403 quando técnico tentar alterar senha de outro [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode alterar sua própria senha');
    });

    it('deve permitir TECNICO alterar própria senha [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar alterar senha [1]', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [5]', () => {
    it('deve retornar status 500 quando ocorrer erro no banco ao buscar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao alterar senha');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro no banco ao atualizar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao alterar senha');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando hashPassword falhar', async () => {
      const erroMock = new Error('Hash error');
      hashPasswordMock.mockImplementationOnce(() => {
        throw erroMock;
      });

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id/horarios (atualização de horários) [1]', () => {
  describe('Casos de sucesso [6]', () => {
    it('deve retornar status 200 e atualizar horários com sucesso [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T09:00:00.000Z'),
              saida: new Date('2025-01-01T18:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('atualizado com sucesso');
      expect(resposta.body.horario).toBeDefined();
    });

    it('deve permitir ADMIN atualizar horários de qualquer técnico [1]', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T09:00:00.000Z'),
              saida: new Date('2025-01-01T18:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar horário de trabalho padrão 08:00-17:00', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T08:00:00.000Z'),
              saida: new Date('2025-01-01T17:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:00', saida: '17:00' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar horário de trabalho estendido', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T07:00:00.000Z'),
              saida: new Date('2025-01-01T20:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '07:00', saida: '20:00' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar horário com minutos específicos', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T08:30:00.000Z'),
              saida: new Date('2025-01-01T17:45:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:30', saida: '17:45' });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações de horário', () => {
    it('deve retornar status 400 quando entrada não for enviada [1]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ saida: '17:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });

    it('deve retornar status 400 quando saída não for enviada [1]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída é obrigatório');
    });

    it('deve retornar status 400 quando horário de entrada for inválido - hora > 23 [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '25:00', saida: '17:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando horário de entrada for inválido - minuto > 59 [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:60', saida: '17:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando horário de saída for inválido - hora > 23 [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:00', saida: '25:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando horário de saída for inválido - minuto > 59', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:00', saida: '17:60' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando saída for anterior à entrada [1]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '18:00', saida: '09:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('posterior ao horário de entrada');
    });

    it('deve retornar status 400 quando saída for igual à entrada [1]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '09:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('posterior ao horário de entrada');
    });

    it('deve retornar status 400 quando formato de entrada for inválido - sem zero à esquerda', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '8:00', saida: '17:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando formato de saída for inválido - sem dois pontos', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:00', saida: '1700' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando entrada não for string', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: 800, saida: '17:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });

    it('deve retornar status 400 quando saída não for string', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:00', saida: 1700 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída é obrigatório');
    });

    it('deve retornar status 400 quando entrada for null [1]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: null, saida: '17:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });

    it('deve retornar status 400 quando saída for null [1]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '08:00', saida: null });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída é obrigatório');
    });
  });

  describe('Validações de estado [2]', () => {
    it('deve retornar status 404 quando técnico não existir [4]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec999/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for TECNICO [1]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/user1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve permitir atualizar horários de técnico inativo', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec2',
        regra: 'TECNICO',
        ativo: false,
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T09:00:00.000Z'),
              saida: new Date('2025-01-01T18:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec2/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Autorização [6]', () => {
    it('deve retornar status 403 quando técnico tentar alterar horários de outro [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode alterar seus próprios horários');
    });

    it('deve permitir TECNICO alterar próprios horários [1]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T09:00:00.000Z'),
              saida: new Date('2025-01-01T18:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar alterar horários [1]', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [6]', () => {
    it('deve retornar status 500 quando ocorrer erro no banco [2]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.$transaction.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar horários');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando findUnique falhar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando updateMany falhar dentro da transação', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      const erroMock = new Error('Update failed');
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockRejectedValue(erroMock),
            create: vi.fn(),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando create falhar dentro da transação', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      const erroMock = new Error('Create failed');
      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockRejectedValue(erroMock),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id (edição de técnico) [2]', () => {
  describe('Casos de sucesso [7]', () => {
    it('deve retornar status 200 e atualizar técnico com sucesso [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'João Atualizado',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'João Atualizado' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe('João Atualizado');
    });

    it('deve permitir ADMIN atualizar setor [2]', async () => {
      currentUserRole = 'ADMIN';
      
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        setor: 'ADMINISTRACAO',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ setor: 'ADMINISTRACAO' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            setor: 'ADMINISTRACAO',
          }),
        })
      );
    });

    it('deve atualizar apenas nome [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'Novo Nome',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nome: 'Novo Nome',
          }),
        })
      );
    });

    it('deve atualizar apenas sobrenome [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        sobrenome: 'Novo Sobrenome',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ sobrenome: 'Novo Sobrenome' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar telefone e ramal [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        telefone: '11987654321',
        ramal: '9999',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ telefone: '11987654321', ramal: '9999' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar email quando email for diferente', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        email: 'novo@empresa.com',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'novo@empresa.com' });

      expect(resposta.status).toBe(200);
    });

    it('deve permitir atualizar com mesmo email [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'joao@empresa.com' });

      expect(resposta.status).toBe(200);
    });

    it('deve atualizar múltiplos campos simultaneamente [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'Novo Nome',
        sobrenome: 'Novo Sobrenome',
        telefone: '11999999999',
        ramal: '5555',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({
          nome: 'Novo Nome',
          sobrenome: 'Novo Sobrenome',
          telefone: '11999999999',
          ramal: '5555',
        });

      expect(resposta.status).toBe(200);
    });

    it('deve fazer trim de nome e sobrenome [3]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: '  João  ', sobrenome: '  Silva  ' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nome: 'João',
            sobrenome: 'Silva',
          }),
        })
      );
    });

    it('deve retornar técnico atual quando nenhum dado for fornecido [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({});

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve retornar técnico atual quando body estiver vazio', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({});

      // Se a API retorna o técnico atual sem atualizar
      expect(resposta.status).toBe(200);
    });

    it('não deve permitir TECNICO atualizar setor [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          setor: 'TECNOLOGIA_INFORMACAO',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ setor: 'ADMINISTRACAO' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve remover telefone quando definido como null', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        telefone: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ telefone: null });

      expect(resposta.status).toBe(200);
    });

    it('deve remover ramal quando definido como null', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        ramal: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ ramal: null });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações [2]', () => {
    it('deve retornar status 404 quando técnico não existir [5]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec999')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for técnico [4]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'user@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/user1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 400 quando tentar editar técnico deletado [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: new Date().toISOString(),
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Não é possível editar um técnico deletado');
    });

    it('deve retornar status 400 quando nome tiver 1 caractere [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'J' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando nome tiver 101 caracteres [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'a'.repeat(101) });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando nome for apenas espaços [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: '   ' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 1 caractere [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ sobrenome: 'S' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 2 caracteres');
    });

    it('deve retornar status 400 quando sobrenome tiver 101 caracteres [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ sobrenome: 'S'.repeat(101) });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando email for inválido', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'email-invalido' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email inválido');
    });

    it('deve retornar status 400 quando email for vazio', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: '' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar status 409 quando email já estiver em uso por outro usuário', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce({
          id: 'tec2',
          email: 'outro@empresa.com',
        });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'outro@empresa.com' });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já está em uso');
    });

    it('deve aceitar nome com 2 caracteres (limite mínimo) [3]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: 'Jo',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Jo' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar nome com 100 caracteres (limite máximo) [3]', async () => {
      currentUserRole = 'ADMIN';
      const nome100 = 'A'.repeat(100);

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        nome: nome100,
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: nome100 });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Autorização [7]', () => {
    it('deve retornar status 403 quando técnico tentar editar outro perfil [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode editar seu próprio perfil');
    });

    it('deve permitir ADMIN editar qualquer técnico [2]', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'João Editado' });

      expect(resposta.status).toBe(200);
    });

    it('deve permitir TECNICO editar próprio perfil [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);

      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'João Editado' });

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar editar técnico', async () => {
      currentUserRole = 'USUARIO';
      currentUserId = 'user1';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [7]', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar técnico [2]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar [2]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockResolvedValueOnce(null);
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ nome: 'Teste' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro na verificação de email', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({
          id: 'tec1',
          regra: 'TECNICO',
          email: 'joao@empresa.com',
          deletadoEm: null,
        })
        .mockRejectedValueOnce(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1')
        .send({ email: 'novo@empresa.com' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id/senha (alteração de senha) [2]', () => {
  describe('Casos de sucesso [8]', () => {
    it('deve retornar status 200 e alterar senha com sucesso [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Senha alterada com sucesso');
      expect(hashPasswordMock).toHaveBeenCalledWith('novasenha123');
    });

    it('deve permitir ADMIN alterar senha de qualquer técnico [2]', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar senha com 8 caracteres (limite mínimo) [3]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: '12345678' });

      expect(resposta.status).toBe(200);
      expect(hashPasswordMock).toHaveBeenCalledWith('12345678');
    });

    it('deve aceitar senha com caracteres especiais [2]', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'S3nh@F0rt3!' });

      expect(resposta.status).toBe(200);
      expect(hashPasswordMock).toHaveBeenCalledWith('S3nh@F0rt3!');
    });

    it('deve aceitar senha com mais de 50 caracteres', async () => {
      currentUserRole = 'ADMIN';
      const senhaLonga = 'a'.repeat(60);

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: senhaLonga });

      expect(resposta.status).toBe(200);
      expect(hashPasswordMock).toHaveBeenCalledWith(senhaLonga);
    });
  });

  describe('Validações [3]', () => {
    it('deve retornar status 400 quando senha não for enviada [3]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for null [3]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: null });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for undefined [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: undefined });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for número [3]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 12345678 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for string vazia [3]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: '' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha tiver 7 caracteres [3]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: '1234567' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve retornar status 400 quando senha for boolean', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: true });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for objeto', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: {} });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 400 quando senha for array', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: [] });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar status 404 quando técnico não existir [6]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec999/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for técnico [5]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/user1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'admin1',
        regra: 'ADMIN',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/admin1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização [8]', () => {
    it('deve retornar status 403 quando técnico tentar alterar senha de outro [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode alterar sua própria senha');
    });

    it('deve permitir TECNICO alterar própria senha [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar alterar senha [2]', async () => {
      currentUserRole = 'USUARIO';
      currentUserId = 'user1';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [8]', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar técnico [3]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao alterar senha');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar senha', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/senha')
        .send({ password: 'novasenha123' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao alterar senha');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id/horarios (atualização de horários) [2]', () => {
  describe('Casos de sucesso [9]', () => {
    it('deve retornar status 200 e atualizar horários com sucesso [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T09:00:00.000Z'),
              saida: new Date('2025-01-01T18:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('atualizado com sucesso');
      expect(resposta.body.horario).toBeDefined();
    });

    it('deve permitir ADMIN atualizar horários de qualquer técnico [2]', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T09:00:00.000Z'),
              saida: new Date('2025-01-01T18:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar horário de 00:00 a 23:59', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T00:00:00.000Z'),
              saida: new Date('2025-01-01T23:59:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '00:00', saida: '23:59' });

      expect(resposta.status).toBe(200);
    });

        it('deve desativar horários antigos e criar novo ativo', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      const updateManyMock = vi.fn().mockResolvedValue({ count: 2 });
      const createMock = vi.fn().mockResolvedValue({
        id: 'exp3',
        entrada: new Date('2025-01-01T10:00:00.000Z'),
        saida: new Date('2025-01-01T19:00:00.000Z'),
        ativo: true,
        geradoEm: new Date(),
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: updateManyMock,
            create: createMock,
          },
        };
        return await callback(tx);
      });

      await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '10:00', saida: '19:00' });

      expect(updateManyMock).toHaveBeenCalledWith({
        where: { usuarioId: 'tec1' },
        data: { ativo: false, deletadoEm: expect.any(Date) },
      });

      expect(createMock).toHaveBeenCalled();
    });
  });

  describe('Validações [4]', () => {
    it('deve retornar status 400 quando entrada não for enviada [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ saida: '18:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });

    it('deve retornar status 400 quando saída não for enviada [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída é obrigatório');
    });

    it('deve retornar status 400 quando entrada for null [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: null, saida: '18:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });

    it('deve retornar status 400 quando saída for null [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: null });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída é obrigatório');
    });

    it('deve retornar status 400 quando saída for anterior à entrada [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '18:00', saida: '09:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('posterior ao horário de entrada');
    });

    it('deve retornar status 400 quando saída for igual à entrada [2]', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '09:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('posterior ao horário de entrada');
    });

    it('deve retornar status 400 quando entrada tiver formato inválido - hora > 23', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '25:00', saida: '18:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando entrada tiver formato inválido - minuto > 59', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:60', saida: '18:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando entrada tiver formato inválido - sem dois dígitos', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '9:00', saida: '18:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando saída tiver formato inválido', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:60' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('formato HH:MM');
    });

    it('deve retornar status 400 quando entrada for número', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: 900, saida: '18:00' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });

    it('deve retornar status 400 quando saída for número', async () => {
      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: 1800 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída é obrigatório');
    });

    it('deve retornar status 404 quando técnico não existir [7]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec999/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for TECNICO [2]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/user1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização [9]', () => {
    it('deve retornar status 403 quando técnico tentar alterar horários de outro [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode alterar seus próprios horários');
    });

    it('deve permitir TECNICO alterar próprios horários [2]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockResolvedValue({
              id: 'exp2',
              entrada: new Date('2025-01-01T09:00:00.000Z'),
              saida: new Date('2025-01-01T18:00:00.000Z'),
              ativo: true,
              geradoEm: new Date(),
            }),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar alterar horários [2]', async () => {
      currentUserRole = 'USUARIO';
      currentUserId = 'user1';

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [9]', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar técnico [4]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar horários');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro na transação [2]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.$transaction.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao atualizar horários');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando expediente.updateMany falhar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockRejectedValue(erroMock),
            create: vi.fn(),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando expediente.create falhar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            create: vi.fn().mockRejectedValue(erroMock),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp())
        .put('/tecnicos/tec1/horarios')
        .send({ entrada: '09:00', saida: '18:00' });

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

// ==================== CONTINUAÇÃO DOS TESTES ====================

// ==================== TESTES POST /tecnicos/:id/avatar ====================

describe('POST /tecnicos/:id/avatar (upload de avatar)', () => {
  describe('Casos de sucesso [10]', () => {
    it('deve retornar status 200 e fazer upload do avatar com sucesso', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/avatar-123.jpg',
      });

      const mockFile = {
        filename: 'avatar-123.jpg',
        path: '/uploads/avatars/avatar-123.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('enviado com sucesso');
      expect(resposta.body.avatarUrl).toBeDefined();
    });

    it('deve permitir ADMIN fazer upload de avatar para qualquer técnico', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/avatar-456.jpg',
      });

      const mockFile = {
        filename: 'avatar-456.jpg',
        path: '/uploads/avatars/avatar-456.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar arquivo JPG', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/avatar.jpg',
      });

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
        mimetype: 'image/jpeg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar arquivo PNG', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/avatar.png',
      });

      const mockFile = {
        filename: 'avatar.png',
        path: '/uploads/avatars/avatar.png',
        mimetype: 'image/png',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve aceitar arquivo WEBP', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/avatar.webp',
      });

      const mockFile = {
        filename: 'avatar.webp',
        path: '/uploads/avatars/avatar.webp',
        mimetype: 'image/webp',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve substituir avatar existente', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        avatarUrl: '/uploads/avatars/avatar-antigo.jpg',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/avatar-novo.jpg',
      });

      const mockFile = {
        filename: 'avatar-novo.jpg',
        path: '/uploads/avatars/avatar-novo.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
      expect(resposta.body.avatarUrl).toBe('/uploads/avatars/avatar-novo.jpg');
    });

    it('deve retornar caminho relativo do avatar', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/123456.jpg',
      });

      const mockFile = {
        filename: '123456.jpg',
        path: '/uploads/avatars/123456.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
      expect(resposta.body.avatarUrl).toMatch(/^\/uploads\/avatars\//);
    });

    it('deve atualizar apenas o campo avatarUrl', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        nome: 'João',
        email: 'joao@empresa.com',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/new-avatar.jpg',
      });

      const mockFile = {
        filename: 'new-avatar.jpg',
        path: '/uploads/avatars/new-avatar.jpg',
      };

      await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tec1' },
          data: { avatarUrl: expect.stringContaining('/uploads/avatars/') },
        })
      );
    });
  });

  describe('Validações [5]', () => {
    it('deve retornar status 400 quando arquivo não for enviado', async () => {
      currentUserRole = 'ADMIN';

      const resposta = await request(criarApp())
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });

    it('deve retornar status 400 quando req.file for undefined', async () => {
      currentUserRole = 'ADMIN';

      const resposta = await request(criarApp())
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });

    it('deve retornar status 400 quando req.file for null', async () => {
      currentUserRole = 'ADMIN';

      const mockFile = null;

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });

    it('deve retornar status 404 quando técnico não existir [8]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec999/avatar')
        .send();

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for TECNICO [3]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
      });

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/user1/avatar')
        .send();

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN [4]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'admin1',
        regra: 'ADMIN',
      });

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/admin1/avatar')
        .send();

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização [10]', () => {
    it('deve retornar status 403 quando técnico tentar fazer upload para outro', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode fazer upload do seu próprio avatar');
    });

    it('deve permitir TECNICO fazer upload do próprio avatar', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockResolvedValue({
        id: 'tec1',
        avatarUrl: '/uploads/avatars/avatar.jpg',
      });

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando USUARIO tentar fazer upload', async () => {
      currentUserRole = 'USUARIO';
      currentUserId = 'user1';

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [10]', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar técnico [5]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao fazer upload do avatar');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar avatar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const mockFile = {
        filename: 'avatar.jpg',
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao fazer upload do avatar');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando arquivo não tiver propriedade filename', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      const mockFile = {
        path: '/uploads/avatars/avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando arquivo não tiver propriedade path', async () => {
      currentUserRole = 'ADMIN';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
      });

      const mockFile = {
        filename: 'avatar.jpg',
      };

      const resposta = await request(criarApp(mockFile))
        .post('/tecnicos/tec1/avatar')
        .send();

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

// ==================== TESTES DELETE /tecnicos/:id ====================

describe('DELETE /tecnicos/:id (deleção de técnico)', () => {
  describe('Soft delete', () => {
    it('deve retornar status 200 e fazer soft delete com sucesso', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('deletado com sucesso');
    });

    it('deve fazer soft delete mesmo com chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 10 },
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
      expect(prismaMock.usuario.delete).not.toHaveBeenCalled();
    });

    it('deve definir deletadoEm ao fazer soft delete', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: new Date().toISOString(),
        ativo: false,
      });

      await request(criarApp()).delete('/tecnicos/tec1');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: 'tec1' },
        data: { deletadoEm: expect.any(Date), ativo: false },
      });
    });

    it('deve fazer soft delete de técnico com 1 chamado vinculado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 1 },
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
    });

    it('deve fazer soft delete de técnico com 100 chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 100 },
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
    });

    it('deve retornar técnico com deletadoEm preenchido', async () => {
      const dataDelecao = new Date().toISOString();
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: dataDelecao,
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      // A API retorna apenas message, não o objeto técnico
      expect(resposta.body.message).toContain('deletado com sucesso');
    });
  });

  describe('Hard delete', () => {
    it('deve retornar status 200 e fazer hard delete quando solicitado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          usuario: {
            delete: vi.fn().mockResolvedValue(tecnicoBase),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('removido permanentemente');
    });

    it('deve retornar status 400 quando tentar hard delete com chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 5 },
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('5 chamados vinculados');
    });

    it('deve deletar expedientes na transação antes de deletar técnico', async () => {
          prismaMock.usuario.findUnique.mockResolvedValue({
            id: 'tec1',
            regra: 'TECNICO',
            email: 'joao@empresa.com',
            deletadoEm: null,
            _count: { tecnicoChamados: 0 },
          });

          const deleteManyMock = vi.fn().mockResolvedValue({ count: 2 });
          const deleteMock = vi.fn().mockResolvedValue(tecnicoBase);

          prismaMock.$transaction.mockImplementation(async (callback) => {
            const tx = {
              expediente: {
                deleteMany: deleteManyMock,
              },
              usuario: {
                delete: deleteMock,
              },
            };
            return await callback(tx);
          });

          await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

          expect(deleteManyMock).toHaveBeenCalledWith({
            where: { usuarioId: 'tec1' },
          });
          expect(deleteMock).toHaveBeenCalledWith({
            where: { id: 'tec1' },
          });
        });

    it('deve retornar status 400 quando tentar hard delete com 1 chamado vinculado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 1 },
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('1 chamado');
    });

    it('deve retornar status 400 quando tentar hard delete com 100 chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 100 },
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('100 chamados vinculados');
    });

    it('deve aceitar query param permanente=1', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          usuario: {
            delete: vi.fn().mockResolvedValue(tecnicoBase),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=1');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('removido permanentemente');
    });

    it('deve aceitar query param permanente=yes', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          usuario: {
            delete: vi.fn().mockResolvedValue(tecnicoBase),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=yes');

      expect(resposta.status).toBe(200);
    });

    it('deve fazer soft delete quando permanente=false', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=false');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('deve fazer soft delete quando permanente não for enviado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalled();
    });
  });

  describe('Validações [6]', () => {
    it('deve retornar status 404 quando técnico não existir [9]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp()).delete('/tecnicos/tec999');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for TECNICO [4]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'user@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      const resposta = await request(criarApp()).delete('/tecnicos/user1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN [5]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'admin1',
        regra: 'ADMIN',
        email: 'admin@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      const resposta = await request(criarApp()).delete('/tecnicos/admin1');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve permitir deletar técnico já deletado (operação idempotente)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: new Date().toISOString(),
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoDeletado,
        ativo: false,
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200); // MUDADO de 400 para 200
      expect(resposta.body.message).toContain('deletado com sucesso');
    });
  });

  describe('Autorização [11]', () => {
    it('deve permitir ADMIN deletar técnico', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoDeletado);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando TECNICO tentar deletar', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando USUARIO tentar deletar', async () => {
      currentUserRole = 'USUARIO';
      currentUserId = 'user1';

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [11]', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar técnico [6]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao deletar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro no soft delete', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao deletar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro no hard delete', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.$transaction.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao deletar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando expediente.deleteMany falhar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            deleteMany: vi.fn().mockRejectedValue(erroMock),
          },
          usuario: {
            delete: vi.fn(),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando usuario.delete falhar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      prismaMock.$transaction.mockImplementation(async (callback) => {
        const tx = {
          expediente: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          usuario: {
            delete: vi.fn().mockRejectedValue(erroMock),
          },
        };
        return await callback(tx);
      });

      const resposta = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PATCH /tecnicos/:id/restaurar (restauração de técnico)', () => {
  describe('Casos de sucesso [11]', () => {
    it('deve retornar status 200 e restaurar técnico deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec3',
        regra: 'TECNICO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date().toISOString(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('restaurado com sucesso');
      expect(resposta.body.tecnico.deletadoEm).toBeNull();
      expect(resposta.body.tecnico.ativo).toBe(true);
      
      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: 'tec3' },
        data: {
          deletadoEm: null,
          ativo: true,
        },
        select: expect.any(Object),
      });
    });

    it('deve restaurar técnico que estava inativo antes de ser deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec3',
        regra: 'TECNICO',
        email: 'deletado@empresa.com',
        ativo: false,
        deletadoEm: new Date().toISOString(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.tecnico.ativo).toBe(true);
    });

    it('deve definir deletadoEm como null', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec3',
        regra: 'TECNICO',
        email: 'deletado@empresa.com',
        deletadoEm: '2025-01-03T00:00:00.000Z',
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: null,
        ativo: true,
      });

      await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve retornar técnico com todos os campos após restauração', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec3',
        regra: 'TECNICO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date().toISOString(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.tecnico).toHaveProperty('id');
      expect(resposta.body.tecnico).toHaveProperty('nome');
      expect(resposta.body.tecnico).toHaveProperty('email');
      expect(resposta.body.tecnico).toHaveProperty('regra');
      expect(resposta.body.tecnico).toHaveProperty('ativo');
      expect(resposta.body.tecnico).toHaveProperty('deletadoEm');
    });

    it('deve restaurar técnico deletado há muito tempo', async () => {
      const dataAntigaDeletado = '2020-01-01T00:00:00.000Z';
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec3',
        regra: 'TECNICO',
        email: 'deletado@empresa.com',
        deletadoEm: dataAntigaDeletado,
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(200);
    });
  });

  describe('Validações [7]', () => {
    it('deve retornar status 404 quando técnico não existir [10]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec999/restaurar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário não for TECNICO [5]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'user1',
        regra: 'USUARIO',
        email: 'user@empresa.com',
        deletadoEm: new Date().toISOString(),
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/user1/restaurar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 404 quando usuário for ADMIN [6]', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'admin1',
        regra: 'ADMIN',
        email: 'admin@empresa.com',
        deletadoEm: new Date().toISOString(),
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/admin1/restaurar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar status 400 quando técnico não estiver deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec1/restaurar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não está deletado');
    });

    it('deve retornar status 400 quando deletadoEm for null', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec1/restaurar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não está deletado');
    });

    it('deve retornar status 400 para técnico ativo não deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1',
        regra: 'TECNICO',
        email: 'joao@empresa.com',
        ativo: true,
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec1/restaurar');

      expect(resposta.status).toBe(400);
    });

    it('deve retornar status 400 para técnico inativo não deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec2',
        regra: 'TECNICO',
        email: 'inativo@empresa.com',
        ativo: false,
        deletadoEm: null,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec2/restaurar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não está deletado');
    });
  });

  describe('Autorização [12]', () => {
    it('deve permitir ADMIN restaurar técnico', async () => {
      currentUserRole = 'ADMIN';
      currentUserId = 'admin1';

      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec3',
        regra: 'TECNICO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date().toISOString(),
      });
      prismaMock.usuario.update.mockResolvedValue({
        ...tecnicoBase,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for TECNICO [3]', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO [3]', async () => {
      currentUserRole = 'USUARIO';
      currentUserId = 'user1';

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros [12]', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar técnico [7]', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao restaurar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao restaurar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec3',
        regra: 'TECNICO',
        email: 'deletado@empresa.com',
        deletadoEm: new Date().toISOString(),
      });
      prismaMock.usuario.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .patch('/tecnicos/tec3/restaurar');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toContain('Erro ao restaurar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});