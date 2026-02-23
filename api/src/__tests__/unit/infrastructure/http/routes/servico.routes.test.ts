import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Response, NextFunction } from 'express';
import request from 'supertest';
import type { Regra } from '@prisma/client';

let currentUserRole: Regra = 'ADMIN';

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

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

vi.mock('@infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, res: Response, next: NextFunction) => {
    req.usuario = {
      id: 'test-user-id',
      email: 'test@example.com',
      regra: currentUserRole,
      type: 'access',
    };
    next();
  },
  authorizeRoles: (...allowedRoles: string[]) => {
    return (req: any, res: Response, next: NextFunction) => {
      if (!req.usuario) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }
      
      if (!allowedRoles.includes(req.usuario.regra)) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
      
      next();
    };
  },
  AuthRequest: class {},
}));

const { default: servicoRoutes } = await import('@presentation/http/routes/servico.routes');

const servicoBase = {
  id: 'serv-123',
  nome: 'Suporte Técnico',
  descricao: 'Suporte técnico geral',
  ativo: true,
  geradoEm: new Date('2025-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2025-01-01T00:00:00.000Z'),
  deletadoEm: null,
};

const servicoInativo = {
  id: 'serv-456',
  nome: 'Serviço Inativo',
  descricao: 'Descrição',
  ativo: false,
  geradoEm: new Date('2025-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2025-01-02T00:00:00.000Z'),
  deletadoEm: null,
};

const servicoDeletado = {
  id: 'serv-789',
  nome: 'Serviço Deletado',
  descricao: 'Descrição',
  ativo: false,
  geradoEm: new Date('2025-01-01T00:00:00.000Z'),
  atualizadoEm: new Date('2025-01-03T00:00:00.000Z'),
  deletadoEm: new Date('2025-01-03T00:00:00.000Z'),
};

const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/servicos', servicoRoutes);
  return app;
}

beforeEach(() => {
  currentUserRole = 'ADMIN';
  Object.values(prismaMock.servico).forEach(mock => mock.mockReset());
  consoleSpy.log.mockClear();
  consoleSpy.error.mockClear();
});

