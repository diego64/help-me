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

// ============================================================================
// MOCK DO PRISMA
// ============================================================================

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

// ============================================================================
// MOCKS DOS REPOSITÓRIOS
// ============================================================================

const salvarHistoricoChamadoMock = vi.fn();
const listarHistoricoChamadoMock = vi.fn();

// ============================================================================
// MOCK DO MODELO MONGODB (ChamadoAtualizacaoModel)
// ============================================================================

const chamadoAtualizacaoModelMock = {
  findOne: vi.fn(),
  create: vi.fn(),
};

// ============================================================================
// FIXTURES DE USUÁRIO
// ============================================================================

const usuarioPadrao = {
  id: 'uid1',
  nome: 'Usuario',
  sobrenome: 'Padrao',
  email: 'usu@em.com',
  regra: 'USUARIO',
};

// ============================================================================
// FIXTURES DE CHAMADO
// ============================================================================

const chamadoBase = {
  id: 'chmid1',
  OS: 'INC0001',
  descricao: 'Teste desc',
  status: 'ABERTO',
  usuarioId: usuarioPadrao.id,
  tecnicoId: 'tec1',
  geradoEm: new Date().toISOString(),
  atualizadoEm: new Date().toISOString(),
  encerradoEm: null,
  descricaoEncerramento: null,
  usuario: usuarioPadrao,
  servicos: [{ id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' } }],
  tecnico: { nome: 'TECNICO', email: 'tec@em.com' },
};

// ============================================================================
// MOCKS DE MÓDULOS
// ============================================================================

vi.mock('@prisma/client', () => ({
  PrismaClient: function () {
    return prismaMock;
  },
}));

vi.mock('../../repositories/chamadoAtualizacao.repository', () => ({
  salvarHistoricoChamado: salvarHistoricoChamadoMock,
  listarHistoricoChamado: listarHistoricoChamadoMock,
}));

vi.mock('../../models/chamadoAtualizacao.model', () => ({
  default: chamadoAtualizacaoModelMock,
}));

// ============================================================================
// ESTADO DE AUTENTICAÇÃO
// ============================================================================

let Regra = 'USUARIO';

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

// Flag para simular usuário nulo
let UsarUsuarioNulo = false;

// ============================================================================
// SETUP E TEARDOWN
// ============================================================================

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
  chamadoAtualizacaoModelMock.findOne.mockReset();
  chamadoAtualizacaoModelMock.create.mockReset();
  Regra = 'USUARIO';
  UsarUsuarioNulo = false;
  salvarHistoricoChamadoMock.mockResolvedValue({});
  listarHistoricoChamadoMock.mockResolvedValue([]);
});

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Factory para criar instância do Express app com o router configurado
 */
function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/chamado', router);
  return app;
}

// ============================================================================
// SUITES DE TESTES
// ============================================================================

