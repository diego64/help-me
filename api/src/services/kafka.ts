import {
  Kafka,
  Producer,
  logLevel,
  LogEntry
} from 'kafkajs';
import { logger } from '../utils/logger';

const ignoreMessages = [
  'The group is rebalancing, so a rejoin is needed'
];

// Logger customizado para o Kafka usando Pino
export const customLogCreator = () => (entry: LogEntry) => {
  const errorMsg = typeof entry.log?.error === 'string' ? entry.log.error : '';
  
  if (
    (entry.level === logLevel.ERROR || entry.level === logLevel.WARN) &&
    !ignoreMessages.some(msg => errorMsg.includes(msg))
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
 * @throws ERROR SE KAFKA_BROKER_URL NÃO ESTIVER DEFINIDA
 */
function getKafkaInstance(): Kafka {
  if (kafkaInstance) return kafkaInstance;

  const brokerUrl = process.env.KAFKA_BROKER_URL;
  if (!brokerUrl) throw new Error('KAFKA_BROKER_URL não definida!');

  kafkaConfig = {
    clientId: 'helpdesk-api',
    brokers: [brokerUrl],
    brokerUrl
  };

  kafkaInstance = new Kafka({
    clientId: kafkaConfig.clientId,
    brokers: kafkaConfig.brokers,
    logLevel: logLevel.ERROR,
    logCreator: customLogCreator,
    retry: {
      initialRetryTime: 300,
      retries: 3
    },
    connectionTimeout: 3000,
    requestTimeout: 25000
  });

  return kafkaInstance;
}

/**
 * OBTÉM A CONFIGURAÇÃO ATUAL DO KAFKA (ÚTIL PARA TESTES)
 * @returns CONFIGURAÇÃO DO KAFKA OU NULL SE NÃO INICIALIZADO
 */
export function getKafkaConfig(): KafkaConfig | null {
  if (kafkaConfig) {
    return kafkaConfig;
  }
  
  const brokerUrl = process.env.KAFKA_BROKER_URL;
  if (!brokerUrl) {
    return null;
  }
  
  try {
    getKafkaInstance();
    return kafkaConfig;
  } catch (error) {
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
export function getProducerInstanceForTest(): Producer | null {
  return producerInstance;
}

export function isKafkaConnected(): boolean {
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
    logger.warn({ brokerUrl: process.env.KAFKA_BROKER_URL }, 'Certifique-se de que o Kafka está rodando');
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

export async function sendMessage(topic: string, messages: any[]): Promise<void> {
  if (!isConnected) {
    logger.warn({ topic }, 'Kafka não conectado - mensagem não enviada');
    return;
  }
  
  try {
    const prod = getProducerInstance();
    await prod.send({
      topic,
      messages
    });
    logger.debug({ topic, messageCount: messages.length }, 'Mensagem enviada ao Kafka');
  } catch (error) {
    logger.error({ err: error, topic }, 'Erro ao enviar mensagem ao Kafka');
    throw error;
  }
}

export const kafka = new Proxy({} as Kafka, {
  get: (_, prop) => {
    const instance = getKafkaInstance();
    return (instance as any)[prop];
  }
});

export const producer = new Proxy({} as Producer, {
  get: (_, prop) => {
    const instance = getProducerInstance();
    return (instance as any)[prop];
  }
});