describe('POST /servicos (criação de serviço)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 201 e criar serviço com dados válidos', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Suporte Técnico', descricao: 'Suporte técnico geral' });

      expect(resposta.status).toBe(201);
      expect(resposta.body).toMatchObject({
        id: servicoBase.id,
        nome: servicoBase.nome,
        descricao: servicoBase.descricao,
        ativo: servicoBase.ativo,
      });
      
      expect(prismaMock.servico.create).toHaveBeenCalledWith({
        data: {
          nome: 'Suporte Técnico',
          descricao: 'Suporte técnico geral',
        },
        select: expect.any(Object),
      });
      
      expect(consoleSpy.log).toHaveBeenCalledWith('[SERVICO CREATED]', {
        id: servicoBase.id,
        nome: servicoBase.nome,
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

    it('deve fazer trim da descrição antes de criar', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue(servicoBase);

      await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Suporte Técnico', descricao: '  Descrição com espaços  ' });

      expect(prismaMock.servico.create).toHaveBeenCalledWith({
        data: {
          nome: 'Suporte Técnico',
          descricao: 'Descrição com espaços',
        },
        select: expect.any(Object),
      });
    });

    it('deve criar serviço com descrição vazia como null', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue(servicoBase);

      await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Suporte Técnico', descricao: '' });

      expect(prismaMock.servico.create).toHaveBeenCalledWith({
        data: {
          nome: 'Suporte Técnico',
          descricao: null,
        },
        select: expect.any(Object),
      });
    });

    it('deve aceitar nome com exatamente 3 caracteres', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue({ ...servicoBase, nome: 'ABC' });

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'ABC' });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar nome com exatamente 100 caracteres', async () => {
      const nome100 = 'A'.repeat(100);
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue({ ...servicoBase, nome: nome100 });

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: nome100 });

      expect(resposta.status).toBe(201);
    });

    it('deve aceitar descrição com exatamente 500 caracteres', async () => {
      const desc500 = 'A'.repeat(500);
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue({ ...servicoBase, descricao: desc500 });

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Serviço', descricao: desc500 });

      expect(resposta.status).toBe(201);
    });
  });

  describe('Validação de nome', () => {
    it('deve retornar status 400 quando nome não for enviado', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ descricao: 'Descrição' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for null', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: null });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for undefined', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: undefined });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for número', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 123 });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for objeto', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: {} });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for array', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: [] });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for string vazia', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: '' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve retornar status 400 quando nome for apenas espaços', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: '   ' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 3 caracteres');
    });

    it('deve retornar status 400 quando nome for menor que 3 caracteres', async () => {
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'AB' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 3 caracteres');
    });

    it('deve retornar status 400 quando nome tiver exatamente 101 caracteres', async () => {
      const nomeGrande = 'A'.repeat(101);
      
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: nomeGrande });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });

    it('deve retornar status 400 quando nome tiver mais de 100 caracteres', async () => {
      const nomeGrande = 'A'.repeat(150);
      
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: nomeGrande });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 100 caracteres');
    });
  });

  describe('Validação de descrição', () => {
    it('deve retornar status 400 quando descrição for maior que 500 caracteres', async () => {
      const descricaoGrande = 'A'.repeat(501);
      
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Serviço', descricao: descricaoGrande });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 500 caracteres');
    });

    it('deve retornar status 400 quando descrição for muito grande', async () => {
      const descricaoGrande = 'A'.repeat(1000);
      
      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Serviço', descricao: descricaoGrande });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 500 caracteres');
    });
  });

  describe('Validação de duplicação', () => {
    it('deve retornar status 409 quando já existir serviço ativo com mesmo nome', async () => {
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
      expect(resposta.body.servicoId).toBe(servicoBase.id);
    });

    it('deve verificar nome case-sensitive ao criar', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockResolvedValue(servicoBase);

      await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Suporte Técnico' });

      expect(prismaMock.servico.findUnique).toHaveBeenCalledWith({
        where: { nome: 'Suporte Técnico' },
        select: expect.any(Object),
      });
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Serviço' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toBe('Acesso negado.');
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Serviço' });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toBe('Acesso negado.');
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao verificar duplicação', async () => {
      const erroMock = new Error('Database connection error');
      prismaMock.servico.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Serviço' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao criar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO CREATE ERROR]', erroMock);
    });

    it('deve retornar status 500 quando ocorrer erro ao criar no banco', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique.mockResolvedValue(null);
      prismaMock.servico.create.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .post('/servicos')
        .send({ nome: 'Serviço' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao criar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO CREATE ERROR]', erroMock);
    });
  });
});

