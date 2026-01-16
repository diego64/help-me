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

const prismaMock = {
  chamado: {
    count: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  $disconnect: vi.fn().mockResolvedValue(undefined)
};

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
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));


const usuarioPadrao = {
  id: 'uid1',
  nome: 'Usuario',
  sobrenome: 'Padrao',
  email: 'usu@em.com',
  regra: 'USUARIO',
};

const tecnicoPadrao = {
  id: 'tec1',
  nome: 'Tecnico',
  sobrenome: 'Padrao',
  email: 'tec@em.com',
  regra: 'TECNICO',
};

const adminPadrao = {
  id: 'admin1',
  nome: 'Admin',
  sobrenome: 'Padrao',
  email: 'admin@em.com',
  regra: 'ADMIN',
};

const chamadoBase = {
  id: 'chmid1',
  OS: 'INC0001',
  descricao: 'Descricao do chamado',
  descricaoEncerramento: null,
  status: 'ABERTO',
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  encerradoEm: null,
  deletadoEm: null,
  usuario: {
    id: 'uid1',
    nome: 'Usuario',
    sobrenome: 'Padrao',
    email: 'usu@em.com',
    setor: 'TECNOLOGIA_INFORMACAO',
  },
  tecnico: null,
  servicos: [
    {
      id: 'sid1',
      servicoId: 'serv1',
      servico: {
        id: 'serv1',
        nome: 'Suporte Técnico',
        descricao: 'Suporte geral',
      },
    },
  ],
};

let usuarioAtual: any = usuarioPadrao;

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = usuarioAtual;
    next();
  },
  authorizeRoles:
    (...roles: string[]) =>
    (req: any, res: any, next: any) =>
      req.usuario && roles.includes(req.usuario.regra)
        ? next()
        : res.status(403).json({ error: 'Forbidden' }),
}));

let router: any;

beforeAll(async () => {
  router = (await import('../../routes/fila-de-chamados.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  
  Object.values(prismaMock.chamado).forEach((fn) => vi.mocked(fn).mockReset());
  
  usuarioAtual = usuarioPadrao;
  
  prismaMock.chamado.count.mockResolvedValue(0);
  prismaMock.chamado.findMany.mockResolvedValue([]);
  prismaMock.chamado.groupBy.mockResolvedValue([]);
});

function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/listagens', router);
  return app;
}

describe('GET /listagens/meus-chamados', () => {
  it('deve retornar status 403 quando usuário não for USUARIO', async () => {
    usuarioAtual = tecnicoPadrao;
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados');
    
    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 200 com lista vazia quando usuário não tiver chamados', async () => {
    prismaMock.chamado.count.mockResolvedValue(0);
    prismaMock.chamado.findMany.mockResolvedValue([]);
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados');
    
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
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toHaveLength(1);
    expect(resposta.body.data[0]).toMatchObject({
      id: chamadoBase.id,
      OS: chamadoBase.OS,
    });
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          usuarioId: usuarioPadrao.id,
        }),
      })
    );
  });

  it('deve aplicar paginação corretamente', async () => {
    prismaMock.chamado.count.mockResolvedValue(25);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados?page=2&limit=5');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 25,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
      })
    );
  });

  it('deve filtrar por status quando fornecido', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados?status=ABERTO');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ABERTO',
        }),
      })
    );
  });

  it('deve ignorar status inválido', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados?status=INVALIDO');
    
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
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletadoEm: null,
        }),
      })
    );
  });

  it('deve incluir chamados deletados quando solicitado', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados?incluirInativos=true');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          deletadoEm: null,
        }),
      })
    );
  });

  it('deve limitar paginação ao máximo de 100 itens', async () => {
    prismaMock.chamado.count.mockResolvedValue(200);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados?limit=200');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      })
    );
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .get('/listagens/meus-chamados');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao listar chamados do usuário');
  });
});

describe('GET /listagens/chamados-atribuidos', () => {
  beforeEach(() => {
    usuarioAtual = tecnicoPadrao;
  });

  it('deve retornar status 403 quando usuário não for TECNICO', async () => {
    usuarioAtual = usuarioPadrao;
    
    const resposta = await request(criarApp())
      .get('/listagens/chamados-atribuidos');
    
    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 200 com chamados atribuídos ao técnico', async () => {
    const chamadoEmAtendimento = {
      ...chamadoBase,
      status: 'EM_ATENDIMENTO',
      tecnico: tecnicoPadrao,
    };
    
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoEmAtendimento]);
    
    const resposta = await request(criarApp())
      .get('/listagens/chamados-atribuidos');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toHaveLength(1);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tecnicoId: tecnicoPadrao.id,
          status: { in: ['EM_ATENDIMENTO', 'REABERTO'] },
        }),
      })
    );
  });

  it('deve ordenar por recentes por padrão', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/chamados-atribuidos');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { geradoEm: 'desc' },
      })
    );
  });

  it('deve ordenar por antigos quando solicitado', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/chamados-atribuidos?prioridade=antigos');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { geradoEm: 'asc' },
      })
    );
  });

  it('deve ordenar por reabertos primeiro quando solicitado', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/chamados-atribuidos?prioridade=reabertos');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ status: 'desc' }, { geradoEm: 'desc' }],
      })
    );
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .get('/listagens/chamados-atribuidos');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao listar chamados do técnico');
  });
});