describe('POST /chamado/abertura-chamado', () => {
  it('Deve retornar status 400 quando campo "descricao" não for enviado', async () => {
    const dadosInvalidos = {};
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosInvalidos);
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando algum campo obrigatório estiver vazio', async () => {
    const dadosComCampoVazio = { descricao: 'Foo', servico: '' };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosComCampoVazio);
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando serviço solicitado não existir no banco', async () => {
    prismaMock.servico.findMany.mockResolvedValue([]);
    const dadosComServicoInexistente = { descricao: 'Teste', servico: 'ServicoInexistente' };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosComServicoInexistente);
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('não foram encontrados');
  });

  it('Deve retornar status 201 e criar chamado quando dados válidos forem fornecidos', async () => {
    prismaMock.servico.findMany.mockResolvedValue([{ id: 'id1', nome: 'ServicoA' }]);
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue(chamadoBase);
    const dadosValidos = { descricao: 'Teste', servico: 'ServicoA' };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    expect(resposta.status).toBe(201);
    expect(resposta.body).toHaveProperty('id');
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na criação', async () => {
    prismaMock.servico.findMany.mockRejectedValue(new Error('Database connection failed'));
    const dadosValidos = { descricao: 'Teste', servico: 'ServicoA' };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao criar o chamado');
  });

  it('Deve retornar status 201 mesmo quando chamado criado não tiver servicos associados', async () => {
    prismaMock.servico.findMany.mockResolvedValue([{ id: 'id1', nome: 'ServicoA' }]);
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue({ ...chamadoBase, servicos: [] });
    const dadosValidos = { descricao: 'Teste', servico: 'ServicoA' };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    expect(resposta.status).toBe(201);
    expect(resposta.body).toHaveProperty('id');
  });

  it('Deve gerar novo OS quando OS já existir no banco (recursão - linha 31)', async () => {
    prismaMock.servico.findMany.mockResolvedValue([{ id: 'id1', nome: 'ServicoA' }]);
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.chamado.findFirst.mockResolvedValue({ OS: 'INC0001' });
    prismaMock.chamado.findUnique
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      OS: 'INC0002',
    });
    const dadosValidos = { descricao: 'Teste recursão', servico: 'ServicoA' };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    expect(resposta.status).toBe(201);
  });

  it('Deve processar servico como array de strings válidas (linha 59)', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' },
      { id: 'id2', nome: 'ServicoB' },
    ]);
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      servicos: [
        { id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' } },
        { id: 'sid2', servico: { id: 'serv2', nome: 'ServicoB' } },
      ],
    });
    const dadosValidos = { descricao: 'Teste array', servico: ['ServicoA', 'ServicoB'] };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    expect(resposta.status).toBe(201);
    expect(resposta.body).toHaveProperty('id');
  });

  it('Deve filtrar itens não-string de array de servicos (linha 59 branch)', async () => {
    prismaMock.servico.findMany.mockResolvedValue([{ id: 'id1', nome: 'ServicoA' }]);
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue(chamadoBase);
    const dadosValidos = { descricao: 'Teste array misto', servico: ['ServicoA', 123, null, '', '  '] };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    expect(resposta.status).toBe(201);
  });

  it('Deve retornar status 400 quando servico for array vazio após filtragem', async () => {
    const dadosInvalidos = { descricao: 'Teste', servico: ['', '   ', null] };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosInvalidos);
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('obrigatório informar');
  });

  it('Deve retornar status 400 quando servico for tipo inválido (não string nem array)', async () => {
    const dadosInvalidos = { descricao: 'Teste', servico: 12345 };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosInvalidos);
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('obrigatório informar');
  });

  it('Deve retornar múltiplos serviços no response quando chamado tiver vários servicos', async () => {
    prismaMock.servico.findMany.mockResolvedValue([
      { id: 'id1', nome: 'ServicoA' },
      { id: 'id2', nome: 'ServicoB' },
    ]);
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue({
      ...chamadoBase,
      servicos: [
        { id: 'sid1', servico: { nome: 'ServicoA' } },
        { id: 'sid2', servico: { nome: 'ServicoB' } },
      ],
    });
    const dadosValidos = { descricao: 'Teste', servico: ['ServicoA', 'ServicoB'] };
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    expect(resposta.status).toBe(201);
    expect(Array.isArray(resposta.body.servico)).toBe(true);
    expect(resposta.body.servico).toHaveLength(2);
  });
});

