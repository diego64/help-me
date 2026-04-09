import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeToken, categoriaRecord } from './helpers';

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    categoria: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    fornecedor: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    itemInventario: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    movimentacaoEstoque: { create: vi.fn(), findMany: vi.fn() },
    estoqueSetor: { findMany: vi.fn(), upsert: vi.fn() },
    solicitacaoCompra: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    itemSolicitacaoCompra: { findMany: vi.fn() },
    reembolso: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    baixa: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    itemBaixa: { findMany: vi.fn() },
    contador: { upsert: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@messaging/producers/compra.producer', () => ({
  publicarCompraCriada: vi.fn().mockResolvedValue(undefined),
  publicarCompraAprovada: vi.fn().mockResolvedValue(undefined),
  publicarCompraRejeitada: vi.fn().mockResolvedValue(undefined),
  publicarCompraExecutada: vi.fn().mockResolvedValue(undefined),
  publicarCompraCancelada: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@messaging/producers/baixa.producer', () => ({
  publicarBaixaCriada: vi.fn().mockResolvedValue(undefined),
  publicarBaixaAprovadaTecnico: vi.fn().mockResolvedValue(undefined),
  publicarBaixaAprovadaGestor: vi.fn().mockResolvedValue(undefined),
  publicarBaixaRejeitada: vi.fn().mockResolvedValue(undefined),
  publicarBaixaExecutada: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@messaging/producers/reembolso.producer', () => ({
  publicarReembolsoCriado: vi.fn().mockResolvedValue(undefined),
  publicarReembolsoAprovado: vi.fn().mockResolvedValue(undefined),
  publicarReembolsoRejeitado: vi.fn().mockResolvedValue(undefined),
  publicarReembolsoProcessado: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createApp } from '@/app';
import { prisma } from '@infrastructure/database/prisma.client';

const app = createApp();
const token = makeToken('ADMIN');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /v1/categorias', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/v1/categorias');
    expect(res.status).toBe(401);
  });

  it('retorna 200 com lista de categorias', async () => {
    vi.mocked(prisma.categoria.findMany).mockResolvedValue([categoriaRecord] as any);

    const res = await request(app)
      .get('/v1/categorias')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].nome).toBe('Eletrônicos');
  });

  it('retorna lista vazia quando não há categorias', async () => {
    vi.mocked(prisma.categoria.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/categorias')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /v1/categorias', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/categorias').send({ nome: 'Nova' });
    expect(res.status).toBe(401);
  });

  it('cria categoria e retorna 201', async () => {
    vi.mocked(prisma.categoria.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.categoria.create).mockResolvedValue(categoriaRecord as any);

    const res = await request(app)
      .post('/v1/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Eletrônicos', descricao: 'Equipamentos eletrônicos' });

    expect(res.status).toBe(201);
    expect(res.body.nome).toBe('Eletrônicos');
  });

  it('retorna 422 quando nome já existe', async () => {
    vi.mocked(prisma.categoria.findUnique).mockResolvedValue(categoriaRecord as any);

    const res = await request(app)
      .post('/v1/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Eletrônicos' });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBeDefined();
  });
});
