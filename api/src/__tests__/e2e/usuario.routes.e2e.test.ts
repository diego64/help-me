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

let usuarioRegra = 'ADMIN';
let usuarioAtualId = 'admin1';

vi.mock('@prisma/client', () => ({
  PrismaClient: function () {
    return prismaMock;
  },
  Setor: {
    TECNOLOGIA_INFORMACAO: 'TECNOLOGIA_INFORMACAO',
    ADMINISTRACAO: 'ADMINISTRACAO',
    FINANCEIRO: 'FINANCEIRO',
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

vi.mock('../../utils/password', () => ({
  hashPassword: hashPasswordMock,
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

vi.mock('../../services/redisClient', () => ({
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

let router: any;

beforeAll(async () => {
  router = (await import('../../routes/usuario.routes')).default;
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

  hashPasswordMock.mockClear();
  hashPasswordMock.mockReturnValue('HASHED_PASSWORD_PBKDF2');
  cacheSetMock.mockResolvedValue(undefined);
  cacheGetMock.mockResolvedValue(null);
  cacheDelMock.mockResolvedValue(undefined);
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

describe('POST /usuarios (criação de usuário)', () => {
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
    expect(resposta.body.regra).toBe('USUARIO');
    expect(hashPasswordMock).toHaveBeenCalledWith('senha123456');
    expect(cacheDelMock).toHaveBeenCalledWith('usuarios:list');
  });

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

  it('deve retornar status 400 quando nome for menor que 2 caracteres', async () => {
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

  it('deve retornar status 400 quando email for inválido', async () => {
    const resposta = await request(criarApp())
      .post('/usuarios')
      .send({
        nome: 'João',
        sobrenome: 'Silva',
        email: 'email-invalido',
        password: 'senha123',
        setor: 'TECNOLOGIA_INFORMACAO',
      });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Email inválido');
  });

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

  it('deve retornar status 400 quando senha for menor que 8 caracteres', async () => {
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
        setor: 'SETOR_INVALIDO',
      });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Setor inválido');
  });

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

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
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

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
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
});

describe('GET /usuarios (listagem de usuários)', () => {
  it('deve retornar status 200 com dados do cache quando disponível', async () => {
    const cachedData = createPaginatedResponse([usuarioBase], 1, 1, 20);
    cacheGetMock.mockResolvedValue(JSON.stringify(cachedData));

    const resposta = await request(criarApp()).get('/usuarios');

    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toHaveLength(1);
    expect(prismaMock.usuario.findMany).not.toHaveBeenCalled();
  });

  it('deve retornar status 200 com lista paginada quando cache vazio', async () => {
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
    });
    expect(cacheSetMock).toHaveBeenCalled();
  });

  it('deve filtrar apenas usuários ativos por padrão', async () => {
    cacheGetMock.mockResolvedValue(null);
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

    await request(criarApp()).get('/usuarios');

    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
      where: {
        regra: 'USUARIO',
        ativo: true,
        deletadoEm: null,
      },
      select: expect.any(Object),
      orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
      skip: 0,
      take: 20,
    });
  });

  it('deve incluir usuários inativos quando solicitado', async () => {
    cacheGetMock.mockResolvedValue(null);
    prismaMock.usuario.count.mockResolvedValue(2);
    prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

    await request(criarApp()).get('/usuarios?incluirInativos=true');

    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith({
      where: {
        regra: 'USUARIO',
        deletadoEm: null,
      },
      select: expect.any(Object),
      orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
      skip: 0,
      take: 20,
    });
  });

  it('deve filtrar por setor quando fornecido', async () => {
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

  it('deve buscar por nome, sobrenome ou email quando fornecido termo', async () => {
    cacheGetMock.mockResolvedValue(null);
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.findMany.mockResolvedValue([usuarioBase]);

    await request(criarApp()).get('/usuarios?busca=João');

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

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp()).get('/usuarios');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    cacheGetMock.mockResolvedValue(null);
    prismaMock.usuario.count.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).get('/usuarios');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao listar usuários');
  });
});

describe('GET /usuarios/:id (buscar usuário específico)', () => {
  it('deve retornar status 200 com dados do usuário quando encontrado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

    const resposta = await request(criarApp()).get('/usuarios/user1');

    expect(resposta.status).toBe(200);
    expect(resposta.body.id).toBe('user1');
    expect(resposta.body.regra).toBe('USUARIO');
  });

  it('deve retornar status 403 quando usuário tentar ver perfil de outro', async () => {
    usuarioRegra = 'USUARIO';
    usuarioAtualId = 'user2';

    const resposta = await request(criarApp()).get('/usuarios/user1');

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode visualizar seu próprio perfil');
  });

  it('deve retornar status 404 quando usuário não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).get('/usuarios/user999');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Usuário não encontrado');
  });

  it('deve retornar status 404 quando não for perfil USUARIO', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      ...usuarioBase,
      regra: 'TECNICO',
    });

    const resposta = await request(criarApp()).get('/usuarios/user1');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Usuário não encontrado');
  });

  it('deve permitir USUARIO visualizar próprio perfil', async () => {
    usuarioRegra = 'USUARIO';
    usuarioAtualId = 'user1';
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

    const resposta = await request(criarApp()).get('/usuarios/user1');

    expect(resposta.status).toBe(200);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).get('/usuarios/user1');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao buscar usuário');
  });
});

