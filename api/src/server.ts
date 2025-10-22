import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import tecnicoRoutes from './routes/tecnico.routes';
import usuarioRoutes from './routes/usuario.routes';
import servicoRoutes from './routes/servico..routes';
import chamadoRoutes from './routes/chamado.routes';
import filaDeChamadosRoutes from './routes/fila-de-chamados.routes';
import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/tecnico', tecnicoRoutes);
app.use('/usuario', usuarioRoutes);
app.use('/servico', servicoRoutes);
app.use('/chamado', chamadoRoutes);
app.use('/filadechamados', filaDeChamadosRoutes);

const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

(async () => {
  try {
    await prisma.$connect(); // Teste de conexão com PostgreSQL/Prisma
    console.log('Banco de dados PostgreSQL conectado!');

    await mongoose.connect(process.env.MONGO_INITDB_URI!); // Teste de conexão com MongoDB
    console.log('Banco de dados MongoDB conectado!');

    app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
  } catch (err) {
    console.error('Erro ao inicializar o servidor:', err);
    process.exit(1);
  }
})();
