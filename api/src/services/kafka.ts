import { Kafka, Producer, logLevel, LogEntry } from 'kafkajs';

const ignoreMessages = [
  'The group is rebalancing, so a rejoin is needed'
];

/**
 * Cria um logger customizado para o Kafka que filtra mensagens desnecessárias
 * Exportado para permitir testes unitários
 */
export const customLogCreator = () => (entry: LogEntry) => {
  const errorMsg = typeof entry.log?.error === 'string' ? entry.log.error : '';
  if (
    (entry.level === logLevel.ERROR || entry.level === logLevel.WARN) &&
    !ignoreMessages.some(msg => errorMsg.includes(msg))
  ) {
    console.log(`[Kafka][${entry.label}]`, entry.log);
  }
};

// Variáveis privadas que serão inicializadas sob demanda
let kafkaInstance: Kafka | null = null;
let producerInstance: Producer | null = null;

/**
 * Configuração do Kafka (exposta para testes)
 */
export interface KafkaConfig {
  clientId: string;
  brokers: string[];
  brokerUrl: string;
}

let kafkaConfig: KafkaConfig | null = null;

/**
 * Inicializa e retorna a instância do Kafka (Lazy Loading)
 * @returns Instância do Kafka
 * @throws Error se KAFKA_BROKER_URL não estiver definida
 */
function getKafkaInstance(): Kafka {
  if (kafkaInstance) return kafkaInstance;

  const brokerUrl = process.env.KAFKA_BROKER_URL;
  if (!brokerUrl) throw new Error('KAFKA_BROKER_URL não definida!');

  // Armazena config para testes
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
 * Obtém a configuração atual do Kafka (útil para testes)
 * @returns Configuração do Kafka ou null se não inicializado
 */
export function getKafkaConfig(): KafkaConfig | null {
  // Se já está inicializado, retorna a config
  if (kafkaConfig) {
    return kafkaConfig;
  }
  
  // Se não há ENV, não tenta inicializar
  const brokerUrl = process.env.KAFKA_BROKER_URL;
  if (!brokerUrl) {
    return null;
  }
  
  // Se tem ENV mas não está inicializado, tenta inicializar
  try {
    getKafkaInstance();
    return kafkaConfig;
  } catch (error) {
    return null;
  }
}

/**
 * Obtém a instância do producer (cria se não existir)
 * @returns Producer do Kafka
 */
function getProducerInstance(): Producer {
  if (producerInstance) return producerInstance;
  
  const kafka = getKafkaInstance();
  producerInstance = kafka.producer();
  
  return producerInstance;
}

/**
 * Obtém a instância real do producer (para testes)
 * @returns Producer do Kafka ou null se não inicializado
 */
export function getProducerInstanceForTest(): Producer | null {
  return producerInstance;
}

/**
 * Conecta o Kafka Producer
 */
export async function conectarKafkaProducer(): Promise<void> {
  const prod = getProducerInstance();
  await prod.connect();
  console.log('Kafka Producer conectado');
}

/**
 * Desconecta o Kafka Producer (útil para testes)
 */
export async function desconectarKafkaProducer(): Promise<void> {
  if (producerInstance) {
    await producerInstance.disconnect();
  }
  
  // Limpa TODAS as instâncias e configurações
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