import { Kafka, Producer, ProducerRecord, CompressionTypes } from 'kafkajs';
import { logger } from '@shared/config/logger';

/**
 * Tópicos Kafka do auth-service
 * Convenção: auth.<entidade>.<evento>
 * Inspirado em: Uber event naming, Confluent topic naming conventions
 */
export const KAFKA_TOPICS = {
  USUARIO_CRIADO:    'auth.usuario.criado',
  USUARIO_ATUALIZADO:'auth.usuario.atualizado',
  USUARIO_DESATIVADO:'auth.usuario.desativado',
  USUARIO_DELETADO:  'auth.usuario.deletado',
  USUARIO_REATIVADO: 'auth.usuario.reativado',
  SENHA_ALTERADA:    'auth.senha.alterada',
} as const;

export type KafkaTopic = typeof KAFKA_TOPICS[keyof typeof KAFKA_TOPICS];

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'auth-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  // Retry com backoff exponencial
  // Inspirado em: AWS SQS retry policy, Confluent best practices
  retry: {
    initialRetryTime: 300,
    retries: 5,
    maxRetryTime: 30000,
    multiplier: 2,
  },
  // Logs do KafkaJS via Pino
  logCreator: () => ({ namespace, level, label, log }) => {
    const { message, ...extra } = log;
    logger.debug({ namespace, level, label, ...extra }, message);
  },
});

let producer: Producer | null = null;
let isConnected = false;

/**
 * Conecta o producer ao Kafka
 * Idempotente — seguro chamar múltiplas vezes
 * Inspirado em: KafkaJS best practices, Confluent producer lifecycle
 */
export async function connectProducer(): Promise<void> {
  if (isConnected) return;

  try {
    producer = kafka.producer({
      // Garante que a mensagem foi recebida por todos os replicas
      // Inspirado em: Confluent durability guarantees
      allowAutoTopicCreation: false, // Tópicos devem ser criados explicitamente
      transactionTimeout: 30000,
    });

    await producer.connect();
    isConnected = true;

    logger.info('[KAFKA] Producer conectado com sucesso');
  } catch (err) {
    logger.error({ err }, '[KAFKA] Falha ao conectar producer');
    throw err;
  }
}

/**
 * Desconecta o producer do Kafka
 * Chamado no shutdown do servidor para garantir flush de mensagens pendentes
 */
export async function disconnectProducer(): Promise<void> {
  if (!producer || !isConnected) return;

  try {
    await producer.disconnect();
    isConnected = false;
    producer = null;
    logger.info('[KAFKA] Producer desconectado com sucesso');
  } catch (err) {
    logger.error({ err }, '[KAFKA] Erro ao desconectar producer');
  }
}

/**
 * Publica uma mensagem em um tópico Kafka
 *
 * GARANTIAS:
 * - Compressão GZIP para reduzir uso de rede
 * - Retry automático com backoff exponencial
 * - Circuit breaker: falha no Kafka não derruba a requisição
 * - Logging estruturado de cada publicação
 *
 * Inspirado em: Uber's Kafka producer, Confluent best practices
 *
 * @param topic - Tópico Kafka (use KAFKA_TOPICS)
 * @param key - Chave da mensagem (garante ordenação por entidade)
 * @param value - Payload da mensagem
 * @param headers - Headers opcionais (correlationId, etc)
 */
export async function publishEvent<T>(
  topic: KafkaTopic,
  key: string,
  value: T,
  headers?: Record<string, string>
): Promise<void> {
  // Circuit breaker: se Kafka não estiver conectado, loga e continua
  // Inspirado em: Netflix Hystrix, Resilience4j
  if (!producer || !isConnected) {
    logger.warn({ topic, key }, '[KAFKA] Producer não conectado — evento descartado');
    return;
  }

  const record: ProducerRecord = {
    topic,
    compression: CompressionTypes.GZIP,
    messages: [
      {
        // Chave garante que eventos do mesmo usuário vão para a mesma partição
        // mantendo ordenação por entidade
        key,
        value: JSON.stringify({
          ...value as object,
          _metadata: {
            topic,
            timestamp: new Date().toISOString(),
            service: 'auth-service',
            version: process.env.APP_VERSION || '1.0.0',
          },
        }),
        headers: {
          'content-type': 'application/json',
          'service': 'auth-service',
          ...headers,
        },
        timestamp: Date.now().toString(),
      },
    ],
  };

  try {
    await producer.send(record);

    logger.debug({ topic, key }, '[KAFKA] Evento publicado com sucesso');
  } catch (err) {
    // Não relança o erro — falha no Kafka não deve derrubar a requisição
    // Inspirado em: Outbox pattern, eventual consistency
    logger.error({ err, topic, key }, '[KAFKA] Falha ao publicar evento');
  }
}

export function isKafkaProducerConnected(): boolean {
  return isConnected;
}

export { kafka };