import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import ChamadoAtualizacaoModel from '../src/models/chamadoAtualizacao.model';

const prisma = new PrismaClient();

async function main() {
  // Limpa histórico no MongoDB
  await mongoose.connect(process.env.MONGO_URI!);
  await ChamadoAtualizacaoModel.deleteMany({});
  await mongoose.disconnect();

  // Limpa dados nas tabelas SQL
  await prisma.ordemDeServico.deleteMany();
  await prisma.chamado.deleteMany();
  await prisma.servico.deleteMany();
  await prisma.expediente.deleteMany();
  await prisma.usuario.deleteMany();
}

main()
  .then(() => {
    console.log('Todos os dados foram excluídos do MongoDB e PostgreSQL!');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