describe('GET /servicos (listagem de serviços)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 com lista vazia', async () => {
      prismaMock.servico.count.mockResolvedValue(0);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toEqual([]);
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('deve retornar status 200 com lista paginada de serviços ativos', async () => {
      prismaMock.servico.count.mockResolvedValue(1);
      prismaMock.servico.findMany.mockResolvedValue([{
        ...servicoBase,
        _count: { chamados: 5 },
      }]);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(1);
      expect(resposta.body.data[0]).toMatchObject({
        id: servicoBase.id,
        nome: servicoBase.nome,
        ativo: true,
      });
      expect(resposta.body.data[0]._count.chamados).toBe(5);
      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('deve ordenar serviços por nome ascendente', async () => {
      prismaMock.servico.count.mockResolvedValue(3);
      prismaMock.servico.findMany.mockResolvedValue([
        { ...servicoBase, nome: 'A Serviço', _count: { chamados: 0 } },
        { ...servicoBase, nome: 'B Serviço', _count: { chamados: 0 } },
        { ...servicoBase, nome: 'C Serviço', _count: { chamados: 0 } },
      ]);

      await request(criarApp()).get('/servicos');

      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { nome: 'asc' },
        })
      );
    });
  });

  describe('Filtros', () => {
    it('deve filtrar apenas serviços ativos por padrão', async () => {
      prismaMock.servico.count.mockResolvedValue(1);
      prismaMock.servico.findMany.mockResolvedValue([{
        ...servicoBase,
        _count: { chamados: 0 },
      }]);

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
        { ...servicoBase, _count: { chamados: 0 } },
        { ...servicoInativo, _count: { chamados: 0 } },
      ]);

      const resposta = await request(criarApp()).get('/servicos?incluirInativos=true');

      expect(resposta.status).toBe(200);
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
        { ...servicoDeletado, _count: { chamados: 0 } },
      ]);

      const resposta = await request(criarApp()).get('/servicos?incluirDeletados=true');

      expect(resposta.status).toBe(200);
      expect(prismaMock.servico.findMany).toHaveBeenCalledWith({
        where: { ativo: true },
        select: expect.any(Object),
        orderBy: { nome: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('deve incluir todos os serviços quando ambos os flags forem true', async () => {
      prismaMock.servico.count.mockResolvedValue(3);
      prismaMock.servico.findMany.mockResolvedValue([
        { ...servicoBase, _count: { chamados: 0 } },
        { ...servicoInativo, _count: { chamados: 0 } },
        { ...servicoDeletado, _count: { chamados: 0 } },
      ]);

      const resposta = await request(criarApp()).get('/servicos?incluirInativos=true&incluirDeletados=true');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toHaveLength(3);
      expect(prismaMock.servico.findMany).toHaveBeenCalledWith({
        where: {},
        select: expect.any(Object),
        orderBy: { nome: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('deve buscar por nome quando fornecido termo de busca', async () => {
      prismaMock.servico.count.mockResolvedValue(1);
      prismaMock.servico.findMany.mockResolvedValue([{
        ...servicoBase,
        _count: { chamados: 0 },
      }]);

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

    it('deve buscar case-insensitive', async () => {
      prismaMock.servico.count.mockResolvedValue(1);
      prismaMock.servico.findMany.mockResolvedValue([{
        ...servicoBase,
        _count: { chamados: 0 },
      }]);

      await request(criarApp()).get('/servicos?busca=SUPORTE');

      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { nome: { contains: 'SUPORTE', mode: 'insensitive' } },
              { descricao: { contains: 'SUPORTE', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('deve combinar busca com outros filtros', async () => {
      prismaMock.servico.count.mockResolvedValue(1);
      prismaMock.servico.findMany.mockResolvedValue([]);

      await request(criarApp()).get('/servicos?busca=TI&incluirInativos=true');

      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletadoEm: null,
            OR: [
              { nome: { contains: 'TI', mode: 'insensitive' } },
              { descricao: { contains: 'TI', mode: 'insensitive' } },
            ],
          },
        })
      );
    });
  });

  describe('Paginação', () => {
    it('deve aplicar paginação padrão (página 1, limite 20)', async () => {
      prismaMock.servico.count.mockResolvedValue(50);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.body.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 50,
        totalPages: 3,
      });
      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        })
      );
    });

    it('deve aplicar paginação personalizada', async () => {
      prismaMock.servico.count.mockResolvedValue(50);
      prismaMock.servico.findMany.mockResolvedValue([]);

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

    it('deve usar página 1 quando page for 0', async () => {
      prismaMock.servico.count.mockResolvedValue(10);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?page=0');

      expect(resposta.body.pagination.page).toBe(1);
      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
        })
      );
    });

    it('deve usar página 1 quando page for negativo', async () => {
      prismaMock.servico.count.mockResolvedValue(10);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?page=-5');

      expect(resposta.body.pagination.page).toBe(1);
    });

    it('deve usar limit 1 quando limit for 0', async () => {
      prismaMock.servico.count.mockResolvedValue(10);
      prismaMock.servico.findMany.mockResolvedValue([]);

      await request(criarApp()).get('/servicos?limit=0');

      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        })
      );
    });

    it('deve usar limit 1 quando limit for negativo', async () => {
      prismaMock.servico.count.mockResolvedValue(10);
      prismaMock.servico.findMany.mockResolvedValue([]);

      await request(criarApp()).get('/servicos?limit=-10');

      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        })
      );
    });

    it('deve limitar paginação ao máximo de 100 itens', async () => {
      prismaMock.servico.count.mockResolvedValue(200);
      prismaMock.servico.findMany.mockResolvedValue([]);

      await request(criarApp()).get('/servicos?limit=200');

      expect(prismaMock.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.servico.count.mockResolvedValue(25);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?limit=10');

      expect(resposta.body.pagination.totalPages).toBe(3);
    });

    it('deve indicar hasNext=true quando houver próxima página', async () => {
      prismaMock.servico.count.mockResolvedValue(50);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?page=1&limit=10');

      expect(resposta.body.pagination.hasNext).toBe(true);
    });

    it('deve indicar hasNext=false quando estiver na última página', async () => {
      prismaMock.servico.count.mockResolvedValue(50);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?page=5&limit=10');

      expect(resposta.body.pagination.hasNext).toBe(false);
    });

    it('deve indicar hasPrev=true quando não estiver na primeira página', async () => {
      prismaMock.servico.count.mockResolvedValue(50);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?page=2&limit=10');

      expect(resposta.body.pagination.hasPrev).toBe(true);
    });

    it('deve indicar hasPrev=false quando estiver na primeira página', async () => {
      prismaMock.servico.count.mockResolvedValue(50);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?page=1&limit=10');

      expect(resposta.body.pagination.hasPrev).toBe(false);
    });

    it('deve aceitar página além do total e retornar lista vazia', async () => {
      prismaMock.servico.count.mockResolvedValue(20);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos?page=100&limit=10');

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toEqual([]);
      expect(resposta.body.pagination.page).toBe(100);
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      currentUserRole = 'ADMIN';
      
      prismaMock.servico.count.mockResolvedValue(0);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir acesso para USUARIO', async () => {
      currentUserRole = 'USUARIO';
      
      prismaMock.servico.count.mockResolvedValue(0);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir acesso para TECNICO', async () => {
      currentUserRole = 'TECNICO';
      
      prismaMock.servico.count.mockResolvedValue(0);
      prismaMock.servico.findMany.mockResolvedValue([]);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.status).toBe(200);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao contar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.count.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar serviços');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO LIST ERROR]', erroMock);
    });

    it('deve retornar status 500 quando ocorrer erro ao buscar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.count.mockResolvedValue(10);
      prismaMock.servico.findMany.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).get('/servicos');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao listar serviços');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO LIST ERROR]', erroMock);
    });
  });
});

