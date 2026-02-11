import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const authState = {
  regra: 'ADMIN',
  id: 'admin1',
};

const prismaMock = {
  chamado: {
    count: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
};

const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

vi.mock('../../infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

vi.mock('../../infrastructure/http/middlewares/auth', () => ({
  authMiddleware: vi.fn((req: any, res: any, next: any) => {
    req.usuario = { id: authState.id, regra: authState.regra };
    next();
  }),
  authorizeRoles: vi.fn((...roles: string[]) => {
    return vi.fn((req: any, res: any, next: any) => {
      if (!req.usuario) {
        return res.status(401).json({ error: 'Não autenticado' });
      }
      if (roles.includes(req.usuario.regra)) {
        return next();
      }
      return res.status(403).json({ error: 'Acesso negado.' });
    });
  }),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: function () {
    return prismaMock;
  },
  ChamadoStatus: {
    ABERTO: 'ABERTO',
    EM_ATENDIMENTO: 'EM_ATENDIMENTO',
    ENCERRADO: 'ENCERRADO',
    CANCELADO: 'CANCELADO',
    REABERTO: 'REABERTO',
  },
  Setor: {
    TECNOLOGIA_INFORMACAO: 'TECNOLOGIA_INFORMACAO',
    ADMINISTRACAO: 'ADMINISTRACAO',
    FINANCEIRO: 'FINANCEIRO',
  },
}));

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

const tecnicoBase = {
  id: 'tec1',
  nome: 'Maria',
  sobrenome: 'Santos',
  email: 'maria.santos@empresa.com',
  telefone: '11888888888',
  ramal: '5678',
  setor: 'TECNOLOGIA_INFORMACAO',
  regra: 'TECNICO',
  ativo: true,
  avatarUrl: null,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
};

const adminBase = {
  id: 'admin1',
  nome: 'Carlos',
  sobrenome: 'Oliveira',
  email: 'carlos.oliveira@empresa.com',
  telefone: '11777777777',
  ramal: '1000',
  setor: 'ADMINISTRACAO',
  regra: 'ADMIN',
  ativo: true,
  avatarUrl: null,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
};

const chamadoBase = {
  id: 'chamado1',
  OS: 'INC0001',
  descricao: 'Computador não liga',
  descricaoEncerramento: null,
  status: 'ABERTO',
  geradoEm: '2025-01-01T10:00:00.000Z',
  atualizadoEm: '2025-01-01T10:00:00.000Z',
  encerradoEm: null,
  deletadoEm: null,
  usuario: {
    id: 'user1',
    nome: 'João',
    sobrenome: 'Silva',
    email: 'joao.silva@empresa.com',
    setor: 'TECNOLOGIA_INFORMACAO',
  },
  tecnico: null,
  servicos: [
    {
      id: 'cs1',
      servicoId: 'serv1',
      servico: {
        id: 'serv1',
        nome: 'Suporte Técnico',
        descricao: 'Suporte técnico geral',
      },
    },
  ],
};

const chamadoEmAtendimento = {
  ...chamadoBase,
  id: 'chamado2',
  OS: 'INC0002',
  status: 'EM_ATENDIMENTO',
  tecnico: {
    id: 'tec1',
    nome: 'Maria',
    sobrenome: 'Santos',
    email: 'maria.santos@empresa.com',
  },
};

const chamadoReaberto = {
  ...chamadoBase,
  id: 'chamado3',
  OS: 'INC0003',
  status: 'REABERTO',
  descricao: 'Problema voltou',
  tecnico: {
    id: 'tec1',
    nome: 'Maria',
    sobrenome: 'Santos',
    email: 'maria.santos@empresa.com',
  },
};

const chamadoEncerrado = {
  ...chamadoBase,
  id: 'chamado4',
  OS: 'INC0004',
  status: 'ENCERRADO',
  descricaoEncerramento: 'Problema resolvido',
  encerradoEm: '2025-01-02T15:00:00.000Z',
  tecnico: {
    id: 'tec1',
    nome: 'Maria',
    sobrenome: 'Santos',
    email: 'maria.santos@empresa.com',
  },
};

const chamadoCancelado = {
  ...chamadoBase,
  id: 'chamado5',
  OS: 'INC0005',
  status: 'CANCELADO',
  descricaoEncerramento: 'Cancelado pelo usuário',
};

const chamadoDeletado = {
  ...chamadoBase,
  id: 'chamado6',
  OS: 'INC0006',
  deletadoEm: '2025-01-05T00:00:00.000Z',
};

let router: any;

beforeAll(async () => {
  router = (await import('../../presentation/http/routes/fila-de-chamados.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  authState.regra = 'ADMIN';
  authState.id = 'admin1';

  Object.values(prismaMock.chamado).forEach(mock => mock.mockReset());

  prismaMock.chamado.count.mockResolvedValue(0);
  prismaMock.chamado.findMany.mockResolvedValue([]);
  prismaMock.chamado.groupBy.mockResolvedValue([]);

  consoleSpy.log.mockClear();
  consoleSpy.error.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/fila-chamados', router);
  return app;
}

describe('GET /fila-chamados/meus-chamados (lista chamados do usuário)', () => {
  describe('Casos de sucesso', () => {
    beforeEach(() => {
      authState.regra = 'USUARIO';
      authState.id = 'user1';
    });

    it('deve retornar status 200 com lista vazia quando usuário não tiver chamados', async () => {
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toEqual([]);
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('deve retornar status 200 com chamados do usuário', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(1);
      expect(resposta.body.data[0].OS).toBe('INC0001');
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usuarioId: 'user1',
          }),
        })
      );
    });

    it('deve retornar múltiplos chamados ordenados por data (mais recentes primeiro)', async () => {
      const chamados = [
        { ...chamadoBase, id: 'c1', OS: 'INC0001', geradoEm: '2025-01-03T00:00:00.000Z' },
        { ...chamadoBase, id: 'c2', OS: 'INC0002', geradoEm: '2025-01-02T00:00:00.000Z' },
        { ...chamadoBase, id: 'c3', OS: 'INC0003', geradoEm: '2025-01-01T00:00:00.000Z' },
      ];
      prismaMock.chamado.count.mockResolvedValue(3);
      prismaMock.chamado.findMany.mockResolvedValue(chamados);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(3);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { geradoEm: 'desc' },
        })
      );
    });

    it('deve retornar chamados com todos os campos necessários', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data[0]).toHaveProperty('id');
      expect(resposta.body.data[0]).toHaveProperty('OS');
      expect(resposta.body.data[0]).toHaveProperty('descricao');
      expect(resposta.body.data[0]).toHaveProperty('status');
      expect(resposta.body.data[0]).toHaveProperty('usuario');
      expect(resposta.body.data[0]).toHaveProperty('servicos');
    });
  });

  describe('Filtros', () => {
    beforeEach(() => {
      authState.regra = 'USUARIO';
      authState.id = 'user1';
    });

    it('deve filtrar por status ABERTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?status=ABERTO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ABERTO',
          }),
        })
      );
    });

    it('deve filtrar por status EM_ATENDIMENTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?status=EM_ATENDIMENTO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'EM_ATENDIMENTO',
          }),
        })
      );
    });

    it('deve filtrar por status ENCERRADO', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEncerrado]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?status=ENCERRADO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ENCERRADO',
          }),
        })
      );
    });

    it('deve filtrar por status CANCELADO', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoCancelado]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?status=CANCELADO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'CANCELADO',
          }),
        })
      );
    });

    it('deve filtrar por status REABERTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoReaberto]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?status=REABERTO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'REABERTO',
          }),
        })
      );
    });

    it('deve ignorar status inválido e retornar todos os chamados', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?status=INVALIDO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            status: 'INVALIDO',
          }),
        })
      );
    });

    it('deve excluir chamados deletados por padrão', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve incluir chamados deletados quando incluirInativos=true', async () => {
      prismaMock.chamado.count.mockResolvedValue(2);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase, chamadoDeletado]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?incluirInativos=true');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve combinar filtro de status com incluirInativos', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get(
        '/fila-chamados/meus-chamados?status=ABERTO&incluirInativos=true'
      );

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ABERTO',
          }),
        })
      );
    });
  });

  describe('Paginação', () => {
    beforeEach(() => {
      authState.regra = 'USUARIO';
      authState.id = 'user1';
    });

    it('deve aplicar paginação padrão (página 1, 10 itens)', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
      });
    });

    it('deve aplicar paginação personalizada', async () => {
      prismaMock.chamado.count.mockResolvedValue(100);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?page=3&limit=20');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
        })
      );
      expect(resposta.body.pagination).toMatchObject({
        page: 3,
        limit: 20,
        total: 100,
        totalPages: 5,
      });
    });

    it('deve limitar paginação ao máximo de 100 itens', async () => {
      prismaMock.chamado.count.mockResolvedValue(200);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?limit=200');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('deve usar página 1 quando page for 0', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?page=0');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
        })
      );
    });

    it('deve usar página 1 quando page for negativo', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?page=-5');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.page).toBe(1);
    });

    it('deve usar limit padrão (10) quando limit for 0', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?limit=0');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10, // getPaginationParams usa DEFAULT_LIMIT quando parseInt retorna 0
        })
      );
    });

    it('deve usar limit 1 quando limit for negativo', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?limit=-10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.limit).toBe(1);
    });

    it('deve indicar hasNext=true quando houver próxima página', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?page=1&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasNext).toBe(true);
    });

    it('deve indicar hasNext=false quando for última página', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?page=5&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasNext).toBe(false);
    });

    it('deve indicar hasPrev=true quando houver página anterior', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?page=3&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasPrev).toBe(true);
    });

    it('deve indicar hasPrev=false quando for primeira página', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?page=1&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.hasPrev).toBe(false);
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.chamado.count.mockResolvedValue(47);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.totalPages).toBe(5);
    });

    it('deve retornar totalPages=0 quando não houver resultados', async () => {
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.totalPages).toBe(0);
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para USUARIO', async () => {
      authState.regra = 'USUARIO';
      authState.id = 'user1';
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      authState.regra = 'TECNICO';

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for ADMIN', async () => {
      authState.regra = 'ADMIN';

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    beforeEach(() => {
      authState.regra = 'USUARIO';
      authState.id = 'user1';
    });

    it('deve retornar status 500 quando ocorrer erro ao contar chamados', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao buscar chamados', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do usuário');
    });
  });
});

