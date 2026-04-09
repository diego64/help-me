/**
 * Global setup — executado uma vez antes de todos os testes E2E no processo principal.
 * Configura variáveis de ambiente necessárias para carregar os módulos sem erro.
 */
export function setup() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'e2e-test-secret-key-supersecure';
  // DATABASE_URL precisa ter valor para evitar throw no módulo prisma.client;
  // o módulo é completamente mockado nos testes, portanto nenhuma conexão real é feita.
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/inventory_test';
  process.env.LOG_LEVEL = 'silent';
}

export function teardown() {
  // noop
}
