import { Kafka, Producer, logLevel, LogEntry } from 'kafkajs';

const ignoreMessages = [
  'The group is rebalancing, so a rejoin is needed'
];

// ==== CRIA UM LOGGER CUSTOMIZADO PARA O KAFKA QUE FILTRA MENSAGENS DESNECESSÁRIAS EXPORTADO PARA PERMITIR TESTES UNITÁRIOS ====
export const customLogCreator = () => (entry: LogEntry) => {
  const errorMsg = typeof entry.log?.error === 'string' ? entry.log.error : '';
  if (
    (entry.level === logLevel.ERROR || entry.level === logLevel.WARN) &&
    !ignoreMessages.some(msg => errorMsg.includes(msg))
  ) {
    console.log(`[Kafka][${entry.label}]`, entry.log);
  }
};

// ===== VARIÁVEIS PRIVADAS QUE SERÃO INICIALIZADAS SOB DEMANDA ====
let kafkaInstance: Kafka | null = null;
let producerInstance: Producer | null = null;

// ==== CONFIGURAÇÃO DO KAFKA (EXPOSTA PARA TESTES) ====
export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  brokerUrl: string;
}

let kafkaConfig: KafkaConfig | null = null;

/**
 * NICIALIZA E RETORNA A INSTÂNCIA DO KAFKA (LAZY LOADING)
 * @returns INSTÂNCIA DO KAFKA
 * @throws ERROR SE KAFKA_BROKER_URL NÃO ESTIVER DEFINIDA
 */
function getKafkaInstance(): Kafka {
  if (kafkaInstance) return kafkaInstance;

  const brokerUrl = process.env.KAFKA_BROKER_URL;
  if (!brokerUrl) throw new Error('KAFKA_BROKER_URL não definida!');

  // ==== ARMAZENA CONFIG PARA TESTES ====
  kafkaConfig = {
    clientId: 'helpdesk-api',
    brokers: [brokerUrl],
    brokerUrl
  };

  kafkaInstance = new Kafka({
    clientId: kafkaConfig.clientId,
    brokers: kafkaConfig.brokers,
    logLevel: logLevel.ERROR,
    logCreator: customLogCreator
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

export async function conectarKafkaProducer(): Promise<void> {
  const prod = getProducerInstance();
  await prod.connect();
  console.log('[Kafka][Producer] Kafka Producer conectado');
}

export async function desconectarKafkaProducer(): Promise<void> {
  if (producerInstance) {
    await producerInstance.disconnect();
  }
  
  producerInstance = null;
  kafkaInstance = null;
  kafkaConfig = null;
  
  console.log('Kafka Producer desconectado');
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