describe('GET /fila-chamados/chamados-atribuidos (lista chamados do técnico)', () => {
  describe('Casos de sucesso', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id = 'tec1';
    });

    it('deve retornar status 200 com lista vazia quando técnico não tiver chamados', async () => {
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toEqual([]);
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('deve retornar status 200 com chamados atribuídos ao técnico', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(1);
      expect(resposta.body.data[0].status).toBe('EM_ATENDIMENTO');
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tecnicoId: 'tec1',
            status: { in: ['EM_ATENDIMENTO', 'REABERTO'] },
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve retornar apenas chamados EM_ATENDIMENTO ou REABERTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(2);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento, chamadoReaberto]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(2);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['EM_ATENDIMENTO', 'REABERTO'] },
          }),
        })
      );
    });

    it('deve excluir chamados deletados automaticamente', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve retornar chamados com todos os campos necessários', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data[0]).toHaveProperty('id');
      expect(resposta.body.data[0]).toHaveProperty('OS');
      expect(resposta.body.data[0]).toHaveProperty('descricao');
      expect(resposta.body.data[0]).toHaveProperty('status');
      expect(resposta.body.data[0]).toHaveProperty('usuario');
      expect(resposta.body.data[0]).toHaveProperty('tecnico');
      expect(resposta.body.data[0]).toHaveProperty('servicos');
    });
  });

  describe('Ordenação', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id = 'tec1';
    });

    it('deve ordenar por recentes por padrão (geradoEm desc)', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { geradoEm: 'desc' },
        })
      );
    });

    it('deve ordenar por antigos quando prioridade=antigos', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos?prioridade=antigos');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { geradoEm: 'asc' },
        })
      );
    });

    it('deve ordenar por reabertos primeiro quando prioridade=reabertos', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoReaberto]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos?prioridade=reabertos');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ status: 'desc' }, { geradoEm: 'desc' }],
        })
      );
    });

    it('deve ignorar prioridade inválida e usar ordenação padrão', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos?prioridade=invalida');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { geradoEm: 'desc' },
        })
      );
    });
  });

  describe('Paginação', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id = 'tec1';
    });

    it('deve aplicar paginação padrão (página 1, 10 itens)', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
    });

    it('deve aplicar paginação personalizada', async () => {
      prismaMock.chamado.count.mockResolvedValue(100);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos?page=2&limit=25');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
        })
      );
    });

    it('deve limitar ao máximo de 100 itens por página', async () => {
      prismaMock.chamado.count.mockResolvedValue(200);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos?limit=150');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para TECNICO', async () => {
      authState.regra = 'TECNICO';
      authState.id = 'tec1';
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      authState.regra = 'USUARIO';

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for ADMIN', async () => {
      authState.regra = 'ADMIN';

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id = 'tec1';
    });

    it('deve retornar status 500 quando ocorrer erro ao contar', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao buscar', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do técnico');
    });
  });
});

