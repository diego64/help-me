import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Instância do PrismaPg (se você usa @prisma/adapter-pg)
export const prismaPg = pool // ou configure conforme necessário

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