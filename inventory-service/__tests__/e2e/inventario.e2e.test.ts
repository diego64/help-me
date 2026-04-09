import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeToken, categoriaRecord, itemRecord, solicitacaoRecord } from './helpers';

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

vi.mock('@infrastructure/database/numero-sequencial', () => ({
  proximoNumero: vi.fn().mockResolvedValue('INV0000001'),
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

describe('GET /v1/inventario', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).get('/v1/inventario');
    expect(res.status).toBe(401);
  });

  it('retorna 200 com lista de itens', async () => {
    vi.mocked(prisma.itemInventario.findMany).mockResolvedValue([itemRecord] as any);

    const res = await request(app)
      .get('/v1/inventario')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].numero).toBe('INV0000001');
    expect(res.body[0].nome).toBe('Notebook Dell');
    // id não deve aparecer na resposta (semId)
    expect(res.body[0].id).toBeUndefined();
  });

  it('filtra por nome', async () => {
    vi.mocked(prisma.itemInventario.findMany).mockResolvedValue([itemRecord] as any);

    const res = await request(app)
      .get('/v1/inventario?nome=Notebook')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(prisma.itemInventario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nome: expect.any(Object) }),
      }),
    );
  });

  it('filtra por estoqueCritico=true', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([itemRecord] as any);

    const res = await request(app)
      .get('/v1/inventario?estoqueCritico=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /v1/inventario', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/inventario').send({});
    expect(res.status).toBe(401);
  });

  it('registra item e retorna 201', async () => {
    vi.mocked(prisma.categoria.findUnique).mockResolvedValue(categoriaRecord as any);
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue({
      ...solicitacaoRecord,
      status: 'COMPRADO',
    } as any);
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.itemInventario.create).mockResolvedValue(itemRecord as any);

    const res = await request(app)
      .post('/v1/inventario')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Notebook Dell',
        sku: 'NB-DELL-001',
        unidade: 'UN',
        quantidade: 1,
        categoriaId: 'cat-e2e-1',
        ocNumero: 'OC0000001',
      });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].numero).toBe('INV0000001');
  });
});

describe('GET /v1/inventario/:id', () => {
  it('retorna 200 quando item existe', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any);
    vi.mocked(prisma.movimentacaoEstoque.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/inventario/item-e2e-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.item.numero).toBe('INV0000001');
  });

  it('retorna 404 quando item não existe', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .get('/v1/inventario/id-inexistente')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.detail).toBeDefined();
  });
});

describe('GET /v1/inventario/numero/:numero', () => {
  it('retorna 200 quando item existe pelo número', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any);
    vi.mocked(prisma.movimentacaoEstoque.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/inventario/numero/INV0000001')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.item.numero).toBe('INV0000001');
  });

  it('retorna 404 quando número não existe', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .get('/v1/inventario/numero/INV9999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /v1/inventario/setor/:setor', () => {
  it('retorna 200 com estoque do setor', async () => {
    vi.mocked(prisma.estoqueSetor.findMany).mockResolvedValue([
      {
        id: 'es-1',
        itemInventarioId: 'item-e2e-1',
        setor: 'TECNOLOGIA_INFORMACAO',
        quantidade: 3,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      },
    ] as any);

    const res = await request(app)
      .get('/v1/inventario/setor/TECNOLOGIA_INFORMACAO')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /v1/inventario/numero/:numero/localizar', () => {
  it('retorna 200 com localização do item', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any);
    vi.mocked(prisma.estoqueSetor.findMany).mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/inventario/numero/INV0000001/localizar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /v1/inventario/destinar', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/inventario/destinar').send({});
    expect(res.status).toBe(401);
  });

  it('destina item ao setor e retorna 200', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any);
    vi.mocked(prisma.itemInventario.update).mockResolvedValue({
      ...itemRecord,
      estoqueAtual: 4,
    } as any);
    vi.mocked(prisma.estoqueSetor.upsert).mockResolvedValue({
      id: 'es-1',
      itemInventarioId: 'item-e2e-1',
      setor: 'TECNOLOGIA_INFORMACAO',
      quantidade: 1,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    } as any);
    vi.mocked(prisma.movimentacaoEstoque.create).mockResolvedValue({
      id: 'mov-1',
      itemId: 'item-e2e-1',
      tipo: 'SAIDA',
      motivo: 'DESTINACAO',
      quantidade: 1,
      estoqueBefore: 5,
      estoqueAfter: 4,
      referenciaId: null,
      realizadoPor: 'user-e2e-id',
      observacoes: null,
      setorDestinoId: null,
      setorDestinoNome: 'TECNOLOGIA_INFORMACAO',
      criadoEm: new Date(),
    } as any);

    const res = await request(app)
      .post('/v1/inventario/destinar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        numeroInventario: 'INV0000001',
        setor: 'TECNOLOGIA_INFORMACAO',
        quantidade: 1,
      });

    expect(res.status).toBe(200);
  });

  it('retorna 422 quando estoque insuficiente', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue({
      ...itemRecord,
      estoqueAtual: 0,
    } as any);

    const res = await request(app)
      .post('/v1/inventario/destinar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        numeroInventario: 'INV0000001',
        setor: 'TECNOLOGIA_INFORMACAO',
        quantidade: 1,
      });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBeDefined();
  });
});

describe('PATCH /v1/inventario/:id', () => {
  it('retorna 200 ao atualizar item', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any);
    vi.mocked(prisma.categoria.findUnique).mockResolvedValue(categoriaRecord as any);
    vi.mocked(prisma.itemInventario.update).mockResolvedValue({
      ...itemRecord,
      nome: 'Notebook Dell Atualizado',
    } as any);

    const res = await request(app)
      .patch('/v1/inventario/item-e2e-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Notebook Dell Atualizado' });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Notebook Dell Atualizado');
  });

  it('retorna 404 quando item não existe', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .patch('/v1/inventario/id-inexistente')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Novo Nome' });

    expect(res.status).toBe(404);
  });
});
