import { config } from 'dotenv';
import { resolve } from 'path';
import { vi } from 'vitest';

/**
 * Executa antes de cada arquivo de teste E2E (setupFiles).
 *
 * Garante que DATABASE_URL e JWT_SECRET estejam disponíveis
 * antes que qualquer módulo da aplicação seja importado.
 */
config({ path: resolve(process.cwd(), '.env.test'), override: true });

/**
 * Silencia o logger em testes para evitar ruído na saída.
 * O Pino normalmente escreve em stdout — em testes isso polui o relatório.
 */
vi.mock('@shared/config/logger', () => ({
  logger: {
    info:  vi.fn(),
    debug: vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));
