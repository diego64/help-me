import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Response, NextFunction } from 'express';
import request from 'supertest';

let currentUserId = 'user1';

function criarFindChain(resultado: any[]) {
  const chain = {
    sort:  vi.fn().mockReturnThis(),
    skip:  vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean:  vi.fn().mockResolvedValue(resultado),
  };
  return chain;
}

const notificacaoModelMock = {
  countDocuments:    vi.fn(),
  find:              vi.fn(),
  updateMany:        vi.fn(),
  findOneAndUpdate:  vi.fn(),
  findOneAndDelete:  vi.fn(),
};

vi.mock('@infrastructure/database/mongodb/notificacao.model', () => ({
  default: notificacaoModelMock,
}));

vi.mock('@infrastructure/http/middlewares/auth', () => ({
  authMiddleware: (req: any, _res: Response, next: NextFunction) => {
    req.usuario = { id: currentUserId };
    next();
  },
  AuthRequest: class {},
}));

const { default: notificacaoRoutes } = await import('@presentation/http/routes/notificacao.routes');

const notificacaoBase = {
  _id:            '664f1a2b3c4d5e6f7a8b9c0d',
  destinatarioId: 'user1',
  titulo:         'Chamado atualizado',
  mensagem:       'Seu chamado #42 foi atualizado.',
  lida:           false,
  lidaEm:         null,
  criadoEm:       new Date('2025-01-01T10:00:00.000Z'),
};

const notificacaoLida = {
  ...notificacaoBase,
  _id:    '664f1a2b3c4d5e6f7a8b9c0e',
  lida:   true,
  lidaEm: new Date('2025-01-02T09:00:00.000Z'),
};

function criarApp() {
  const app = express();
  app.use(express.json());
  app.use('/notificacoes', notificacaoRoutes);
  return app;
}

function setupListagem(total: number, lista: any[], naoLidas: number) {
  notificacaoModelMock.countDocuments
    .mockResolvedValueOnce(total)   // total filtrado
    .mockResolvedValueOnce(naoLidas); // total não lidas (sempre)
  notificacaoModelMock.find.mockReturnValueOnce(criarFindChain(lista));
}

beforeEach(() => {
  vi.resetAllMocks();
  currentUserId = 'user1';
}, 120000);

