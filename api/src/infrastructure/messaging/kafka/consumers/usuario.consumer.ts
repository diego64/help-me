import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { logger } from '@shared/config/logger';
import { cacheGet, cacheSet } from '@infrastructure/database/redis/client';
import { 
  handleUsuarioCriado,
  handleUsuarioAtualizado,
  handleUsuarioDesativado,
  handleUsuarioDeletado,
  handleUsuarioReativado
} from '../handlers/usuario.handler';

const TOPICS_CONSUMIDOS = [
  'auth.usuario.criado',
  'auth.usuario.atualizado',
  'auth.usuario.desativado',
  'auth.usuario.deletado',
  'auth.usuario.reativado',
] as const;

type TopicConsumido = typeof TOPICS_CONSUMIDOS[number];

const HANDLERS: Record<TopicConsumido, (payload: unknown, correlationId?: string) => Promise<void>> = {
  'auth.usuario.criado':     handleUsuarioCriado,
  'auth.usuario.atualizado': handleUsuarioAtualizado,
  'auth.usuario.desativado': handleUsuarioDesativado,
  'auth.usuario.deletado':   handleUsuarioDeletado,
  'auth.usuario.reativado':  handleUsuarioReativado,
};

// Chave Redis que marca se o consumer já foi inicializado ao menos uma vez
const CONSUMER_INIT_KEY = 'kafka:consumer:usuario:inicializado';

let consumer: Consumer | null = null;
let isRunning = false;

export async function conectarUsuarioConsumer(): Promise<void> {
  const brokerUrl = process.env.KAFKA_BROKER_URL;
  if (!brokerUrl) {
    logger.warn('[KAFKA CONSUMER] KAFKA_BROKER_URL não definida — consumer não iniciado');
    return;
  }

  try {
    const kafka = new Kafka({
      clientId: 'helpdesk-api-consumer',
      brokers: [brokerUrl],
      logLevel: logLevel.ERROR,
      retry: {
        initialRetryTime: 300,
        retries: 5,
        maxRetryTime: 30000,
        multiplier: 2,
      },
      connectionTimeout: 10000,
    });

    consumer = kafka.consumer({
      groupId: 'helpdesk-api.usuarios',
      rebalanceTimeout: 60000,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    logger.info({ broker: brokerUrl }, '[KAFKA CONSUMER] Conectado ao broker');

    // Verifica se é o primeiro boot — se sim, reprocessa eventos históricos
    const jaInicializado = await cacheGet(CONSUMER_INIT_KEY);
    const fromBeginning = !jaInicializado;

    if (fromBeginning) {
      logger.info('[KAFKA CONSUMER] Primeiro boot detectado — reprocessando eventos históricos');
    }

    await consumer.subscribe({
      topics: [...TOPICS_CONSUMIDOS],
      fromBeginning,
    });

    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, message, partition } = payload;
        const correlationId = message.headers?.['x-correlation-id']?.toString();
        const rawValue = message.value?.toString();

        if (!rawValue) {
          logger.warn({ topic, partition }, '[KAFKA CONSUMER] Mensagem sem payload recebida');
          return;
        }

        try {
          const data = JSON.parse(rawValue);
          const handler = HANDLERS[topic as TopicConsumido];

          if (!handler) {
            logger.warn({ topic }, '[KAFKA CONSUMER] Nenhum handler para o tópico');
            return;
          }

          logger.debug(
            { topic, partition, offset: message.offset, correlationId },
            '[KAFKA CONSUMER] Processando mensagem'
          );

          await handler(data, correlationId);

          logger.debug(
            { topic, partition, offset: message.offset, correlationId },
            '[KAFKA CONSUMER] Mensagem processada com sucesso'
          );
        } catch (err) {
          logger.error(
            { err, topic, partition, offset: message.offset, correlationId },
            '[KAFKA CONSUMER] Erro ao processar mensagem'
          );
        }
      },
    });

    // Marca como inicializado — próximos boots não reprocessam histórico
    // TTL de 30 dias — renova a cada boot
    await cacheSet(CONSUMER_INIT_KEY, '1', 60 * 60 * 24 * 30);

    isRunning = true;
    logger.info('[KAFKA CONSUMER] Consumer de usuários iniciado');
  } catch (err) {
    logger.warn({ err }, '[KAFKA CONSUMER] Falha ao iniciar consumer — API continua sem sincronização');
  }
}

export async function desconectarUsuarioConsumer(): Promise<void> {
  if (!consumer || !isRunning) return;

  try {
    await consumer.disconnect();
    isRunning = false;
    consumer = null;
    logger.info('[KAFKA CONSUMER] Consumer de usuários desconectado');
  } catch (err) {
    logger.error({ err }, '[KAFKA CONSUMER] Erro ao desconectar consumer');
  }
}

export function isConsumerRunning(): boolean {
  return isRunning;
}