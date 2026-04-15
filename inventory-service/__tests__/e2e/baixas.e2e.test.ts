import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeToken, itemRecord, baixaRecord, itemBaixaRecord } from './helpers';

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
  publicarBaixaConcluida: vi.fn().mockResolvedValue(undefined),
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

const baixaAprovadaTecnico = {
  ...baixaRecord,
  status: 'APROVADO_TECNICO' as const,
  aprovadoPorTecnico: 'user-e2e-id',
  aprovadoEmTecnico: new Date(),
};

const baixaAprovadaGestor = {
  ...baixaAprovadaTecnico,
  status: 'APROVADO_GESTOR' as const,
  aprovadoPorGestor: 'user-e2e-id',
  aprovadoEmGestor: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /v1/baixas', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/baixas').send({});
    expect(res.status).toBe(401);
  });

  it('cria baixa e retorna 201', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any);
    vi.mocked(prisma.baixa.create).mockResolvedValue(baixaRecord as any);

    const res = await request(app)
      .post('/v1/baixas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        justificativa: 'Item danificado irreparavelmente',
        itens: [{ numeroInventario: 'INV0000001', quantidade: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDENTE');
  });

  it('retorna 422 quando item tem estoque zero', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue({
      ...itemRecord,
      estoqueAtual: 0,
    } as any);

    const res = await request(app)
      .post('/v1/baixas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        justificativa: 'Item danificado',
        itens: [{ numeroInventario: 'INV0000001', quantidade: 1 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.detail).toBeDefined();
  });

  it('retorna 404 quando item não existe', async () => {
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/v1/baixas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        justificativa: 'Item danificado',
        itens: [{ numeroInventario: 'INV9999999', quantidade: 1 }],
      });

    expect(res.status).toBe(404);
  });
});

describe('POST /v1/baixas/:id/aprovar-tecnico', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app).post('/v1/baixas/id/aprovar-tecnico');
    expect(res.status).toBe(401);
  });

  it('aprova tecnicamente e retorna 200', async () => {
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(baixaRecord as any);
    vi.mocked(prisma.baixa.update).mockResolvedValue(baixaAprovadaTecnico as any);

    const res = await request(app)
      .post('/v1/baixas/baixa-e2e-1/aprovar-tecnico')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APROVADO_TECNICO');
  });

  it('retorna 404 quando baixa não existe', async () => {
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post('/v1/baixas/id-inexistente/aprovar-tecnico')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /v1/baixas/:id/aprovar-gestor', () => {
  it('aprova pelo gestor e retorna 200', async () => {
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(baixaAprovadaTecnico as any);
    vi.mocked(prisma.baixa.update).mockResolvedValue(baixaAprovadaGestor as any);

    const res = await request(app)
      .post('/v1/baixas/baixa-e2e-1/aprovar-gestor')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APROVADO_GESTOR');
  });

  it('retorna 422 quando baixa está PENDENTE (falta aprovação técnica)', async () => {
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(baixaRecord as any);

    const res = await request(app)
      .post('/v1/baixas/baixa-e2e-1/aprovar-gestor')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.detail).toBeDefined();
  });
});

describe('POST /v1/baixas/:id/rejeitar', () => {
  it('rejeita baixa PENDENTE e retorna 200', async () => {
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(baixaRecord as any);
    vi.mocked(prisma.baixa.update).mockResolvedValue({
      ...baixaRecord,
      status: 'REJEITADO',
      rejeitadoPor: 'user-e2e-id',
      rejeitadoEm: new Date(),
      motivoRejeicao: 'Item ainda pode ser reparado',
    } as any);

    const res = await request(app)
      .post('/v1/baixas/baixa-e2e-1/rejeitar')
      .set('Authorization', `Bearer ${token}`)
      .send({ motivoRejeicao: 'Item ainda pode ser reparado' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJEITADO');
    expect(res.body.motivoRejeicao).toBe('Item ainda pode ser reparado');
  });
});

describe('POST /v1/baixas/:id/executar', () => {
  it('executa baixa APROVADO_GESTOR e retorna 200', async () => {
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(baixaAprovadaGestor as any);
    vi.mocked(prisma.itemBaixa.findMany).mockResolvedValue([itemBaixaRecord] as any);
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any);
    vi.mocked(prisma.itemInventario.update).mockResolvedValue({
      ...itemRecord,
      estoqueAtual: 4,
    } as any);
    vi.mocked(prisma.movimentacaoEstoque.create).mockResolvedValue({
      id: 'mov-1',
      itemId: 'item-e2e-1',
      tipo: 'SAIDA',
      motivo: 'BAIXA',
      quantidade: 1,
      estoqueBefore: 5,
      estoqueAfter: 4,
      referenciaId: 'baixa-e2e-1',
      realizadoPor: 'user-e2e-id',
      observacoes: null,
      setorDestinoId: null,
      setorDestinoNome: null,
      criadoEm: new Date(),
    } as any);
    vi.mocked(prisma.baixa.update).mockResolvedValue({
      ...baixaAprovadaGestor,
      status: 'CONCLUIDO',
      executadoPor: 'user-e2e-id',
      executadoEm: new Date(),
    } as any);

    const res = await request(app)
      .post('/v1/baixas/baixa-e2e-1/executar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONCLUIDO');
  });

  it('retorna 422 quando estoque insuficiente para executar baixa', async () => {
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(baixaAprovadaGestor as any);
    vi.mocked(prisma.itemBaixa.findMany).mockResolvedValue([{ ...itemBaixaRecord, quantidade: 10 }] as any);
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue({
      ...itemRecord,
      estoqueAtual: 0,
    } as any);

    const res = await request(app)
      .post('/v1/baixas/baixa-e2e-1/executar')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});
