import { Consumer, EachMessagePayload, Kafka, logLevel } from 'kafkajs';
import { logger } from '@shared/config/logger';
import { customLogCreator } from '../kafka.client';

/**
 * Tópicos do auth-service consumidos pelo inventory-service
 * O inventory precisa saber se usuários existem e estão ativos
 * para validar solicitações de baixa, compra e reembolso
 */
const TOPICS_CONSUMIDOS = [
  'auth.usuario.criado',
  'auth.usuario.atualizado',
  'auth.usuario.desativado',
  'auth.usuario.reativado',
  'auth.usuario.deletado',
] as const;

type TopicConsumido = typeof TOPICS_CONSUMIDOS[number];

export interface UsuarioCached {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: string;
  ativo: boolean;
}

/**
 * Cache in-memory de usuários sincronizado via eventos Kafka do auth-service
 * Evita chamadas HTTP ao auth-service nos fluxos de negócio críticos
 */
const usuariosCache = new Map<string, UsuarioCached>();

export function buscarUsuarioCached(id: string): UsuarioCached | null {
  return usuariosCache.get(id) ?? null;
}

export function isUsuarioAtivo(id: string): boolean {
  return usuariosCache.get(id)?.ativo === true;
}

function handleUsuarioCriado(payload: unknown): void {
  const data = payload as UsuarioCached;
  usuariosCache.set(data.id, {
    id: data.id,
    nome: data.nome,
    sobrenome: data.sobrenome,
    email: data.email,
    regra: data.regra,
    ativo: data.ativo,
  });
  logger.debug({ usuarioId: data.id }, '[AUTH CONSUMER] Usuário adicionado ao cache');
}

function handleUsuarioAtualizado(payload: unknown): void {
  const data = payload as UsuarioCached;
  const existente = usuariosCache.get(data.id);
  usuariosCache.set(data.id, {
    id: data.id,
    nome: data.nome,
    sobrenome: data.sobrenome,
    email: data.email,
    regra: data.regra,
    ativo: existente?.ativo ?? data.ativo,
  });
  logger.debug({ usuarioId: data.id }, '[AUTH CONSUMER] Usuário atualizado no cache');
}

function handleUsuarioDesativado(payload: unknown): void {
  const data = payload as { id: string };
  const existente = usuariosCache.get(data.id);
  if (existente) {
    usuariosCache.set(data.id, { ...existente, ativo: false });
    logger.debug({ usuarioId: data.id }, '[AUTH CONSUMER] Usuário desativado no cache');
  }
}

function handleUsuarioReativado(payload: unknown): void {
  const data = payload as { id: string };
  const existente = usuariosCache.get(data.id);
  if (existente) {
    usuariosCache.set(data.id, { ...existente, ativo: true });
    logger.debug({ usuarioId: data.id }, '[AUTH CONSUMER] Usuário reativado no cache');
  }
}

function handleUsuarioDeletado(payload: unknown): void {
  const data = payload as { id: string };
  usuariosCache.delete(data.id);
  logger.debug({ usuarioId: data.id }, '[AUTH CONSUMER] Usuário removido do cache');
}

const HANDLERS: Record<TopicConsumido, (payload: unknown) => void> = {
  'auth.usuario.criado':    handleUsuarioCriado,
  'auth.usuario.atualizado': handleUsuarioAtualizado,
  'auth.usuario.desativado': handleUsuarioDesativado,
  'auth.usuario.reativado':  handleUsuarioReativado,
  'auth.usuario.deletado':   handleUsuarioDeletado,
};

let consumer: Consumer | null = null;
let isRunning = false;

export async function conectarAuthConsumer(): Promise<void> {
  const brokerUrl = process.env.KAFKA_BROKERS;
  if (!brokerUrl) {
    logger.warn('[AUTH CONSUMER] KAFKA_BROKERS não definida — consumer não iniciado');
    return;
  }

  try {
    const kafka = new Kafka({
      clientId: `${process.env.KAFKA_CLIENT_ID ?? 'inventory-service'}-consumer`,
      brokers: [brokerUrl],
      logLevel: logLevel.ERROR,
      logCreator: customLogCreator,
      retry: {
        initialRetryTime: 300,
        retries: 3,
        maxRetryTime: 30000,
        multiplier: 2,
      },
      connectionTimeout: 10000,
    });

    consumer = kafka.consumer({
      groupId: 'inventory-service.auth',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    logger.info({ broker: brokerUrl }, '[AUTH CONSUMER] Conectado ao broker');

    await consumer.subscribe({
      topics: [...TOPICS_CONSUMIDOS],
      fromBeginning: true,
    });

    await consumer.run({
      eachMessage: async (messagePayload: EachMessagePayload) => {
        const { topic, message, partition } = messagePayload;
        const correlationId = message.headers?.['x-correlation-id']?.toString();
        const rawValue = message.value?.toString();

        if (!rawValue) {
          logger.warn({ topic, partition }, '[AUTH CONSUMER] Mensagem sem payload recebida');
          return;
        }

        try {
          const data: unknown = JSON.parse(rawValue);
          const handler = HANDLERS[topic as TopicConsumido];

          if (!handler) {
            logger.warn({ topic }, '[AUTH CONSUMER] Nenhum handler para o tópico');
            return;
          }

          handler(data);

          logger.debug(
            { topic, partition, offset: message.offset, correlationId },
            '[AUTH CONSUMER] Mensagem processada',
          );
        } catch (err) {
          logger.error(
            { err, topic, partition, offset: message.offset, correlationId },
            '[AUTH CONSUMER] Erro ao processar mensagem',
          );
        }
      },
    });

    isRunning = true;
    logger.info('[AUTH CONSUMER] Consumer de autenticação iniciado');
  } catch (err) {
    logger.warn({ err }, '[AUTH CONSUMER] Falha ao iniciar consumer — serviço continua sem cache de usuários');
  }
}

export async function desconectarAuthConsumer(): Promise<void> {
  if (!consumer || !isRunning) return;

  try {
    await consumer.disconnect();
    isRunning = false;
    consumer = null;
    logger.info('[AUTH CONSUMER] Consumer de autenticação desconectado');
  } catch (err) {
    logger.error({ err }, '[AUTH CONSUMER] Erro ao desconectar consumer');
  }
}

export function isAuthConsumerRunning(): boolean {
  return isRunning;
}