describe('GET /listagens/todos-chamados', () => {
  beforeEach(() => {
    usuarioAtual = adminPadrao;
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioAtual = usuarioPadrao;
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados');
    
    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 200 com todos os chamados', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toHaveLength(1);
  });

  it('deve retornar status 400 quando status for inválido', async () => {
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?status=INVALIDO');
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toBe('Status inválido');
    expect(resposta.body).toHaveProperty('statusValidos');
  });

  it('deve filtrar por status válido', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?status=ABERTO');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ABERTO',
        }),
      })
    );
  });

  it('deve filtrar por tecnicoId', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?tecnicoId=tec1');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tecnicoId: 'tec1',
        }),
      })
    );
  });

  it('deve filtrar por usuarioId', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?usuarioId=uid1');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          usuarioId: 'uid1',
        }),
      })
    );
  });

  it('deve filtrar por setor', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?setor=TECNOLOGIA_INFORMACAO');
    
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

  it('deve filtrar por data de início', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?dataInicio=2025-01-01');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          geradoEm: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it('deve filtrar por data de fim', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?dataFim=2025-12-31');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          geradoEm: expect.objectContaining({
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it('deve filtrar por período completo', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?dataInicio=2025-01-01&dataFim=2025-12-31');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          geradoEm: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      })
    );
  });

  it('deve buscar por OS ou descrição', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados?busca=INC0001');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ OS: expect.any(Object) }),
            expect.objectContaining({ descricao: expect.any(Object) }),
          ]),
        }),
      })
    );
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .get('/listagens/todos-chamados');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao listar chamados');
  });
});

describe('GET /listagens/abertos', () => {
  beforeEach(() => {
    usuarioAtual = tecnicoPadrao;
  });

  it('deve retornar status 403 quando usuário não for ADMIN ou TECNICO', async () => {
    usuarioAtual = usuarioPadrao;
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos');
    
    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 200 com chamados abertos', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toHaveLength(1);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['ABERTO', 'REABERTO'] },
          deletadoEm: null,
        }),
      })
    );
  });

  it('deve filtrar por setor', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos?setor=TECNOLOGIA_INFORMACAO');
    
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

  it('deve ordenar por recentes por padrão', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { geradoEm: 'desc' },
      })
    );
  });

  it('deve ordenar por antigos quando solicitado', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos?ordenacao=antigos');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { geradoEm: 'asc' },
      })
    );
  });

  it('deve ordenar por prioridade (reabertos primeiro)', async () => {
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos?ordenacao=prioridade');
    
    expect(resposta.status).toBe(200);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ status: 'desc' }, { geradoEm: 'desc' }],
      })
    );
  });

  it('deve permitir acesso para ADMIN', async () => {
    usuarioAtual = adminPadrao;
    prismaMock.chamado.count.mockResolvedValue(1);
    prismaMock.chamado.findMany.mockResolvedValue([chamadoBase]);
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos');
    
    expect(resposta.status).toBe(200);
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .get('/listagens/abertos');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao listar chamados abertos');
  });
});

describe('GET /listagens/estatisticas', () => {
  beforeEach(() => {
    usuarioAtual = adminPadrao;
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioAtual = usuarioPadrao;
    
    const resposta = await request(criarApp())
      .get('/listagens/estatisticas');
    
    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 200 com estatísticas', async () => {
    prismaMock.chamado.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(10)  // abertos
      .mockResolvedValueOnce(20)  // em atendimento
      .mockResolvedValueOnce(50)  // encerrados
      .mockResolvedValueOnce(15)  // cancelados
      .mockResolvedValueOnce(5)   // reabertos
      .mockResolvedValueOnce(8);  // sem técnico
    
    prismaMock.chamado.groupBy.mockResolvedValue([
      { usuarioId: 'uid1', _count: 10 },
      { usuarioId: 'uid2', _count: 5 },
    ]);
    
    const resposta = await request(criarApp())
      .get('/listagens/estatisticas');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({
      total: 100,
      porStatus: {
        abertos: 10,
        emAtendimento: 20,
        encerrados: 50,
        cancelados: 15,
        reabertos: 5,
      },
      pendentes: 15, // abertos + reabertos
      semTecnico: 8,
    });
    expect(resposta.body).toHaveProperty('timestamp');
  });

  it('deve calcular pendentes corretamente', async () => {
    prismaMock.chamado.count
      .mockResolvedValueOnce(50)  // total
      .mockResolvedValueOnce(10)  // abertos
      .mockResolvedValueOnce(15)  // em atendimento
      .mockResolvedValueOnce(20)  // encerrados
      .mockResolvedValueOnce(0)   // cancelados
      .mockResolvedValueOnce(5)   // reabertos
      .mockResolvedValueOnce(8);  // sem técnico
    
    prismaMock.chamado.groupBy.mockResolvedValue([]);
    
    const resposta = await request(criarApp())
      .get('/listagens/estatisticas');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.pendentes).toBe(15); // 10 abertos + 5 reabertos
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    prismaMock.chamado.count.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .get('/listagens/estatisticas');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao buscar estatísticas');
  });
});