describe('PATCH /chamado/:id/status', () => {
  it('Deve retornar status 400 quando status informado for inválido', async () => {
    Regra = 'ADMIN';
    const statusInvalido = { status: 'STATUS_INVALIDO' };
    const resposta = await request(criarApp())
      .patch('/chamado/123/status')
      .send(statusInvalido);
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 404 quando tentar alterar status de chamado inexistente', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    const dadosValidos = { status: 'ENCERRADO', descricaoEncerramento: 'Resolvido' };
    const resposta = await request(criarApp())
      .patch('/chamado/123/status')
      .send(dadosValidos);
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando ADMIN tentar alterar status de chamado cancelado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'CANCELADO' });
    const dadosAtualizacao = { status: 'ENCERRADO', descricaoEncerramento: 'Resolvido' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('cancelados');
  });

  it('Deve retornar status 403 quando técnico tentar alterar chamado encerrado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ENCERRADO' });
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('técnicos');
  });

  it('Deve retornar status 403 quando técnico tentar cancelar chamado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'EM_ATENDIMENTO' });
    const dadosCancelamento = { status: 'CANCELADO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(403);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando tentar encerrar chamado sem descrição de encerramento', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    const dadosSemDescricao = { status: 'ENCERRADO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosSemDescricao);
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('encerramento');
  });

  it('Deve retornar status 403 quando técnico fora do expediente tentar assumir chamado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.expediente.findMany.mockResolvedValue([
      { entrada: '08:00', saida: '10:00', usuarioId: usuarioPadrao.id },
    ]);
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(19);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('horário');
  });

  it('Deve retornar status 200 quando técnico dentro do expediente assumir chamado', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ABERTO',
      tecnicoId: null,
    });
    prismaMock.expediente.findMany.mockResolvedValue([
      { entrada: '08:00', saida: '18:00', usuarioId: usuarioPadrao.id },
    ]);
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'EM_ATENDIMENTO',
      tecnicoId: usuarioPadrao.id,
    });
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
  });

  it('Deve retornar status 200 e atualizar status quando requisitos forem atendidos', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido',
    });
    listarHistoricoChamadoMock.mockResolvedValue([
      { _id: 'hid1', tipo: 'STATUS', autorId: usuarioPadrao.id },
    ]);
    const dadosEncerramento = {
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido',
      atualizacaoDescricao: 'Problema solucionado',
    };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosEncerramento);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
    expect(resposta.body.ultimaAtualizacao).toHaveProperty('id');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na atualização', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    const dadosAtualizacao = { status: 'CANCELADO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 200 quando atualizar status sem atualizacaoDescricao', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido',
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosEncerramento = {
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido',
    };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosEncerramento);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
  });

  it('Deve retornar status 400 quando status for vazio', async () => {
    Regra = 'ADMIN';
    const dadosInvalidos = { status: '' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosInvalidos);
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 403 quando técnico sem expediente cadastrado tentar assumir chamado (linha 194)', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.expediente.findMany.mockResolvedValue([]);
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('expediente');
  });

  it('Deve retornar status 200 quando ADMIN cancelar chamado diretamente via status', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosCancelamento = { status: 'CANCELADO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
  });

  it('Deve usar descrição padrão "Chamado cancelado" quando cancelar sem atualizacaoDescricao', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosCancelamento = { status: 'CANCELADO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: 'Chamado cancelado',
      })
    );
  });

  it('Deve retornar status 200 com response sem usuario quando usuario for null', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      usuario: null,
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
      usuario: null,
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosCancelamento = { status: 'CANCELADO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toBeNull();
  });

  it('Deve retornar status 200 com response sem tecnico quando tecnico for null', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      tecnico: null,
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
      tecnico: null,
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosCancelamento = { status: 'CANCELADO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(200);
    expect(resposta.body.tecnico).toBeNull();
  });

  it('Deve verificar múltiplos expedientes e permitir quando pelo menos um estiver no horário', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.expediente.findMany.mockResolvedValue([
      { entrada: '08:00', saida: '12:00', usuarioId: usuarioPadrao.id },
      { entrada: '14:00', saida: '18:00', usuarioId: usuarioPadrao.id },
    ]);
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'EM_ATENDIMENTO',
    });
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(15);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(30);
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(200);
  });
});

