import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const authState = { regra: 'ADMIN', id: 'admin1', nivel: null as string | null };

const prismaMock = {
  chamado: {
    count:   vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  usuario: {
    findUnique: vi.fn(),
  },
};

const consoleSpy = {
  log:   vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

vi.mock('@infrastructure/database/prisma/client', () => ({ prisma: prismaMock }));

vi.mock('@infrastructure/http/middlewares/auth', () => ({
  authMiddleware: vi.fn((req: any, _res: any, next: any) => {
    req.usuario = { id: authState.id, regra: authState.regra };
    next();
  }),
  authorizeRoles: vi.fn((...roles: string[]) =>
    vi.fn((req: any, res: any, next: any) => {
      if (!req.usuario) return res.status(401).json({ error: 'Não autenticado' });
      if (roles.includes(req.usuario.regra)) return next();
      return res.status(403).json({ error: 'Acesso negado.' });
    })
  ),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; },
  ChamadoStatus: {
    ABERTO:         'ABERTO',
    EM_ATENDIMENTO: 'EM_ATENDIMENTO',
    ENCERRADO:      'ENCERRADO',
    CANCELADO:      'CANCELADO',
    REABERTO:       'REABERTO',
  },
  NivelTecnico: { N1: 'N1', N2: 'N2', N3: 'N3' },
  PrioridadeChamado: {
    P1: 'P1',
    P2: 'P2',
    P3: 'P3',
    P4: 'P4',
    P5: 'P5',
  },
  Setor: {
    TECNOLOGIA_INFORMACAO: 'TECNOLOGIA_INFORMACAO',
    ADMINISTRACAO:         'ADMINISTRACAO',
    FINANCEIRO:            'FINANCEIRO',
  },
}));

const usuarioFila = {
  id:        'user1',
  nome:      'João',
  sobrenome: 'Silva',
  email:     'joao.silva@empresa.com',
};

const tecnicoFila = {
  id:        'tec1',
  nome:      'Maria',
  sobrenome: 'Santos',
  email:     'maria.santos@empresa.com',
};

const servicoFila = {
  servico: { id: 'serv1', nome: 'Suporte Técnico' },
};

const servicoSelect = {
  id:         'cs1',
  servicoId:  'serv1',
  servico: {
    id:        'serv1',
    nome:      'Suporte Técnico',
    descricao: 'Suporte técnico geral',
  },
};

/** Chamado base para endpoints de listagem (usa CHAMADO_SELECT) */
const chamadoBase = {
  id:                    'chamado1',
  OS:                    'INC0001',
  descricao:             'Computador não liga',
  descricaoEncerramento: null,
  status:                'ABERTO',
  prioridade:            'P4',
  geradoEm:              '2025-01-01T10:00:00.000Z',
  atualizadoEm:          '2025-01-01T10:00:00.000Z',
  encerradoEm:           null,
  deletadoEm:            null,
  usuario:               { ...usuarioFila, setor: 'TECNOLOGIA_INFORMACAO' },
  tecnico:               null,
  servicos:              [servicoSelect],
};

/** Chamado base para endpoints de fila (usa FILA_SELECT) */
const chamadoFila = {
  id:          'chamado1',
  OS:          'INC0001',
  descricao:   'Computador não liga',
  status:      'ABERTO',
  prioridade:  'P4',
  geradoEm:    '2025-01-01T10:00:00.000Z',
  atualizadoEm: '2025-01-01T10:00:00.000Z',
  usuario:     usuarioFila,
  tecnico:     null,
  servicos:    [servicoFila],
};

const chamadoEmAtendimento = {
  ...chamadoBase,
  id:        'chamado2',
  OS:        'INC0002',
  status:    'EM_ATENDIMENTO',
  prioridade: 'P3',
  tecnico:   tecnicoFila,
};

const chamadoReaberto = {
  ...chamadoBase,
  id:       'chamado3',
  OS:       'INC0003',
  status:   'REABERTO',
  descricao: 'Problema voltou',
  prioridade: 'P4',
  tecnico:  tecnicoFila,
};

const chamadoEncerrado = {
  ...chamadoBase,
  id:                    'chamado4',
  OS:                    'INC0004',
  status:                'ENCERRADO',
  prioridade:            'P4',
  descricaoEncerramento: 'Problema resolvido',
  encerradoEm:           '2025-01-02T15:00:00.000Z',
  tecnico:               tecnicoFila,
};

const chamadoCancelado = {
  ...chamadoBase,
  id:                    'chamado5',
  OS:                    'INC0005',
  status:                'CANCELADO',
  prioridade:            'P5',
  descricaoEncerramento: 'Cancelado pelo usuário',
};

const chamadoDeletado = {
  ...chamadoBase,
  id:         'chamado6',
  OS:         'INC0006',
  deletadoEm: '2025-01-05T00:00:00.000Z',
};

/** Chamados para fila alta (P1, P2, P3) */
const chamadoFilaAlta = {
  ...chamadoFila,
  id:        'fila-alta-1',
  OS:        'INC0010',
  prioridade: 'P1',
  status:    'ABERTO',
};

/** Chamados para fila baixa (P4, P5) */
const chamadoFilaBaixa = {
  ...chamadoFila,
  id:        'fila-baixa-1',
  OS:        'INC0020',
  prioridade: 'P4',
  status:    'ABERTO',
};

/** Monta instância fresh do Express a cada teste (evita vazamento de estado) */
function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/fila-chamados', router);
  return app;
}

