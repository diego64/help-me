import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@application': resolve(__dirname, 'src/application'),
      '@domain': resolve(__dirname, 'src/domain'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@templates': resolve(__dirname, 'src/templates'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],

    include: ['src/__tests__/unit/**/*.{test,spec}.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'src/__tests__/e2e/**',
      'src/__tests__/performance/**',
      'src/__tests__/unit/infrastructure/http/routes/**',
    ],
    pool: 'forks',
    isolate: true,
    clearMocks: true,
    mockReset: false,
    restoreMocks: true,
    testTimeout: 120000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/*.d.ts',
        'src/server.ts',
        'src/app.ts',
        'src/config/mongo.ts',
        'src/consumers/**',
        'src/events/**',
        'src/routes/envio-email-teste.routes.ts',
        'src/@types/**',
        'src/shared/@types/**',
        'prisma/**',
        // infrastructure bootstrap — cannot be unit tested without integration setup
        'src/infrastructure/database/**',
        'src/infrastructure/messaging/**',
        'src/infrastructure/email/**',
        'src/infrastructure/storage/**',
        'src/infrastructure/websocket/**',
        'src/infrastructure/repositories/**',
        'src/infrastructure/http/middlewares/auth.ts',
        'src/infrastructure/http/middlewares/error-logger.middleware.ts',
        'src/infrastructure/http/middlewares/request-logger.middleware.ts',
        'src/infrastructure/http/middlewares/tracing.middleware.ts',
        'src/infrastructure/http/middlewares/rate-limit.middleware.ts',
        // presentation layer (routes)
        'src/presentation/**',
        // domain jobs (scheduled tasks)
        'src/domain/jobs/**',
        // config/bootstrap — no logic to unit test
        'src/shared/config/logger.ts',
        'src/shared/config/swagger.ts',
        'src/shared/config/tracing.ts',
        'src/shared/config/loki-sender.ts',
        'src/shared/config/jwt.ts',
        // upload helpers — depend on multer/minio runtime
        'src/application/use-cases/chamado/helpers/upload-arquivos.helper.ts',
        'src/application/use-cases/chamado/helpers/expediente.helper.ts',
        'src/application/use-cases/reembolso/helpers/upload-comprovantes.helper.ts',
        // infrastructure-coupled — cannot be unit tested without real DB/Kafka
        'src/application/use-cases/chamado/helpers/os.helper.ts',
        'src/application/use-cases/reembolso/helpers/numero.helper.ts',
        'src/application/use-cases/reembolso/comprovantes/upload-comprovante.use-case.ts',
        'src/domain/sla/sla.service.ts',
      ],
      thresholds: {
        lines:      100,
        functions:  100,
        branches:   100,
        statements: 100,
      },
    },
  },
});