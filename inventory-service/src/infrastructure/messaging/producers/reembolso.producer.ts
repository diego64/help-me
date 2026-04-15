import { Reembolso } from '@/domain/reembolso/reembolso.entity';
import { logger } from '@shared/config/logger';
import { enviarMensagem } from '../kafka.client';

/**
 * Tópicos Kafka do inventory-service para o domínio de reembolso
 * Convenção: inventory.<entidade>.<evento>
 */
export const TOPICOS_REEMBOLSO = {
  CRIADO:    'inventory.reembolso.criado',
  APROVADO:  'inventory.reembolso.aprovado',
  REJEITADO: 'inventory.reembolso.rejeitado',
  PAGO:      'inventory.reembolso.pago',
} as const;

type TopicoReembolso = typeof TOPICOS_REEMBOLSO[keyof typeof TOPICOS_REEMBOLSO];

function criarMetadata(topic: TopicoReembolso) {
  return {
    topic,
    timestamp: new Date().toISOString(),
    service: 'inventory-service',
    version: process.env.APP_VERSION ?? '1.0.0',
  };
}

async function publicar(topic: TopicoReembolso, id: string, payload: object): Promise<void> {
  const value = JSON.stringify({ ...payload, _metadata: criarMetadata(topic) });
  await enviarMensagem(topic, [{ key: id, value }]);
  logger.debug({ topic, id }, '[REEMBOLSO PRODUCER] Evento publicado');
}

// Publica evento quando um reembolso é criado (status PENDENTE)
export async function publicarReembolsoCriado(reembolso: Reembolso): Promise<void> {
  await publicar(TOPICOS_REEMBOLSO.CRIADO, reembolso.id, {
    id: reembolso.id,
    solicitadoPor: reembolso.solicitadoPor,
    solicitacaoCompraId: reembolso.solicitacaoCompraId,
    valor: reembolso.valor,
    descricao: reembolso.descricao,
    status: reembolso.status,
    nfe: reembolso.nfe,
    cnpjFornecedor: reembolso.cnpjFornecedor,
    criadoEm: reembolso.criadoEm.toISOString(),
  });
}

// Publica evento quando o reembolso é aprovado (status APROVADO)
export async function publicarReembolsoAprovado(reembolso: Reembolso): Promise<void> {
  await publicar(TOPICOS_REEMBOLSO.APROVADO, reembolso.id, {
    id: reembolso.id,
    solicitadoPor: reembolso.solicitadoPor,
    valor: reembolso.valor,
    status: reembolso.status,
    aprovadoPor: reembolso.aprovadoPor,
    aprovadoEm: reembolso.aprovadoEm?.toISOString() ?? null,
    atualizadoEm: reembolso.atualizadoEm.toISOString(),
  });
}

// Publica evento quando o reembolso é rejeitado (status REJEITADO)
export async function publicarReembolsoRejeitado(reembolso: Reembolso): Promise<void> {
  await publicar(TOPICOS_REEMBOLSO.REJEITADO, reembolso.id, {
    id: reembolso.id,
    solicitadoPor: reembolso.solicitadoPor,
    valor: reembolso.valor,
    status: reembolso.status,
    rejeitadoPor: reembolso.rejeitadoPor,
    rejeitadoEm: reembolso.rejeitadoEm?.toISOString() ?? null,
    motivoRejeicao: reembolso.motivoRejeicao,
    atualizadoEm: reembolso.atualizadoEm.toISOString(),
  });
}

/**
 * Publica evento quando o reembolso é pago (status PAGO)
 * Consumido por: serviços financeiros ou de notificação
 */
export async function publicarReembolsoPago(reembolso: Reembolso): Promise<void> {
  await publicar(TOPICOS_REEMBOLSO.PAGO, reembolso.id, {
    id: reembolso.id,
    solicitadoPor: reembolso.solicitadoPor,
    solicitacaoCompraId: reembolso.solicitacaoCompraId,
    valor: reembolso.valor,
    status: reembolso.status,
    processadoPor: reembolso.processadoPor,
    processadoEm: reembolso.processadoEm?.toISOString() ?? null,
    urlComprovante: reembolso.urlComprovante,
    atualizadoEm: reembolso.atualizadoEm.toISOString(),
  });
}