/** Mock padrão para getNivelTecnico() */
function mockNivel(nivel: string | null) {
  prismaMock.usuario.findUnique.mockResolvedValue(nivel ? { nivel } : null);
}

/** Mock padrão de estatísticas — todos os counts em sequência + groupBy */
function mockEstatisticas(
  counts: [number, number, number, number, number, number, number],
  prioridades: { prioridade: string; _count: { id: number } }[] = []
) {
  counts.forEach(v => prismaMock.chamado.count.mockResolvedValueOnce(v));
  prismaMock.chamado.groupBy.mockResolvedValue(prioridades);
}

let router: any;

beforeAll(async () => {
  router = (await import('@presentation/http/routes/fila.routes')).default;
});

beforeEach(() => {
  // Limpa apenas os mocks do prisma e auth — NÃO usa vi.clearAllMocks()
  prismaMock.chamado.count.mockReset();
  prismaMock.chamado.findMany.mockReset();
  prismaMock.chamado.groupBy.mockReset();
  prismaMock.usuario.findUnique.mockReset();

  authState.regra = 'ADMIN';
  authState.id    = 'admin1';
  authState.nivel = null;

  prismaMock.chamado.count.mockResolvedValue(0);
  prismaMock.chamado.findMany.mockResolvedValue([]);
  prismaMock.chamado.groupBy.mockResolvedValue([]);
  prismaMock.usuario.findUnique.mockResolvedValue(null);

  // Spies: apenas limpa o histórico, mantém o mockImplementation ativo
  consoleSpy.log.mockClear();
  consoleSpy.error.mockClear();
});

afterEach(() => {
  // Mesmo aqui: só limpa histórico dos mocks do prisma
  prismaMock.chamado.count.mockReset();
  prismaMock.chamado.findMany.mockReset();
  prismaMock.chamado.groupBy.mockReset();
  prismaMock.usuario.findUnique.mockReset();
});

