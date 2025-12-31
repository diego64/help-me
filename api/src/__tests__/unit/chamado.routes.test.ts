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
// MOCK DO PRISMA
// ========================================

const prismaMock = {
  chamado: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  servico: {
    findMany: vi.fn(),
  },
  expediente: {
    findMany: vi.fn(),
  },
  ordemDeServico: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
  $disconnect: vi.fn().mockResolvedValue(undefined)
};

// ========================================
// MOCKS DOS REPOSITÓRIOS
// ========================================

const salvarHistoricoChamadoMock = vi.fn().mockResolvedValue({});
const listarHistoricoChamadoMock = vi.fn().mockResolvedValue([]);

// ========================================
// MOCK DO MODELO MONGODB
// ========================================

const chamadoAtualizacaoModelMock = {
  findOne: vi.fn(),
  create: vi.fn().mockResolvedValue({}),
};

// ========================================
// FIXTURES DE USUÁRIO
// ========================================

const usuarioPadrao = {
  id: 'uid1',
  nome: 'Usuario',
  sobrenome: 'Padrao',
  email: 'usu@em.com',
  regra: 'USUARIO',
};

// ========================================
// FIXTURES DE CHAMADO
// ========================================

const chamadoBase = {
  id: 'chmid1',
  OS: 'INC0001',
  descricao: 'Descricao valida com mais de 10 caracteres',
  status: 'ABERTO',
  usuarioId: usuarioPadrao.id,
  tecnicoId: 'tec1',
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  encerradoEm: null,
  descricaoEncerramento: null,
  deletadoEm: null,
  usuario: {
    id: usuarioPadrao.id,
    nome: usuarioPadrao.nome,
    sobrenome: usuarioPadrao.sobrenome,
    email: usuarioPadrao.email,
  },
  servicos: [
    { 
      id: 'sid1', 
      servico: { 
        id: 'serv1', 
        nome: 'ServicoA' 
      } 
    }
  ],
  tecnico: { 
    id: 'tec1',
    nome: 'TECNICO', 
    email: 'tec@em.com' 
  },
};

// ========================================
// MOCKS DE MÓDULOS
// ========================================

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

vi.mock('../../repositories/chamadoAtualizacao.repository', () => ({
  salvarHistoricoChamado: salvarHistoricoChamadoMock,
  listarHistoricoChamado: listarHistoricoChamadoMock,
}));

vi.mock('../../models/chamadoAtualizacao.model', () => ({
  default: chamadoAtualizacaoModelMock,
}));

// ========================================
// ESTADO DE AUTENTICAÇÃO
// ========================================

let Regra = 'USUARIO';
let UsarUsuarioNulo = false;

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (UsarUsuarioNulo) {
      req.usuario = null;
    } else {
      req.usuario = { ...usuarioPadrao, regra: Regra };
    }
    req.session = { destroy: (cb: any) => cb(null) };
    next();
  },
  authorizeRoles:
    (...roles: string[]) =>
    (req: any, res: any, next: any) =>
      req.usuario && roles.includes(req.usuario.regra)
        ? next()
        : res.status(403).json({ error: 'Forbidden' }),
}));

// ========================================
// SETUP E TEARDOWN
// ========================================

let router: any;

