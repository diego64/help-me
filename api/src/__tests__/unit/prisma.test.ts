import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

if (!process.env.DATABASE_URL || typeof process.env.DATABASE_URL !== 'string') {
  throw new Error('DATABASE_URL não está definida ou não é uma string');
}

// Criar pool do PostgreSQL com configurações completas
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export const prismaPg = new PrismaPg(pool)

// Criar instância do Prisma com o adapter
export const prisma = new PrismaClient({
  adapter: prismaPg,
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

// Apenas executar cleanup em ambientes que NÃO são de teste
if (process.env.NODE_ENV !== 'test') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  // Também adicionar para SIGINT e SIGTERM
  process.on('SIGINT', async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
}