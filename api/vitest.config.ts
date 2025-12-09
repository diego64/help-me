import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      ...config({ path: '.env.test' }).parsed,
    },
    include: [
      'src/__tests__/e2e/**/*.test.ts',
      'src/__tests__/teste-de-carga/**/*.test.ts',
      'src/__tests__/unit/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
    ],
    fileParallelism: false,
    testTimeout: 30000,
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
        'src/server.ts',
        'src/config/mongo.ts',
        'src/consumers/**',
        'src/events/**',
        'src/routes/envio-email-teste.routes.ts',
        'src/@types/**',
        'prisma/**',
      ],
      
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});