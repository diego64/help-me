import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '.env.test'), override: true });

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
    name: 'e2e',
    globals: true,
    environment: 'node',

    globalSetup: [
      './__tests__/e2e/setup/global-setup.ts'
    ],

    setupFiles: [
      './__tests__/e2e/setup/test.environment.ts'
    ],

    include: [
      '__tests__/e2e/**/*.e2e.test.ts'
    ],

    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '__tests__/unit/**',
      '__tests__/performance/**',
    ],

    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,

    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/e2e',
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        'src/server.ts',
        'src/@types/**',
        'prisma/**',
      ],
    },
    
    reporters: process.env.CI 
      ? ['default', 'github-actions']
      : ['verbose'],
    
    logHeapUsage: true,
    
    retry: process.env.CI ? 2 : 0,
  },
});