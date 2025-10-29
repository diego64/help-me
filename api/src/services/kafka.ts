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

export const kafka = new Kafka({
  clientId: 'helpdesk-api',
  brokers: ['localhost:9092'],
  logLevel: logLevel.ERROR,
  logCreator: customLogCreator
});

export const producer = kafka.producer();

export async function conectarKafkaProducer() {
  await producer.connect();
}
