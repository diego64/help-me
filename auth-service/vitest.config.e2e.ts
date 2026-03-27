import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@application': resolve(__dirname, 'src/application'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
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
      './src/__tests__/e2e/setup/global-setup.ts'
    ],

    setupFiles: [
      './src/__tests__/e2e/setup/test.environment.ts'
    ],

    include: [
      'src/__tests__/e2e/**/*.e2e.test.ts'
    ],
    
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'src/__tests__/unit/**',
      'src/__tests__/performance/**',
    ],

    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,
    
    // @ts-expect-error - Vitest não tem tipagem para poolOptions
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },

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