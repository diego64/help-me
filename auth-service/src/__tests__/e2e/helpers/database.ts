import { prisma } from '@infrastructure/database/prisma/client';

/**
 * Remove todos os registros do banco de testes.
 * A ordem respeita as FK constraints (auditoria → usuário).
 */
export async function limparBancoDados(): Promise<void> {
  await prisma.auditoriaAuth.deleteMany();
  await prisma.usuario.deleteMany();
}
