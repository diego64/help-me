import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

const hashPasswordMock = vi.fn().mockReturnValue('HASHED_PASSWORD');

vi.mock('@infrastructure/database/prisma/client', () => ({ prisma: prismaMock }));
vi.mock('@shared/config/password', () => ({ hashPassword: hashPasswordMock }));
vi.mock('@utils/password', () => ({ hashPassword: hashPasswordMock }));

vi.mock('@infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, _res: Response, next: NextFunction) => {
    req.usuario = { id: currentUserId, email: 'test@test.com', regra: currentUserRole, type: 'access' };
    next();
  },
  authorizeRoles: (...roles: string[]) => (req: any, res: Response, next: NextFunction) => {
    if (!req.usuario) return res.status(401).json({ error: 'Não autorizado.' });
    if (!roles.includes(req.usuario.regra)) return res.status(403).json({ error: 'Acesso negado.' });
    next();
  },
  AuthRequest: class {},
}));

vi.mock('multer', () => {
  const multerFactory: any = vi.fn(() => ({
    single: () => (req: any, _res: any, next: any) => {
      req.file = req._mockFile ?? undefined;
      next();
    },
  }));
  multerFactory.diskStorage = vi.fn().mockReturnValue({});
  return { default: multerFactory };
});

vi.mock('fs', () => ({
  default: { existsSync: vi.fn().mockReturnValue(true), mkdirSync: vi.fn() },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; },
  Setor: {
    TECNOLOGIA_INFORMACAO: 'TECNOLOGIA_INFORMACAO',
    ADMINISTRACAO: 'ADMINISTRACAO',
    RECURSOS_HUMANOS: 'RECURSOS_HUMANOS',
    FINANCEIRO: 'FINANCEIRO',
  },
  Regra: { ADMIN: 'ADMIN', TECNICO: 'TECNICO', USUARIO: 'USUARIO' },
  NivelTecnico: { N1: 'N1', N2: 'N2', N3: 'N3' },
}));

const { default: tecnicoRoutes } = await import('@presentation/http/routes/tecnico.routes');

const tecnicoBase = {
  id: 'tec1',
  nome: 'João',
  sobrenome: 'Silva',
  email: 'joao.silva@empresa.com',
  nivel: 'N1',
  telefone: '11999999999',
  ramal: '1234',
  setor: 'TECNOLOGIA_INFORMACAO',
  regra: 'TECNICO',
  ativo: true,
  avatarUrl: null,
  geradoEm: new Date('2025-01-01'),
  atualizadoEm: new Date('2025-01-01'),
  deletadoEm: null,
  tecnicoDisponibilidade: [
    {
      id: 'exp1',
      entrada: new Date('2025-01-01T08:00:00.000Z'),
      saida: new Date('2025-01-01T17:00:00.000Z'),
      ativo: true,
      geradoEm: new Date('2025-01-01'),
      atualizadoEm: new Date('2025-01-01'),
      deletadoEm: null,
    },
  ],
  _count: { tecnicoChamados: 0 },
};

let consoleSpy: {
  log: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
};

function criarApp(mockFile?: any) {
  const app = express();
  app.use(express.json());
  if (mockFile !== undefined) {
    app.use((req: any, _res: any, next: any) => {
      req._mockFile = mockFile;
      next();
    });
  }
  app.use('/tecnicos', tecnicoRoutes);
  return app;
}

function mockTransacaoCriar(tecnicoId = 'tec1') {
  prismaMock.$transaction.mockImplementation(async (cb: any) => {
    const tx = {
      usuario: { create: vi.fn().mockResolvedValue({ id: tecnicoId }) },
      expediente: { create: vi.fn().mockResolvedValue({ id: 'exp1' }) },
    };
    return cb(tx);
  });
}

type TecnicoOverrides = Partial<Omit<typeof tecnicoBase, 'telefone' | 'ramal' | 'avatarUrl' | 'deletadoEm'>> & {
  telefone?: string | null;
  ramal?: string | null;
  avatarUrl?: string | null;
  deletadoEm?: string | Date | null;
};

function setupCriacaoSucesso(overrides?: TecnicoOverrides) {
  prismaMock.usuario.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ ...tecnicoBase, ...overrides });
  mockTransacaoCriar();
}

function mockTransacaoHorarios(entrada = '09:00', saida = '18:00') {
  prismaMock.$transaction.mockImplementation(async (cb: any) => {
    const tx = {
      expediente: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({
          id: 'exp2',
          entrada: new Date(`2025-01-01T${entrada}:00.000Z`),
          saida: new Date(`2025-01-01T${saida}:00.000Z`),
          ativo: true,
          geradoEm: new Date(),
        }),
      },
    };
    return cb(tx);
  });
}

