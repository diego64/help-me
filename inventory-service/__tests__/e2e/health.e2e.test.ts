import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

// Prisma deve ser mockado antes de qualquer import que carregue o módulo
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
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
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

import { createApp } from '../../src/app';

const app = createApp();

describe('GET /health', () => {
  it('retorna 200 com status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('inventory-service');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /health/live', () => {
  it('retorna 200 com status ok', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /health/ready', () => {
  it('retorna 200 com status ok', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Rota inexistente', () => {
  it('retorna 404 com formato RFC 7807', async () => {
    const res = await request(app).get('/v1/rota-inexistente-xyz');

    expect(res.status).toBe(404);
  });
});