describe('GET /fila-chamados/todos-chamados (listagem por status - ADMIN/TECNICO)', () => {
  describe('Casos de sucesso', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve retornar status 200 com chamados filtrados por status ABERTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(5);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(1);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ABERTO',
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve retornar status 200 com chamados filtrados por status EM_ATENDIMENTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(3);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=EM_ATENDIMENTO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'EM_ATENDIMENTO',
          }),
        })
      );
    });

    it('deve retornar status 200 com chamados filtrados por status ENCERRADO', async () => {
      prismaMock.chamado.count.mockResolvedValue(10);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEncerrado]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ENCERRADO');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 200 com chamados filtrados por status CANCELADO', async () => {
      prismaMock.chamado.count.mockResolvedValue(2);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoCancelado]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=CANCELADO');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 200 com chamados filtrados por status REABERTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(3);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoReaberto]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=REABERTO');

      expect(resposta.status).toBe(200);
    });

    it('deve excluir chamados deletados automaticamente', async () => {
      prismaMock.chamado.count.mockResolvedValue(5);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletadoEm: null,
          }),
        })
      );
    });
  });

  describe('Filtros adicionais', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve filtrar por setor quando fornecido', async () => {
      prismaMock.chamado.count.mockResolvedValue(3);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get(
        '/fila-chamados/todos-chamados?status=ABERTO&setor=TECNOLOGIA_INFORMACAO'
      );

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usuario: {
              setor: 'TECNOLOGIA_INFORMACAO',
            },
          }),
        })
      );
    });
  });

  describe('Ordenação', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve ordenar por recentes por padrão', async () => {
      prismaMock.chamado.count.mockResolvedValue(5);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { geradoEm: 'desc' },
        })
      );
    });
  });

  describe('Validações', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve retornar status 400 quando status for inválido', async () => {
      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=INVALIDO');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('Status inválido');
      expect(resposta.body.statusValidos).toBeDefined();
    });
  });

  describe('Paginação', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve aplicar paginação padrão', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
    });

    it('deve aplicar paginação personalizada', async () => {
      prismaMock.chamado.count.mockResolvedValue(100);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO&page=3&limit=20');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
        })
      );
    });

    it('deve limitar ao máximo de 100 itens', async () => {
      prismaMock.chamado.count.mockResolvedValue(200);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO&limit=200');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      authState.regra = 'ADMIN';
      prismaMock.chamado.count.mockResolvedValue(5);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      authState.regra = 'USUARIO';

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve retornar status 500 quando ocorrer erro ao contar', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro ao buscar', async () => {
      prismaMock.chamado.count.mockResolvedValue(5);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados');
    });
  });
});