beforeAll(async () => {
  router = (await import('../../routes/chamado.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  
  Object.values(prismaMock.chamado).forEach((fn) => vi.mocked(fn).mockReset());
  Object.values(prismaMock.servico).forEach((fn) => vi.mocked(fn).mockReset());
  Object.values(prismaMock.expediente).forEach((fn) => vi.mocked(fn).mockReset());
  Object.values(prismaMock.ordemDeServico).forEach((fn) => vi.mocked(fn).mockReset());
  
  prismaMock.$transaction.mockReset();
  chamadoAtualizacaoModelMock.findOne.mockReset();
  chamadoAtualizacaoModelMock.create.mockReset();
  salvarHistoricoChamadoMock.mockReset();
  listarHistoricoChamadoMock.mockReset();
  
  Regra = 'USUARIO';
  UsarUsuarioNulo = false;
  
  salvarHistoricoChamadoMock.mockResolvedValue({});
  listarHistoricoChamadoMock.mockResolvedValue([]);
  chamadoAtualizacaoModelMock.create.mockResolvedValue({});
});

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/chamado', router);
  return app;
}

// ========================================
// SUITES DE TESTES
// ========================================

describe('POST /chamado/abertura-chamado', () => {
  it('deve retornar status 400 quando campo "descricao" não for enviado', async () => {
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({});
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toBe('Descrição é obrigatória');
  });

  it('deve retornar status 400 quando descrição for muito curta (< 10 caracteres)', async () => {
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ descricao: 'Curta', servico: 'ServicoA' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('no mínimo 10 caracteres');
  });

  it('deve retornar status 400 quando descrição for muito longa (> 5000 caracteres)', async () => {
    const descricaoLonga = 'a'.repeat(5001);
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ descricao: descricaoLonga, servico: 'ServicoA' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('no máximo 5000 caracteres');
  });

  it('deve retornar status 400 quando campo servico estiver vazio', async () => {
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ descricao: 'Descricao valida com mais de 10 caracteres', servico: '' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('obrigatório informar pelo menos um serviço');
  });

  it('deve retornar status 400 quando serviço não existir no banco', async () => {
    prismaMock.servico.findMany.mockResolvedValue([]);
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: 'ServicoInexistente' 
      });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('não encontrados ou inativos');
  });

  it('deve retornar status 201 e criar chamado quando dados válidos forem fornecidos', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' }
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue(chamadoBase);
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: 'ServicoA' 
      });
    
    expect(resposta.status).toBe(201);
    expect(resposta.body).toHaveProperty('id');
    expect(resposta.body).toHaveProperty('OS');
    expect(resposta.body.servicos).toHaveLength(1);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'ABERTURA',
        para: 'ABERTO',
      })
    );
  });

  it('deve gerar OS incrementado quando já existir chamado', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' }
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.findFirst.mockResolvedValue({ OS: 'INC0001' });
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      OS: 'INC0002',
    });
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: 'ServicoA' 
      });
    
    expect(resposta.status).toBe(201);
    expect(resposta.body.OS).toBe('INC0002');
  });

  it('deve processar serviço como array de strings', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' },
      { id: 'id2', nome: 'ServicoB' },
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      servicos: [
        { id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' } },
        { id: 'sid2', servico: { id: 'serv2', nome: 'ServicoB' } },
      ],
    });
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: ['ServicoA', 'ServicoB'] 
      });
    
    expect(resposta.status).toBe(201);
    expect(resposta.body.servicos).toHaveLength(2);
  });

  it('deve filtrar itens inválidos de array de serviços', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' }
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue(chamadoBase);
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: ['ServicoA', 123, null, '', '  '] as any
      });
    
    expect(resposta.status).toBe(201);
  });

  it('deve retornar status 400 quando servico for array vazio após filtragem', async () => {
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: ['', '   ', null] as any
      });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('obrigatório informar');
  });

  it('deve retornar status 400 quando servico for null', async () => {
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: null 
      });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('obrigatório informar');
  });

  it('deve retornar status 500 quando ocorrer erro inesperado', async () => {
    prismaMock.servico.findMany.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: 'ServicoA' 
      });
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao criar o chamado');
  });

  it('deve retornar chamado com servicos vazio quando não houver servicos', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' }
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      servicos: [],
    });
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: 'ServicoA' 
      });
    
    expect(resposta.status).toBe(201);
    expect(resposta.body.servicos).toEqual([]);
  });

  it('deve formatar resposta corretamente com usuario null', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' }
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      usuario: null,
    });
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: 'ServicoA' 
      });
    
    expect(resposta.status).toBe(201);
    expect(resposta.body.usuario).toBeNull();
  });

  it('deve formatar resposta corretamente com tecnico null', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' }
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      tecnico: null,
      tecnicoId: null,
    });
    
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send({ 
        descricao: 'Descricao valida com mais de 10 caracteres', 
        servico: 'ServicoA' 
      });
    
    expect(resposta.status).toBe(201);
    expect(resposta.body.tecnico).toBeNull();
  });
});

