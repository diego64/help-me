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

    include: ['src/__tests__/unit/**/*.test.ts'],
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
        'prisma/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        'src/app.ts',
        'src/consumers/**',
        'src/infrastructure/database/**',
        'src/infrastructure/messaging/**',
        'src/presentation/**',
        'src/server.ts',
      ],
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   80,
        statements: 80,
      },
    },
  },
});