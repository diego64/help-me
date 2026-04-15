import { Baixa } from '@/domain/baixa/baixa.entity';
import { ItemBaixa } from '@/domain/baixa/item-baixa.entity';
import { logger } from '@shared/config/logger';
import { enviarMensagem } from '../kafka.client';

/**
 * Tópicos Kafka do inventory-service para o domínio de baixa
 * Convenção: inventory.<entidade>.<evento>
 */
export const TOPICOS_BAIXA = {
  CRIADA: 'inventory.baixa.criada',
  APROVADA_TECNICO: 'inventory.baixa.aprovada-tecnico',
  APROVADA_GESTOR: 'inventory.baixa.aprovada-gestor',
  CONCLUIDA: 'inventory.baixa.concluida',
  REJEITADA: 'inventory.baixa.rejeitada',
} as const;

type TopicoBaixa = typeof TOPICOS_BAIXA[keyof typeof TOPICOS_BAIXA];

function criarMetadata(topic: TopicoBaixa) {
  return {
    topic,
    timestamp: new Date().toISOString(),
    service: 'inventory-service',
    version: process.env.APP_VERSION ?? '1.0.0',
  };
}

async function publicar(topic: TopicoBaixa, id: string, payload: object): Promise<void> {
  const value = JSON.stringify({ ...payload, _metadata: criarMetadata(topic) });
  await enviarMensagem(topic, [{ key: id, value }]);
  logger.debug({ topic, id }, '[BAIXA PRODUCER] Evento publicado');
}

/**
 * Publica evento quando uma nova baixa é criada (status PENDENTE)
 * Consumido por: serviços que precisam rastrear solicitações de baixa
 */
export async function publicarBaixaCriada(baixa: Baixa, itens: ItemBaixa[]): Promise<void> {
  await publicar(TOPICOS_BAIXA.CRIADA, baixa.id, {
    id: baixa.id,
    solicitadoPor: baixa.solicitadoPor,
    perfilSolicitante: baixa.perfilSolicitante,
    status: baixa.status,
    justificativa: baixa.justificativa,
    itens: itens.map(i => ({
      id: i.id,
      itemInventarioId: i.itemInventarioId,
      quantidade: i.quantidade,
      motivo: i.motivo,
    })),
    criadoEm: baixa.criadoEm.toISOString(),
  });
}

// Publica evento quando a baixa é aprovada pelo técnico (status APROVADO_TECNICO)
export async function publicarBaixaAprovadaTecnico(baixa: Baixa): Promise<void> {
  await publicar(TOPICOS_BAIXA.APROVADA_TECNICO, baixa.id, {
    id: baixa.id,
    solicitadoPor: baixa.solicitadoPor,
    status: baixa.status,
    aprovadoTecnicoPor: baixa.aprovadoTecnicoPor,
    aprovadoTecnicoEm: baixa.aprovadoTecnicoEm?.toISOString() ?? null,
    atualizadoEm: baixa.atualizadoEm.toISOString(),
  });
}

// Publica evento quando a baixa é aprovada pelo gestor (status APROVADO_GESTOR)
export async function publicarBaixaAprovadaGestor(baixa: Baixa): Promise<void> {
  await publicar(TOPICOS_BAIXA.APROVADA_GESTOR, baixa.id, {
    id: baixa.id,
    solicitadoPor: baixa.solicitadoPor,
    status: baixa.status,
    aprovadoGestorPor: baixa.aprovadoGestorPor,
    aprovadoGestorEm: baixa.aprovadoGestorEm?.toISOString() ?? null,
    atualizadoEm: baixa.atualizadoEm.toISOString(),
  });
}

/**
 * Publica evento quando a baixa é executada (status CONCLUIDO)
 * Consumido por: serviços que precisam rastrear a saída de itens do estoque
 */
export async function publicarBaixaConcluida(baixa: Baixa): Promise<void> {
  await publicar(TOPICOS_BAIXA.CONCLUIDA, baixa.id, {
    id: baixa.id,
    solicitadoPor: baixa.solicitadoPor,
    status: baixa.status,
    executadoPor: baixa.executadoPor,
    executadoEm: baixa.executadoEm?.toISOString() ?? null,
    atualizadoEm: baixa.atualizadoEm.toISOString(),
  });
}

// Publica evento quando a baixa é rejeitada (status REJEITADO)
export async function publicarBaixaRejeitada(baixa: Baixa): Promise<void> {
  await publicar(TOPICOS_BAIXA.REJEITADA, baixa.id, {
    id: baixa.id,
    solicitadoPor: baixa.solicitadoPor,
    status: baixa.status,
    rejeitadoPor: baixa.rejeitadoPor,
    rejeitadoEm: baixa.rejeitadoEm?.toISOString() ?? null,
    motivoRejeicao: baixa.motivoRejeicao,
    atualizadoEm: baixa.atualizadoEm.toISOString(),
  });
}
