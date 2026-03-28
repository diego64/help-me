import { prisma } from '@infrastructure/database/prisma/client';
import mongoose from 'mongoose';

/**
 * Remove todos os registros dos bancos de testes.
 *
 * Ordem respeitando FK constraints do PostgreSQL:
 * dependentes → pais → raiz.
 */
export async function limparBancoDados(): Promise<void> {
  // PostgreSQL — ordem inversa às dependências
  await prisma.anexoChamado.deleteMany();
  await prisma.comentarioChamado.deleteMany();
  await prisma.transferenciaChamado.deleteMany();
  await prisma.ordemDeServico.deleteMany();
  await prisma.expediente.deleteMany();
  // Zera auto-referência (pai/filho) antes de deletar chamados
  await prisma.chamado.updateMany({ data: { chamadoPaiId: null } });
  await prisma.chamado.deleteMany();
  await prisma.servico.deleteMany();
  await prisma.usuario.deleteMany();
}

/**
 * Limpa as coleções MongoDB usadas nos testes.
 */
export async function limparMongoDB(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections().toArray();
  await Promise.all(collections.map(({ name }) => db.collection(name).deleteMany({})));
}
