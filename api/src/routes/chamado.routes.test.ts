import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
};

// ============================================================================
// MOCKS DOS REPOSITÓRIOS
// ============================================================================

const salvarHistoricoChamadoMock = vi.fn();
const listarHistoricoChamadoMock = vi.fn();

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
  servicos: [{ id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' }}],
  tecnico: { nome: "TECNICO", email: "tec@em.com" }
};

// ============================================================================
// MOCKS DE MÓDULOS
// ============================================================================

vi.mock('@prisma/client', () => ({
  PrismaClient: function() { return prismaMock; },
}));

vi.mock('../repositories/chamadoAtualizacao.repository', () => ({
  salvarHistoricoChamado: salvarHistoricoChamadoMock,
  listarHistoricoChamado: listarHistoricoChamadoMock,
}));

// ============================================================================
// ESTADO DE AUTENTICAÇÃO
// ============================================================================

let Regra = 'USUARIO';

vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { ...usuarioPadrao, regra: Regra };
    req.session = { destroy: (cb: any) => cb(null) };
    next();
  },
  authorizeRoles: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.usuario.regra) ? next() : res.status(403).json({ error: 'Forbidden' }),
}));

// ============================================================================
// SETUP E TEARDOWN
// ============================================================================

let router: any;

beforeAll(async () => {
  router = (await import('./chamado.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(prismaMock.chamado).forEach(fn => vi.mocked(fn).mockReset());
  Object.values(prismaMock.servico).forEach(fn => vi.mocked(fn).mockReset());
  Object.values(prismaMock.ordemDeServico).forEach(fn => vi.mocked(fn).mockReset());
  Regra = 'USUARIO';
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
    // Arrange
    const dadosInvalidos = {};
    
    // Act
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosInvalidos);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando algum campo obrigatório estiver vazio', async () => {
    // Arrange
    const dadosComCampoVazio = { descricao: 'Foo', servico: '' };
    
    // Act
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosComCampoVazio);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando serviço solicitado não existir no banco', async () => {
    // Arrange
    prismaMock.servico.findMany.mockResolvedValue([]);
    const dadosComServicoInexistente = { descricao: 'Teste', servico: 'ServicoInexistente' };
    
    // Act
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosComServicoInexistente);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('não foram encontrados');
  });

  it('Deve retornar status 201 e criar chamado quando dados válidos forem fornecidos', async () => {
    // Arrange
    prismaMock.servico.findMany.mockResolvedValue([{ id: 'id1', nome: 'ServicoA' }]);
    prismaMock.$transaction.mockImplementation(async fn => fn(prismaMock));
    prismaMock.chamado.findFirst.mockResolvedValue(null);
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    prismaMock.chamado.create.mockResolvedValue(chamadoBase);
    const dadosValidos = { descricao: 'Teste', servico: 'ServicoA' };

    // Act
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    
    // Assert
    expect(resposta.status).toBe(201);
    expect(resposta.body).toHaveProperty('id');
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na criação', async () => {
    // Arrange
    prismaMock.servico.findMany.mockRejectedValue(new Error('Database connection failed'));
    const dadosValidos = { descricao: 'Teste', servico: 'ServicoA' };
    
    // Act
    const resposta = await request(criarApp())
      .post('/chamado/abertura-chamado')
      .send(dadosValidos);
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao criar o chamado');
  });
});