describe('POST /usuarios/email (buscar por email)', () => {
  it('deve retornar status 200 com dados do usuário quando encontrado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase);

    const resposta = await request(criarApp())
      .post('/usuarios/email')
      .send({ email: 'joao.silva@empresa.com' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.email).toBe('joao.silva@empresa.com');
  });

  it('deve retornar status 400 quando email não for enviado', async () => {
    const resposta = await request(criarApp())
      .post('/usuarios/email')
      .send({});

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Email é obrigatório');
  });

  it('deve retornar status 400 quando email for inválido', async () => {
    const resposta = await request(criarApp())
      .post('/usuarios/email')
      .send({ email: 'email-invalido' });

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

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp())
      .post('/usuarios/email')
      .send({ email: 'joao@empresa.com' });

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp())
      .post('/usuarios/email')
      .send({ email: 'joao@empresa.com' });

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao buscar usuário');
  });
});

describe('PUT /usuarios/:id (edição de usuário)', () => {
  it('deve retornar status 200 e atualizar usuário com sucesso', async () => {
    usuarioRegra = 'USUARIO';
    usuarioAtualId = 'user1';

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
      nome: 'João Atualizado',
    });

    const resposta = await request(criarApp())
      .put('/usuarios/user1')
      .send({ nome: 'João Atualizado' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.nome).toBe('João Atualizado');
    expect(cacheDelMock).toHaveBeenCalledWith('usuarios:list');
  });

  it('deve retornar status 403 quando usuário tentar editar outro perfil', async () => {
    usuarioRegra = 'USUARIO';
    usuarioAtualId = 'user2';

    const resposta = await request(criarApp())
      .put('/usuarios/user1')
      .send({ nome: 'Teste' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode editar seu próprio perfil');
  });

  it('deve retornar status 404 quando usuário não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp())
      .put('/usuarios/user999')
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

  it('deve permitir ADMIN atualizar setor', async () => {
    usuarioRegra = 'ADMIN';
    
    prismaMock.usuario.findUnique
      .mockResolvedValueOnce({
        id: 'user1',
        regra: 'USUARIO',
        email: 'joao@empresa.com',
        deletadoEm: null,
      })
      .mockResolvedValueOnce(null);

    prismaMock.usuario.update.mockResolvedValue(usuarioBase);

    const resposta = await request(criarApp())
      .put('/usuarios/user1')
      .send({ setor: 'FINANCEIRO' });

    expect(resposta.status).toBe(200);
  });

  it('deve retornar usuário atual quando nenhum dado for fornecido', async () => {
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

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
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
});

describe('PUT /usuarios/:id/senha (alteração de senha)', () => {
  it('deve retornar status 200 e alterar senha com sucesso', async () => {
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
    expect(resposta.body.message).toContain('Senha alterada com sucesso');
    expect(hashPasswordMock).toHaveBeenCalledWith('novasenha123');
  });

  it('deve retornar status 403 quando usuário tentar alterar senha de outro', async () => {
    usuarioRegra = 'USUARIO';
    usuarioAtualId = 'user2';

    const resposta = await request(criarApp())
      .put('/usuarios/user1/senha')
      .send({ password: 'novasenha123' });

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode alterar sua própria senha');
  });

  it('deve retornar status 400 quando senha não for enviada', async () => {
    const resposta = await request(criarApp())
      .put('/usuarios/user1/senha')
      .send({});

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Senha é obrigatória');
  });

  it('deve retornar status 400 quando senha for muito curta', async () => {
    const resposta = await request(criarApp())
      .put('/usuarios/user1/senha')
      .send({ password: '123' });

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

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
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

describe('POST /usuarios/:id/avatar (upload de avatar)', () => {
  it('deve retornar status 200 e fazer upload do avatar com sucesso', async () => {
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
    expect(resposta.body.message).toContain('enviado com sucesso');
    expect(resposta.body.avatarUrl).toBeDefined();
    expect(cacheDelMock).toHaveBeenCalledWith('usuarios:list');
  });

  it('deve retornar status 403 quando usuário tentar fazer upload para outro perfil', async () => {
    usuarioRegra = 'USUARIO';
    usuarioAtualId = 'user2';

    const resposta = await request(criarApp())
      .post('/usuarios/user1/avatar')
      .send();

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode fazer upload do seu próprio avatar');
  });

  it('deve retornar status 400 quando arquivo não for enviado', async () => {
    usuarioRegra = 'ADMIN';

    const resposta = await request(criarApp())
      .post('/usuarios/user1/avatar')
      .send();

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Arquivo não enviado');
  });

  it('deve retornar status 404 quando usuário não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const mockFile = { filename: 'avatar-123.jpg' };

    const resposta = await request(criarApp(mockFile))
      .post('/usuarios/user999/avatar')
      .send();

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Usuário não encontrado');
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'user1',
      regra: 'USUARIO',
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const mockFile = { filename: 'avatar-123.jpg' };

    const resposta = await request(criarApp(mockFile))
      .post('/usuarios/user1/avatar')
      .send();

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao fazer upload do avatar');
  });
});

describe('DELETE /usuarios/:id (deleção de usuário)', () => {
  it('deve retornar status 200 e fazer soft delete com sucesso', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'user1',
      regra: 'USUARIO',
      email: 'joao@empresa.com',
      deletadoEm: null,
      _count: { chamadoOS: 0 },
    });
    prismaMock.usuario.update.mockResolvedValue(usuarioBase);

    const resposta = await request(criarApp()).delete('/usuarios/user1');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('deletado com sucesso');
    expect(cacheDelMock).toHaveBeenCalledWith('usuarios:list');
  });

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
    expect(cacheDelMock).toHaveBeenCalledWith('usuarios:list');
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

  it('deve retornar status 403 quando usuário tentar deletar outra conta', async () => {
    usuarioRegra = 'USUARIO';
    usuarioAtualId = 'user2';

    const resposta = await request(criarApp()).delete('/usuarios/user1');

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('só pode deletar sua própria conta');
  });

  it('deve retornar status 404 quando usuário não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).delete('/usuarios/user999');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Usuário não encontrado');
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'user1',
      regra: 'USUARIO',
      email: 'joao@empresa.com',
      deletadoEm: null,
      _count: { chamadoOS: 0 },
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).delete('/usuarios/user1');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao deletar usuário');
  });
});

describe('PATCH /usuarios/:id/restaurar (restauração de usuário)', () => {
  it('deve retornar status 200 e restaurar usuário deletado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'user1',
      regra: 'USUARIO',
      email: 'joao@empresa.com',
      deletadoEm: new Date(),
    });
    prismaMock.usuario.update.mockResolvedValue(usuarioBase);

    const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('restaurado com sucesso');
    expect(cacheDelMock).toHaveBeenCalledWith('usuarios:list');
  });

  it('deve retornar status 404 quando usuário não existir', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).patch('/usuarios/user999/restaurar');

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

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'user1',
      regra: 'USUARIO',
      email: 'joao@empresa.com',
      deletadoEm: new Date(),
    });
    prismaMock.usuario.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).patch('/usuarios/user1/restaurar');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao restaurar usuário');
  });
});

function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
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