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

const servicoBase = {
  id: 'serv1',
  nome: 'Suporte Técnico',
  descricao: 'Suporte técnico geral',
  ativo: true,
  geradoEm: '2025-01-01T00:00:00.000Z',
  atualizadoEm: '2025-01-01T00:00:00.000Z',
  deletadoEm: null,
};

const prismaMock = {
  servico: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

let usuarioRegra = 'ADMIN';

vi.mock('@prisma/client', () => ({
  PrismaClient: function () {
    return prismaMock;
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { id: 'uid1', regra: usuarioRegra };
    next();
  },
  authorizeRoles:
    (...roles: string[]) =>
    (req: any, res: any, next: any) =>
      roles.includes(req.usuario.regra)
        ? next()
        : res.status(403).json({ error: 'Forbidden' }),
}));

let router: any;

beforeAll(async () => {
  router = (await import('../../routes/servico.routes')).default;
}, 20000);

beforeEach(() => {
  vi.clearAllMocks();
  usuarioRegra = 'ADMIN';
  
  prismaMock.servico.findUnique.mockReset();
  prismaMock.servico.findMany.mockReset();
  prismaMock.servico.count.mockReset();
  prismaMock.servico.create.mockReset();
  prismaMock.servico.update.mockReset();
  prismaMock.servico.delete.mockReset();
});

function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/servicos', router);
  return app;
}

describe('POST /servicos (criação de serviço)', () => {
  it('deve retornar status 201 e criar serviço com dados válidos', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);
    prismaMock.servico.create.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'Suporte Técnico', descricao: 'Suporte técnico geral' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.nome).toBe('Suporte Técnico');
    expect(prismaMock.servico.create).toHaveBeenCalledWith({
      data: {
        nome: 'Suporte Técnico',
        descricao: 'Suporte técnico geral',
      },
      select: expect.any(Object),
    });
  });

  it('deve retornar status 400 quando nome não for enviado', async () => {
    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ descricao: 'Descrição' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Nome é obrigatório');
  });

  it('deve retornar status 400 quando nome for menor que 3 caracteres', async () => {
    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'AB' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('no mínimo 3 caracteres');
  });

  it('deve retornar status 400 quando nome for maior que 100 caracteres', async () => {
    const nomeGrande = 'A'.repeat(101);
    
    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: nomeGrande });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('no máximo 100 caracteres');
  });

  it('deve retornar status 400 quando descrição for maior que 500 caracteres', async () => {
    const descricaoGrande = 'A'.repeat(501);
    
    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'Serviço', descricao: descricaoGrande });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('no máximo 500 caracteres');
  });

  it('deve retornar status 409 quando já existir serviço com mesmo nome ativo', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      deletadoEm: null,
    });

    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'Suporte Técnico' });

    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toContain('Já existe um serviço com esse nome');
  });

  it('deve retornar status 409 quando existir serviço deletado com mesmo nome', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      deletadoEm: new Date(),
    });

    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'Suporte Técnico' });

    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toContain('serviço deletado com esse nome');
    expect(resposta.body.servicoId).toBe('serv1');
  });

  it('deve fazer trim do nome antes de criar', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);
    prismaMock.servico.create.mockResolvedValue(servicoBase);

    await request(criarApp())
      .post('/servicos')
      .send({ nome: '  Suporte Técnico  ' });

    expect(prismaMock.servico.create).toHaveBeenCalledWith({
      data: {
        nome: 'Suporte Técnico',
        descricao: null,
      },
      select: expect.any(Object),
    });
  });

  it('deve criar serviço sem descrição quando não fornecida', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);
    prismaMock.servico.create.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'Suporte Técnico' });

    expect(resposta.status).toBe(201);
    expect(prismaMock.servico.create).toHaveBeenCalledWith({
      data: {
        nome: 'Suporte Técnico',
        descricao: null,
      },
      select: expect.any(Object),
    });
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'Serviço' });

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);
    prismaMock.servico.create.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp())
      .post('/servicos')
      .send({ nome: 'Serviço' });

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao criar serviço');
  });
});