describe('GET /servicos/:id (buscar serviço por ID)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 com serviço encontrado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 10 },
      });

      const resposta = await request(criarApp()).get('/servicos/serv-123');

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        id: servicoBase.id,
        nome: servicoBase.nome,
        descricao: servicoBase.descricao,
        ativo: true,
      });
      expect(resposta.body._count.chamados).toBe(10);
    });

    it('deve contar apenas chamados não deletados', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 5 },
      });

      await request(criarApp()).get('/servicos/serv-123');

      expect(prismaMock.servico.findUnique).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        select: expect.objectContaining({
          _count: {
            select: {
              chamados: {
                where: { deletadoEm: null },
              },
            },
          },
        }),
      });
    });

    it('deve retornar serviço inativo', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoInativo,
        _count: { chamados: 0 },
      });

      const resposta = await request(criarApp()).get('/servicos/serv-456');

      expect(resposta.status).toBe(200);
      expect(resposta.body.ativo).toBe(false);
    });

    it('deve retornar serviço deletado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoDeletado,
        _count: { chamados: 0 },
      });

      const resposta = await request(criarApp()).get('/servicos/serv-789');

      expect(resposta.status).toBe(200);
      expect(resposta.body.deletadoEm).toBeTruthy();
    });
  });

  describe('Casos de erro', () => {
    it('deve retornar status 404 quando serviço não for encontrado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp()).get('/servicos/id-inexistente');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toBe('Serviço não encontrado');
    });

    it('deve retornar status 500 quando ocorrer erro no banco', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp()).get('/servicos/serv-123');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao buscar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO GET ERROR]', erroMock);
    });
  });

  describe('Autorização', () => {
    it('deve permitir acesso para ADMIN', async () => {
      currentUserRole = 'ADMIN';
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 0 },
      });

      const resposta = await request(criarApp()).get('/servicos/serv-123');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir acesso para USUARIO', async () => {
      currentUserRole = 'USUARIO';
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 0 },
      });

      const resposta = await request(criarApp()).get('/servicos/serv-123');

      expect(resposta.status).toBe(200);
    });

    it('deve permitir acesso para TECNICO', async () => {
      currentUserRole = 'TECNICO';
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 0 },
      });

      const resposta = await request(criarApp()).get('/servicos/serv-123');

      expect(resposta.status).toBe(200);
    });
  });
});