describe('GET /notificacoes', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar 200 com estrutura completa de paginação e naoLidas', async () => {
      setupListagem(3, [notificacaoBase, notificacaoLida], 2);

      const res = await request(criarApp()).get('/notificacoes');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data:     expect.any(Array),
        naoLidas: 2,
        pagination: {
          page:       1,
          limit:      20,
          total:      3,
          totalPages: 1,
          hasNext:    false,
          hasPrev:    false,
        },
      });
    });

    it('deve retornar lista vazia quando não houver notificações', async () => {
      setupListagem(0, [], 0);

      const res = await request(criarApp()).get('/notificacoes');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.naoLidas).toBe(0);
      expect(res.body.pagination.total).toBe(0);
    });

    it('deve calcular paginação corretamente (page=2, limit=5, total=12)', async () => {
      setupListagem(12, Array(5).fill(notificacaoBase), 3);

      const res = await request(criarApp()).get('/notificacoes?page=2&limit=5');

      expect(res.body.pagination).toMatchObject({
        page:       2,
        limit:      5,
        total:      12,
        totalPages: 3,
        hasNext:    true,
        hasPrev:    true,
      });
    });

    it('deve usar page=1 e limit=20 como padrão quando não informados', async () => {
      setupListagem(1, [notificacaoBase], 1);

      await request(criarApp()).get('/notificacoes');

      // find encadeado: skip(0), limit(20)
      const findChain = notificacaoModelMock.find.mock.results[0].value;
      expect(findChain.skip).toHaveBeenCalledWith(0);
      expect(findChain.limit).toHaveBeenCalledWith(20);
    });

    it('deve ordenar por criadoEm decrescente', async () => {
      setupListagem(1, [notificacaoBase], 0);

      await request(criarApp()).get('/notificacoes');

      const findChain = notificacaoModelMock.find.mock.results[0].value;
      expect(findChain.sort).toHaveBeenCalledWith({ criadoEm: -1 });
    });

    it('deve limitar ao máximo de 100 por página', async () => {
      setupListagem(5, [notificacaoBase], 1);

      await request(criarApp()).get('/notificacoes?limit=999');

      const findChain = notificacaoModelMock.find.mock.results[0].value;
      expect(findChain.limit).toHaveBeenCalledWith(100);
    });

    it('deve calcular skip correto para page=3, limit=10', async () => {
      setupListagem(30, [], 0);

      await request(criarApp()).get('/notificacoes?page=3&limit=10');

      const findChain = notificacaoModelMock.find.mock.results[0].value;
      expect(findChain.skip).toHaveBeenCalledWith(20); // (3-1)*10
    });

    it('deve filtrar apenas não lidas quando naoLidas=true', async () => {
      setupListagem(2, [notificacaoBase], 2);

      await request(criarApp()).get('/notificacoes?naoLidas=true');

      // find e countDocuments de total devem incluir lida:false
      expect(notificacaoModelMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'user1', lida: false })
      );
      expect(notificacaoModelMock.countDocuments).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ lida: false })
      );
    });

    it('não deve filtrar por lida quando naoLidas não for informado', async () => {
      setupListagem(5, [notificacaoBase], 1);

      await request(criarApp()).get('/notificacoes');

      expect(notificacaoModelMock.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ lida: false })
      );
    });

    it('não deve filtrar por lida quando naoLidas=false', async () => {
      setupListagem(5, [notificacaoBase], 1);

      await request(criarApp()).get('/notificacoes?naoLidas=false');

      expect(notificacaoModelMock.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ lida: false })
      );
    });

    it('deve sempre retornar naoLidas sem filtro de página (query independente)', async () => {
      setupListagem(2, [notificacaoBase], 7);

      const res = await request(criarApp()).get('/notificacoes?naoLidas=true');

      // Terceira chamada ao countDocuments sempre usa apenas destinatarioId + lida:false
      expect(notificacaoModelMock.countDocuments).toHaveBeenNthCalledWith(
        2,
        { destinatarioId: 'user1', lida: false }
      );
      expect(res.body.naoLidas).toBe(7);
    });

    it('deve filtrar notificações pelo destinatarioId do usuário autenticado', async () => {
      currentUserId = 'outro-user';
      setupListagem(1, [{ ...notificacaoBase, destinatarioId: 'outro-user' }], 0);

      await request(criarApp()).get('/notificacoes');

      expect(notificacaoModelMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'outro-user' })
      );
    });

    it('deve retornar hasNext=false na última página', async () => {
      setupListagem(10, Array(10).fill(notificacaoBase), 0);

      const res = await request(criarApp()).get('/notificacoes?page=2&limit=5');

      expect(res.body.pagination.hasNext).toBe(false);
      expect(res.body.pagination.hasPrev).toBe(true);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando countDocuments lançar erro', async () => {
      notificacaoModelMock.countDocuments.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).get('/notificacoes');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao listar notificações');
    });

    it('deve retornar 500 quando find lançar erro', async () => {
      notificacaoModelMock.countDocuments.mockResolvedValueOnce(5);
      notificacaoModelMock.find.mockReturnValueOnce({
        sort:  vi.fn().mockReturnThis(),
        skip:  vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean:  vi.fn().mockRejectedValueOnce(new Error('DB error')),
      });

      const res = await request(criarApp()).get('/notificacoes');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao listar notificações');
    });
  });
});