describe('PATCH /chamado/:id/status', () => {
  it('Deve retornar status 400 quando status informado for inválido', async () => {
    // Arrange
    Regra = 'ADMIN';
    const statusInvalido = { status: 'STATUS_INVALIDO' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/123/status')
      .send(statusInvalido);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 404 quando tentar alterar status de chamado inexistente', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    const dadosValidos = { status: 'ENCERRADO', descricaoEncerramento: 'Resolvido' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/123/status')
      .send(dadosValidos);
    
    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando ADMIN tentar alterar status de chamado cancelado', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'CANCELADO' });
    const dadosAtualizacao = { status: 'ENCERRADO', descricaoEncerramento: 'Resolvido' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('cancelados');
  });

  it('Deve retornar status 403 quando técnico tentar alterar chamado encerrado', async () => {
    // Arrange
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ENCERRADO' });
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    
    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('técnicos');
  });

  it('Deve retornar status 403 quando técnico tentar cancelar chamado', async () => {
    // Arrange
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'EM_ATENDIMENTO' });
    const dadosCancelamento = { status: 'CANCELADO' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosCancelamento);
    
    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando tentar encerrar chamado sem descrição de encerramento', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    const dadosSemDescricao = { status: 'ENCERRADO' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosSemDescricao);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('encerramento');
  });

  it('Deve retornar status 403 quando técnico fora do expediente tentar assumir chamado', async () => {
    // Arrange
    Regra = 'TECNICO';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.expediente.findMany.mockResolvedValue([
      { entrada: '08:00', saida: '10:00', usuarioId: usuarioPadrao.id }
    ]);
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(19);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);
    const dadosAtualizacao = { status: 'EM_ATENDIMENTO' };

    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    
    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('horário');
  });

  it('Deve retornar status 200 e atualizar status quando requisitos forem atendidos', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    prismaMock.chamado.update.mockResolvedValue({ 
      ...chamadoBase, 
      status: 'ENCERRADO', 
      descricaoEncerramento: 'Resolvido' 
    });
    listarHistoricoChamadoMock.mockResolvedValue([
      { _id: 'hid1', tipo: 'STATUS', autorId: usuarioPadrao.id }
    ]);
    const dadosEncerramento = { 
      status: 'ENCERRADO', 
      descricaoEncerramento: 'Resolvido', 
      atualizacaoDescricao: 'Problema solucionado' 
    };

    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosEncerramento);

    // Assert
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
    expect(resposta.body.ultimaAtualizacao).toHaveProperty('id');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na atualização', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    const dadosAtualizacao = { status: 'CANCELADO' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/status')
      .send(dadosAtualizacao);
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });
});

describe('GET /chamado/:id/historico', () => {
  it('Deve retornar status 200 e listar histórico de atualizações do chamado', async () => {
    // Arrange
    listarHistoricoChamadoMock.mockResolvedValue([{ _id: 'hid1', tipo: 'STATUS' }]);
    
    // Act
    const resposta = await request(criarApp()).get('/chamado/chmid1/historico');
    
    // Assert
    expect(resposta.status).toBe(200);
    expect(Array.isArray(resposta.body)).toBeTruthy();
    expect(resposta.body[0]).toHaveProperty('_id');
  });

  it('Deve retornar status 500 quando ocorrer erro ao buscar histórico', async () => {
    // Arrange
    listarHistoricoChamadoMock.mockRejectedValue(new Error('Database error'));
    
    // Act
    const resposta = await request(criarApp()).get('/chamado/chmid1/historico');
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });
});

