import { SolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity';
import { ItemSolicitacaoCompra } from '@/domain/compra/item-solicitacao-compra.entity';
import { logger } from '@shared/config/logger';
import { enviarMensagem } from '../kafka.client';

/**
 * Tópicos Kafka do inventory-service para o domínio de compra
 * Convenção: inventory.<entidade>.<evento>
 */
export const TOPICOS_COMPRA = {
  CRIADA:    'inventory.compra.criada',
  APROVADA:  'inventory.compra.aprovada',
  REJEITADA: 'inventory.compra.rejeitada',
  EXECUTADA: 'inventory.compra.executada',
  CANCELADA: 'inventory.compra.cancelada',
} as const;

type TopicoCompra = typeof TOPICOS_COMPRA[keyof typeof TOPICOS_COMPRA];

function criarMetadata(topic: TopicoCompra) {
  return {
    topic,
    timestamp: new Date().toISOString(),
    service: 'inventory-service',
    version: process.env.APP_VERSION ?? '1.0.0',
  };
}

async function publicar(topic: TopicoCompra, id: string, payload: object): Promise<void> {
  const value = JSON.stringify({ ...payload, _metadata: criarMetadata(topic) });
  await enviarMensagem(topic, [{ key: id, value }]);
  logger.debug({ topic, id }, '[COMPRA PRODUCER] Evento publicado');
}

// Publica evento quando uma nova solicitação de compra é criada (status PENDENTE)
export async function publicarCompraCriada(
  solicitacao: SolicitacaoCompra,
  itens: ItemSolicitacaoCompra[],
): Promise<void> {
  await publicar(TOPICOS_COMPRA.CRIADA, solicitacao.id, {
    id: solicitacao.id,
    solicitadoPor: solicitacao.solicitadoPor,
    fornecedorId: solicitacao.fornecedorId,
    status: solicitacao.status,
    justificativa: solicitacao.justificativa,
    itens: itens.map(i => ({
      id: i.id,
      itemInventarioId: i.itemInventarioId,
      quantidade: i.quantidade,
      precoEstimado: i.precoEstimado,
    })),
    criadoEm: solicitacao.criadoEm.toISOString(),
  });
}

// Publica evento quando a solicitação de compra é aprovada (status APROVADO)
export async function publicarCompraAprovada(solicitacao: SolicitacaoCompra): Promise<void> {
  await publicar(TOPICOS_COMPRA.APROVADA, solicitacao.id, {
    id: solicitacao.id,
    solicitadoPor: solicitacao.solicitadoPor,
    status: solicitacao.status,
    aprovadoPor: solicitacao.aprovadoPor,
    aprovadoEm: solicitacao.aprovadoEm?.toISOString() ?? null,
    atualizadoEm: solicitacao.atualizadoEm.toISOString(),
  });
}

// Publica evento quando a solicitação de compra é rejeitada (status REJEITADO)
export async function publicarCompraRejeitada(solicitacao: SolicitacaoCompra): Promise<void> {
  await publicar(TOPICOS_COMPRA.REJEITADA, solicitacao.id, {
    id: solicitacao.id,
    solicitadoPor: solicitacao.solicitadoPor,
    status: solicitacao.status,
    rejeitadoPor: solicitacao.rejeitadoPor,
    rejeitadoEm: solicitacao.rejeitadoEm?.toISOString() ?? null,
    motivoRejeicao: solicitacao.motivoRejeicao,
    atualizadoEm: solicitacao.atualizadoEm.toISOString(),
  });
}

/**
 * Publica evento quando a compra é efetivada (status COMPRADO)
 * Consumido por: serviços que precisam registrar a entrada de itens no estoque
 */
export async function publicarCompraExecutada(solicitacao: SolicitacaoCompra): Promise<void> {
  await publicar(TOPICOS_COMPRA.EXECUTADA, solicitacao.id, {
    id: solicitacao.id,
    solicitadoPor: solicitacao.solicitadoPor,
    fornecedorId: solicitacao.fornecedorId,
    status: solicitacao.status,
    executadoPor: solicitacao.executadoPor,
    executadoEm: solicitacao.executadoEm?.toISOString() ?? null,
    valorTotal: solicitacao.valorTotal,
    atualizadoEm: solicitacao.atualizadoEm.toISOString(),
  });
}

// Publica evento quando a solicitação de compra é cancelada (status CANCELADO)
export async function publicarCompraCancelada(solicitacao: SolicitacaoCompra): Promise<void> {
  await publicar(TOPICOS_COMPRA.CANCELADA, solicitacao.id, {
    id: solicitacao.id,
    solicitadoPor: solicitacao.solicitadoPor,
    status: solicitacao.status,
    atualizadoEm: solicitacao.atualizadoEm.toISOString(),
  });
}
