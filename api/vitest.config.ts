import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      ...config({ path: '.env.test' }).parsed,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/routes/envio-email-teste.routes.ts',
        'dist',
        'build',
        'node_modules',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    exclude: [
      'dist',
      'build',
      'node_modules',
      'src/routes/envio-email-teste.routes.ts',
    ],

    fileParallelism: false,
    testTimeout: 30000,

    include: [
    'src/__tests__/e2e/**/*.test.ts',
    'src/__tests__/teste-de-carga/**/*.test.ts',
    'src/__tests__/unit/**/*.test.ts',
    ],
  },
});
