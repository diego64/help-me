import { prisma } from '../src/lib/prisma';
import mongoose from 'mongoose';
import app from './app';
import { conectarKafkaProducer, desconectarKafkaProducer } from './services/kafka';
import { startChamadoConsumer, stopChamadoConsumer } from './consumers/chamadoConsumer';
import { logger } from './utils/logger';
import { redisClient } from './services/redisClient';

const PORT = process.env.PORT || 3000;

let servidor: any;

(async () => {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL conectado com sucesso');

    await mongoose.connect(process.env.MONGO_INITDB_URI!);
    logger.info('MongoDB conectado com sucesso');

    await conectarKafkaProducer();
    logger.info('Kafka Producer conectado com sucesso!');

    await startChamadoConsumer();
    logger.info('Kafka Consumer inicializado com sucesso!');

	  
    servidor = app.listen(PORT, () => {
      logger.info(
        {
          porta: PORT,
          ambiente: process.env.NODE_ENV || 'development',
          versaoNode: process.version,
        },
        'Servidor HTTP iniciado com sucesso'
      );
    });

  } catch (erro) {
    logger.fatal({ err: erro }, 'Erro na inicialização do servidor');
    process.exit(1);
  }
})();


const progressiveShutdown = async (sinal: string) => {
  logger.info({ sinal }, ' Sinal de desligamento recebido');

  if (servidor) {
    servidor.close(async () => {
      logger.info('Servidor HTTP encerrado');

      try {
 
        logger.info('Parando Kafka Consumer...');
        if (typeof stopChamadoConsumer === 'function') {
          await stopChamadoConsumer();
        }
        logger.info('Kafka Consumer parado');

        logger.info('Desconectando Kafka Producer...');
        if (typeof desconectarKafkaProducer === 'function') {
          await desconectarKafkaProducer();
        }
        logger.info('Kafka Producer desconectado');

        logger.info('Desconectando MongoDB...');
        await mongoose.disconnect();
        logger.info('MongoDB desconectado');

        logger.info('Desconectando PostgreSQL...');
        await prisma.$disconnect();
        logger.info('PostgreSQL desconectado');

        logger.info('Desconectando Redis...');
        await redisClient.quit();
        logger.info('Redis desconectado');

        logger.info('Todas as conexões encerradas com sucesso');
        process.exit(0);
      } catch (erro) {
        logger.error({ err: erro }, 'Erro durante desligamento gracioso');
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error('Desligamento forçado após timeout');
      process.exit(1);
    }, 15000);
  } else {
    logger.warn('Servidor não inicializado, saindo imediatamente');
    process.exit(0);
  }
};


process.on('SIGTERM', () => progressiveShutdown('SIGTERM'));
process.on('SIGINT', () => progressiveShutdown('SIGINT'));

process.on('uncaughtException', (erro: Error) => {
  logger.fatal({ err: erro }, 'Exceção não capturada');
  process.exit(1);
});

process.on('unhandledRejection', (razao: any) => {
  logger.fatal({ err: razao }, 'Promise rejeitada não tratada');
  process.exit(1);
});

redisClient.on('error', (erro) => {
  logger.error({ err: erro }, 'Erro no cliente Redis');
});

redisClient.on('connect', () => {
  logger.info('Cliente Redis conectado');
});

redisClient.on('ready', () => {
  logger.info('Cliente Redis pronto');
});

redisClient.on('end', () => {
  logger.info('Cliente Redis desconectado');
});

mongoose.connection.on('connected', () => {
  logger.info('Conexão MongoDB estabelecida');
});

mongoose.connection.on('error', (erro) => {
  logger.error({ err: erro }, 'Erro na conexão MongoDB');
});

mongoose.connection.on('disconnected', () => {
  logger.info('MongoDB desconectado');
});

export default servidor;