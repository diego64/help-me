import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    exclude: ['dist', 'build', 'node_modules'],
     fileParallelism: false,
    testTimeout: 30000,
  },
} as any);