describe('GET /fila-chamados/resumo', () => {
  describe('ADMIN — vê filas alta e baixa', () => {
    it('deve retornar ambas as filas com contagens corretas', async () => {
      prismaMock.chamado.groupBy.mockResolvedValue([
        { prioridade: 'P1', _count: { id: 3 } },
        { prioridade: 'P2', _count: { id: 5 } },
        { prioridade: 'P4', _count: { id: 7 } },
        { prioridade: 'P5', _count: { id: 2 } },
      ]);

      const resposta = await request(criarApp()).get('/fila-chamados/resumo');

      expect(resposta.status).toBe(200);
      expect(resposta.body.filas.alta).toBeDefined();
      expect(resposta.body.filas.baixa).toBeDefined();
      expect(resposta.body.filas.alta.total).toBe(8);   // P1+P2
      expect(resposta.body.filas.baixa.total).toBe(9);  // P4+P5
      expect(resposta.body.totalGeral).toBe(17);
    });

    it('deve retornar zeros quando não houver chamados na fila', async () => {
      prismaMock.chamado.groupBy.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/resumo');

      expect(resposta.status).toBe(200);
      expect(resposta.body.filas.alta.total).toBe(0);
      expect(resposta.body.filas.baixa.total).toBe(0);
      expect(resposta.body.totalGeral).toBe(0);
    });

    it('deve detalhar contagem por prioridade dentro de cada fila', async () => {
      prismaMock.chamado.groupBy.mockResolvedValue([
        { prioridade: 'P1', _count: { id: 2 } },
        { prioridade: 'P2', _count: { id: 3 } },
        { prioridade: 'P3', _count: { id: 1 } },
        { prioridade: 'P4', _count: { id: 4 } },
        { prioridade: 'P5', _count: { id: 0 } },
      ]);

      const resposta = await request(criarApp()).get('/fila-chamados/resumo');

      expect(resposta.body.filas.alta.prioridades).toMatchObject({ P1: 2, P2: 3, P3: 1 });
      expect(resposta.body.filas.baixa.prioridades).toMatchObject({ P4: 4, P5: 0 });
    });
  });

  describe('TECNICO N1 — vê apenas fila baixa', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id    = 'tec1';
      mockNivel('N1');
    });

    it('deve retornar somente fila baixa', async () => {
      prismaMock.chamado.groupBy.mockResolvedValue([
        { prioridade: 'P4', _count: { id: 5 } },
        { prioridade: 'P5', _count: { id: 3 } },
      ]);

      const resposta = await request(criarApp()).get('/fila-chamados/resumo');

      expect(resposta.status).toBe(200);
      expect(resposta.body.filas.baixa).toBeDefined();
      expect(resposta.body.filas.alta).toBeUndefined();
      expect(resposta.body.totalGeral).toBe(8);
    });
  });

  describe('TECNICO N2 — vê apenas fila alta', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id    = 'tec1';
      mockNivel('N2');
    });

    it('deve retornar somente fila alta', async () => {
      prismaMock.chamado.groupBy.mockResolvedValue([
        { prioridade: 'P2', _count: { id: 4 } },
        { prioridade: 'P3', _count: { id: 2 } },
      ]);

      const resposta = await request(criarApp()).get('/fila-chamados/resumo');

      expect(resposta.status).toBe(200);
      expect(resposta.body.filas.alta).toBeDefined();
      expect(resposta.body.filas.baixa).toBeUndefined();
      expect(resposta.body.totalGeral).toBe(6);
    });
  });

  describe('TECNICO N3 — vê apenas fila alta', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id    = 'tec1';
      mockNivel('N3');
    });

    it('deve retornar somente fila alta', async () => {
      prismaMock.chamado.groupBy.mockResolvedValue([
        { prioridade: 'P1', _count: { id: 10 } },
      ]);

      const resposta = await request(criarApp()).get('/fila-chamados/resumo');

      expect(resposta.status).toBe(200);
      expect(resposta.body.filas.alta).toBeDefined();
      expect(resposta.body.filas.baixa).toBeUndefined();
    });
  });

  describe('Autorização', () => {
    it.each([
      ['USUARIO', 403],
    ])('deve retornar %d para %s', async (regra, statusEsperado) => {
      authState.regra = regra;
      const resposta = await request(criarApp()).get('/fila-chamados/resumo');
      expect(resposta.status).toBe(statusEsperado);
    });

    it.each(['ADMIN', 'TECNICO'])('deve permitir acesso para %s', async (regra) => {
      authState.regra = regra;
      if (regra === 'TECNICO') { authState.id = 'tec1'; mockNivel('N1'); }
      prismaMock.chamado.groupBy.mockResolvedValue([]);
      const resposta = await request(criarApp()).get('/fila-chamados/resumo');
      expect(resposta.status).toBe(200);
    });
  });

  describe('Tratamento de erros', () => {
    it.todo('deve retornar 500 quando groupBy falhar', async () => {
      prismaMock.chamado.groupBy.mockRejectedValue(new Error('DB error'));
      const resposta = await request(criarApp()).get('/fila-chamados/resumo');
      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar resumo das filas');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('GET /fila-chamados/alta', () => {
  describe('Casos de sucesso', () => {
    it('ADMIN deve receber fila com prioridades P1/P2/P3', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoFilaAlta]);

      const resposta = await request(criarApp()).get('/fila-chamados/alta');

      expect(resposta.status).toBe(200);
      expect(resposta.body.fila).toBe('ALTA');
      expect(resposta.body.prioridades).toEqual(['P1', 'P2', 'P3']);
      expect(resposta.body.data).toHaveLength(1);
    });

    it('deve incluir tempoEspera formatado em cada chamado', async () => {
      // Chamado gerado há 90 minutos
      const geradoEm = new Date(Date.now() - 90 * 60 * 1000).toISOString();
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([{ ...chamadoFilaAlta, geradoEm }]);

      const resposta = await request(criarApp()).get('/fila-chamados/alta');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data[0]).toHaveProperty('tempoEspera');
      expect(resposta.body.data[0].tempoEspera).toMatch(/\d+h \d+min/);
    });

    it('deve exibir tempoEspera em minutos para chamados recentes (< 60min)', async () => {
      const geradoEm = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([{ ...chamadoFilaAlta, geradoEm }]);

      const resposta = await request(criarApp()).get('/fila-chamados/alta');

      expect(resposta.body.data[0].tempoEspera).toMatch(/^\d+ min$/);
    });

    it('deve exibir tempoEspera em dias para chamados antigos (>= 1440min)', async () => {
      const geradoEm = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([{ ...chamadoFilaAlta, geradoEm }]);

      const resposta = await request(criarApp()).get('/fila-chamados/alta');

      expect(resposta.body.data[0].tempoEspera).toMatch(/^\d+d \d+h$/);
    });

    it('deve buscar apenas chamados ABERTO/REABERTO com prioridade P1/P2/P3', async () => {
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      await request(criarApp()).get('/fila-chamados/alta');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status:     { in: ['ABERTO', 'REABERTO'] },
            prioridade: { in: ['P1', 'P2', 'P3'] },
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve retornar paginação correta', async () => {
      prismaMock.chamado.count.mockResolvedValue(30);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoFilaAlta]);

      const resposta = await request(criarApp()).get('/fila-chamados/alta?page=2&limit=10');

      expect(resposta.body.pagination).toMatchObject({
        page: 2, limit: 10, total: 30, totalPages: 3,
      });
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });
  });

  describe('Autorização por nível técnico', () => {
    it('TECNICO N1 deve receber 403', async () => {
      authState.regra = 'TECNICO';
      authState.id    = 'tec1';
      mockNivel('N1');

      const resposta = await request(criarApp()).get('/fila-chamados/alta');

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('N1');
    });

    it.each(['N2', 'N3'])('TECNICO %s deve ter acesso', async (nivel) => {
      authState.regra = 'TECNICO';
      authState.id    = 'tec1';
      mockNivel(nivel);
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/alta');

      expect(resposta.status).toBe(200);
    });

    it('USUARIO deve receber 403', async () => {
      authState.regra = 'USUARIO';
      const resposta = await request(criarApp()).get('/fila-chamados/alta');
      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it.todo('deve retornar 500 quando findMany falhar', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/alta');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar fila de alta prioridade');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});

describe('GET /fila-chamados/baixa', () => {
  describe('Casos de sucesso', () => {
    beforeEach(() => {
      authState.regra = 'TECNICO';
      authState.id    = 'tec1';
      mockNivel('N1');
    });

    it('TECNICO N1 deve receber fila com prioridades P4/P5', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoFilaBaixa]);

      const resposta = await request(criarApp()).get('/fila-chamados/baixa');

      expect(resposta.status).toBe(200);
      expect(resposta.body.fila).toBe('BAIXA');
      expect(resposta.body.prioridades).toEqual(['P4', 'P5']);
    });

    it('deve buscar apenas chamados ABERTO/REABERTO com prioridade P4/P5', async () => {
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      await request(criarApp()).get('/fila-chamados/baixa');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status:     { in: ['ABERTO', 'REABERTO'] },
            prioridade: { in: ['P4', 'P5'] },
            deletadoEm: null,
          }),
        })
      );
    });

    it('ADMIN deve ter acesso', async () => {
      authState.regra = 'ADMIN';
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/baixa');

      expect(resposta.status).toBe(200);
    });
  });

  describe('Autorização por nível técnico', () => {
    it.each(['N2', 'N3'])('TECNICO %s deve receber 403', async (nivel) => {
      authState.regra = 'TECNICO';
      authState.id    = 'tec1';
      mockNivel(nivel);

      const resposta = await request(criarApp()).get('/fila-chamados/baixa');

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain(nivel);
    });

    it('USUARIO deve receber 403', async () => {
      authState.regra = 'USUARIO';
      const resposta = await request(criarApp()).get('/fila-chamados/baixa');
      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    beforeEach(() => { authState.regra = 'ADMIN'; });

    it('deve retornar 500 quando findMany falhar', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/baixa');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar fila de baixa prioridade');
    });
  });
});