describe('GET /fila-chamados/estatisticas (estatísticas gerais)', () => {
  describe('Casos de sucesso', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve retornar status 200 com estatísticas completas', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(15)  // abertos
        .mockResolvedValueOnce(25)  // em atendimento
        .mockResolvedValueOnce(50)  // encerrados
        .mockResolvedValueOnce(5)   // cancelados
        .mockResolvedValueOnce(5)   // reabertos
        .mockResolvedValueOnce(10); // sem técnico

      prismaMock.chamado.groupBy.mockResolvedValue([
        { usuarioId: 'user1', _count: 30 },
        { usuarioId: 'user2', _count: 20 },
      ]);

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        total: 100,
        porStatus: {
          abertos: 15,
          emAtendimento: 25,
          encerrados: 50,
          cancelados: 5,
          reabertos: 5,
        },
        pendentes: 20,
        semTecnico: 10,
      });
      expect(resposta.body).toHaveProperty('timestamp');
    });

    it('deve retornar timestamp válido em formato ISO', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5);

      prismaMock.chamado.groupBy.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
      expect(resposta.body.timestamp).toBeDefined();
      expect(new Date(resposta.body.timestamp).toISOString()).toBe(resposta.body.timestamp);
    });

    it('deve calcular pendentes corretamente (abertos + reabertos)', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(15)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(8);

      prismaMock.chamado.groupBy.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
      expect(resposta.body.pendentes).toBe(15);
    });

    it('deve retornar zero para todas as estatísticas quando não houver chamados', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      prismaMock.chamado.groupBy.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        total: 0,
        porStatus: {
          abertos: 0,
          emAtendimento: 0,
          encerrados: 0,
          cancelados: 0,
          reabertos: 0,
        },
        pendentes: 0,
        semTecnico: 0,
      });
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      authState.regra = 'ADMIN';
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.groupBy.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      authState.regra = 'TECNICO';

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      authState.regra = 'USUARIO';

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    beforeEach(() => {
      authState.regra = 'ADMIN';
      authState.id = 'admin1';
    });

    it('deve retornar status 500 quando ocorrer erro no primeiro count (total)', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar estatísticas');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar status 500 quando ocorrer erro em count de abertos', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(100)
        .mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar estatísticas');
    });

    it('deve retornar status 500 quando ocorrer erro em groupBy', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(15)
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(10);

      prismaMock.chamado.groupBy.mockRejectedValue(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar estatísticas');
    });

    it('deve retornar status 500 quando Promise.all falhar', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(15)
        .mockRejectedValueOnce(new Error('Database error'));

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(500);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[ESTATISTICAS ERROR]',
        expect.any(Error)
      );
    });
  });
});