describe('PATCH /notificacoes/marcar-todas-lidas', () => {
  describe('Casos de sucesso', () => {
    it('deve retornar 200 com message e quantidade de atualizadas', async () => {
      notificacaoModelMock.updateMany.mockResolvedValueOnce({ modifiedCount: 5 });

      const res = await request(criarApp()).patch('/notificacoes/marcar-todas-lidas');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Todas as notificações marcadas como lidas');
      expect(res.body.atualizadas).toBe(5);
    });

    it('deve retornar atualizadas=0 quando não houver notificações não lidas', async () => {
      notificacaoModelMock.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });

      const res = await request(criarApp()).patch('/notificacoes/marcar-todas-lidas');

      expect(res.status).toBe(200);
      expect(res.body.atualizadas).toBe(0);
    });

    it('deve chamar updateMany filtrando pelo destinatarioId e lida=false', async () => {
      notificacaoModelMock.updateMany.mockResolvedValueOnce({ modifiedCount: 3 });

      await request(criarApp()).patch('/notificacoes/marcar-todas-lidas');

      expect(notificacaoModelMock.updateMany).toHaveBeenCalledWith(
        { destinatarioId: 'user1', lida: false },
        { lida: true, lidaEm: expect.any(Date) }
      );
    });

    it('deve usar o destinatarioId do usuário autenticado', async () => {
      currentUserId = 'outro-user';
      notificacaoModelMock.updateMany.mockResolvedValueOnce({ modifiedCount: 2 });

      await request(criarApp()).patch('/notificacoes/marcar-todas-lidas');

      expect(notificacaoModelMock.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'outro-user' }),
        expect.any(Object)
      );
    });

    it('deve setar lidaEm com a data atual', async () => {
      const antes = new Date();
      notificacaoModelMock.updateMany.mockResolvedValueOnce({ modifiedCount: 1 });

      await request(criarApp()).patch('/notificacoes/marcar-todas-lidas');

      const depois = new Date();
      const [, data] = notificacaoModelMock.updateMany.mock.calls[0];
      expect(data.lidaEm.getTime()).toBeGreaterThanOrEqual(antes.getTime());
      expect(data.lidaEm.getTime()).toBeLessThanOrEqual(depois.getTime());
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando updateMany lançar erro', async () => {
      notificacaoModelMock.updateMany.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).patch('/notificacoes/marcar-todas-lidas');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao marcar notificações como lidas');
    });
  });
});