describe('GET /fila-chamados/meus-chamados', () => {
  beforeEach(() => {
    authState.regra = 'USUARIO';
    authState.id    = 'user1';
  });

  describe('Casos de sucesso', () => {
    it('deve retornar lista vazia com paginação quando não houver chamados', async () => {
      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toEqual([]);
      expect(resposta.body.pagination).toMatchObject({
        page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
      });
    });

    it('deve filtrar pelo usuarioId do usuário autenticado', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data[0].OS).toBe('INC0001');
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ usuarioId: 'user1' }),
          orderBy: { geradoEm: 'desc' },
        })
      );
    });

    it('deve retornar todos os campos necessários no chamado', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      const item = resposta.body.data[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('OS');
      expect(item).toHaveProperty('descricao');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('usuario');
      expect(item).toHaveProperty('servicos');
    });
  });

  describe('Filtros', () => {
    it.each([
      ['ABERTO',         chamadoBase],
      ['EM_ATENDIMENTO', chamadoEmAtendimento],
      ['ENCERRADO',      chamadoEncerrado],
      ['CANCELADO',      chamadoCancelado],
      ['REABERTO',       chamadoReaberto],
    ])('deve filtrar por status %s', async (status, fixture) => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([fixture]);

      const resposta = await request(criarApp()).get(`/fila-chamados/meus-chamados?status=${status}`);

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status }) })
      );
    });

    it('deve ignorar status inválido (não adiciona filtro status)', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?status=INVALIDO');

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: 'INVALIDO' }),
        })
      );
    });

    it('deve excluir chamados deletados por padrão (deletadoEm: null)', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletadoEm: null }) })
      );
    });

    it('deve incluir deletados quando incluirInativos=true', async () => {
      prismaMock.chamado.count.mockResolvedValue(2);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase, chamadoDeletado]);

      await request(criarApp()).get('/fila-chamados/meus-chamados?incluirInativos=true');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ deletadoEm: null }),
        })
      );
    });

    it('deve combinar status + incluirInativos corretamente', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      await request(criarApp()).get('/fila-chamados/meus-chamados?status=ABERTO&incluirInativos=true');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ABERTO' }) })
      );
    });
  });

  describe('Paginação', () => {
    it.each([
      ['padrão',             '',                 0,  10, 1,  10,  50, 5],
      ['personalizada p3l20',  '?page=3&limit=20', 40, 20, 3,  20, 100, 5],
      ['max 100 itens',      '?limit=200',       0, 100, 1, 100, 200, 2],
      ['page=0 → página 1',  '?page=0',          0,  10, 1,  10,  50, 5],
      ['page=-5 → página 1', '?page=-5',         0,  10, 1,  10,  50, 5],
    ])('%s', async (_label, qs, skip, take, page, limit, total, totalPages) => {
      prismaMock.chamado.count.mockResolvedValue(total);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get(`/fila-chamados/meus-chamados${qs}`);

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip, take })
      );
      expect(resposta.body.pagination).toMatchObject({ page, limit, total, totalPages });
    });

    it('deve usar limit padrão (10) quando limit=0', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      await request(criarApp()).get('/fila-chamados/meus-chamados?limit=0');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('deve usar limit 1 quando limit for negativo', async () => {
      prismaMock.chamado.count.mockResolvedValue(50);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?limit=-10');

      expect(resposta.body.pagination.limit).toBe(1);
    });

    it.each([
      ['hasNext=true  p1/50',  '?page=1&limit=10', 50, true,  false],
      ['hasNext=false p5/50',  '?page=5&limit=10', 50, false, true],
      ['hasPrev=true  p3/50',  '?page=3&limit=10', 50, true,  true],
      ['hasPrev=false p1/50',  '?page=1&limit=10', 50, true,  false],
    ])('%s', async (_label, qs, total, hasNext, hasPrev) => {
      prismaMock.chamado.count.mockResolvedValue(total);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get(`/fila-chamados/meus-chamados${qs}`);

      expect(resposta.body.pagination.hasNext).toBe(hasNext);
      expect(resposta.body.pagination.hasPrev).toBe(hasPrev);
    });

    it('deve retornar totalPages=0 quando não houver resultados', async () => {
      prismaMock.chamado.count.mockResolvedValue(0);
      prismaMock.chamado.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.body.pagination.totalPages).toBe(0);
    });

    it('deve calcular totalPages corretamente com total não divisível (47/10 = 5)', async () => {
      prismaMock.chamado.count.mockResolvedValue(47);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados?limit=10');

      expect(resposta.body.pagination.totalPages).toBe(5);
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para USUARIO', async () => {
      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');
      expect(resposta.status).toBe(200);
    });

    it.each(['TECNICO', 'ADMIN'])('deve negar acesso para %s (403)', async (regra) => {
      authState.regra = regra;
      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');
      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it.todo('deve retornar 500 quando count falhar', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do usuário');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando findMany falhar', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/meus-chamados');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do usuário');
    });
  });
});

