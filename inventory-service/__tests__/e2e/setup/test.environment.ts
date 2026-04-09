/**
 * Setup por arquivo de teste — executado no worker antes de cada arquivo E2E.
 * Garante que variáveis de ambiente críticas estejam disponíveis no worker.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'e2e-test-secret-key-supersecure';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/inventory_test';
process.env.LOG_LEVEL = 'silent';
