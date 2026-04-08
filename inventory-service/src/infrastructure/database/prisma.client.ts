import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { logger } from '@shared/config/logger';

const connectionString = process.env.DATABASE_URL;

if (!connectionString || typeof connectionString !== 'string') {
  logger.error('DATABASE_URL não está definida ou não é uma string');
  throw new Error('DATABASE_URL não está definida ou não é uma string');
}

const pool = new Pool({
  connectionString,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function desconectarBancoDados(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}

// Garante desconexão limpa em sinais de encerramento (SIGTERM enviado pelo K8s/Docker,
// SIGINT pelo Ctrl+C em desenvolvimento). Quando server.ts implementar seu próprio
// graceful shutdown, pode chamar desconectarBancoDados() diretamente e remover estes handlers.
process.on('SIGTERM', desconectarBancoDados);
process.on('SIGINT', desconectarBancoDados);