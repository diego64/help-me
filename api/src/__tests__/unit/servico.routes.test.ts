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

const servicoMock = {
  id: 'serv1',
  nome: 'Email',
  descricao: 'Envio de e-mails automáticos',
  ativo: true,
};

const prismaMock = {
  servico: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

let Regra = 'ADMIN';
vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; }
}));

vi.mock('../../lib/prisma.ts', () => ({
  prisma: prismaMock,
}));

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { id: 'uid', regra: Regra };
    next();
  },
  authorizeRoles: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.usuario.regra) ? next() : res.status(403).json({ error: 'Forbidden' }),
}));

let router: any;
beforeAll(async () => {
  router = (await import('../../routes/servico.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  Regra = 'ADMIN';
});

function getApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe('POST / (criação de serviço)', () => {
  it('deve retornar status 201 e criar um novo serviço quando receber dados válidos e o nome não existir no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(null);
    prismaMock.servico.create.mockResolvedValueOnce(servicoMock);
    const res = await request(getApp()).post('/').send(servicoMock);
    expect(res.status).toBe(201);
    expect(res.body.nome).toBe('Email');
  });

  it('deve retornar status 400 com mensagem de erro quando o campo "nome" não for enviado na requisição', async () => {
    const res = await request(getApp()).post('/').send({ descricao: 'Qualquer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('nome do serviço');
  });

  it('deve retornar status 409 com mensagem de conflito quando já existir um serviço com o mesmo nome', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    const res = await request(getApp()).post('/').send(servicoMock);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Já existe um serviço');
  });

  it('deve retornar status 400 quando ocorrer um erro inesperado durante a criação no banco de dados', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(null);
    prismaMock.servico.create.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).post('/').send(servicoMock);
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    const res = await request(getApp()).post('/').send(servicoMock);
    expect(res.status).toBe(403);
  });

  it('deve retornar status 400 quando nome for string vazia', async () => {
    const res = await request(getApp()).post('/').send({ nome: '', descricao: 'Qualquer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('nome do serviço');
  });

  it('deve retornar status 400 quando nome for apenas espaços em branco', async () => {
    const res = await request(getApp()).post('/').send({ nome: '   ', descricao: 'Qualquer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('nome do serviço');
  });
});

describe('GET / (listar serviços)', () => {
  it('deve retornar status 200 e listar apenas os serviços ativos quando não especificar parâmetros adicionais', async () => {
    prismaMock.servico.findMany.mockResolvedValueOnce([servicoMock]);
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].ativo).toBe(true);
  });

  it('deve retornar status 200 e incluir serviços inativos na listagem quando o parâmetro "incluirInativos=true" for enviado', async () => {
    const mockInativo = { ...servicoMock, id: 'serv2', ativo: false };
    prismaMock.servico.findMany.mockResolvedValueOnce([servicoMock, mockInativo]);
    const res = await request(getApp()).get('/?incluirInativos=true');
    expect(res.status).toBe(200);
    expect(res.body.find((s: { ativo: any; }) => !s.ativo)).toBeDefined();
  });

  it('deve retornar status 500 quando ocorrer uma falha na consulta ao banco de dados (findMany)', async () => {
    prismaMock.servico.findMany.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(500);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão ADMIN ou USUARIO', async () => {
    Regra = 'TECNICO';
    const res = await request(getApp()).get('/');
    expect(res.status).toBe(403);
  });

  it('deve cobrir o branch alternativo quando incluirInativos não é "true"', async () => {
    prismaMock.servico.findMany.mockResolvedValueOnce([servicoMock]);
    const res = await request(getApp()).get('/?incluirInativos=false');
    expect(res.status).toBe(200);
    expect(prismaMock.servico.findMany).toHaveBeenCalledWith({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
  });
});

describe('GET /:id (buscar serviço por id)', () => {
  it('deve retornar status 200 e os dados do serviço quando buscar por um ID existente', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    const res = await request(getApp()).get('/serv1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('serv1');
  });

  it('deve retornar status 404 com mensagem de erro quando buscar por um ID que não existe no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(null);
    const res = await request(getApp()).get('/serv2');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Serviço não encontrado');
  });

  it('deve retornar status 400 quando ocorrer um erro inesperado durante a busca no banco (findUnique)', async () => {
    prismaMock.servico.findUnique.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).get('/serv1');
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir permissão ADMIN ou USUARIO', async () => {
    Regra = 'TECNICO';
    const res = await request(getApp()).get('/serv1');
    expect(res.status).toBe(403);
  });
});

describe('PUT /:id (editar serviço)', () => {
  it('deve retornar status 200 e os dados atualizados quando editar um serviço existente com sucesso', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ ...servicoMock, nome: 'Email Corrigido' });
    const res = await request(getApp()).put('/serv1').send({ nome: 'Email Corrigido' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Email Corrigido');
  });

  it('deve retornar status 404 com mensagem de erro quando tentar editar um serviço que não existe', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(null);
    const res = await request(getApp()).put('/serv1').send({ nome: 'Novo' });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Serviço não encontrado');
  });

  it('deve retornar status 400 quando ocorrer uma falha durante a atualização no banco de dados (update)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).put('/serv1').send({ nome: 'Novo' });
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    const res = await request(getApp()).put('/serv1').send({ nome: 'Novo' });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // TESTES PARA COBERTURA 100% - Linha 90 (branches de nome e descricao)
  // -------------------------------------------------------------------------

  it('deve manter a descrição original quando descricao não for enviada (undefined - linha 90)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ ...servicoMock, nome: 'Novo Nome' });
    
    // Enviar apenas nome, sem descricao
    const res = await request(getApp()).put('/serv1').send({ nome: 'Novo Nome' });
    
    expect(res.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        nome: 'Novo Nome',
        descricao: servicoMock.descricao, // Deve usar a descrição original
      },
    });
  });

  it('deve manter a descrição original quando descricao for null (linha 90)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ ...servicoMock, nome: 'Novo Nome' });
    
    // Enviar descricao como null explicitamente
    const res = await request(getApp()).put('/serv1').send({ nome: 'Novo Nome', descricao: null });
    
    expect(res.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        nome: 'Novo Nome',
        descricao: servicoMock.descricao, // null ?? servico.descricao = servico.descricao
      },
    });
  });

  it('deve atualizar a descrição quando descricao for enviada como string vazia (linha 90)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ ...servicoMock, descricao: '' });
    
    // Enviar descricao como string vazia (não é null/undefined, então usa o valor)
    const res = await request(getApp()).put('/serv1').send({ nome: 'Email', descricao: '' });
    
    expect(res.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        nome: 'Email',
        descricao: '', // String vazia é um valor válido para ??
      },
    });
  });

  it('deve manter o nome original quando nome não for enviado (undefined)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ ...servicoMock, descricao: 'Nova Descricao' });
    
    // Enviar apenas descricao, sem nome
    const res = await request(getApp()).put('/serv1').send({ descricao: 'Nova Descricao' });
    
    expect(res.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        nome: servicoMock.nome, // Deve usar o nome original
        descricao: 'Nova Descricao',
      },
    });
  });

  it('deve manter o nome original quando nome for string vazia após trim', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce(servicoMock);
    
    // Enviar nome como string vazia ou apenas espaços
    const res = await request(getApp()).put('/serv1').send({ nome: '   ', descricao: 'Desc' });
    
    expect(res.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        nome: servicoMock.nome, // '' || servico.nome = servico.nome
        descricao: 'Desc',
      },
    });
  });

  it('deve atualizar ambos nome e descricao quando enviados com valores válidos', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ 
      ...servicoMock, 
      nome: 'Novo Nome', 
      descricao: 'Nova Descricao' 
    });
    
    const res = await request(getApp()).put('/serv1').send({ 
      nome: 'Novo Nome', 
      descricao: 'Nova Descricao' 
    });
    
    expect(res.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        nome: 'Novo Nome',
        descricao: 'Nova Descricao',
      },
    });
  });

  it('deve fazer trim do nome quando enviado com espaços nas extremidades', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ ...servicoMock, nome: 'Nome Com Espacos' });
    
    const res = await request(getApp()).put('/serv1').send({ nome: '  Nome Com Espacos  ' });
    
    expect(res.status).toBe(200);
    expect(prismaMock.servico.update).toHaveBeenCalledWith({
      where: { id: 'serv1' },
      data: {
        nome: 'Nome Com Espacos',
        descricao: servicoMock.descricao,
      },
    });
  });
});