describe('GET /fila-chamados/chamados-atribuidos', () => {
  beforeEach(() => {
    authState.regra = 'TECNICO';
    authState.id    = 'tec1';
  });

  describe('Casos de sucesso', () => {
    it('deve retornar lista vazia com paginação quando técnico não tiver chamados', async () => {
      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toEqual([]);
      expect(resposta.body.pagination).toMatchObject({
        page: 1, limit: 10, total: 0, totalPages: 0,
      });
    });

    it('deve filtrar por tecnicoId e status EM_ATENDIMENTO/REABERTO', async () => {
      prismaMock.chamado.count.mockResolvedValue(2);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento, chamadoReaberto]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(2);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tecnicoId:  'tec1',
            status:     { in: ['EM_ATENDIMENTO', 'REABERTO'] },
            deletadoEm: null,
          }),
        })
      );
    });

    it('deve retornar todos os campos necessários no chamado', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      const item = resposta.body.data[0];
      ['id', 'OS', 'descricao', 'status', 'usuario', 'tecnico', 'servicos'].forEach(campo => {
        expect(item).toHaveProperty(campo);
      });
    });
  });

  describe('Ordenação (parâmetro: ordenacao)', () => {
    beforeEach(() => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);
    });

    it('deve ordenar por recentes por padrão (geradoEm desc)', async () => {
      await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      );
    });

    it('deve ordenar por mais antigos com ordenacao=antigos', async () => {
      await request(criarApp()).get('/fila-chamados/chamados-atribuidos?ordenacao=antigos');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'asc' } })
      );
    });

    it('deve priorizar reabertos com ordenacao=reabertos', async () => {
      await request(criarApp()).get('/fila-chamados/chamados-atribuidos?ordenacao=reabertos');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ status: 'desc' }, { geradoEm: 'desc' }] })
      );
    });

    it('deve usar ordenação padrão para valor inválido', async () => {
      await request(criarApp()).get('/fila-chamados/chamados-atribuidos?ordenacao=invalida');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      );
    });
  });

  describe('Paginação', () => {
    it.each([
      ['padrão',              '',                  0,  10],
      ['personalizada p2l25', '?page=2&limit=25',  25, 25],
      ['max 100 itens',       '?limit=150',        0, 100],
    ])('%s', async (_label, qs, skip, take) => {
      prismaMock.chamado.count.mockResolvedValue(200);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);

      await request(criarApp()).get(`/fila-chamados/chamados-atribuidos${qs}`);

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip, take })
      );
    });
  },10000);

  describe('Autorização', () => {
    it('deve permitir acesso para TECNICO', async () => {
      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');
      expect(resposta.status).toBe(200);
    });

    it.each(['USUARIO', 'ADMIN'])('deve negar acesso para %s (403)', async (regra) => {
      authState.regra = regra;
      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');
      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it.todo('deve retornar 500 quando count falhar', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do técnico');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando findMany falhar', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/chamados-atribuidos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados do técnico');
    });
  });
});