describe('PATCH /chamado/:id/status - Cobertura completa da linha 242', () => {
  it('Deve usar descrição "Chamado assumido pelo técnico" quando status for EM_ATENDIMENTO sem atualizacaoDescricao', async () => {
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ 
      ...chamadoBase, 
      status: 'ABERTO',
      tecnicoId: null
    });
    prismaMock.expediente.findMany.mockResolvedValue([
      { entrada: '08:00', saida: '18:00', usuarioId: usuarioPadrao.id },
    ]);
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'EM_ATENDIMENTO',
      tecnicoId: usuarioPadrao.id,
    });
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: 'Chamado assumido pelo técnico',
      })
    );
  });

  it('Deve usar descrição "Chamado encerrado" quando status for ENCERRADO sem atualizacaoDescricao', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ 
      ...chamadoBase, 
      status: 'ABERTO' 
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido',
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosEncerramento = { 
      status: 'ENCERRADO', 
      descricaoEncerramento: 'Resolvido'
    };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosEncerramento);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: 'Chamado encerrado',
      })
    );
  });

  it('Deve usar atualizacaoDescricao fornecida quando presente e não vazia', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ 
      ...chamadoBase, 
      status: 'ABERTO' 
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      descricaoEncerramento: 'Resolvido',
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const descricaoCustomizada = 'Problema foi resolvido completamente';
    const dadosEncerramento = { 
      status: 'ENCERRADO', 
      descricaoEncerramento: 'Resolvido',
      atualizacaoDescricao: descricaoCustomizada
    };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosEncerramento);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: descricaoCustomizada,
      })
    );
  });

  it('Deve usar descrição padrão quando atualizacaoDescricao for string com apenas espaços', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ 
      ...chamadoBase, 
      status: 'ABERTO' 
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
    });
    listarHistoricoChamadoMock.mockResolvedValue([]);
    const dadosCancelamento = { 
      status: 'CANCELADO',
      atualizacaoDescricao: '    '
    };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: 'Chamado cancelado',
      })
    );
  });
});

describe('GET /chamado/:id/historico', () => {
  it('Deve retornar status 200 e listar histórico de atualizações do chamado', async () => {
    listarHistoricoChamadoMock.mockResolvedValue([{ _id: 'hid1', tipo: 'STATUS' }]);
    const resposta = await request(criarApp()).get('/chamado/chmid1/historico');
    expect(resposta.status).toBe(200);
    expect(Array.isArray(resposta.body)).toBeTruthy();
    expect(resposta.body[0]).toHaveProperty('_id');
  });

  it('Deve retornar status 500 quando ocorrer erro ao buscar histórico', async () => {
    listarHistoricoChamadoMock.mockRejectedValue(new Error('Database error'));
    const resposta = await request(criarApp()).get('/chamado/chmid1/historico');
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });
});

