import { createApp } from './app';
import { logger } from '@shared/config/logger';
import { prisma, desconectarBancoDados } from '@infrastructure/database/prisma.client';
import { conectarKafkaProducer, desconectarKafkaProducer } from '@infrastructure/messaging/kafka.client';

const PORT = Number(process.env.PORT) || 3001;
const NODE_ENV = process.env.NODE_ENV ?? 'development';

async function bootstrap(): Promise<void> {
  logger.info({ environment: NODE_ENV }, '[SERVER] Iniciando inventory-service...');

  try {
    await prisma.$connect();
    logger.info('[SERVER] PostgreSQL conectado');
  } catch (err) {
    logger.error({ err }, '[SERVER] Falha ao conectar PostgreSQL');
    process.exit(1);
  }

  try {
    await conectarKafkaProducer();
    logger.info('[SERVER] Kafka producer conectado');
  } catch (err) {
    logger.warn({ err }, '[SERVER] Kafka producer indisponível — serviço continua sem eventos');
  }

  const app = createApp();

  const server = app.listen(PORT, () => {
    logger.info(
      {
        port: PORT,
        environment: NODE_ENV,
        docs: NODE_ENV !== 'production' ? `http://localhost:${PORT}/docs` : undefined,
        health: `http://localhost:${PORT}/health`,
      },
      `[SERVER] Inventory-service rodando na porta ${PORT}`,
    );
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, '[SERVER] Sinal recebido — iniciando graceful shutdown...');

    server.close(async () => {
      logger.info('[SERVER] Servidor HTTP encerrado');

      await desconectarKafkaProducer();
      logger.info('[SERVER] Kafka producer desconectado');

      await desconectarBancoDados();
      logger.info('[SERVER] PostgreSQL desconectado');

      logger.info('[SERVER] Graceful shutdown concluído');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('[SERVER] Graceful shutdown excedeu 15s — forçando encerramento');
      process.exit(1);
    }, 15000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '[SERVER] Uncaught exception — encerrando processo');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, '[SERVER] Unhandled rejection — encerrando processo');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, '[SERVER] Falha crítica na inicialização');
  process.exit(1);
});