describe('GET /fila-chamados/todos-chamados', () => {
  beforeEach(() => {
    authState.regra = 'ADMIN';
    authState.id    = 'admin1';
  });

  describe('Casos de sucesso', () => {
    it.each([
      ['ABERTO',         chamadoBase],
      ['EM_ATENDIMENTO', chamadoEmAtendimento],
      ['ENCERRADO',      chamadoEncerrado],
      ['CANCELADO',      chamadoCancelado],
      ['REABERTO',       chamadoReaberto],
    ])('deve filtrar por status %s', async (status, fixture) => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([fixture]);

      const resposta = await request(criarApp()).get(`/fila-chamados/todos-chamados?status=${status}`);

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status }) })
      );
    });

    it('deve excluir deletados por padrão', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletadoEm: null }) })
      );
    });

    it('deve ordenar por mais recentes por padrão (geradoEm desc)', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      );
    });
  });

  describe('Filtros adicionais', () => {
    beforeEach(() => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    });

    it('deve filtrar por tecnicoId', async () => {
      await request(criarApp()).get('/fila-chamados/todos-chamados?tecnicoId=tec1');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tecnicoId: 'tec1' }) })
      );
    });

    it('deve filtrar por usuarioId', async () => {
      await request(criarApp()).get('/fila-chamados/todos-chamados?usuarioId=user1');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ usuarioId: 'user1' }) })
      );
    });

    it('deve filtrar por setor', async () => {
      await request(criarApp()).get('/fila-chamados/todos-chamados?setor=TECNOLOGIA_INFORMACAO');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ usuario: { setor: 'TECNOLOGIA_INFORMACAO' } }),
        })
      );
    });

    it('deve filtrar por dataInicio', async () => {
      await request(criarApp()).get('/fila-chamados/todos-chamados?dataInicio=2025-01-01');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            geradoEm: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        })
      );
    });

    it('deve filtrar por dataFim (com 23:59:59)', async () => {
      await request(criarApp()).get('/fila-chamados/todos-chamados?dataFim=2025-01-31');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            geradoEm: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        })
      );
    });

    it('deve filtrar por busca (OS ou descrição)', async () => {
      await request(criarApp()).get('/fila-chamados/todos-chamados?busca=INC0001');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { OS:        { contains: 'INC0001', mode: 'insensitive' } },
              { descricao: { contains: 'INC0001', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('deve incluir inativos quando incluirInativos=true', async () => {
      await request(criarApp()).get('/fila-chamados/todos-chamados?incluirInativos=true');

      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ deletadoEm: null }),
        })
      );
    });
  });

  describe('Validações', () => {
    it('deve retornar 400 para status inválido com lista de válidos', async () => {
      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=INVALIDO');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('Status inválido');
      expect(resposta.body.statusValidos).toBeDefined();
    });
  });

  describe('Paginação', () => {
    it.each([
      ['padrão',              '',                       0,  10, 1,  10],
      ['personalizada p3l20', '?page=3&limit=20',      40,  20, 3,  20],
      ['max 100 itens',       '?limit=200',             0, 100, 1, 100],
    ])('%s', async (_label, qs, skip, take, page, limit) => {
      prismaMock.chamado.count.mockResolvedValue(100);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get(`/fila-chamados/todos-chamados${qs}`);

      expect(resposta.status).toBe(200);
      expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip, take })
      );
      expect(resposta.body.pagination).toMatchObject({ page, limit });
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      prismaMock.chamado.count.mockResolvedValue(1);
      prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(200);
    });

    it.each(['USUARIO', 'TECNICO'])('deve negar acesso para %s (403)', async (regra) => {
      authState.regra = regra;
      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');
      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it.todo('deve retornar 500 quando count falhar', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('deve retornar 500 quando findMany falhar', async () => {
      prismaMock.chamado.count.mockResolvedValue(5);
      prismaMock.chamado.findMany.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/todos-chamados?status=ABERTO');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar chamados');
    });
  });
});

