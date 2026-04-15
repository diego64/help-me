import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeToken, reembolsoRecord, solicitacaoRecord } from './helpers';

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
  proximoNumero: vi.fn().mockResolvedValue('OC0000001'),
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
  publicarReembolsoPago: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createApp } from '@/app';
import { prisma } from '@infrastructure/database/prisma.client';

const app = createApp();
const token = makeToken('ADMIN');

const reembolsoAprovado = {
  ...reembolsoRecord,
  status: 'APROVADO' as const,
  aprovadoPor: 'user-e2e-id',
  aprovadoEm: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/reembolsos', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/reembolsos').send({});
    expect(res.status).toBe(401);
  });

  it('cria reembolso avulso e retorna 201', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.reembolso.create).mockResolvedValue(reembolsoRecord as any);

    const res = await request(app)
      .post('/v1/reembolsos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        valor: 150.0,
        descricao: 'Reembolso de material de escritório',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDENTE');
    expect(res.body.valor).toBe(150.0);
  });

  it('retorna 422 quando reembolso duplicado para mesma OC', async () => {
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue({
      ...solicitacaoRecord,
      status: 'COMPRADO',
    } as any);
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(reembolsoRecord as any);

    const res = await request(app)
      .post('/v1/reembolsos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        solicitacaoCompraId: 'compra-1',
        valor: 150.0,
        descricao: 'Reembolso duplicado',
      });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBeDefined();
  });
});

describe('POST /v1/reembolsos/:id/aprovar', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/reembolsos/id/aprovar').send({});
    expect(res.status).toBe(401);
  });

  it('aprova reembolso e retorna 200', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(reembolsoRecord as any);
    vi.mocked(prisma.reembolso.update).mockResolvedValue(reembolsoAprovado as any);

    const res = await request(app)
      .post('/v1/reembolsos/reembolso-e2e-1/aprovar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APROVADO');
  });

  it('retorna 404 quando reembolso não existe', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/v1/reembolsos/id-inexistente/aprovar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /v1/reembolsos/:id/rejeitar', () => {
  it('rejeita reembolso e retorna 200', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(reembolsoRecord as any);
    vi.mocked(prisma.reembolso.update).mockResolvedValue({
      ...reembolsoRecord,
      status: 'REJEITADO',
      rejeitadoPor: 'user-e2e-id',
      rejeitadoEm: new Date(),
      motivoRejeicao: 'Nota fiscal inválida',
    } as any);

    const res = await request(app)
      .post('/v1/reembolsos/reembolso-e2e-1/rejeitar')
      .set('Authorization', `Bearer ${token}`)
      .send({ motivoRejeicao: 'Nota fiscal inválida' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJEITADO');
    expect(res.body.motivoRejeicao).toBe('Nota fiscal inválida');
  });
});

describe('POST /v1/reembolsos/:id/processar', () => {
  it('processa pagamento e retorna 200', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(reembolsoAprovado as any);
    vi.mocked(prisma.reembolso.update).mockResolvedValue({
      ...reembolsoAprovado,
      status: 'PAGO',
      processadoPor: 'user-e2e-id',
      processadoEm: new Date(),
    } as any);

    const res = await request(app)
      .post('/v1/reembolsos/reembolso-e2e-1/processar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAGO');
  });

  it('retorna 422 quando reembolso está PENDENTE (não aprovado)', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(reembolsoRecord as any);

    const res = await request(app)
      .post('/v1/reembolsos/reembolso-e2e-1/processar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});