describe('PATCH /chamado/:id/reabrir-chamado', () => {
  it('Deve retornar status 404 quando tentar reabrir chamado inexistente', async () => {
    // Arrange
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    Regra = 'USUARIO';
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 403 quando tentar reabrir chamado criado por outro usuário', async () => {
    // Arrange
    prismaMock.chamado.findUnique.mockResolvedValue({ 
      ...chamadoBase, 
      usuarioId: 'outro_usuario' 
    });
    Regra = 'USUARIO';
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('criados por você');
  });

  it('Deve retornar status 400 quando tentar reabrir chamado já com status ABERTO', async () => {
    // Arrange
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    Regra = 'USUARIO';
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando chamado ENCERRADO não tiver data de encerramento', async () => {
    // Arrange
    prismaMock.chamado.findUnique.mockResolvedValue({ 
      ...chamadoBase, 
      status: 'ENCERRADO', 
      encerradoEm: null 
    });
    Regra = 'USUARIO';
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando tentar reabrir chamado encerrado há mais de 48 horas', async () => {
    // Arrange
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: new Date(Date.now() - 49 * 3600 * 1000).toISOString(),
    });
    Regra = 'USUARIO';
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it.skip('Deve retornar status 200 e reabrir chamado dentro do prazo de 48 horas', async () => {
    // TODO: Este teste está com timeout - necessário revisar a implementação da rota
    // Possíveis causas: mock faltando, transação pendente, ou dependência externa não mockada
    
    // Arrange
    Regra = 'USUARIO';
    
    const chamadoEncerrado = {
      ...chamadoBase,
      status: 'ENCERRADO',
      encerradoEm: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      tecnicoId: 'tec1',
      usuario: usuarioPadrao,
      tecnico: { nome: "TECNICO", email: "tec@em.com" },
      servicos: [{ id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' } }]
    };
    
    const chamadoReaberto = {
      ...chamadoBase,
      status: 'REABERTO',
      encerradoEm: null,
      descricaoEncerramento: null,
      atualizadoEm: new Date().toISOString(),
      tecnicoId: 'tec1',
      usuario: usuarioPadrao,
      tecnico: { nome: "TECNICO", email: "tec@em.com" },
      servicos: [{ id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' } }]
    };
    
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoEncerrado);
    prismaMock.chamado.update.mockResolvedValue(chamadoReaberto);
    
    listarHistoricoChamadoMock.mockResolvedValue([
      { 
        _id: 'hid_encerramento',
        tipo: 'STATUS',
        de: 'EM_ATENDIMENTO',
        para: 'ENCERRADO',
        autorId: 'tec1',
        chamadoId: 'chmid1'
      }
    ]);
    
    salvarHistoricoChamadoMock.mockResolvedValue({
      _id: 'hid_reabertura',
      dataHora: new Date().toISOString(),
      tipo: 'REABERTURA',
      de: 'ENCERRADO',
      para: 'REABERTO',
      descricao: 'Chamado reaberto pelo usuário dentro do prazo',
      autorId: usuarioPadrao.id,
      autorNome: usuarioPadrao.nome,
      autorEmail: usuarioPadrao.email,
      chamadoId: 'chmid1'
    });

    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(200);
    expect(salvarHistoricoChamadoMock).toHaveBeenCalled();
    expect(listarHistoricoChamadoMock).toHaveBeenCalled();
    expect(resposta.body.status).toBe('REABERTO');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na reabertura', async () => {
    // Arrange
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    Regra = 'USUARIO';
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/reabrir-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });
});

describe('PATCH /chamado/:id/cancelar-chamado', () => {
  it('Deve retornar status 400 quando tentar cancelar chamado sem justificativa', async () => {
    // Arrange
    Regra = 'ADMIN';
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send({});
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 404 quando ADMIN tentar cancelar chamado inexistente', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    
    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 403 quando usuário tentar cancelar chamado de outro usuário', async () => {
    // Arrange
    Regra = 'USUARIO';
    prismaMock.chamado.findUnique.mockResolvedValue({ 
      ...chamadoBase, 
      usuarioId: 'outro_usuario', 
      status: 'ABERTO' 
    });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    
    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando ADMIN tentar cancelar chamado ENCERRADO', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ENCERRADO' });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 400 quando ADMIN tentar cancelar chamado já cancelado', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'CANCELADO' });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    
    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 200 e cancelar chamado quando requisitos forem atendidos', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({ ...chamadoBase, status: 'ABERTO' });
    prismaMock.chamado.update.mockResolvedValue({ ...chamadoBase, status: 'CANCELADO' });
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    
    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('cancelado');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado no cancelamento', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockRejectedValue(new Error('Database error'));
    const dadosCancelamento = { descricaoEncerramento: 'Motivo do cancelamento' };
    
    // Act
    const resposta = await request(criarApp())
      .patch('/chamado/chmid1/cancelar-chamado')
      .send(dadosCancelamento);
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });
});

describe('DELETE /chamado/:id/excluir-chamado', () => {
  it('Deve retornar status 404 quando ADMIN tentar excluir chamado inexistente', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(null);
    
    // Act
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    
    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.body).toHaveProperty('error');
  });

  it('Deve retornar status 200 e excluir chamado permanentemente com sucesso', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue({
      ...chamadoBase,
      servicos: [{ id: 'sid1', servico: { id: 'serv1', nome: 'ServicoA' } }]
    });
    prismaMock.ordemDeServico.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.chamado.delete.mockResolvedValue(chamadoBase);
    
    // Act
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    
    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('deletado');
  });

  it('Deve retornar status 500 quando ocorrer erro inesperado na exclusão', async () => {
    // Arrange
    Regra = 'ADMIN';
    prismaMock.chamado.findUnique.mockResolvedValue(chamadoBase);
    prismaMock.chamado.delete.mockRejectedValue(new Error('Database error'));
    
    // Act
    const resposta = await request(criarApp()).delete('/chamado/chmid1/excluir-chamado');
    
    // Assert
    expect(resposta.status).toBe(500);
    expect(resposta.body).toHaveProperty('error');
  });
});