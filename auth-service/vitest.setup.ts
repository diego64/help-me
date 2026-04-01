import { config } from 'dotenv';
import { resolve } from 'path';
import { vi } from 'vitest'

config({ path: resolve(process.cwd(), '.env.test') });

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))