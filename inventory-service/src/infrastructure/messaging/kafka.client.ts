import { Kafka, Producer, logLevel, LogEntry } from 'kafkajs';
import { logger } from '@shared/config/logger';

const ignorarMensagens = [
  'The group is rebalancing, so a rejoin is needed',
  'Connection timeout',
  'Failed to connect to seed broker',
];

export const customLogCreator = () => (entry: LogEntry) => {
  const errorMsg = typeof entry.log?.error === 'string' ? entry.log.error : '';

  if (
    (entry.level === logLevel.ERROR || entry.level === logLevel.WARN) &&
    !ignorarMensagens.some(msg => errorMsg.includes(msg))
  ) {
    if (entry.level === logLevel.ERROR) {
      logger.error({ kafka: entry.log, label: entry.label }, 'Kafka error');
    } else {
      logger.warn({ kafka: entry.log, label: entry.label }, 'Kafka warning');
    }
  }
};

let kafkaInstance: Kafka | null = null;
let producerInstance: Producer | null = null;
let isConnected = false;

export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  brokerUrl: string;
}

let kafkaConfig: KafkaConfig | null = null;

/**
 * INICIALIZA E RETORNA A INSTÂNCIA DO KAFKA (LAZY LOADING)
 * @returns INSTÂNCIA DO KAFKA
 * @throws ERROR SE KAFKA_BROKERS NÃO ESTIVER DEFINIDA
 */
function getKafkaInstance(): Kafka {
  if (kafkaInstance) return kafkaInstance;

  const brokerUrl = process.env.KAFKA_BROKERS;
  if (!brokerUrl) throw new Error('KAFKA_BROKERS não definida!');

  const clientId = process.env.KAFKA_CLIENT_ID || 'inventory-service';

  kafkaConfig = {
    clientId,
    brokers: [brokerUrl],
    brokerUrl,
  };

  kafkaInstance = new Kafka({
    clientId,
    brokers: kafkaConfig.brokers,
    logLevel: logLevel.ERROR,
    logCreator: customLogCreator,
    retry: {
      initialRetryTime: 300,
      retries: 3,
    },
    connectionTimeout: 10000,
    requestTimeout: 90000,
  });

  return kafkaInstance;
}

/**
 * OBTÉM A CONFIGURAÇÃO ATUAL DO KAFKA
 * @returns CONFIGURAÇÃO DO KAFKA OU NULL SE NÃO INICIALIZADO
 */
export function getKafkaConfig(): KafkaConfig | null {
  if (kafkaConfig) return kafkaConfig;

  const brokerUrl = process.env.KAFKA_BROKERS;
  if (!brokerUrl) return null;

  try {
    getKafkaInstance();
    return kafkaConfig;
  } catch {
    return null;
  }
}

/**
 * OBTÉM A INSTÂNCIA DO PRODUCER (CRIA SE NÃO EXISTIR)
 * @returns PRODUCER DO KAFKA
 */
function getProducerInstance(): Producer {
  if (producerInstance) return producerInstance;

  const kafka = getKafkaInstance();
  producerInstance = kafka.producer();

  return producerInstance;
}

/**
 * OBTÉM A INSTÂNCIA REAL DO PRODUCER (PARA TESTES)
 * @returns PRODUCER DO KAFKA OU NULL SE NÃO INICIALIZADO
 */
export function getProducerInstanceParaTeste(): Producer | null {
  return producerInstance;
}

export function isKafkaConectado(): boolean {
  return isConnected;
}

export async function conectarKafkaProducer(): Promise<void> {
  try {
    const prod = getProducerInstance();
    await prod.connect();
    isConnected = true;
    logger.info('Kafka Producer conectado');
  } catch (error) {
    isConnected = false;
    logger.warn('Falha ao conectar ao Kafka - funcionando sem Kafka');
    logger.warn({ brokerUrl: process.env.KAFKA_BROKERS }, 'Certifique-se de que o Kafka está rodando');
  }
}

export async function desconectarKafkaProducer(): Promise<void> {
  if (producerInstance && isConnected) {
    try {
      await producerInstance.disconnect();
      logger.info('Kafka Producer desconectado');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao desconectar Kafka Producer');
    }
  }

  producerInstance = null;
  kafkaInstance = null;
  kafkaConfig = null;
  isConnected = false;
}

export async function enviarMensagem(topic: string, messages: { key?: string; value: string }[]): Promise<void> {
  if (!isConnected) {
    logger.warn({ topic }, 'Kafka não conectado - mensagem não enviada');
    return;
  }

  try {
    const prod = getProducerInstance();
    await prod.send({ topic, messages });
    logger.debug({ topic, totalMensagens: messages.length }, 'Mensagem enviada ao Kafka');
  } catch (error) {
    logger.error({ err: error, topic }, 'Erro ao enviar mensagem ao Kafka');
    throw error;
  }
}

export const kafka = new Proxy({} as Kafka, {
  get: (_, prop) => {
    const instance = getKafkaInstance();
    return (instance as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const producer = new Proxy({} as Producer, {
  get: (_, prop) => {
    const instance = getProducerInstance();
    return (instance as unknown as Record<string | symbol, unknown>)[prop];
  },
});