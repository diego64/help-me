import { config } from 'dotenv';
import { resolve } from 'path';
import { execSync } from 'child_process';

/**
 * Executa uma vez antes de todos os testes E2E.
 *
 * Responsabilidades:
 * 1. Carrega variáveis de ambiente de teste (.env.test)
 * 2. Executa migrations Prisma no banco de testes
 *
 * Pré-requisitos:
 * - docker compose up auth-postgres-test auth-redis-test -d
 */
export async function setup(): Promise<void> {
  // Carrega .env.test antes de qualquer outra operação
  config({ path: resolve(process.cwd(), '.env.test'), override: true });

  console.log('\n[E2E Global Setup] Executando migrations no banco de testes...');

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });

  console.log('[E2E Global Setup] Migrations concluídas.\n');
}

export async function teardown(): Promise<void> {
  // As conexões são encerradas pelo processo ao finalizar
}
