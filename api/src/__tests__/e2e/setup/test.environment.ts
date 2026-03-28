import { config } from 'dotenv';
import { resolve } from 'path';
import { vi } from 'vitest';

/**
 * Executa antes de cada arquivo de teste E2E (setupFiles).
 *
 * Garante que DATABASE_URL, JWT_SECRET e demais variáveis estejam
 * disponíveis antes que qualquer módulo da aplicação seja importado.
 */
config({ path: resolve(process.cwd(), '.env.test'), override: true });

// Conecta MongoDB no processo de teste (setupFiles roda no worker, global-setup no processo pai)
import mongoose from 'mongoose';
const mongoUri = process.env.MONGO_INITDB_URI_TESTE!;
if (mongoUri && mongoose.connection.readyState === 0) {
  mongoose.connect(mongoUri).catch(() => {
    // Falha silenciosa — testes de notificação serão ignorados se MongoDB indisponível
  });
}

/**
 * Silencia o logger Pino para não poluir a saída dos testes.
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

/**
 * Mock do Kafka consumer — evita tentativas de conexão ao broker durante testes.
 * O consumer só seria ativado via startServices() no server.ts, mas o mock
 * garante que o módulo não tente conectar ao importar app.ts.
 */
vi.mock('@infrastructure/messaging/kafka/consumers/notificacao.consumer', () => ({
  startNotificacaoConsumer: vi.fn().mockResolvedValue(undefined),
  stopNotificacaoConsumer:  vi.fn().mockResolvedValue(undefined),
}));

/**
 * Mock do SLA Job — evita inicialização de cron job durante testes.
 */
vi.mock('@/domain/jobs/sla.job', () => ({
  iniciarSLAJob: vi.fn().mockReturnValue(null),
}));