describe('PUT /servicos/:id (atualizar serviço)', () => {
  const servicoAtualizado = {
    ...servicoBase,
    nome: 'Novo Nome',
    descricao: 'Nova Descrição',
  };

  describe('Casos de sucesso', () => {
    it('deve retornar status 200 ao atualizar nome e descrição', async () => {
      prismaMock.servico.findUnique
        .mockResolvedValueOnce(servicoBase)
        .mockResolvedValueOnce(null);
      prismaMock.servico.update.mockResolvedValue(servicoAtualizado);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Novo Nome', descricao: 'Nova Descrição' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe('Novo Nome');
      expect(resposta.body.descricao).toBe('Nova Descrição');
      expect(consoleSpy.log).toHaveBeenCalledWith('[SERVICO UPDATED]', {
        id: servicoBase.id,
        nome: 'Novo Nome',
      });
    });

    it('deve atualizar apenas nome', async () => {
      prismaMock.servico.findUnique
        .mockResolvedValueOnce(servicoBase)
        .mockResolvedValueOnce(null);
      prismaMock.servico.update.mockResolvedValue({
        ...servicoBase,
        nome: 'Apenas Nome',
      });

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Apenas Nome' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        data: { nome: 'Apenas Nome' },
        select: expect.any(Object),
      });
    });

    it('deve atualizar apenas descrição', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
      prismaMock.servico.update.mockResolvedValue({
        ...servicoBase,
        descricao: 'Apenas Descrição',
      });

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ descricao: 'Apenas Descrição' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        data: { descricao: 'Apenas Descrição' },
        select: expect.any(Object),
      });
    });

    it('deve fazer trim do nome ao atualizar', async () => {
      prismaMock.servico.findUnique
        .mockResolvedValueOnce(servicoBase)
        .mockResolvedValueOnce(null);
      prismaMock.servico.update.mockResolvedValue(servicoAtualizado);

      await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: '  Novo Nome  ' });

      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        data: { nome: 'Novo Nome' },
        select: expect.any(Object),
      });
    });

    it('deve fazer trim da descrição ao atualizar', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
      prismaMock.servico.update.mockResolvedValue(servicoAtualizado);

      await request(criarApp())
        .put('/servicos/serv-123')
        .send({ descricao: '  Nova Descrição  ' });

      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        data: { descricao: 'Nova Descrição' },
        select: expect.any(Object),
      });
    });

    it('deve definir descrição como null quando vazia', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
      prismaMock.servico.update.mockResolvedValue({
        ...servicoBase,
        descricao: null,
      });

      await request(criarApp())
        .put('/servicos/serv-123')
        .send({ descricao: '' });

      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        data: { descricao: null },
        select: expect.any(Object),
      });
    });

    it('deve retornar serviço sem modificações quando nada for alterado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({});

      expect(resposta.status).toBe(200);
      expect(resposta.body).toMatchObject({
        id: servicoBase.id,
        nome: servicoBase.nome,
        descricao: servicoBase.descricao,
        ativo: servicoBase.ativo,
        deletadoEm: servicoBase.deletadoEm,
      });
      // Verificar que as datas existem (serão strings após serialização)
      expect(resposta.body.geradoEm).toBeDefined();
      expect(resposta.body.atualizadoEm).toBeDefined();
      expect(prismaMock.servico.update).not.toHaveBeenCalled();
    });

    it('deve retornar serviço quando nome for igual ao atual', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Suporte Técnico' });

      expect(resposta.status).toBe(200);
      expect(prismaMock.servico.update).not.toHaveBeenCalled();
    });
  });

  describe('Validações', () => {
    it('deve retornar status 400 quando nome for inválido', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'AB' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 3 caracteres');
    });

    it('deve retornar status 400 quando descrição for muito grande', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ descricao: 'A'.repeat(501) });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no máximo 500 caracteres');
    });

    it('deve retornar status 404 quando serviço não existir', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .put('/servicos/id-inexistente')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toBe('Serviço não encontrado');
    });

    it('deve retornar status 400 ao tentar editar serviço deletado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoDeletado);

      const resposta = await request(criarApp())
        .put('/servicos/serv-789')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('Não é possível editar um serviço deletado');
    });

    it('deve retornar status 409 quando novo nome já existir', async () => {
      prismaMock.servico.findUnique
        .mockResolvedValueOnce(servicoBase)
        .mockResolvedValueOnce({ id: 'outro-id', nome: 'Nome Existente' });

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Nome Existente' });

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toBe('Já existe outro serviço com esse nome');
    });

    it('deve permitir atualizar quando nome já existe mas é do próprio serviço', async () => {
      const servicoEncontrado = { id: 'serv-123', nome: 'Novo Nome' };
      prismaMock.servico.findUnique
        .mockResolvedValueOnce(servicoBase)
        .mockResolvedValueOnce(servicoEncontrado);
      prismaMock.servico.update.mockResolvedValue(servicoAtualizado);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(200);
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro ao buscar serviço', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao atualizar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO UPDATE ERROR]', erroMock);
    });

    it('deve retornar status 500 quando ocorrer erro ao atualizar', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique
        .mockResolvedValueOnce(servicoBase)
        .mockResolvedValueOnce(null);
      prismaMock.servico.update.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .put('/servicos/serv-123')
        .send({ nome: 'Novo Nome' });

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao atualizar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO UPDATE ERROR]', erroMock);
    });
  });
});