describe('PATCH /notificacoes/:id/lida', () => {
  const notificacaoId = '664f1a2b3c4d5e6f7a8b9c0d';

  describe('Casos de sucesso', () => {
    it('deve retornar 200 com message e notificacao atualizada', async () => {
      const notificacaoAtualizada = { ...notificacaoBase, lida: true, lidaEm: new Date() };
      notificacaoModelMock.findOneAndUpdate.mockResolvedValueOnce(notificacaoAtualizada);

      const res = await request(criarApp()).patch(`/notificacoes/${notificacaoId}/lida`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Notificação marcada como lida');
      expect(res.body.notificacao).toBeDefined();
    });

    it('deve chamar findOneAndUpdate com _id, destinatarioId e { new: true }', async () => {
      notificacaoModelMock.findOneAndUpdate.mockResolvedValueOnce({ ...notificacaoBase, lida: true });

      await request(criarApp()).patch(`/notificacoes/${notificacaoId}/lida`);

      expect(notificacaoModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: notificacaoId, destinatarioId: 'user1' },
        { lida: true, lidaEm: expect.any(Date) },
        { new: true }
      );
    });

    it('deve setar lidaEm com a data atual', async () => {
      const antes = new Date();
      notificacaoModelMock.findOneAndUpdate.mockResolvedValueOnce({ ...notificacaoBase, lida: true });

      await request(criarApp()).patch(`/notificacoes/${notificacaoId}/lida`);

      const depois = new Date();
      const [, data] = notificacaoModelMock.findOneAndUpdate.mock.calls[0];
      expect(data.lidaEm.getTime()).toBeGreaterThanOrEqual(antes.getTime());
      expect(data.lidaEm.getTime()).toBeLessThanOrEqual(depois.getTime());
    });

    it('deve usar o destinatarioId do usuário autenticado', async () => {
      currentUserId = 'outro-user';
      notificacaoModelMock.findOneAndUpdate.mockResolvedValueOnce({ ...notificacaoBase, destinatarioId: 'outro-user', lida: true });

      await request(criarApp()).patch(`/notificacoes/${notificacaoId}/lida`);

      expect(notificacaoModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'outro-user' }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Casos 404', () => {
    it('deve retornar 404 quando notificação não existir', async () => {
      notificacaoModelMock.findOneAndUpdate.mockResolvedValueOnce(null);

      const res = await request(criarApp()).patch(`/notificacoes/${notificacaoId}/lida`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Notificação não encontrada');
    });

    it('deve retornar 404 quando notificação pertencer a outro usuário (query com destinatarioId)', async () => {
      // findOneAndUpdate filtra por destinatarioId → retorna null se for de outro user
      notificacaoModelMock.findOneAndUpdate.mockResolvedValueOnce(null);

      currentUserId = 'user-sem-acesso';
      const res = await request(criarApp()).patch(`/notificacoes/${notificacaoId}/lida`);

      expect(res.status).toBe(404);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findOneAndUpdate lançar erro', async () => {
      notificacaoModelMock.findOneAndUpdate.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).patch(`/notificacoes/${notificacaoId}/lida`);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao marcar notificação como lida');
    });
  });
});

describe('DELETE /notificacoes/:id', () => {
  const notificacaoId = '664f1a2b3c4d5e6f7a8b9c0d';
  describe('Casos de sucesso', () => {
    it('deve retornar 200 com message e id removido', async () => {
      notificacaoModelMock.findOneAndDelete.mockResolvedValueOnce(notificacaoBase);

      const res = await request(criarApp()).delete(`/notificacoes/${notificacaoId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Notificação removida');
      expect(res.body.id).toBe(notificacaoId);
    });

    it('deve chamar findOneAndDelete com _id e destinatarioId', async () => {
      notificacaoModelMock.findOneAndDelete.mockResolvedValueOnce(notificacaoBase);

      await request(criarApp()).delete(`/notificacoes/${notificacaoId}`);

      expect(notificacaoModelMock.findOneAndDelete).toHaveBeenCalledWith({
        _id:            notificacaoId,
        destinatarioId: 'user1',
      });
    });

    it('deve usar o destinatarioId do usuário autenticado', async () => {
      currentUserId = 'outro-user';
      notificacaoModelMock.findOneAndDelete.mockResolvedValueOnce({ ...notificacaoBase, destinatarioId: 'outro-user' });

      await request(criarApp()).delete(`/notificacoes/${notificacaoId}`);

      expect(notificacaoModelMock.findOneAndDelete).toHaveBeenCalledWith(
        expect.objectContaining({ destinatarioId: 'outro-user' })
      );
    });
  });

  describe('Casos 404', () => {
    it('deve retornar 404 quando notificação não existir', async () => {
      notificacaoModelMock.findOneAndDelete.mockResolvedValueOnce(null);

      const res = await request(criarApp()).delete(`/notificacoes/${notificacaoId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Notificação não encontrada');
    });

    it('deve retornar 404 quando notificação pertencer a outro usuário', async () => {
      // findOneAndDelete filtra por destinatarioId → retorna null se de outro user
      notificacaoModelMock.findOneAndDelete.mockResolvedValueOnce(null);

      currentUserId = 'user-sem-acesso';
      const res = await request(criarApp()).delete(`/notificacoes/${notificacaoId}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Tratamento de erros', () => {
    it('deve retornar 500 quando findOneAndDelete lançar erro', async () => {
      notificacaoModelMock.findOneAndDelete.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(criarApp()).delete(`/notificacoes/${notificacaoId}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Erro ao remover notificação');
    });
  });
});