import { beforeAll, afterAll, beforeEach } from 'vitest';
import { cleanDatabase, seedBasicData, connectMongoDB } from './test.database';
import { logger } from '@shared/config/logger';
import mongoose from 'mongoose';

beforeAll(async () => {
  await connectMongoDB();

  if (process.env.SILENT_TESTS === 'true') {
    logger.level = 'error';
  }

  console.log('[INFO]: Iniciando suite de testes E2E...');
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  console.log('[INFO]: Suite de testes E2E concluída');
});

beforeEach(async () => {
  await cleanDatabase();
  await seedBasicData();
});