describe('GET /servicos (listagem de serviços)', () => {
  it('deve retornar status 200 com lista paginada de serviços ativos', async () => {
    prismaMock.servico.count.mockResolvedValue(1);
    prismaMock.servico.findMany.mockResolvedValue([servicoBase]);

    const resposta = await request(criarApp()).get('/servicos');

    expect(resposta.status).toBe(200);
    expect(resposta.body.data).toHaveLength(1);
    expect(resposta.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  });

  it('deve filtrar apenas serviços ativos por padrão', async () => {
    prismaMock.servico.count.mockResolvedValue(1);
    prismaMock.servico.findMany.mockResolvedValue([servicoBase]);

    await request(criarApp()).get('/servicos');

    expect(prismaMock.servico.findMany).toHaveBeenCalledWith({
      where: { ativo: true, deletadoEm: null },
      select: expect.any(Object),
      orderBy: { nome: 'asc' },
      skip: 0,
      take: 20,
    });
  });

  it('deve incluir serviços inativos quando solicitado', async () => {
    prismaMock.servico.count.mockResolvedValue(2);
    prismaMock.servico.findMany.mockResolvedValue([
      servicoBase,
      { ...servicoBase, id: 'serv2', ativo: false },
    ]);

    await request(criarApp()).get('/servicos?incluirInativos=true');

    expect(prismaMock.servico.findMany).toHaveBeenCalledWith({
      where: { deletadoEm: null },
      select: expect.any(Object),
      orderBy: { nome: 'asc' },
      skip: 0,
      take: 20,
    });
  });

  it('deve incluir serviços deletados quando solicitado', async () => {
    prismaMock.servico.count.mockResolvedValue(1);
    prismaMock.servico.findMany.mockResolvedValue([
      { ...servicoBase, deletadoEm: new Date() },
    ]);

    await request(criarApp()).get('/servicos?incluirDeletados=true');

    expect(prismaMock.servico.findMany).toHaveBeenCalledWith({
      where: { ativo: true },
      select: expect.any(Object),
      orderBy: { nome: 'asc' },
      skip: 0,
      take: 20,
    });
  });

  it('deve buscar por nome ou descrição quando fornecido termo de busca', async () => {
    prismaMock.servico.count.mockResolvedValue(1);
    prismaMock.servico.findMany.mockResolvedValue([servicoBase]);

    await request(criarApp()).get('/servicos?busca=Suporte');

    expect(prismaMock.servico.findMany).toHaveBeenCalledWith({
      where: {
        ativo: true,
        deletadoEm: null,
        OR: [
          { nome: { contains: 'Suporte', mode: 'insensitive' } },
          { descricao: { contains: 'Suporte', mode: 'insensitive' } },
        ],
      },
      select: expect.any(Object),
      orderBy: { nome: 'asc' },
      skip: 0,
      take: 20,
    });
  });

  it('deve aplicar paginação corretamente', async () => {
    prismaMock.servico.count.mockResolvedValue(50);
    prismaMock.servico.findMany.mockResolvedValue([servicoBase]);

    const resposta = await request(criarApp()).get('/servicos?page=2&limit=10');

    expect(resposta.status).toBe(200);
    expect(resposta.body.pagination).toMatchObject({
      page: 2,
      limit: 10,
      total: 50,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
    expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      })
    );
  });

  it('deve limitar paginação ao máximo de 100 itens', async () => {
    prismaMock.servico.count.mockResolvedValue(200);
    prismaMock.servico.findMany.mockResolvedValue([servicoBase]);

    await request(criarApp()).get('/servicos?limit=200');

    expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      })
    );
  });

  it('deve permitir acesso para USUARIO', async () => {
    usuarioRegra = 'USUARIO';
    prismaMock.servico.count.mockResolvedValue(0);
    prismaMock.servico.findMany.mockResolvedValue([]);

    const resposta = await request(criarApp()).get('/servicos');

    expect(resposta.status).toBe(200);
  });

  it('deve permitir acesso para TECNICO', async () => {
    usuarioRegra = 'TECNICO';
    prismaMock.servico.count.mockResolvedValue(0);
    prismaMock.servico.findMany.mockResolvedValue([]);

    const resposta = await request(criarApp()).get('/servicos');

    expect(resposta.status).toBe(200);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.count.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).get('/servicos');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao listar serviços');
  });
});