describe('GET /fila-chamados/estatisticas', () => {
  beforeEach(() => {
    authState.regra = 'ADMIN';
    authState.id    = 'admin1';
  });

  describe('Casos de sucesso', () => {
    it('deve retornar estatísticas completas por status e prioridade', async () => {
      mockEstatisticas(
        [100, 15, 25, 50, 5, 5, 10],
        [
          { prioridade: 'P1', _count: { id: 5  } },
          { prioridade: 'P2', _count: { id: 10 } },
          { prioridade: 'P3', _count: { id: 8  } },
          { prioridade: 'P4', _count: { id: 40 } },
          { prioridade: 'P5', _count: { id: 37 } },
        ]
      );

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        total: 100,
        porStatus: {
          abertos: 15, emAtendimento: 25, encerrados: 50, cancelados: 5, reabertos: 5,
        },
        porPrioridade: { P1: 5, P2: 10, P3: 8, P4: 40, P5: 37 },
        filaAlta:  23,  // P1+P2+P3
        filaBaixa: 77,  // P4+P5
        pendentes: 20,  // abertos+reabertos
        semTecnico: 10,
      });
      expect(resposta.body).toHaveProperty('timestamp');
    });

    it('deve retornar timestamp válido em formato ISO', async () => {
      mockEstatisticas([10, 2, 3, 4, 1, 0, 5]);

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
      expect(new Date(resposta.body.timestamp).toISOString()).toBe(resposta.body.timestamp);
    });

    it('deve calcular pendentes = abertos + reabertos', async () => {
      mockEstatisticas([50, 12, 15, 20, 0, 3, 8]); // abertos=12, reabertos=3

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.body.pendentes).toBe(15);
    });

    it('deve retornar zeros quando não houver chamados', async () => {
      mockEstatisticas([0, 0, 0, 0, 0, 0, 0]);

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        total: 0,
        porStatus: { abertos: 0, emAtendimento: 0, encerrados: 0, cancelados: 0, reabertos: 0 },
        porPrioridade: { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
        filaAlta: 0, filaBaixa: 0, pendentes: 0, semTecnico: 0,
      });
    });

    it('deve usar 0 como fallback para prioridades ausentes no groupBy', async () => {
      mockEstatisticas([10, 2, 3, 4, 1, 0, 0],
        [{ prioridade: 'P1', _count: { id: 3 } }] // apenas P1, restantes ausentes
      );

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.body.porPrioridade).toMatchObject({ P1: 3, P2: 0, P3: 0, P4: 0, P5: 0 });
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      mockEstatisticas([0, 0, 0, 0, 0, 0, 0]);
      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');
      expect(resposta.status).toBe(200);
    });

    it.each(['TECNICO', 'USUARIO'])('deve negar acesso para %s (403)', async (regra) => {
      authState.regra = regra;
      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');
      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it.todo('deve retornar 500 quando count total falhar', async () => {
      prismaMock.chamado.count.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar estatísticas');
      expect(consoleSpy.error).toHaveBeenCalledWith('[ESTATISTICAS ERROR]', expect.any(Error));
    });

    it('deve retornar 500 quando qualquer count do Promise.all falhar', async () => {
      prismaMock.chamado.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(15)
        .mockRejectedValueOnce(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar estatísticas');
    });

    it('deve retornar 500 quando groupBy falhar', async () => {
      mockEstatisticas([100, 15, 25, 50, 5, 5, 10]);
      prismaMock.chamado.groupBy.mockRejectedValue(new Error('DB error'));

      const resposta = await request(criarApp()).get('/fila-chamados/estatisticas');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar estatísticas');
    });
  });
});