describe('PATCH /servicos/:id/desativar (desativar serviço)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 ao desativar serviço ativo', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);
      prismaMock.servico.update.mockResolvedValue({ ...servicoBase, ativo: false });

      const resposta = await request(criarApp())
        .patch('/servicos/serv-123/desativar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toBe('Serviço desativado com sucesso');
      expect(resposta.body.id).toBe('serv-123');
      
      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        data: { ativo: false },
      });
      
      expect(consoleSpy.log).toHaveBeenCalledWith('[SERVICO DEACTIVATED]', {
        id: 'serv-123',
        nome: servicoBase.nome,
      });
    });
  });

  describe('Validações', () => {
    it('deve retornar status 404 quando serviço não existir', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .patch('/servicos/id-inexistente/desativar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toBe('Serviço não encontrado');
    });

    it('deve retornar status 400 quando serviço já estiver desativado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoInativo);

      const resposta = await request(criarApp())
        .patch('/servicos/serv-456/desativar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('Serviço já está desativado');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .patch('/servicos/serv-123/desativar');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp())
        .patch('/servicos/serv-123/desativar');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .patch('/servicos/serv-123/desativar');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao desativar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO DEACTIVATE ERROR]', erroMock);
    });
  });
});

describe('PATCH /servicos/:id/reativar (reativar serviço)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 ao reativar serviço inativo', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoInativo);
      prismaMock.servico.update.mockResolvedValue({ ...servicoInativo, ativo: true });

      const resposta = await request(criarApp())
        .patch('/servicos/serv-456/reativar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toBe('Serviço reativado com sucesso');
      expect(resposta.body.servico.ativo).toBe(true);
      
      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-456' },
        data: { ativo: true },
        select: expect.any(Object),
      });
      
      expect(consoleSpy.log).toHaveBeenCalledWith('[SERVICO REACTIVATED]', {
        id: 'serv-456',
        nome: servicoInativo.nome,
      });
    });
  });

  describe('Validações', () => {
    it('deve retornar status 404 quando serviço não existir', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .patch('/servicos/id-inexistente/reativar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toBe('Serviço não encontrado');
    });

    it('deve retornar status 400 quando tentar reativar serviço deletado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoDeletado);

      const resposta = await request(criarApp())
        .patch('/servicos/serv-789/reativar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('Não é possível reativar um serviço deletado. Use a rota de restauração.');
    });

    it('deve retornar status 400 quando serviço já estiver ativo', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .patch('/servicos/serv-123/reativar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('Serviço já está ativo');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .patch('/servicos/serv-456/reativar');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp())
        .patch('/servicos/serv-456/reativar');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .patch('/servicos/serv-456/reativar');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao reativar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO REACTIVATE ERROR]', erroMock);
    });
  });
});

