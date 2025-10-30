  import { Kafka, logLevel, LogEntry } from 'kafkajs';

  const ignoreMessages = [
    'The group is rebalancing, so a rejoin is needed'
  ];

  const customLogCreator = () => (entry: LogEntry) => {
    const errorMsg = typeof entry.log?.error === 'string' ? entry.log.error : '';
    if (
      (entry.level === logLevel.ERROR || entry.level === logLevel.WARN) &&
      !ignoreMessages.some(msg => errorMsg.includes(msg))
    ) {
      console.log(`[Kafka][${entry.label}]`, entry.log);
    }
  };

  const brokerUrl = process.env.KAFKA_BROKER_URL;
  if (!brokerUrl) throw new Error('KAFKA_BROKER_URL não definida!');

  export const kafka = new Kafka({
    clientId: 'helpdesk-api',
    brokers: [brokerUrl],
    logLevel: logLevel.ERROR,
    logCreator: customLogCreator
  });

  export const producer = kafka.producer();

  export async function conectarKafkaProducer() {
    await producer.connect();
  }
