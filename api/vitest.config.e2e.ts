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
    name: 'e2e',
    globals: true,
    environment: 'node',
    
    // Setup global antes de TODOS os testes E2E
    globalSetup: [
      './src/__tests__/e2e/setup/global-setup.ts'
    ],
    
    // Setup executado antes de cada arquivo de teste
    setupFiles: [
      './src/__tests__/e2e/setup/test.environment.ts'
    ],
    
    // Incluir apenas testes E2E
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
    
    // Configurações de execução
    fileParallelism: false, // Evita conflitos de banco de dados
    testTimeout: 60000, // 60s - testes E2E podem ser mais lentos
    hookTimeout: 60000, // 60s para beforeAll/afterAll
    teardownTimeout: 60000, // 60s para cleanup
    
    // Executar sequencialmente para evitar race conditions
    // @ts-expect-error - Vitest não tem tipagem para poolOptions
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    
    // Coverage específica para E2E (opcional)
    coverage: {
      enabled: false, // Desabilitar por padrão em E2E
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
    
    // Reporters
    reporters: process.env.CI 
      ? ['default', 'github-actions']
      : ['verbose'],
    
    // Logs
    logHeapUsage: true,
    
    // Retry em caso de falha (útil para testes E2E instáveis)
    retry: process.env.CI ? 2 : 0,
  },
});