describe('DELETE /servicos/:id (deletar serviço)', () => {
  describe('Soft delete (padrão)', () => {
    it('deve retornar status 200 ao fazer soft delete', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 0 },
      });
      prismaMock.servico.update.mockResolvedValue(servicoDeletado);

      const resposta = await request(criarApp())
        .delete('/servicos/serv-123');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toBe('Serviço deletado com sucesso');
      expect(resposta.body.id).toBe('serv-123');
      
      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
        data: {
          deletadoEm: expect.any(Date),
          ativo: false,
        },
      });
      
      expect(consoleSpy.log).toHaveBeenCalledWith('[SERVICO SOFT DELETED]', {
        id: 'serv-123',
        nome: servicoBase.nome,
      });
    });

    it('deve fazer soft delete mesmo com chamados vinculados', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 50 },
      });
      prismaMock.servico.update.mockResolvedValue(servicoDeletado);

      const resposta = await request(criarApp())
        .delete('/servicos/serv-123');

      expect(resposta.status).toBe(200);
      expect(prismaMock.servico.update).toHaveBeenCalled();
      expect(prismaMock.servico.delete).not.toHaveBeenCalled();
    });
  });

  describe('Delete permanente', () => {
    it('deve retornar status 200 ao deletar permanentemente sem chamados', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 0 },
      });
      prismaMock.servico.delete.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .delete('/servicos/serv-123?permanente=true');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toBe('Serviço removido permanentemente');
      expect(resposta.body.id).toBe('serv-123');
      
      expect(prismaMock.servico.delete).toHaveBeenCalledWith({
        where: { id: 'serv-123' },
      });
      
      expect(consoleSpy.log).toHaveBeenCalledWith('[SERVICO DELETED PERMANENTLY]', {
        id: 'serv-123',
        nome: servicoBase.nome,
      });
    });

    it('deve retornar status 400 ao tentar deletar permanentemente com chamados', async () => {
      prismaMock.servico.findUnique.mockResolvedValue({
        ...servicoBase,
        _count: { chamados: 10 },
      });

      const resposta = await request(criarApp())
        .delete('/servicos/serv-123?permanente=true');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Existem 10 chamados vinculados');
    });
  });

  describe('Validações', () => {
    it('deve retornar status 404 quando serviço não existir', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .delete('/servicos/id-inexistente');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toBe('Serviço não encontrado');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .delete('/servicos/serv-123');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp())
        .delete('/servicos/serv-123');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .delete('/servicos/serv-123');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao deletar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO DELETE ERROR]', erroMock);
    });
  });
});

describe('PATCH /servicos/:id/restaurar (restaurar serviço deletado)', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar status 200 ao restaurar serviço deletado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoDeletado);
      prismaMock.servico.update.mockResolvedValue({
        ...servicoDeletado,
        deletadoEm: null,
        ativo: true,
      });

      const resposta = await request(criarApp())
        .patch('/servicos/serv-789/restaurar');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toBe('Serviço restaurado com sucesso');
      expect(resposta.body.servico.deletadoEm).toBeNull();
      expect(resposta.body.servico.ativo).toBe(true);
      
      expect(prismaMock.servico.update).toHaveBeenCalledWith({
        where: { id: 'serv-789' },
        data: {
          deletadoEm: null,
          ativo: true,
        },
        select: expect.any(Object),
      });
      
      expect(consoleSpy.log).toHaveBeenCalledWith('[SERVICO RESTORED]', {
        id: 'serv-789',
        nome: servicoDeletado.nome,
      });
    });
  });

  describe('Validações', () => {
    it('deve retornar status 404 quando serviço não existir', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(null);

      const resposta = await request(criarApp())
        .patch('/servicos/id-inexistente/restaurar');

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toBe('Serviço não encontrado');
    });

    it('deve retornar status 400 quando serviço não estiver deletado', async () => {
      prismaMock.servico.findUnique.mockResolvedValue(servicoBase);

      const resposta = await request(criarApp())
        .patch('/servicos/serv-123/restaurar');

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('Serviço não está deletado');
    });
  });

  describe('Autorização', () => {
    it('deve retornar status 403 quando usuário for USUARIO', async () => {
      currentUserRole = 'USUARIO';

      const resposta = await request(criarApp())
        .patch('/servicos/serv-789/restaurar');

      expect(resposta.status).toBe(403);
    });

    it('deve retornar status 403 quando usuário for TECNICO', async () => {
      currentUserRole = 'TECNICO';

      const resposta = await request(criarApp())
        .patch('/servicos/serv-789/restaurar');

      expect(resposta.status).toBe(403);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar status 500 quando ocorrer erro', async () => {
      const erroMock = new Error('Database error');
      prismaMock.servico.findUnique.mockRejectedValue(erroMock);

      const resposta = await request(criarApp())
        .patch('/servicos/serv-789/restaurar');

      expect(resposta.status).toBe(500);
      expect(resposta.body.error).toBe('Erro ao restaurar serviço');
      expect(consoleSpy.error).toHaveBeenCalledWith('[SERVICO RESTORE ERROR]', erroMock);
    });
  });
});