describe('GET /servicos/:id (buscar serviço específico)', () => {
  it('deve retornar status 200 com dados do serviço quando encontrado', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      _count: { chamados: 5 },
    });

    const resposta = await request(criarApp()).get('/servicos/serv1');

    expect(resposta.status).toBe(200);
    expect(resposta.body.id).toBe('serv1');
    expect(resposta.body.nome).toBe('Suporte Técnico');
  });

  it('deve retornar status 404 quando serviço não existir', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).get('/servicos/serv999');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Serviço não encontrado');
  });

  it('deve permitir acesso para USUARIO', async () => {
    usuarioRegra = 'USUARIO';
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp()).get('/servicos/serv1');

    expect(resposta.status).toBe(200);
  });

  it('deve permitir acesso para TECNICO', async () => {
    usuarioRegra = 'TECNICO';
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp()).get('/servicos/serv1');

    expect(resposta.status).toBe(200);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.findUnique.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).get('/servicos/serv1');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao buscar serviço');
  });
});

describe('PUT /servicos/:id (edição de serviço)', () => {
  it('deve retornar status 200 e atualizar serviço com sucesso', async () => {
    prismaMock.servico.findUnique
      .mockResolvedValueOnce(servicoBase)
      .mockResolvedValueOnce(null);
    prismaMock.servico.update.mockResolvedValue({
      ...servicoBase,
      nome: 'Novo Nome',
    });

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ nome: 'Novo Nome' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.nome).toBe('Novo Nome');
  });

  it('deve retornar status 404 quando serviço não existir', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp())
      .put('/servicos/serv999')
      .send({ nome: 'Novo Nome' });

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Serviço não encontrado');
  });

  it('deve retornar status 400 quando tentar editar serviço deletado', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      deletadoEm: new Date(),
    });

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ nome: 'Novo Nome' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Não é possível editar um serviço deletado');
  });

  it('deve retornar status 400 quando nome for inválido', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ nome: 'AB' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('no mínimo 3 caracteres');
  });

  it('deve retornar status 409 quando novo nome já existir em outro serviço', async () => {
    prismaMock.servico.findUnique
      .mockResolvedValueOnce(servicoBase)
      .mockResolvedValueOnce({ ...servicoBase, id: 'serv2' });

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ nome: 'Nome Existente' });

    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toContain('Já existe outro serviço com esse nome');
  });

  it('deve permitir manter o mesmo nome ao editar', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
    prismaMock.servico.update.mockResolvedValue({
      ...servicoBase,
      descricao: 'Nova Descrição',
    });

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ nome: 'Suporte Técnico', descricao: 'Nova Descrição' });

    expect(resposta.status).toBe(200);
  });

  it('deve atualizar apenas descrição quando nome não for fornecido', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
    prismaMock.servico.update.mockResolvedValue({
      ...servicoBase,
      descricao: 'Nova Descrição',
    });

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ descricao: 'Nova Descrição' });

    expect(resposta.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: { descricao: 'Nova Descrição' },
      select: expect.any(Object),
    });
  });

  it('deve retornar serviço inalterado quando nenhum dado for fornecido', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({});

    expect(resposta.status).toBe(200);
    expect(prismaMock.servico.update).not.toHaveBeenCalled();
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ nome: 'Novo Nome' });

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
    prismaMock.servico.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp())
      .put('/servicos/serv1')
      .send({ nome: 'Novo Nome' });

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao atualizar serviço');
  });
});

describe('PATCH /servicos/:id/desativar (desativação)', () => {
  it('deve retornar status 200 e desativar serviço com sucesso', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
    prismaMock.servico.update.mockResolvedValue({
      ...servicoBase,
      ativo: false,
    });

    const resposta = await request(criarApp()).patch('/servicos/serv1/desativar');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('desativado com sucesso');
  });

  it('deve retornar status 404 quando serviço não existir', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).patch('/servicos/serv999/desativar');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Serviço não encontrado');
  });

  it('deve retornar status 400 quando serviço já estiver desativado', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      ativo: false,
    });

    const resposta = await request(criarApp()).patch('/servicos/serv1/desativar');

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('já está desativado');
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp()).patch('/servicos/serv1/desativar');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
    prismaMock.servico.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).patch('/servicos/serv1/desativar');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao desativar serviço');
  });
});

