import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'src/routes/envio-email-teste.routes.ts',
        'dist',
        'build',
        'node_modules',
      ],
    },
    exclude: [
      'dist',
      'build',
      'node_modules',
      'src/routes/envio-email-teste.routes.ts'
    ],
    fileParallelism: false,
    testTimeout: 30000,
  },
} as any);