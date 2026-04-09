import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeToken, solicitacaoRecord, itemSolicitacaoRecord } from './helpers';

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
  proximoNumero: vi.fn().mockImplementation((tipo: string) => {
    if (tipo === 'AC') return Promise.resolve('AC0000001');
    if (tipo === 'OC') return Promise.resolve('OC0000001');
    return Promise.resolve('INV0000001');
  }),
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
const tokenAdmin = makeToken('ADMIN');
const tokenGestor = makeToken('GESTOR', 'TECNOLOGIA_INFORMACAO');

const solicitacaoAprovada = {
  ...solicitacaoRecord,
  status: 'APROVADO' as const,
  formaPagamento: 'PIX',
  parcelas: 0,
  aprovadoPor: 'user-e2e-id',
  aprovadoEm: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/compras', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/compras').send({});
    expect(res.status).toBe(401);
  });

  it('cria solicitação de compra e retorna 201', async () => {
    vi.mocked(prisma.solicitacaoCompra.create).mockResolvedValue(solicitacaoRecord as any);

    const res = await request(app)
      .post('/v1/compras')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        justificativa: 'Necessidade urgente',
        itens: [{ nomeProduto: 'Notebook Dell', quantidade: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDENTE');
    expect(res.body.acNumero).toBe('AC0000001');
  });
});

describe('POST /v1/compras/:id/aprovar', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/compras/id-qualquer/aprovar').send({});
    expect(res.status).toBe(401);
  });

  it('aprova solicitação e retorna 200', async () => {
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(solicitacaoRecord as any);
    vi.mocked(prisma.solicitacaoCompra.update).mockResolvedValue(solicitacaoAprovada as any);

    const res = await request(app)
      .post('/v1/compras/compra-e2e-1/aprovar')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ formaPagamento: 'PIX', parcelas: 0 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APROVADO');
  });

  it('retorna 422 com formaPagamento inválido', async () => {
    const res = await request(app)
      .post('/v1/compras/compra-e2e-1/aprovar')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ formaPagamento: 'INVALIDO', parcelas: 0 });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBeDefined();
  });

  it('retorna 404 quando solicitação não existe', async () => {
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/v1/compras/id-inexistente/aprovar')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ formaPagamento: 'PIX', parcelas: 0 });

    expect(res.status).toBe(404);
  });
});

describe('POST /v1/compras/:id/rejeitar', () => {
  it('rejeita solicitação e retorna 200', async () => {
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(solicitacaoRecord as any);
    vi.mocked(prisma.solicitacaoCompra.update).mockResolvedValue({
      ...solicitacaoRecord,
      status: 'REJEITADO',
      rejeitadoPor: 'user-e2e-id',
      rejeitadoEm: new Date(),
      motivoRejeicao: 'Orçamento insuficiente',
    } as any);

    const res = await request(app)
      .post('/v1/compras/compra-e2e-1/rejeitar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ motivoRejeicao: 'Orçamento insuficiente' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJEITADO');
    expect(res.body.motivoRejeicao).toBe('Orçamento insuficiente');
  });
});

describe('POST /v1/compras/:id/executar', () => {
  it('executa compra e retorna 200', async () => {
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(solicitacaoAprovada as any);
    vi.mocked(prisma.itemSolicitacaoCompra.findMany).mockResolvedValue([]);
    vi.mocked(prisma.solicitacaoCompra.update).mockResolvedValue({
      ...solicitacaoAprovada,
      status: 'COMPRADO',
      executadoPor: 'user-e2e-id',
      executadoEm: new Date(),
    } as any);

    const res = await request(app)
      .post('/v1/compras/compra-e2e-1/executar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ valorTotal: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPRADO');
  });

  it('retorna 422 se tentar executar solicitação PENDENTE', async () => {
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(solicitacaoRecord as any);

    const res = await request(app)
      .post('/v1/compras/compra-e2e-1/executar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({});

    expect(res.status).toBe(422);
  });
});

describe('POST /v1/compras/:id/cancelar', () => {
  it('cancela solicitação e retorna 200', async () => {
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(solicitacaoRecord as any);
    vi.mocked(prisma.solicitacaoCompra.update).mockResolvedValue({
      ...solicitacaoRecord,
      status: 'CANCELADO',
    } as any);

    const res = await request(app)
      .post('/v1/compras/compra-e2e-1/cancelar')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELADO');
  });
});
