import { config } from 'dotenv';
import { resolve } from 'path';
import { execSync } from 'child_process';
import mongoose from 'mongoose';

/**
 * Executa uma vez antes de todos os testes E2E.
 *
 * Responsabilidades:
 * 1. Carrega variáveis de ambiente de teste (.env.test)
 * 2. Executa migrations Prisma no banco de testes (PostgreSQL)
 * 3. Conecta ao MongoDB de testes
 *
 * Pré-requisitos:
 * - docker compose up (postgresql, mongodb, redis) com portas de teste
 */
export async function setup(): Promise<void> {
  config({ path: resolve(process.cwd(), '.env.test'), override: true });

  console.log('\n[E2E Global Setup] Executando migrations no banco de testes...');
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('[E2E Global Setup] Migrations concluídas.');

  const mongoUri = process.env.MONGO_INITDB_URI_TESTE!;
  if (mongoUri && mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
    console.log('[E2E Global Setup] MongoDB conectado.\n');
  }
}

export async function teardown(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
