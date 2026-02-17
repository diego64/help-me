import { beforeAll, afterAll, beforeEach } from 'vitest';
import { cleanDatabase, seedBasicData } from './test.database';
import { logger } from '../../../shared/config/logger';

beforeAll(async () => {
  if (process.env.SILENT_TESTS === 'true') {
    logger.level = 'error';
  }
  
  console.log('[INFO]: Iniciando suite de testes E2E...');
});

afterAll(async () => {
  console.log('[INFO]: Suite de testes E2E concluída');
});

beforeEach(async () => {
  await cleanDatabase();

  await seedBasicData();
});