describe('PATCH /chamado/:id/status', () => {
  it('deve retornar status 400 quando status informado for inválido', async () => {
    Regra = 'ADMIN';
    
    const resposta = await request(criarApp())
      .patch('/chamado/123/status')
      .send({ status: 'STATUS_INVALIDO' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Status inválido');
  });

  it('deve retornar status 404 quando chamado não existir', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    
    const resposta = await request(criarApp())
      .patch('/chamado/123/status')
      .send({ 
        status: 'ENCERRADO', 
        descricaoEncerramento: 'Resolvido com sucesso' 
      });
    
    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toBe('Chamado não encontrado');
  });

  it('deve retornar status 400 quando tentar alterar chamado cancelado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ status: 'ENCERRADO', descricaoEncerramento: 'Teste com mais de 10 chars' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('cancelados não podem ser alterados');
  });

  it('deve retornar status 403 quando técnico tentar alterar chamado encerrado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ status: 'EM_ATENDIMENTO' });
    
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('técnicos');
  });

  it('deve retornar status 403 quando técnico tentar cancelar chamado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ status: 'CANCELADO' });
    
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('Técnicos não podem cancelar');
  });

  it('deve retornar status 400 quando tentar encerrar sem descrição', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ status: 'ENCERRADO' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('encerramento inválida');
  });

  it('deve retornar status 403 quando técnico fora do expediente tentar assumir chamado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ABERTO',
    });
    prismaMock.expediente.findMany.mockResolvedValue([]);
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ status: 'EM_ATENDIMENTO' });
    
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('horário de trabalho');
  });

  it('deve retornar status 200 quando técnico dentro do expediente assumir chamado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ABERTO',
    });
    
    const agora = new Date();
    const entrada = new Date(agora);
    entrada.setHours(8, 0, 0, 0);
    const saida = new Date(agora);
    saida.setHours(18, 0, 0, 0);
    
    prismaMock.expediente.findMany.mockResolvedValue([
      { 
        entrada, 
        saida, 
        usuarioId: usuarioPadrao.id,
        ativo: true,
        deletadoEm: null,
      },
    ]);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'EM_ATENDIMENTO',
      tecnicoId: usuarioPadrao.id,
    });
    
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ status: 'EM_ATENDIMENTO' });
    
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
  });

  it('deve retornar status 200 quando admin encerrar chamado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido com sucesso',
      encerradoEm: new Date().toISOString(),
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ 
        status: 'ENCERRADO',
        descricaoEncerramento: 'Resolvido com sucesso',
        atualizacaoDescricao: 'Problema solucionado'
      });
    
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'STATUS',
        descricao: 'Problema solucionado',
      })
    );
  });

  it('deve usar descrição padrão quando não enviar atualizacaoDescricao', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido com sucesso completo',
      encerradoEm: new Date().toISOString(),
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ 
        status: 'ENCERRADO',
        descricaoEncerramento: 'Resolvido com sucesso completo'
      });
    
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: 'Chamado encerrado',
      })
    );
  });

  it('deve retornar status 500 quando ocorrer erro inesperado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    prismaMock.$transaction.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send({ 
        status: 'ENCERRADO',
        descricaoEncerramento: 'Resolvido com sucesso' 
      });
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao atualizar status do chamado');
  });
});

describe('GET /chamado/:id/historico', () => {
  it('deve retornar status 200 e listar histórico', async () => {
    listarHistoricoChamadoMock.mockResolvedValue([
      { _id: 'hid1', tipo: 'STATUS' }
    ]);
    
    const resposta = await request(criarApp())
      .get('/chamado/chmid1/historico');
    
    expect(resposta.status).toBe(200);
    expect(Array.isArray(resposta.body)).toBeTruthy();
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    listarHistoricoChamadoMock.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .get('/chamado/chmid1/historico');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao buscar histórico');
  });
});

