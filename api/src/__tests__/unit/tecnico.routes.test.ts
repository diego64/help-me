import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  vi
} from 'vitest';
import express from 'express';
import request from 'supertest';

// ========================================
// FIXTURES E MOCKS
// ========================================

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
      entrada: '08:00',
      saida: '17:00',
      ativo: true,
      geradoEm: '2025-01-01T00:00:00.000Z',
      atualizadoEm: '2025-01-01T00:00:00.000Z',
    },
  ],
  _count: {
    tecnicoChamados: 0,
  },
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
  expediente: {
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

const bcryptMock = {
  hash: vi.fn().mockResolvedValue('hashed_password'),
};

let usuarioRegra = 'ADMIN';
let usuarioAtualId = 'admin1';

// ========================================
// CONFIGURAÇÃO DE MOCKS
// ========================================

vi.mock('@prisma/client', () => ({
  PrismaClient: function () {
    return prismaMock;
  },
  Setor: {
    TECNOLOGIA_INFORMACAO: 'TECNOLOGIA_INFORMACAO',
    ADMINISTRACAO: 'ADMINISTRACAO',
  },
  Regra: {
    ADMIN: 'ADMIN',
    TECNICO: 'TECNICO',
    USUARIO: 'USUARIO',
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('bcrypt', () => ({
  default: bcryptMock,
}));

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { id: usuarioAtualId, regra: usuarioRegra };
    next();
  },
  authorizeRoles:
    (...roles: string[]) =>
    (req: any, res: any, next: any) =>
      roles.includes(req.usuario.regra)
        ? next()
        : res.status(403).json({ error: 'Forbidden' }),
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

// ========================================
// SETUP E TEARDOWN
// ========================================

let router: any;

beforeAll(async () => {
  router = (await import('../../routes/tecnico.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  usuarioRegra = 'ADMIN';
  usuarioAtualId = 'admin1';

  prismaMock.usuario.findUnique.mockReset();
  prismaMock.usuario.findMany.mockReset();
  prismaMock.usuario.count.mockReset();
  prismaMock.usuario.create.mockReset();
  prismaMock.usuario.update.mockReset();
  prismaMock.usuario.delete.mockReset();
  prismaMock.expediente.create.mockReset();
  prismaMock.expediente.updateMany.mockReset();
  prismaMock.expediente.deleteMany.mockReset();
  prismaMock.$transaction.mockReset();

  bcryptMock.hash.mockResolvedValue('hashed_password');
});

// ========================================
// FUNÇÃO AUXILIAR
// ========================================

function criarApp(mockFile?: any) {
  const app = express();
  app.use(express.json());
  if (mockFile) {
    app.use((req: any, res: any, next: any) => {
      req._mockFile = mockFile;
      next();
    });
  }
  app.use('/tecnicos', router);
  return app;
}

// ========================================
// SUITES DE TESTES
// ========================================

describe('POST /tecnicos (criação de técnico)', () => {
  it('deve retornar status 201 e criar técnico com expediente padrão', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (callback) => {
      const tx = {
        usuario: {
          create: vi.fn().mockResolvedValue(tecnicoBase),
        },
        expediente: {
          create: vi.fn().mockResolvedValue({
            id: 'exp1',
            entrada: '08:00',
            saida: '17:00',
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
    expect(bcryptMock.hash).toHaveBeenCalledWith('senha123456', 10);
  });

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

  it('deve retornar status 400 quando nome for menor que 2 caracteres', async () => {
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

  it('deve retornar status 400 quando email for inválido', async () => {
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

  it('deve retornar status 400 quando senha não for enviada', async () => {
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

  it('deve retornar status 400 quando senha for menor que 8 caracteres', async () => {
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

  it('deve retornar status 400 quando horário de entrada for inválido', async () => {
    const resposta = await request(criarApp())
      .post('/tecnicos')
      .send({
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@empresa.com',
        password: 'senha123',
        entrada: '25:00',
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
      deletadoEm: new Date(),
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

  it('deve usar horários padrão quando não fornecidos', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    
    const expedienteCreateMock = vi.fn().mockResolvedValue({
      id: 'exp1',
      entrada: '08:00',
      saida: '17:00',
    });

    prismaMock.$transaction.mockImplementation(async (callback) => {
      const tx = {
        usuario: {
          create: vi.fn().mockResolvedValue(tecnicoBase),
        },
        expediente: {
          create: expedienteCreateMock,
        },
      };
      return await callback(tx);
    });

    await request(criarApp())
      .post('/tecnicos')
      .send({
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@empresa.com',
        password: 'senha123',
      });

    expect(expedienteCreateMock).toHaveBeenCalledWith({
      data: {
        usuarioId: tecnicoBase.id,
        entrada: '08:00',
        saida: '17:00',
      },
    });
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'TECNICO';

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

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValue(new Error('Database error'));

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
  });
});

describe('GET /tecnicos (listagem de técnicos)', () => {
  it('deve retornar status 200 com lista paginada de técnicos', async () => {
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

    const resposta = await request(criarApp()).get('/tecnicos');

    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toHaveLength(1);
    expect(resposta.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

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
    prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

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
    prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);

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

  it('deve filtrar por setor quando fornecido', async () => {
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

  it('deve buscar por nome, sobrenome ou email quando fornecido termo', async () => {
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

  it('deve aplicar paginação corretamente', async () => {
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
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'TECNICO';

    const resposta = await request(criarApp()).get('/tecnicos');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.count.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).get('/tecnicos');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao listar técnicos');
  });
});

describe('GET /tecnicos/:id (buscar técnico específico)', () => {
  it('deve retornar status 200 com dados do técnico quando encontrado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(tecnicoBase);

    const resposta = await request(criarApp()).get('/tecnicos/tec1');

    expect(resposta.status).toBe(200);
    expect(resposta.body.id).toBe('tec1');
    expect(resposta.body.regra).toBe('TECNICO');
  });

  it('deve retornar status 404 quando técnico não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).get('/tecnicos/tec999');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Técnico não encontrado');
  });

  it('deve retornar status 404 quando usuário não for técnico', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...tecnicoBase,
      regra: 'USUARIO',
    });

    const resposta = await request(criarApp()).get('/tecnicos/tec1');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Técnico não encontrado');
  });

  it('deve permitir acesso para TECNICO', async () => {
    usuarioRegra = 'TECNICO';
    prismaMock.usuario.findUnique.mockResolvedValue(tecnicoBase);

    const resposta = await request(criarApp()).get('/tecnicos/tec1');

    expect(resposta.status).toBe(200);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).get('/tecnicos/tec1');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao buscar técnico');
  });
});

describe('PUT /tecnicos/:id (edição de técnico)', () => {
  it('deve retornar status 200 e atualizar técnico com sucesso', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec1';

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

  it('deve retornar status 403 quando técnico tentar editar outro perfil', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec2';

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1')
      .send({ nome: 'Teste' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode editar seu próprio perfil');
  });

  it('deve retornar status 404 quando técnico não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp())
      .put('/tecnicos/tec999')
      .send({ nome: 'Teste' });

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Técnico não encontrado');
  });

  it('deve retornar status 400 quando tentar editar técnico deletado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
      email: 'joao@empresa.com',
      deletadoEm: new Date(),
    });

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1')
      .send({ nome: 'Teste' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Não é possível editar um técnico deletado');
  });

  it('deve retornar status 400 quando nome for inválido', async () => {
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

  it('deve retornar técnico atual quando nenhum dado for fornecido', async () => {
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

  it('deve permitir ADMIN atualizar setor', async () => {
    usuarioRegra = 'ADMIN';
    
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

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
      email: 'joao@empresa.com',
      deletadoEm: null,
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1')
      .send({ nome: 'Teste' });

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao atualizar técnico');
  });
});

describe('PUT /tecnicos/:id/password (alteração de senha)', () => {
  it('deve retornar status 200 e alterar senha com sucesso', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec1';

    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
    });
    prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/password')
      .send({ password: 'novasenha123' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('Senha alterada com sucesso');
    expect(bcryptMock.hash).toHaveBeenCalledWith('novasenha123', 10);
  });

  it('deve retornar status 403 quando técnico tentar alterar senha de outro', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec2';

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/password')
      .send({ password: 'novasenha123' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode alterar sua própria senha');
  });

  it('deve retornar status 400 quando senha não for enviada', async () => {
    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/password')
      .send({});

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Senha é obrigatória');
  });

  it('deve retornar status 400 quando senha for muito curta', async () => {
    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/password')
      .send({ password: '123' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('no mínimo 8 caracteres');
  });

  it('deve retornar status 404 quando técnico não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp())
      .put('/tecnicos/tec999/password')
      .send({ password: 'novasenha123' });

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Técnico não encontrado');
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/password')
      .send({ password: 'novasenha123' });

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao alterar senha');
  });
});

describe('PUT /tecnicos/:id/horarios (atualização de horários)', () => {
  it('deve retornar status 200 e atualizar horários com sucesso', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec1';

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
            entrada: '09:00',
            saida: '18:00',
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

  it('deve retornar status 403 quando técnico tentar alterar horários de outro', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec2';

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/horarios')
      .send({ entrada: '09:00', saida: '18:00' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode alterar seus próprios horários');
  });

  it('deve retornar status 400 quando horário de entrada for inválido', async () => {
    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/horarios')
      .send({ entrada: '25:00', saida: '18:00' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('formato HH:MM');
  });

  it('deve retornar status 400 quando saída for anterior à entrada', async () => {
    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/horarios')
      .send({ entrada: '18:00', saida: '09:00' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('posterior ao horário de entrada');
  });

  it('deve retornar status 404 quando técnico não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp())
      .put('/tecnicos/tec999/horarios')
      .send({ entrada: '09:00', saida: '18:00' });

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Técnico não encontrado');
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
    });
    prismaMock.$transaction.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp())
      .put('/tecnicos/tec1/horarios')
      .send({ entrada: '09:00', saida: '18:00' });

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao atualizar horários');
  });
});

describe('POST /tecnicos/:id/avatar (upload de avatar)', () => {
  it('deve retornar status 200 e fazer upload do avatar com sucesso', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec1';

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

  it('deve retornar status 403 quando técnico tentar fazer upload para outro perfil', async () => {
    usuarioRegra = 'TECNICO';
    usuarioAtualId = 'tec2';

    const resposta = await request(criarApp())
      .post('/tecnicos/tec1/avatar')
      .send();

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode fazer upload do seu próprio avatar');
  });

  it('deve retornar status 400 quando arquivo não for enviado', async () => {
    usuarioRegra = 'ADMIN';

    const resposta = await request(criarApp())
      .post('/tecnicos/tec1/avatar')
      .send();

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Arquivo não enviado');
  });

  it('deve retornar status 404 quando técnico não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const mockFile = { filename: 'avatar-123.jpg' };

    const resposta = await request(criarApp(mockFile))
      .post('/tecnicos/tec999/avatar')
      .send();

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Técnico não encontrado');
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const mockFile = { filename: 'avatar-123.jpg' };

    const resposta = await request(criarApp(mockFile))
      .post('/tecnicos/tec1/avatar')
      .send();

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao fazer upload do avatar');
  });
});

describe('DELETE /tecnicos/:id (deleção de técnico)', () => {
  it('deve retornar status 200 e fazer soft delete com sucesso', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
      email: 'joao@empresa.com',
      deletadoEm: null,
      _count: { tecnicoChamados: 0 },
    });
    prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

    const resposta = await request(criarApp()).delete('/tecnicos/tec1');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('deletado com sucesso');
  });

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

  it('deve retornar status 404 quando técnico não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).delete('/tecnicos/tec999');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Técnico não encontrado');
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'TECNICO';

    const resposta = await request(criarApp()).delete('/tecnicos/tec1');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
      email: 'joao@empresa.com',
      deletadoEm: null,
      _count: { tecnicoChamados: 0 },
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).delete('/tecnicos/tec1');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao deletar técnico');
  });
});

describe('PATCH /tecnicos/:id/restaurar (restauração de técnico)', () => {
  it('deve retornar status 200 e restaurar técnico deletado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
      email: 'joao@empresa.com',
      deletadoEm: new Date(),
    });
    prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

    const resposta = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('restaurado com sucesso');
  });

  it('deve retornar status 404 quando técnico não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).patch('/tecnicos/tec999/restaurar');

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

    const resposta = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('não está deletado');
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'TECNICO';

    const resposta = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'tec1',
      regra: 'TECNICO',
      email: 'joao@empresa.com',
      deletadoEm: new Date(),
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao restaurar técnico');
  });
});