import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.chamadoAtualizacao.deleteMany();
  await prisma.ordemDeServico.deleteMany();
  await prisma.chamado.deleteMany();
  await prisma.servico.deleteMany();
  await prisma.expediente.deleteMany();
  await prisma.usuario.deleteMany();
}

main()
  .then(() => {
    console.log('Todos os dados foram excluídos!');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