describe('PATCH /chamado/:id/reabrir-chamado', () => {
  it('deve retornar status 404 quando chamado não existir', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toBe('Chamado não encontrado');
  });

  it('deve retornar status 403 quando tentar reabrir chamado de outro usuário', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      usuarioId: 'outro_usuario',
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('criados por você');
  });

  it('deve retornar status 400 quando chamado não estiver encerrado', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ABERTO',
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('encerrados podem ser reabertos');
  });

  it('deve retornar status 400 quando não houver data de encerramento', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: null,
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Data de encerramento');
  });

  it('deve retornar status 400 quando exceder prazo de 48 horas', async () => {
    Regra = 'USUARIO';
    const encerradoHaMuitoTempo = new Date(Date.now() - 49 * 3600 * 1000);
    
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoHaMuitoTempo.toISOString(),
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('48 horas');
  });

  it('deve retornar status 200 e reabrir chamado dentro do prazo', async () => {
    Regra = 'USUARIO';
    const encerradoRecente = new Date(Date.now() - 24 * 3600 * 1000);
    
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoRecente.toISOString(),
      tecnicoId: 'tec1',
    });
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'REABERTO',
      tecnicoId: 'tec1',
      encerradoEm: null,
      descricaoEncerramento: null,
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({ atualizacaoDescricao: 'Problema voltou' });
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe('REABERTO');
  });

  it('deve buscar último técnico quando tecnicoId for null', async () => {
    Regra = 'USUARIO';
    const encerradoRecente = new Date(Date.now() - 24 * 3600 * 1000);
    
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoRecente.toISOString(),
      tecnicoId: null,
    });
    
    chamadoAtualizacaoModelMock.findOne.mockResolvedValue({
      autorId: 'tecnico_mongo_id',
    });
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'REABERTO',
      tecnicoId: 'tecnico_mongo_id',
      encerradoEm: null,
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    expect(resposta.status).toBe(200);
    expect(chamadoAtualizacaoModelMock.findOne).toHaveBeenCalled();
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao reabrir chamado');
  });
});

describe('PATCH /chamado/:id/cancelar-chamado', () => {
  it('deve retornar status 400 quando não enviar justificativa', async () => {
    Regra = 'ADMIN';
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({});
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Justificativa');
  });

  it('deve retornar status 404 quando chamado não existir', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({ descricaoEncerramento: 'Motivo do cancelamento válido' });
    
    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toBe('Chamado não encontrado');
  });

  it('deve retornar status 403 quando usuário tentar cancelar chamado de outro', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      usuarioId: 'outro_usuario',
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({ descricaoEncerramento: 'Motivo do cancelamento válido' });
    
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('não tem permissão');
  });

  it('deve retornar status 400 quando tentar cancelar chamado encerrado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({ descricaoEncerramento: 'Motivo do cancelamento válido' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('encerrado');
  });

  it('deve retornar status 400 quando chamado já estiver cancelado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({ descricaoEncerramento: 'Motivo do cancelamento válido' });
    
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('já está cancelado');
  });

  it('deve retornar status 200 e cancelar chamado com sucesso', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
      descricaoEncerramento: 'Motivo do cancelamento válido',
      encerradoEm: new Date().toISOString(),
    });
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({ descricaoEncerramento: 'Motivo do cancelamento válido' });
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('cancelado');
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    prismaMock.$transaction.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({ descricaoEncerramento: 'Motivo do cancelamento válido' });
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao cancelar o chamado');
  });
});

describe('DELETE /chamado/:id', () => {
  it('deve retornar status 404 quando chamado não existir', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    
    const resposta = await request(criarApp())
      .delete('/chamado/chmid1');
    
    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toBe('Chamado não encontrado');
  });

  it('deve realizar soft delete por padrão', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      deletadoEm: new Date().toISOString(),
    });
    
    const resposta = await request(criarApp())
      .delete('/chamado/chmid1');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('desativado');
    expect(prismaMock.chamado.update).toHaveBeenCalledWith({
      where: { id: 'chmid1' },
      data: { deletadoEm: expect.any(Date) },
    });
  });

  it('deve realizar delete permanente quando solicitado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    
    prismaMock.$transaction.mockImplementation(async (fn) => {
      return await fn(prismaMock);
    });
    
    prismaMock.ordemDeServico.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.chamado.delete.mockResolvedValue(chamadoBase);
    
    const resposta = await request(criarApp())
      .delete('/chamado/chmid1?permanente=true');
    
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('permanentemente');
    expect(prismaMock.ordemDeServico.deleteMany).toHaveBeenCalled();
    expect(prismaMock.chamado.delete).toHaveBeenCalled();
  });

  it('deve retornar status 403 quando usuário tentar deletar', async () => {
    Regra = 'USUARIO';
    
    const resposta = await request(criarApp())
      .delete('/chamado/chmid1');
    
    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    
    const resposta = await request(criarApp())
      .delete('/chamado/chmid1');
    
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe('Erro ao deletar o chamado');
  });
});