beforeEach(() => {
  consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  vi.resetAllMocks();

  currentUserRole = 'ADMIN';
  currentUserId = 'admin1';
  hashPasswordMock.mockReturnValue('HASHED_PASSWORD');

  prismaMock.usuario.findUnique.mockResolvedValue(null);
  prismaMock.usuario.findMany.mockResolvedValue([]);
  prismaMock.usuario.count.mockResolvedValue(0);
  prismaMock.usuario.create.mockResolvedValue(undefined as any);
  prismaMock.usuario.update.mockResolvedValue(undefined as any);
  prismaMock.usuario.delete.mockResolvedValue(undefined as any);
  prismaMock.expediente.create.mockResolvedValue(undefined as any);
  prismaMock.expediente.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.expediente.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.$transaction.mockResolvedValue(undefined as any);

  consoleSpy.log.mockImplementation(() => {});
  consoleSpy.error.mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /tecnicos', () => {
  const payload = {
    nome: 'João',
    sobrenome: 'Silva',
    email: 'joao@empresa.com',
    password: 'senha12345',
  };

  describe('Casos de sucesso', () => {
    it('deve criar técnico com expediente padrão e retornar 201', async () => {
      setupCriacaoSucesso();

      const res = await request(criarApp()).post('/tecnicos').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.nome).toBe('João');
      expect(res.body.regra).toBe('TECNICO');
    });

    it('deve criar técnico com horários personalizados e chamar expediente.create', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);

      const expedienteCreate = vi.fn().mockResolvedValue({ id: 'exp1' });
      prismaMock.$transaction.mockImplementation(async (cb: any) =>
        cb({
          usuario: { create: vi.fn().mockResolvedValue({ id: 'tec1' }) },
          expediente: { create: expedienteCreate },
        })
      );

      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, entrada: '09:00', saida: '18:00' });

      expect(res.status).toBe(201);
      expect(expedienteCreate).toHaveBeenCalled();
    });

    it('deve hashear a senha antes de salvar', async () => {
      setupCriacaoSucesso();

      await request(criarApp()).post('/tecnicos').send(payload);

      expect(hashPasswordMock).toHaveBeenCalledWith('senha12345');
    });

    it('deve fazer trim de nome e sobrenome', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);

      const usuarioCreate = vi.fn().mockResolvedValue({ id: 'tec1' });
      prismaMock.$transaction.mockImplementation(async (cb: any) =>
        cb({ usuario: { create: usuarioCreate }, expediente: { create: vi.fn().mockResolvedValue({}) } })
      );

      await request(criarApp()).post('/tecnicos').send({ ...payload, nome: '  João  ', sobrenome: '  Silva  ' });

      expect(usuarioCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nome: 'João', sobrenome: 'Silva' }) })
      );
    });

    it('deve criar com todos os campos opcionais preenchidos', async () => {
      setupCriacaoSucesso({ telefone: '11987654321', ramal: '9999', setor: 'ADMINISTRACAO' });

      const res = await request(criarApp()).post('/tecnicos').send({
        ...payload,
        telefone: '11987654321',
        ramal: '9999',
        setor: 'ADMINISTRACAO',
      });

      expect(res.status).toBe(201);
    });

    it('deve criar técnico sem telefone e ramal (campos opcionais)', async () => {
      setupCriacaoSucesso({ telefone: null, ramal: null });

      const res = await request(criarApp()).post('/tecnicos').send(payload);

      expect(res.status).toBe(201);
    });

    it.each([
      ['nome mínimo (2 chars)', { nome: 'Jo' }],
      ['senha mínima (8 chars)', { password: '12345678' }],
      ['nome máximo (100 chars)', { nome: 'A'.repeat(100) }],
    ])('deve aceitar %s', async (_, override) => {
      setupCriacaoSucesso();

      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(201);
    });

    it('deve usar setor TECNOLOGIA_INFORMACAO como padrão', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(tecnicoBase);

      const usuarioCreate = vi.fn().mockResolvedValue({ id: 'tec1' });
      prismaMock.$transaction.mockImplementation(async (cb: any) =>
        cb({ usuario: { create: usuarioCreate }, expediente: { create: vi.fn().mockResolvedValue({}) } })
      );

      await request(criarApp()).post('/tecnicos').send(payload);

      expect(usuarioCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ setor: 'TECNOLOGIA_INFORMACAO' }) })
      );
    });

    it('deve registrar log de criação', async () => {
      setupCriacaoSucesso();

      await request(criarApp()).post('/tecnicos').send(payload);

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO CREATED]', expect.any(Object));
    });
  });

  describe('Validação de nome', () => {
    it('deve retornar 400 quando nome for ausente', async () => {
      const { nome: _n, ...semNome } = payload;
      const res = await request(criarApp()).post('/tecnicos').send(semNome);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Nome é obrigatório');
    });

    it.each([
      ['null', { nome: null }],
      ['número', { nome: 123 }],
      ['boolean', { nome: true }],
      ['objeto', { nome: {} }],
      ['array', { nome: [] }],
      ['string vazia', { nome: '' }],
    ])('deve retornar 400 quando nome for %s', async (_, override) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Nome é obrigatório');
    });

    it.each([
      ['1 char', { nome: 'J' }, 'no mínimo 2 caracteres'],
      ['só espaços', { nome: '   ' }, 'no mínimo 2 caracteres'],
      ['101 chars', { nome: 'A'.repeat(101) }, 'no máximo 100 caracteres'],
    ])('deve retornar 400 quando nome tiver %s', async (_, override, mensagem) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(mensagem);
    });
  });

  describe('Validação de sobrenome', () => {
    it('deve retornar 400 quando sobrenome for ausente', async () => {
      const { sobrenome: _s, ...semSobrenome } = payload;
      const res = await request(criarApp()).post('/tecnicos').send(semSobrenome);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Sobrenome é obrigatório');
    });

    it.each([
      ['null', { sobrenome: null }],
      ['número', { sobrenome: 456 }],
      ['string vazia', { sobrenome: '' }],
    ])('deve retornar 400 quando sobrenome for %s', async (_, override) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Sobrenome é obrigatório');
    });

    it.each([
      ['1 char', { sobrenome: 'S' }, 'no mínimo 2 caracteres'],
      ['só espaços', { sobrenome: '   ' }, 'no mínimo 2 caracteres'],
      ['101 chars', { sobrenome: 'S'.repeat(101) }, 'no máximo 100 caracteres'],
    ])('deve retornar 400 quando sobrenome tiver %s', async (_, override, mensagem) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(mensagem);
    });
  });

  describe('Validação de email', () => {
    it('deve retornar 400 quando email for ausente', async () => {
      const { email: _e, ...semEmail } = payload;
      const res = await request(criarApp()).post('/tecnicos').send(semEmail);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Email é obrigatório');
    });

    it.each([
      ['null', { email: null }],
      ['número', { email: 123 }],
      ['string vazia', { email: '' }],
    ])('deve retornar 400 quando email for %s', async (_, override) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Email é obrigatório');
    });

    it.each([
      ['sem @', 'email-invalido'],
      ['sem domínio', 'joao@'],
      ['sem local part', '@empresa.com'],
      ['com espaços', 'joao @empresa.com'],
    ])('deve retornar 400 para email inválido (%s)', async (_, email) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, email });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Email inválido');
    });
  });

  describe('Validação de senha', () => {
    it('deve retornar 400 quando senha for ausente', async () => {
      const { password: _p, ...semSenha } = payload;
      const res = await request(criarApp()).post('/tecnicos').send(semSenha);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Senha é obrigatória');
    });

    it.each([
      ['null', { password: null }],
      ['número', { password: 12345678 }],
      ['string vazia', { password: '' }],
    ])('deve retornar 400 quando senha for %s', async (_, override) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar 400 quando senha tiver menos de 8 chars', async () => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, password: '1234567' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('no mínimo 8 caracteres');
    });
  });

  describe('Validação de horários', () => {
    it.each([
      ['entrada não é string', { entrada: 900 }, 'Horário de entrada é obrigatório'],
      ['saída não é string', { entrada: '08:00', saida: 1700 }, 'Horário de saída é obrigatório'],
      ['hora entrada > 23', { entrada: '25:00', saida: '17:00' }, 'formato HH:MM'],
      ['minuto entrada > 59', { entrada: '08:60', saida: '17:00' }, 'formato HH:MM'],
      ['hora saída > 23', { entrada: '08:00', saida: '25:00' }, 'formato HH:MM'],
      ['minuto saída > 59', { entrada: '08:00', saida: '17:60' }, 'formato HH:MM'],
      ['entrada sem zero', { entrada: '8:00', saida: '17:00' }, 'formato HH:MM'],
      ['saída sem dois pontos', { entrada: '08:00', saida: '1700' }, 'formato HH:MM'],
      ['saída anterior à entrada', { entrada: '18:00', saida: '08:00' }, 'posterior ao horário de entrada'],
      ['saída igual à entrada', { entrada: '08:00', saida: '08:00' }, 'posterior ao horário de entrada'],
    ])('deve retornar 400 quando %s', async (_, override, mensagem) => {
      const res = await request(criarApp()).post('/tecnicos').send({ ...payload, ...override });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(mensagem);
    });
  });

  describe('Validação de duplicação', () => {
    it('deve retornar 409 quando email já estiver cadastrado (ativo)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'user1', deletadoEm: null });

      const res = await request(criarApp()).post('/tecnicos').send(payload);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Email já cadastrado');
    });

    it('deve retornar 409 quando existir usuário deletado com o mesmo email', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'user1',
        deletadoEm: new Date().toISOString(),
      });

      const res = await request(criarApp()).post('/tecnicos').send(payload);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('usuário deletado com este email');
    });
  });

  describe('Autorização', () => {
    it.each(['TECNICO', 'USUARIO'] as Regra[])('deve retornar 403 para role %s', async (role) => {
      currentUserRole = role;

      const res = await request(criarApp()).post('/tecnicos').send(payload);

      expect(res.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findUnique lançar erro', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).post('/tecnicos').send(payload);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao criar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando a transação falhar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(null);
      prismaMock.$transaction.mockRejectedValueOnce(new Error('TX error'));

      const res = await request(criarApp()).post('/tecnicos').send(payload);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao criar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('GET /tecnicos', () => {
  beforeEach(() => {
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.findMany.mockResolvedValue([tecnicoBase]);
  });

  describe('Casos de sucesso', () => {
    it('deve retornar 200 com estrutura de paginação', async () => {
      const res = await request(criarApp()).get('/tecnicos');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data: expect.any(Array),
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });

    it('deve retornar lista vazia quando não houver técnicos', async () => {
      prismaMock.usuario.count.mockResolvedValue(0);
      prismaMock.usuario.findMany.mockResolvedValue([]);

      const res = await request(criarApp()).get('/tecnicos');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });

    it('deve calcular paginação corretamente (page=2, limit=5, total=12)', async () => {
      prismaMock.usuario.count.mockResolvedValue(12);
      prismaMock.usuario.findMany.mockResolvedValue(Array(5).fill(tecnicoBase));

      const res = await request(criarApp()).get('/tecnicos?page=2&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });

    it('deve passar filtro where apenas para TECNICO por padrão', async () => {
      await request(criarApp()).get('/tecnicos');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regra: 'TECNICO', ativo: true, deletadoEm: null }),
        })
      );
    });

    it('deve incluir inativos quando incluirInativos=true', async () => {
      await request(criarApp()).get('/tecnicos?incluirInativos=true');

      const call = prismaMock.usuario.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('ativo');
    });

    it('deve incluir deletados quando incluirDeletados=true', async () => {
      await request(criarApp()).get('/tecnicos?incluirDeletados=true');

      const call = prismaMock.usuario.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('deletadoEm');
    });

    it('deve filtrar por setor', async () => {
      await request(criarApp()).get('/tecnicos?setor=FINANCEIRO');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ setor: 'FINANCEIRO' }),
        })
      );
    });

    it.each([['N1'], ['N2'], ['N3']])('deve filtrar por nível %s', async (nivel) => {
      await request(criarApp()).get(`/tecnicos?nivel=${nivel}`);

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ nivel }),
        })
      );
    });

    it('deve ignorar nível inválido (não adiciona ao where)', async () => {
      await request(criarApp()).get('/tecnicos?nivel=N9');

      const call = prismaMock.usuario.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('nivel');
    });

    it('deve aplicar busca textual com OR em nome, sobrenome e email', async () => {
      await request(criarApp()).get('/tecnicos?busca=jo');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ nome: expect.objectContaining({ contains: 'jo' }) }),
              expect.objectContaining({ sobrenome: expect.objectContaining({ contains: 'jo' }) }),
              expect.objectContaining({ email: expect.objectContaining({ contains: 'jo' }) }),
            ]),
          }),
        })
      );
    });

    it('deve ordenar por nome e sobrenome ascendente', async () => {
      await request(criarApp()).get('/tecnicos');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        })
      );
    });

    it('deve limitar ao MAX de 100 por página', async () => {
      await request(criarApp()).get('/tecnicos?limit=999');

      expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  describe('Autorização', () => {
    it.each(['TECNICO', 'USUARIO'] as Regra[])('deve retornar 403 para role %s', async (role) => {
      currentUserRole = role;

      const res = await request(criarApp()).get('/tecnicos');

      expect(res.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando o banco falhar', async () => {
      prismaMock.usuario.count.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).get('/tecnicos');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao listar técnicos');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('GET /tecnicos/:id', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar 200 com o técnico encontrado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(tecnicoBase);

      const res = await request(criarApp()).get('/tecnicos/tec1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('tec1');
      expect(res.body.regra).toBe('TECNICO');
    });

    it('deve retornar dados de disponibilidade', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(tecnicoBase);

      const res = await request(criarApp()).get('/tecnicos/tec1');

      expect(res.body.tecnicoDisponibilidade).toBeDefined();
      expect(res.body._count).toBeDefined();
    });
  });

  describe('Casos 404', () => {
    it.each([
      ['não existir', null],
      ['ser USUARIO', { id: 'u1', regra: 'USUARIO' }],
      ['ser ADMIN', { id: 'a1', regra: 'ADMIN' }],
    ])('deve retornar 404 quando técnico %s', async (_, mockValue) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(mockValue);

      const res = await request(criarApp()).get('/tecnicos/tec1');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização', () => {
    it.each(['ADMIN', 'TECNICO'] as Regra[])('deve permitir acesso para role %s', async (role) => {
      currentUserRole = role;
      prismaMock.usuario.findUnique.mockResolvedValueOnce(tecnicoBase);

      const res = await request(criarApp()).get('/tecnicos/tec1');

      expect(res.status).toBe(200);
    });

    it('deve retornar 403 para USUARIO', async () => {
      currentUserRole = 'USUARIO';

      const res = await request(criarApp()).get('/tecnicos/tec1');

      expect(res.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando o banco falhar', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).get('/tecnicos/tec1');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao buscar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id', () => {
  function setupTecnicoParaEditar(overrides?: object) {
    prismaMock.usuario.findUnique
      .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null, ...overrides })
      .mockResolvedValueOnce(null);
    prismaMock.usuario.update.mockResolvedValue(tecnicoBase);
  }

  describe('Casos de sucesso', () => {
    it.each([
      ['nome', { nome: 'Novo Nome' }],
      ['sobrenome', { sobrenome: 'Novo Sobrenome' }],
      ['telefone', { telefone: '11987654321' }],
      ['ramal', { ramal: '9999' }],
      ['múltiplos campos', { nome: 'Novo', sobrenome: 'Sobrenome' }],
    ])('deve atualizar %s com sucesso', async (_, body) => {
      setupTecnicoParaEditar();

      const res = await request(criarApp()).put('/tecnicos/tec1').send(body);

      expect(res.status).toBe(200);
    });

    it('deve atualizar com novo email disponível', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null })
        .mockResolvedValueOnce(null);
      prismaMock.usuario.update.mockResolvedValue({ ...tecnicoBase, email: 'novo@empresa.com' });

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ email: 'novo@empresa.com' });

      expect(res.status).toBe(200);
    });

    it('deve permitir atualizar com o mesmo email atual', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null })
        .mockResolvedValueOnce(tecnicoBase);

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ email: 'joao.silva@empresa.com' });

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve retornar técnico atual sem chamar update quando body estiver vazio', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null })
        .mockResolvedValueOnce(tecnicoBase);

      const res = await request(criarApp()).put('/tecnicos/tec1').send({});

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve fazer trim de nome e sobrenome', async () => {
      setupTecnicoParaEditar();

      await request(criarApp()).put('/tecnicos/tec1').send({ nome: '  João  ', sobrenome: '  Silva  ' });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nome: 'João', sobrenome: 'Silva' }) })
      );
    });

    it('deve remover telefone quando enviado como null', async () => {
      setupTecnicoParaEditar();

      await request(criarApp()).put('/tecnicos/tec1').send({ telefone: null });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ telefone: null }) })
      );
    });

    it('deve remover ramal quando enviado como null', async () => {
      setupTecnicoParaEditar();

      await request(criarApp()).put('/tecnicos/tec1').send({ ramal: null });

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ramal: null }) })
      );
    });

    it('deve permitir ADMIN atualizar setor', async () => {
      setupTecnicoParaEditar();
      prismaMock.usuario.update.mockResolvedValue({ ...tecnicoBase, setor: 'ADMINISTRACAO' });

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ setor: 'ADMINISTRACAO' });

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ setor: 'ADMINISTRACAO' }) })
      );
    });

    it('não deve atualizar setor quando enviado por TECNICO (ignorado silenciosamente)', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null })
        .mockResolvedValueOnce(tecnicoBase);

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ setor: 'ADMINISTRACAO' });

      expect(res.status).toBe(200);
      expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    });

    it('deve permitir atualizar técnico inativo', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec2', regra: 'TECNICO', email: 'inativo@empresa.com', ativo: false, deletadoEm: null })
        .mockResolvedValueOnce(null);
      prismaMock.usuario.update.mockResolvedValue({ ...tecnicoBase, id: 'tec2' });

      const res = await request(criarApp()).put('/tecnicos/tec2').send({ nome: 'Atualizado' });

      expect(res.status).toBe(200);
    });

    it('deve registrar log de atualização', async () => {
      // Adicionar terceiro mock se o handler busca o técnico atualizado no final
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null }) // busca inicial
        .mockResolvedValueOnce(null)        // verifica email duplicado
        .mockResolvedValueOnce(tecnicoBase); // busca dados atualizados para retornar
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'Novo' });

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO UPDATED]', expect.any(Object));
    });
  });

  describe('Validação de campos', () => {
    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null,
      });
    });

    it.each([
      ['nome com 1 char', { nome: 'J' }, 'no mínimo 2 caracteres'],
      ['nome com 101 chars', { nome: 'A'.repeat(101) }, 'no máximo 100 caracteres'],
      ['nome com só espaços', { nome: '   ' }, 'no mínimo 2 caracteres'],
      ['sobrenome com 1 char', { sobrenome: 'S' }, 'no mínimo 2 caracteres'],
      ['sobrenome com 101 chars', { sobrenome: 'S'.repeat(101) }, 'no máximo 100 caracteres'],
      ['sobrenome com só espaços', { sobrenome: '   ' }, 'no mínimo 2 caracteres'],
    ])('deve retornar 400 para %s', async (_, body, mensagem) => {
      const res = await request(criarApp()).put('/tecnicos/tec1').send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(mensagem);
    });

    it.each([
      ['sem @', 'email-invalido', 'Email inválido'],
      ['sem domínio', 'joao@', 'Email inválido'],
      ['vazio', '', 'Email é obrigatório'],
    ])('deve retornar 400 para email %s', async (_, email, mensagem) => {
      const res = await request(criarApp()).put('/tecnicos/tec1').send({ email });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(mensagem);
    });
  });

  describe('Validações de estado', () => {
    it('deve retornar 404 quando técnico não existir', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(null);

      const res = await request(criarApp()).put('/tecnicos/inexistente').send({ nome: 'X' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar 404 quando usuário existir mas não for TECNICO', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'a1', regra: 'ADMIN', email: 'a@a.com', deletadoEm: null });

      const res = await request(criarApp()).put('/tecnicos/a1').send({ nome: 'X' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });

    it('deve retornar 400 quando tentar editar técnico deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: new Date(),
      });

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'X' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Não é possível editar um técnico deletado');
    });

    it('deve retornar 409 quando novo email já estiver em uso', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null })
        .mockResolvedValueOnce({ id: 'tec2', email: 'emuso@empresa.com' });

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ email: 'emuso@empresa.com' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Email já está em uso');
    });
  });

  describe('Autorização', () => {
    it('deve retornar 403 quando USUARIO tentar editar', async () => {
      currentUserRole = 'USUARIO';

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'X' });

      expect(res.status).toBe(403);
    });

    it('deve retornar 403 quando TECNICO tentar editar outro perfil', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'X' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('só pode editar seu próprio perfil');
    });

    it('deve permitir TECNICO editar o próprio perfil', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';
      setupTecnicoParaEditar();

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'Editado' });

      expect(res.status).toBe(200);
    });

    it('deve permitir ADMIN editar qualquer técnico', async () => {
      setupTecnicoParaEditar();

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'Editado' });

      expect(res.status).toBe(200);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findUnique lançar erro', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'X' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao atualizar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando update lançar erro', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null })
        .mockResolvedValueOnce(null);
      prismaMock.usuario.update.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ nome: 'NovoNome' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao atualizar técnico');
    });

    it('deve retornar 500 quando verificação de email duplicado falhar', async () => {
      prismaMock.usuario.findUnique
        .mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO', email: 'joao.silva@empresa.com', deletadoEm: null })
        .mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).put('/tecnicos/tec1').send({ email: 'novo@empresa.com' });

      expect(res.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id/senha', () => {
  const senhaPayload = { password: 'novasenha123' };

  describe('Casos de sucesso', () => {
    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);
    });

    it('deve alterar senha e retornar 200 com mensagem', async () => {
      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Senha alterada com sucesso');
    });

    it('deve chamar hashPassword antes do update', async () => {
      await request(criarApp()).put('/tecnicos/tec1/senha').send({ password: 'minhasenha123' });

      expect(hashPasswordMock).toHaveBeenCalledWith('minhasenha123');
      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ password: 'HASHED_PASSWORD' }) })
      );
    });

    it.each([
      ['8 chars (mínimo)', '12345678'],
      ['com caracteres especiais', 'S3nh@F0rt3!'],
      ['60 chars', 'a'.repeat(60)],
    ])('deve aceitar senha com %s', async (_, password) => {
      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send({ password });

      expect(res.status).toBe(200);
    });

    it('deve registrar log', async () => {
      await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO PASSWORD UPDATED]', expect.any(Object));
    });
  });

  describe('Validações', () => {
    it.each([
      ['ausente', {}],
      ['null', { password: null }],
      ['número', { password: 12345678 }],
      ['string vazia', { password: '' }],
      ['boolean', { password: true }],
    ])('deve retornar 400 quando senha for %s', async (_, body) => {
      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Senha é obrigatória');
    });

    it('deve retornar 400 quando senha tiver menos de 8 chars', async () => {
      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send({ password: '1234567' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('no mínimo 8 caracteres');
    });

    /*it.each([
      ['não existir', null, 'Técnico não encontrado'],
      ['ser USUARIO', { id: 'u1', regra: 'USUARIO' }, 'Técnico não encontrado'],
      ['ser ADMIN', { id: 'a1', regra: 'ADMIN' }, 'Técnico não encontrado'],
    ])('deve retornar 404 quando técnico %s', async (_, mockValue, mensagem) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(mockValue);

      const res = await request(criarApp()).put('/tecnicos/tec999/senha').send(senhaPayload);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain(mensagem);
    });*/
  });

  describe('Autorização', () => {
    it('deve retornar 403 quando USUARIO tentar alterar senha', async () => {
      currentUserRole = 'USUARIO';

      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(403);
    });

    it('deve retornar 403 quando TECNICO tentar alterar senha de outro', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('só pode alterar sua própria senha');
    });

    it('deve permitir TECNICO alterar sua própria senha', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(200);
    });

    it('deve permitir ADMIN alterar senha de qualquer técnico', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(200);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findUnique falhar', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao alterar senha');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando update falhar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao alterar senha');
    });

    it('deve retornar 500 quando hashPassword lançar erro', async () => {
      hashPasswordMock.mockImplementationOnce(() => { throw new Error('Hash error'); });
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });

      const res = await request(criarApp()).put('/tecnicos/tec1/senha').send(senhaPayload);

      expect(res.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PUT /tecnicos/:id/horarios', () => {
  const horariosPayload = { entrada: '09:00', saida: '18:00' };

  describe('Casos de sucesso', () => {
    beforeEach(() => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 'tec1', regra: 'TECNICO' });
      mockTransacaoHorarios();
    });

    it('deve atualizar horários e retornar 200 com message e horario', async () => {
      const res = await request(criarApp()).put('/tecnicos/tec1/horarios').send(horariosPayload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('atualizado com sucesso');
      expect(res.body.horario).toBeDefined();
    });

    it.each([
      ['padrão', { entrada: '08:00', saida: '17:00' }],
      ['estendido', { entrada: '07:00', saida: '20:00' }],
      ['com minutos', { entrada: '08:30', saida: '17:45' }],
      ['limite máximo', { entrada: '00:00', saida: '23:59' }],
    ])('deve aceitar horário %s', async (_, body) => {
      const res = await request(criarApp()).put('/tecnicos/tec1/horarios').send(body);

      expect(res.status).toBe(200);
    });

    it('deve desativar horários anteriores e criar novo na transação', async () => {
      const updateManyMock = vi.fn().mockResolvedValue({ count: 2 });
      const createMock = vi.fn().mockResolvedValue({
        id: 'exp2', entrada: new Date(), saida: new Date(), ativo: true, geradoEm: new Date(),
      });

      prismaMock.$transaction.mockImplementation(async (cb: any) =>
        cb({ expediente: { updateMany: updateManyMock, create: createMock } })
      );

      await request(criarApp()).put('/tecnicos/tec1/horarios').send(horariosPayload);

      expect(updateManyMock).toHaveBeenCalledWith({
        where: { usuarioId: 'tec1' },
        data: { ativo: false, deletadoEm: expect.any(Date) },
      });
      expect(createMock).toHaveBeenCalled();
    });

    it('deve funcionar com técnico inativo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 'tec2', regra: 'TECNICO', ativo: false });

      const res = await request(criarApp()).put('/tecnicos/tec2/horarios').send(horariosPayload);

      expect(res.status).toBe(200);
    });

    it('deve registrar log', async () => {
      await request(criarApp()).put('/tecnicos/tec1/horarios').send(horariosPayload);

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO HORARIOS UPDATED]', expect.any(Object));
    });
  });

  describe('Validações de horário', () => {
    it.each([
      ['entrada ausente', { saida: '18:00' }, 'Horário de entrada é obrigatório'],
      ['saída ausente', { entrada: '09:00' }, 'Horário de saída é obrigatório'],
      ['entrada null', { entrada: null, saida: '18:00' }, 'Horário de entrada é obrigatório'],
      ['saída null', { entrada: '09:00', saida: null }, 'Horário de saída é obrigatório'],
      ['entrada número', { entrada: 900, saida: '18:00' }, 'Horário de entrada é obrigatório'],
      ['hora entrada > 23', { entrada: '25:00', saida: '18:00' }, 'formato HH:MM'],
      ['minuto entrada > 59', { entrada: '09:60', saida: '18:00' }, 'formato HH:MM'],
      ['hora saída > 23', { entrada: '09:00', saida: '25:00' }, 'formato HH:MM'],
      ['minuto saída > 59', { entrada: '09:00', saida: '18:60' }, 'formato HH:MM'],
      ['entrada sem zero', { entrada: '9:00', saida: '18:00' }, 'formato HH:MM'],
      ['saída anterior à entrada', { entrada: '18:00', saida: '09:00' }, 'posterior ao horário de entrada'],
      ['saída igual à entrada', { entrada: '09:00', saida: '09:00' }, 'posterior ao horário de entrada'],
    ])('deve retornar 400 quando %s', async (_, body, mensagem) => {
      const res = await request(criarApp()).put('/tecnicos/tec1/horarios').send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain(mensagem);
    });

    it.each([
      ['não existir', null],
      ['ser USUARIO', { id: 'u1', regra: 'USUARIO' }],
    ])('deve retornar 404 quando técnico %s', async (_, mockValue) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(mockValue);

      const res = await request(criarApp()).put('/tecnicos/tec999/horarios').send(horariosPayload);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização', () => {
    it.each(['TECNICO', 'USUARIO'] as Regra[])('deve retornar 403 para role %s', async (role) => {
      currentUserRole = role;

      const res = await request(criarApp()).put('/tecnicos/tec1/horarios').send(horariosPayload);

      expect(res.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findUnique falhar', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).put('/tecnicos/tec1/horarios').send(horariosPayload);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao atualizar horários');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando a transação falhar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.$transaction.mockRejectedValueOnce(new Error('TX error'));

      const res = await request(criarApp()).put('/tecnicos/tec1/horarios').send(horariosPayload);

      expect(res.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PATCH /tecnicos/:id/nivel', () => {
  describe('Casos de sucesso', () => {
    it.each([
      ['N1→N2', 'N1', 'N2'],
      ['N2→N3', 'N2', 'N3'],
      ['N3→N1', 'N3', 'N1'],
    ])('deve atualizar nível %s com sucesso', async (_, nivelAtual, nivelNovo) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', nivel: nivelAtual, deletadoEm: null,
      });
      prismaMock.usuario.update.mockResolvedValue({ ...tecnicoBase, nivel: nivelNovo });

      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: nivelNovo });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain(`Nível do técnico atualizado para ${nivelNovo}`);
      expect(res.body.tecnico).toBeDefined();
    });

    it('deve registrar log com nível anterior e novo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', nivel: 'N1', deletadoEm: null,
      });
      prismaMock.usuario.update.mockResolvedValue({ ...tecnicoBase, nivel: 'N2' });

      await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: 'N2' });

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO NIVEL UPDATED]', expect.objectContaining({
        nivelAnterior: 'N1',
        nivelNovo: 'N2',
      }));
    });
  });

  describe('Validações', () => {
    it.each([
      ['ausente', {}],
      ['null', { nivel: null }],
      ['inválido (N4)', { nivel: 'N4' }],
      ['inválido (n1 minúsculo)', { nivel: 'n1' }],
      ['string vazia', { nivel: '' }],
    ])('deve retornar 400 quando nível for %s', async (_, body) => {
      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Nível inválido');
    });

    it('deve retornar 400 quando técnico já possuir o nível informado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', nivel: 'N2', deletadoEm: null,
      });

      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: 'N2' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Técnico já possui o nível N2');
    });

    it('deve retornar 400 quando técnico estiver deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', nivel: 'N1', deletadoEm: new Date(),
      });

      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: 'N2' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Não é possível alterar o nível de um técnico deletado');
    });

    it.each([
      ['não existir', null],
      ['ser USUARIO', { id: 'u1', regra: 'USUARIO', nivel: 'N1', deletadoEm: null }],
    ])('deve retornar 404 quando técnico %s', async (_, mockValue) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(mockValue);

      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: 'N2' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização', () => {
    it.each(['TECNICO', 'USUARIO'] as Regra[])('deve retornar 403 para role %s', async (role) => {
      currentUserRole = role;

      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: 'N2' });

      expect(res.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findUnique falhar', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: 'N2' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao alterar nível do técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando update falhar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', nivel: 'N1', deletadoEm: null,
      });
      prismaMock.usuario.update.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).patch('/tecnicos/tec1/nivel').send({ nivel: 'N2' });

      expect(res.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('POST /tecnicos/:id/avatar', () => {
  const mockFile = {
    fieldname: 'avatar',
    originalname: 'foto.jpg',
    filename: 'avatar-1234567890.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
  };

  describe('Casos de sucesso', () => {
    it('deve fazer upload e retornar 200 com avatarUrl', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockResolvedValue({ id: 'tec1', avatarUrl: '/uploads/avatars/avatar-1234567890.jpg' });

      const res = await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Avatar enviado com sucesso');
      expect(res.body.avatarUrl).toContain('avatar-1234567890.jpg');
    });

    it('deve salvar o caminho correto no banco', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockResolvedValue({ id: 'tec1', avatarUrl: '/uploads/avatars/avatar-1234567890.jpg' });

      await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { avatarUrl: `/uploads/avatars/${mockFile.filename}` },
        })
      );
    });

    it('deve permitir TECNICO fazer upload do próprio avatar', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec1';
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockResolvedValue({ id: 'tec1', avatarUrl: '/uploads/avatars/foto.jpg' });

      const res = await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(200);
    });

    it('deve registrar log de upload', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockResolvedValue({ id: 'tec1', avatarUrl: '/uploads/avatars/foto.jpg' });

      await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO AVATAR UPLOADED]', expect.any(Object));
    });
  });

  describe('Validações', () => {
    it('deve retornar 400 quando nenhum arquivo for enviado', async () => {
      const res = await request(criarApp(null)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Arquivo não enviado');
    });

    it.each([
      ['não existir', null],
      ['ser ADMIN', { id: 'a1', regra: 'ADMIN' }],
      ['ser USUARIO', { id: 'u1', regra: 'USUARIO' }],
    ])('deve retornar 404 quando técnico %s', async (_, mockValue) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(mockValue);

      const res = await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização', () => {
    it('deve retornar 403 quando USUARIO tentar fazer upload', async () => {
      currentUserRole = 'USUARIO';

      const res = await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(403);
    });

    it('deve retornar 403 quando TECNICO tentar fazer upload do avatar de outro', async () => {
      currentUserRole = 'TECNICO';
      currentUserId = 'tec2';

      const res = await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('só pode fazer upload do seu próprio avatar');
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findUnique falhar', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao fazer upload do avatar');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando update falhar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ id: 'tec1', regra: 'TECNICO' });
      prismaMock.usuario.update.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp(mockFile)).post('/tecnicos/tec1/avatar');

      expect(res.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('DELETE /tecnicos/:id', () => {
  describe('Soft delete (padrão)', () => {
    it('deve retornar 200 e marcar como deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({ id: 'tec1' });

      const res = await request(criarApp()).delete('/tecnicos/tec1');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deletado com sucesso');
      expect(res.body.id).toBe('tec1');
    });

    it('deve chamar update com deletadoEm e ativo false', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
        _count: { tecnicoChamados: 3 },
      });
      prismaMock.usuario.update.mockResolvedValue({ id: 'tec1' });

      await request(criarApp()).delete('/tecnicos/tec1');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith({
        where: { id: 'tec1' },
        data: { deletadoEm: expect.any(Date), ativo: false },
      });
    });

    it('deve registrar log de soft delete', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.usuario.update.mockResolvedValue({ id: 'tec1' });

      await request(criarApp()).delete('/tecnicos/tec1');

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO SOFT DELETED]', expect.any(Object));
    });
  });

  describe('Hard delete (?permanente=true)', () => {
    it('deve deletar permanentemente quando sem chamados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          expediente: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
          usuario: { delete: vi.fn().mockResolvedValue({ id: 'tec1' }) },
        };
        return cb(tx);
      });

      const res = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('removido permanentemente');
    });

    it('deve retornar 400 quando técnico tiver chamados vinculados', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
        _count: { tecnicoChamados: 5 },
      });

      const res = await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('5 chamados vinculados');
    });

    it('deve deletar expedientes na transação antes de deletar o usuário', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });

      const expedienteDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
      const usuarioDelete = vi.fn().mockResolvedValue({ id: 'tec1' });

      prismaMock.$transaction.mockImplementation(async (cb: any) =>
        cb({ expediente: { deleteMany: expedienteDeleteMany }, usuario: { delete: usuarioDelete } })
      );

      await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(expedienteDeleteMany).toHaveBeenCalledWith({ where: { usuarioId: 'tec1' } });
      expect(usuarioDelete).toHaveBeenCalledWith({ where: { id: 'tec1' } });
    });

    it('deve registrar log de hard delete', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
        _count: { tecnicoChamados: 0 },
      });
      prismaMock.$transaction.mockImplementation(async (cb: any) =>
        cb({
          expediente: { deleteMany: vi.fn().mockResolvedValue({}) },
          usuario: { delete: vi.fn().mockResolvedValue({}) },
        })
      );

      await request(criarApp()).delete('/tecnicos/tec1?permanente=true');

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO DELETED PERMANENTLY]', expect.any(Object));
    });
  });

  describe('Casos 404', () => {
    it.each([
      ['não existir', null],
      ['ser USUARIO', { id: 'u1', regra: 'USUARIO', _count: { tecnicoChamados: 0 } }],
    ])('deve retornar 404 quando técnico %s', async (_, mockValue) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(mockValue);

      const res = await request(criarApp()).delete('/tecnicos/tec1');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização', () => {
    it.each(['TECNICO', 'USUARIO'] as Regra[])('deve retornar 403 para role %s', async (role) => {
      currentUserRole = role;

      const res = await request(criarApp()).delete('/tecnicos/tec1');

      expect(res.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando o banco falhar', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).delete('/tecnicos/tec1');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao deletar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('PATCH /tecnicos/:id/restaurar', () => {
  describe('Casos de sucesso', () => {
    it('deve restaurar técnico e retornar 200 com mensagem', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue({ ...tecnicoBase, deletadoEm: null, ativo: true });

      const res = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('restaurado com sucesso');
      expect(res.body.tecnico).toBeDefined();
    });

    it('deve chamar update com deletadoEm null e ativo true', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(prismaMock.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletadoEm: null, ativo: true },
        })
      );
    });

    it('deve registrar log de restauração', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockResolvedValue(tecnicoBase);

      await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(consoleSpy.log).toHaveBeenCalledWith('[TECNICO RESTORED]', expect.any(Object));
    });
  });

  describe('Validações', () => {
    it('deve retornar 400 quando técnico não estiver deletado', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: null,
      });

      const res = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Técnico não está deletado');
    });

    it.each([
      ['não existir', null],
      ['ser USUARIO', { id: 'u1', regra: 'USUARIO', email: 'u@u.com', deletadoEm: null }],
    ])('deve retornar 404 quando técnico %s', async (_, mockValue) => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce(mockValue);

      const res = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Técnico não encontrado');
    });
  });

  describe('Autorização', () => {
    it.each(['TECNICO', 'USUARIO'] as Regra[])('deve retornar 403 para role %s', async (role) => {
      currentUserRole = role;

      const res = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(res.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findUnique falhar', async () => {
      prismaMock.usuario.findUnique.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao restaurar técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando update falhar', async () => {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({
        id: 'tec1', regra: 'TECNICO', email: 'joao@empresa.com', deletadoEm: new Date(),
      });
      prismaMock.usuario.update.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).patch('/tecnicos/tec1/restaurar');

      expect(res.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});