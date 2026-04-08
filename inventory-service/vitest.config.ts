import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@application': resolve(__dirname, 'src/application'),
      '@domain': resolve(__dirname, 'src/domain'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@messaging': resolve(__dirname, 'src/infrastructure/messaging'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@templates': resolve(__dirname, 'src/templates'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],

    include: ['__tests__/unit/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '__tests__/e2e/**',
      '__tests__/performance/**',
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