describe('PATCH /servicos/:id/reativar (reativação)', () => {
  it('deve retornar status 200 e reativar serviço com sucesso', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      ativo: false,
    });
    prismaMock.servico.update.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp()).patch('/servicos/serv1/reativar');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('reativado com sucesso');
    expect(resposta.body.servico.ativo).toBe(true);
  });

  it('deve retornar status 404 quando serviço não existir', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).patch('/servicos/serv999/reativar');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Serviço não encontrado');
  });

  it('deve retornar status 400 quando serviço estiver deletado', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      ativo: false,
      deletadoEm: new Date(),
    });

    const resposta = await request(criarApp()).patch('/servicos/serv1/reativar');

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('Não é possível reativar um serviço deletado');
  });

  it('deve retornar status 400 quando serviço já estiver ativo', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp()).patch('/servicos/serv1/reativar');

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('já está ativo');
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp()).patch('/servicos/serv1/reativar');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      ativo: false,
    });
    prismaMock.servico.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).patch('/servicos/serv1/reativar');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao reativar serviço');
  });
});

describe('DELETE /servicos/:id (deleção)', () => {
  it('deve retornar status 200 e fazer soft delete por padrão', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      _count: { chamados: 0 },
    });
    prismaMock.servico.update.mockResolvedValue({
      ...servicoBase,
      deletadoEm: new Date(),
    });

    const resposta = await request(criarApp()).delete('/servicos/serv1');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('deletado com sucesso');
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        deletadoEm: expect.any(Date),
        ativo: false,
      },
    });
  });

  it('deve retornar status 200 e fazer hard delete quando solicitado', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      _count: { chamados: 0 },
    });
    prismaMock.servico.delete.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp()).delete('/servicos/serv1?permanente=true');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('removido permanentemente');
    expect(prismaMock.servico.delete).toHaveBeenCalledWith({
      where: { id: 'serv1' },
    });
  });

  it('deve retornar status 400 quando tentar hard delete com chamados vinculados', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      _count: { chamados: 5 },
    });

    const resposta = await request(criarApp()).delete('/servicos/serv1?permanente=true');

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('5 chamados vinculados');
  });

  it('deve retornar status 404 quando serviço não existir', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).delete('/servicos/serv999');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Serviço não encontrado');
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp()).delete('/servicos/serv1');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      _count: { chamados: 0 },
    });
    prismaMock.servico.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).delete('/servicos/serv1');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao deletar serviço');
  });
});

describe('PATCH /servicos/:id/restaurar (restauração)', () => {
  it('deve retornar status 200 e restaurar serviço deletado', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      deletadoEm: new Date(),
    });
    prismaMock.servico.update.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp()).patch('/servicos/serv1/restaurar');

    expect(resposta.status).toBe(200);
    expect(resposta.body.message).toContain('restaurado com sucesso');
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        deletadoEm: null,
        ativo: true,
      },
      select: expect.any(Object),
    });
  });

  it('deve retornar status 404 quando serviço não existir', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(null);

    const resposta = await request(criarApp()).patch('/servicos/serv999/restaurar');

    expect(resposta.status).toBe(404);
    expect(resposta.body.error).toContain('Serviço não encontrado');
  });

  it('deve retornar status 400 quando serviço não estiver deletado', async () => {
    prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

    const resposta = await request(criarApp()).patch('/servicos/serv1/restaurar');

    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toContain('não está deletado');
  });

  it('deve retornar status 403 quando usuário não for ADMIN', async () => {
    usuarioRegra = 'USUARIO';

    const resposta = await request(criarApp()).patch('/servicos/serv1/restaurar');

    expect(resposta.status).toBe(403);
  });

  it('deve retornar status 500 quando ocorrer erro no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValue({
      ...servicoBase,
      deletadoEm: new Date(),
    });
    prismaMock.servico.update.mockRejectedValue(new Error('Database error'));

    const resposta = await request(criarApp()).patch('/servicos/serv1/restaurar');

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toContain('Erro ao restaurar serviço');
  });
});