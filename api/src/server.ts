import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';

import { conectarKafkaProducer } from './services/kafka';
import { startChamadoConsumer } from './consumers/chamadoConsumer';

import express from 'express';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import tecnicoRoutes from './routes/tecnico.routes';
import usuarioRoutes from './routes/usuario.routes';
import servicoRoutes from './routes/servico..routes';
import chamadoRoutes from './routes/chamado.routes';
import filaDeChamadosRoutes from './routes/fila-de-chamados.routes';
import envioDeEmailTeste from './routes/envio-email-teste.routes';

const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/tecnico', tecnicoRoutes);
app.use('/usuario', usuarioRoutes);
app.use('/servico', servicoRoutes);
app.use('/chamado', chamadoRoutes);
app.use('/filadechamados', filaDeChamadosRoutes);
app.use('/testeemail', envioDeEmailTeste);

(async () => {
  try {
    await prisma.$connect();
    console.log('[PostgreSQL] Banco de dados conectado!');

    await mongoose.connect(process.env.MONGO_INITDB_URI!);
    console.log('[MongoDB] Banco de dados conectado!');

    await conectarKafkaProducer();

    await startChamadoConsumer();
    console.log('[Kafka][Consumer] Listener iniciado!');

    app.listen(PORT, () => console.log(`[Node.JS] Servidor rodando na porta ${PORT} com sucesso!`));

  } catch (err) {
    console.error('[Erro de inicialização]:', err);
    process.exit(1);
  }
})();
