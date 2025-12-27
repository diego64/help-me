import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

// Criar instância do Prisma
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Criar pool do PostgreSQL para conexões diretas (se necessário)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Apenas executar cleanup em ambientes que NÃO são de teste
if (process.env.NODE_ENV !== 'test') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  // Também adicionar para SIGINT e SIGTERM (opcional, mas recomendado)
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