import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/lib/prisma';
import mongoose from 'mongoose';
import app from './app';
import { conectarKafkaProducer } from './services/kafka';
import { startChamadoConsumer } from './consumers/chamadoConsumer';

const PORT = process.env.PORT || 3000;


(async () => {
  try {
    await prisma.$connect();
    console.log('[PostgreSQL] Banco de dados conectado!');

    await mongoose.connect(process.env.MONGO_INITDB_URI!);
    console.log('[MongoDB] Banco de dados conectado!');

    await conectarKafkaProducer();
    console.log('[Kafka][Producer] Conectado com sucesso!');

    await startChamadoConsumer();
    console.log('[Kafka][Consumer] Listener iniciado!');

    app.listen(PORT, () => {
      console.log(`[Node.JS] Servidor rodando na porta ${PORT} com sucesso!`);
    });

  } catch (err) {
    console.error('[Erro de inicialização]:', err);
    process.exit(1);
  }
})();