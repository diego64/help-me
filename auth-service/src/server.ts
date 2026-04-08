import { createApp } from './app';
import { logger } from '@shared/config/logger';
import { prisma } from '@infrastructure/database/prisma/client';
import { waitForRedis, disconnectRedis } from '@infrastructure/database/redis/client';
import { connectProducer, disconnectProducer } from '@infrastructure/messaging/kafka/producers/producer';
import { initTracing } from '@infrastructure/http/middlewares/tracing.middleware';

const PORT = Number(process.env.PORT) || 3333;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function bootstrap(): Promise<void> {
  logger.info({ environment: NODE_ENV }, '[SERVER] Iniciando auth-service...');

  await initTracing();

  try {
    await prisma.$connect();
    logger.info('[SERVER] PostgreSQL conectado');
  } catch (err) {
    logger.error({ err }, '[SERVER] Falha ao conectar PostgreSQL');
    process.exit(1);
  }

  const redisReady = await waitForRedis(10000);
  if (!redisReady) {
    logger.error('[SERVER] Falha ao conectar Redis — timeout de 10s');
    process.exit(1);
  }
  logger.info('[SERVER] Redis conectado');

  const app = createApp();

  const server = app.listen(PORT, () => {
    logger.info(
      {
        port: PORT,
        environment: NODE_ENV,
        docs: NODE_ENV !== 'production' ? `http://localhost:${PORT}/docs` : undefined,
        health: `http://localhost:${PORT}/health`,
      },
      `[SERVER] Auth-service rodando na porta ${PORT}`
    );
  });

  // Kafka conecta em background — não bloqueia o servidor HTTP
  connectProducer()
    .then(() => logger.info('[SERVER] Kafka producer conectado'))
    .catch((err) => logger.warn({ err }, '[SERVER] Kafka producer indisponível — serviço continua sem eventos'));

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, '[SERVER] Sinal recebido — iniciando graceful shutdown...');

    server.close(async () => {
      logger.info('[SERVER] Servidor HTTP encerrado');

      await disconnectProducer();
      logger.info('[SERVER] Kafka producer desconectado');

      await disconnectRedis();
      logger.info('[SERVER] Redis desconectado');

      await prisma.$disconnect();
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
  process.on('SIGINT',  () => shutdown('SIGINT'));

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