describe('DELETE /:id/desativar (soft delete)', () => {
  it('deve retornar status 200 e mensagem de sucesso quando desativar um serviço ativo', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockResolvedValueOnce({ ...servicoMock, ativo: false });
    const res = await request(getApp()).delete('/serv1/desativar');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('desativado');
  });

  it('deve retornar status 404 quando tentar desativar um serviço que não existe no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(null);
    const res = await request(getApp()).delete('/serv2/desativar');
    expect(res.status).toBe(404);
  });

  it('deve retornar status 400 com mensagem de erro quando tentar desativar um serviço que já está desativado', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce({ ...servicoMock, ativo: false });
    const res = await request(getApp()).delete('/serv1/desativar');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('já está desativado');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a atualização do status no banco (update)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).delete('/serv1/desativar');
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    const res = await request(getApp()).delete('/serv1/desativar');
    expect(res.status).toBe(403);
  });
});

describe('PATCH /:id/reativar (reativar serviço)', () => {
  it('deve retornar status 200 e reativar o serviço quando ele estiver desativado', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce({ ...servicoMock, ativo: false });
    prismaMock.servico.update.mockResolvedValueOnce(servicoMock);
    const res = await request(getApp()).patch('/serv1/reativar');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reativado');
    expect(res.body.servico.ativo).toBe(true);
  });

  it('deve retornar status 404 quando tentar reativar um serviço que não existe no banco', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(null);
    const res = await request(getApp()).patch('/serv2/reativar');
    expect(res.status).toBe(404);
  });

  it('deve retornar status 400 com mensagem de erro quando tentar reativar um serviço que já está ativo', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    const res = await request(getApp()).patch('/serv1/reativar');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('já está ativo');
  });

  it('deve retornar status 400 quando ocorrer um erro durante a reativação no banco de dados (update)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce({ ...servicoMock, ativo: false });
    prismaMock.servico.update.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).patch('/serv1/reativar');
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    const res = await request(getApp()).patch('/serv1/reativar');
    expect(res.status).toBe(403);
  });
});

describe('DELETE /:id/excluir (hard delete)', () => {
  it('deve retornar status 200 e remover permanentemente o serviço do banco quando executar exclusão definitiva', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.delete.mockResolvedValueOnce({});
    const res = await request(getApp()).delete('/serv1/excluir');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('removido permanentemente');
  });

  it('deve retornar status 404 quando tentar excluir permanentemente um serviço que não existe', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(null);
    const res = await request(getApp()).delete('/serv2/excluir');
    expect(res.status).toBe(404);
  });

  it('deve retornar status 400 quando ocorrer um erro durante a exclusão permanente no banco (delete)', async () => {
    prismaMock.servico.findUnique.mockResolvedValueOnce(servicoMock);
    prismaMock.servico.delete.mockRejectedValueOnce(new Error('fail'));
    const res = await request(getApp()).delete('/serv1/excluir');
    expect(res.status).toBe(400);
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir a permissão ADMIN', async () => {
    Regra = 'USUARIO';
    const res = await request(getApp()).delete('/serv1/excluir');
    expect(res.status).toBe(403);
  });
});