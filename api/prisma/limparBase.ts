import * as dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/lib/prisma';
import mongoose from 'mongoose';
import ChamadoAtualizacaoModel from '../src/models/chamadoAtualizacao.model';

async function main() {
// ============================================================================
// LIMPEZA DO BANCO DE DADOS MONGODB
// ============================================================================

  await mongoose.connect(process.env.MONGO_URI!);
  await ChamadoAtualizacaoModel.deleteMany({});
  await mongoose.disconnect();

// ============================================================================
// LIMPEZA DO BANCO DE DADOS POSTGRESQL
// ============================================================================

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