describe('PATCH /chamado/:id/reabrir-chamado', () => {
  it('Deve retornar status 404 quando tentar reabrir chamado inexistente', async () => {
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    Regra = 'USUARIO';
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 403 quando tentar reabrir chamado criado por outro usuário', async () => {
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      usuarioId: 'outro_usuario',
    });
    Regra = 'USUARIO';
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('criados por você');
  });

  it('Deve retornar status 400 quando tentar reabrir chamado já com status ABERTO', async () => {
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    Regra = 'USUARIO';
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando chamado ENCERRADO não tiver data de encerramento', async () => {
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: null,
    });
    Regra = 'USUARIO';
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando tentar reabrir chamado encerrado há mais de 48 horas', async () => {
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: new Date(Date.now() - 49 * 3600 * 1000).toISOString(),
    });
    Regra = 'USUARIO';
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na reabertura', async () => {
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    Regra = 'USUARIO';
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve reabrir chamado com sucesso quando tecnicoId existir no chamado', async () => {
    Regra = 'USUARIO';
    const encerradoRecente = new Date(Date.now() - 24 * 3600 * 1000);
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoRecente,
      tecnicoId: 'tec1',
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'REABERTO',
      tecnicoId: 'tec1',
      encerradoEm: null,
    });
    chamadoAtualizacaoModelMock.create.mockResolvedValue({});
    chamadoAtualizacaoModelMock.findOne.mockResolvedValue({
      _id: 'hist1',
      dataHora: new Date(),
      tipo: 'REABERTURA',
      de: 'ENCERRADO',
      para: 'REABERTO',
      descricao: 'Chamado reaberto pelo usuário dentro do prazo',
      autorId: usuarioPadrao.id,
      autorNome: usuarioPadrao.nome,
      autorEmail: usuarioPadrao.email,
    });
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({ atualizacaoDescricao: 'Problema voltou' });
    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe('REABERTO');
  });

  it('Deve buscar técnico no MongoDB quando tecnicoId for null (linhas 350-360)', async () => {
    Regra = 'USUARIO';
    const encerradoRecente = new Date(Date.now() - 24 * 3600 * 1000);
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoRecente,
      tecnicoId: null,
    });
    chamadoAtualizacaoModelMock.findOne.mockImplementation((query: any, projection: any, options: any) => {
      if (query.tipo === 'STATUS' && query.para === 'EM_ATENDIMENTO') {
        return Promise.resolve({
          autorId: 'tecnico_mongo_id',
          autorNome: 'Tecnico Mongo',
          autorEmail: 'tecnico@mongo.com',
        });
      }
      return Promise.resolve({
        _id: 'hist1',
        dataHora: new Date(),
        tipo: 'REABERTURA',
        de: 'ENCERRADO',
        para: 'REABERTO',
        descricao: 'Chamado reaberto pelo usuário dentro do prazo',
        autorId: usuarioPadrao.id,
        autorNome: usuarioPadrao.nome,
        autorEmail: usuarioPadrao.email,
      });
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'REABERTO',
      tecnicoId: 'tecnico_mongo_id',
      encerradoEm: null,
    });
    chamadoAtualizacaoModelMock.create.mockResolvedValue({});
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(200);
    expect(chamadoAtualizacaoModelMock.findOne).toHaveBeenCalled();
  });

  it('Deve reabrir chamado mesmo quando não encontrar técnico no MongoDB', async () => {
    Regra = 'USUARIO';
    const encerradoRecente = new Date(Date.now() - 24 * 3600 * 1000);
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoRecente,
      tecnicoId: null,
    });
    chamadoAtualizacaoModelMock.findOne.mockImplementation((query: any) => {
      if (query.tipo === 'STATUS' && query.para === 'EM_ATENDIMENTO') {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        _id: 'hist1',
        dataHora: new Date(),
        tipo: 'REABERTURA',
        de: 'ENCERRADO',
        para: 'REABERTO',
        descricao: 'Chamado reaberto pelo usuário dentro do prazo',
        autorId: usuarioPadrao.id,
        autorNome: usuarioPadrao.nome,
        autorEmail: usuarioPadrao.email,
      });
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'REABERTO',
      tecnicoId: null,
      encerradoEm: null,
      tecnico: null,
    });
    chamadoAtualizacaoModelMock.create.mockResolvedValue({});
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(200);
    expect(resposta.body.tecnico).toBeNull();
  });

  it('Deve usar descrição padrão quando atualizacaoDescricao for vazio', async () => {
    Regra = 'USUARIO';
    const encerradoRecente = new Date(Date.now() - 24 * 3600 * 1000);
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoRecente,
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'REABERTO',
      encerradoEm: null,
    });
    chamadoAtualizacaoModelMock.create.mockResolvedValue({});
    chamadoAtualizacaoModelMock.findOne.mockResolvedValue({
      _id: 'hist1',
      dataHora: new Date(),
      tipo: 'REABERTURA',
      de: 'ENCERRADO',
      para: 'REABERTO',
      descricao: 'Chamado reaberto pelo usuário dentro do prazo',
      autorId: usuarioPadrao.id,
      autorNome: usuarioPadrao.nome,
      autorEmail: usuarioPadrao.email,
    });
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({ atualizacaoDescricao: '   ' });
    expect(resposta.status).toBe(200);
  });

  it('Deve retornar response com servico null quando não tiver servicos', async () => {
    Regra = 'USUARIO';
    const encerradoRecente = new Date(Date.now() - 24 * 3600 * 1000);
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: encerradoRecente,
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'REABERTO',
      encerradoEm: null,
      servicos: [],
    });
    chamadoAtualizacaoModelMock.create.mockResolvedValue({});
    chamadoAtualizacaoModelMock.findOne.mockResolvedValue(null);
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    expect(resposta.status).toBe(200);
    expect(resposta.body.servico).toBeNull();
    expect(resposta.body.ultimaAtualizacao).toBeNull();
  });
});

describe('PATCH /chamado/:id/cancelar-chamado', () => {
  it('Deve retornar status 400 quando tentar cancelar chamado sem justificativa', async () => {
    Regra = 'ADMIN';
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({});
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 404 quando ADMIN tentar cancelar chamado inexistente', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 403 quando usuário tentar cancelar chamado de outro usuário', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      usuarioId: 'outro_usuario',
      status: 'ABERTO',
    });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(403);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando ADMIN tentar cancelar chamado ENCERRADO', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ENCERRADO' });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando ADMIN tentar cancelar chamado já cancelado', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'CANCELADO' });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 200 e cancelar chamado quando requisitos forem atendidos', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.chamado.update.mockResolvedValue({ ...chamadoBase, status: 'CANCELADO' });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('cancelado');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado no cancelamento', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve permitir USUARIO cancelar seu próprio chamado', async () => {
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ABERTO',
      usuarioId: usuarioPadrao.id,
    });
    prismaMock.chamado.update.mockResolvedValue({
      ...chamadoBase,
      status: 'CANCELADO',
    });
    const dadosCancelamento = { descricaoEncerramento: 'Desisti do chamado' };
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('cancelado');
  });
});

describe('DELETE /chamado/:id/excluir-chamado', () => {
  it('Deve retornar status 404 quando ADMIN tentar excluir chamado inexistente', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 200 e excluir chamado permanentemente com sucesso', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      servicos: [{ id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' } }],
    });
    prismaMock.ordemDeServico.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.chamado.delete.mockResolvedValue(chamadoBase);
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('deletado');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na exclusão', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    prismaMock.chamado.delete.mockRejectedValue(new Error('Database error'));
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 200 e excluir chamado mesmo sem ordens de servico associadas', async () => {
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      servicos: [],
    });
    prismaMock.ordemDeServico.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.chamado.delete.mockResolvedValue(chamadoBase);
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('deletado');
  });

  it('Deve retornar status 403 quando USUARIO tentar excluir chamado', async () => {
    Regra = 'USUARIO';
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    expect(resposta.status).toBe(403);
  });

  it('Deve retornar status 403 quando TECNICO tentar excluir chamado', async () => {
    Regra = 'TECNICO';
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    expect(resposta.status).toBe(403);
  });

  describe('Dado um chamado existente e um usuário autenticado com permissão para alterar seu status', () => {
    it('Deve cobrir todos os branches da descrição de histórico', async () => {    
      Regra = 'ADMIN';
      prismaMock.chamado.findUnique.mockResolvedValue({ 
        ...chamadoBase, 
        status: 'ABERTO' 
      });
      
      // Simular um update que resulta em status ABERTO (edge case)
      prismaMock.chamado.update.mockImplementationOnce((args: any) => {
        return Promise.resolve({
          ...chamadoBase,
          status: args.data.status,
          atualizadoEm: new Date(),
        });
      });
      
      listarHistoricoChamadoMock.mockResolvedValue([]);
      
      const dadosAtualizacao = { 
        status: 'CANCELADO'
      };
      
      const resposta = await request(criarApp())
        .patch('/chamado/chmid1/status')
        .send(dadosAtualizacao);
      
      expect(resposta.status).toBe(200);
      expect(salvarHistoricoChamadoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: "STATUS",
          para: "CANCELADO"
        })
      );
    });
  });
});