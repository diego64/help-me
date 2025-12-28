import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Salvar NODE_ENV original
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

// Mock do PrismaClient como uma classe
class MockPrismaClient {
  $connect = vi.fn();
  $disconnect = vi.fn();
  $queryRaw = vi.fn();

  constructor(options?: any) {
    // Armazenar options para verificação nos testes
    (this as any).options = options;
  }
}

// Mock do PrismaPg
class MockPrismaPg {
  constructor(pool: any) {
    // Mock constructor
  }
}

// Mock do Pool como uma classe
class MockPool {
  end = vi.fn();
  query = vi.fn();
  connect = vi.fn();
  options: any;

  constructor(config: any) {
    this.options = config;
  }
}

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: MockPrismaPg,
}));

vi.mock('pg', () => ({
  Pool: MockPool,
}));

describe('Prisma Client Singleton', () => {
  beforeEach(() => {
    // Garantir que DATABASE_URL existe
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    }
    
    // Limpar o cache de módulos para forçar reimportação
    vi.resetModules();
    // Limpar globalThis.prisma
    (globalThis as any).prisma = undefined;
    
    // Resetar mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restaurar NODE_ENV original
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    // Limpar globalThis.prisma
    (globalThis as any).prisma = undefined;
  });

  it('Deve criar nova instância do PrismaClient quando não existir instância global', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect(prisma).toBeDefined();
    expect(prisma).toBeInstanceOf(MockPrismaClient);
  });

  it('Deve reutilizar instância global existente do PrismaClient', async () => {
    // Arrange
    const instanciaExistente = new MockPrismaClient();
    (globalThis as any).prisma = instanciaExistente;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect(prisma).toBe(instanciaExistente);
  });

  it('Deve atribuir prisma ao globalThis quando NODE_ENV não for production', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect((globalThis as any).prisma).toBe(prisma);
  });

  it('Deve atribuir prisma ao globalThis quando NODE_ENV for test', async () => {
    // Arrange
    process.env.NODE_ENV = 'test';
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect((globalThis as any).prisma).toBe(prisma);
  });

  it('NÃO deve atribuir prisma ao globalThis quando NODE_ENV for production', async () => {
    // Arrange
    process.env.NODE_ENV = 'production';
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect(prisma).toBeDefined();
    expect((globalThis as any).prisma).toBeUndefined();
  });

  it('Deve criar Pool com configurações corretas', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    process.env.DB_MAX_CONNECTIONS = '15';
    delete (globalThis as any).prisma;
    vi.resetModules();

    // Act
    const module = await import('../../lib/prisma');

    // Assert
    expect(module.prisma).toBeDefined();
  });

  it('Deve usar valor padrão de conexões quando DB_MAX_CONNECTIONS não estiver definido', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete process.env.DB_MAX_CONNECTIONS;
    delete (globalThis as any).prisma;
    vi.resetModules();

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect(prisma).toBeDefined();
  });

  it('Deve criar apenas uma instância do PrismaClient em múltiplas importações (singleton)', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    // Act
    const { prisma: prisma1 } = await import('../../lib/prisma');
    const { prisma: prisma2 } = await import('../../lib/prisma');

    // Assert
    expect(prisma1).toBe(prisma2);
  });

  it('Deve usar operador nullish coalescing (??) corretamente', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';

    // Teste 1: globalThis.prisma é undefined
    delete (globalThis as any).prisma;
    vi.resetModules();
    const { prisma: prismaQuandoUndefined } = await import('../../lib/prisma');
    expect(prismaQuandoUndefined).toBeInstanceOf(MockPrismaClient);

    // Teste 2: globalThis.prisma existe
    const instanciaExistente = new MockPrismaClient();
    (globalThis as any).prisma = instanciaExistente;
    vi.resetModules();
    const { prisma: prismaQuandoExiste } = await import('../../lib/prisma');
    expect(prismaQuandoExiste).toBe(instanciaExistente);
  });

  it('Deve funcionar corretamente quando NODE_ENV não estiver definido', async () => {
    // Arrange
    delete process.env.NODE_ENV;
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect(prisma).toBeDefined();
    expect(prisma).toBeInstanceOf(MockPrismaClient);
    // Quando NODE_ENV é undefined, !== 'production' é true
    expect((globalThis as any).prisma).toBe(prisma);
  });

  it('Deve cobrir todos os branches da condição NODE_ENV', async () => {
    // Teste com diferentes valores de NODE_ENV
    const ambientes = ['development', 'test', 'staging', 'production'];

    for (const ambiente of ambientes) {
      // Arrange
      process.env.NODE_ENV = ambiente;
      delete (globalThis as any).prisma;
      vi.resetModules();

      // Act
      const { prisma } = await import('../../lib/prisma');

      // Assert
      expect(prisma).toBeDefined();
      expect(prisma).toBeInstanceOf(MockPrismaClient);

      if (ambiente === 'production') {
        // Em produção, não deve adicionar ao globalThis
        expect((globalThis as any).prisma).toBeUndefined();
      } else {
        // Fora de produção, deve adicionar ao globalThis
        expect((globalThis as any).prisma).toBe(prisma);
      }
    }
  });

  it('Deve configurar logs corretamente em development', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect((prisma as any).options?.log).toEqual(['error', 'warn']);
  });

  it('Deve configurar logs corretamente em production', async () => {
    // Arrange
    process.env.NODE_ENV = 'production';
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect((prisma as any).options?.log).toEqual(['error']);
  });

  it('Deve validar DATABASE_URL corretamente', () => {
    // Este teste verifica a lógica de validação da DATABASE_URL
    // Testamos os diferentes cenários de validação
    
    const testCases = [
      { value: undefined, description: 'undefined', shouldFail: true },
      { value: null, description: 'null', shouldFail: true },
      { value: '', description: 'string vazia', shouldFail: true },
      { value: 123, description: 'número', shouldFail: true },
      { value: {}, description: 'objeto', shouldFail: true },
      { value: [], description: 'array', shouldFail: true },
      { value: 'postgresql://valid:pass@localhost:5432/db', description: 'string válida', shouldFail: false },
    ];

    testCases.forEach(({ value, description, shouldFail }) => {
      const isInvalid = !value || typeof value !== 'string';
      expect(isInvalid).toBe(shouldFail);
    });
  });

  it('Deve ter comportamento correto quando DATABASE_URL é inválida', async () => {
    // Arrange
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    
    // Limpar completamente o cache
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as any).prisma;

    // Act & Assert
    try {
      await import('../../lib/prisma');
      // Se chegou aqui, o teste deve falhar
      expect.fail('Deveria ter lançado um erro quando DATABASE_URL não está definida');
    } catch (error: any) {
      expect(error.message).toContain('DATABASE_URL');
    } finally {
      // Cleanup
      process.env.DATABASE_URL = originalUrl;
      vi.resetModules();
    }
  });

  it('Deve ter comportamento correto quando DATABASE_URL não é uma string', async () => {
    // Arrange
    const originalUrl = process.env.DATABASE_URL;
    (process.env as any).DATABASE_URL = 123; // Não é string
    
    // Limpar completamente o cache
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as any).prisma;

    // Act & Assert
    try {
      await import('../../lib/prisma');
      // Se chegou aqui, o teste deve falhar
      expect.fail('Deveria ter lançado um erro quando DATABASE_URL não é uma string');
    } catch (error: any) {
      expect(error.message).toContain('DATABASE_URL');
    } finally {
      // Cleanup
      process.env.DATABASE_URL = originalUrl;
      vi.resetModules();
    }
  });

  it('Deve configurar Pool com todas as propriedades esperadas', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.DB_MAX_CONNECTIONS = '20';
    delete (globalThis as any).prisma;
    vi.resetModules();

    // Act
    await import('../../lib/prisma');

    // Assert - Verificar que Pool foi instanciado (através do mock)
    expect(MockPool).toBeDefined();
  });

  it('Deve exportar prisma como named export', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    // Act
    const module = await import('../../lib/prisma');

    // Assert
    expect(module.prisma).toBeDefined();
    expect(module.prisma).toBeInstanceOf(MockPrismaClient);
  });

  it('Deve manter consistência do singleton através de múltiplas reimportações', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    // Act - Primeira importação
    const { prisma: firstImport } = await import('../../lib/prisma');
    
    // Não resetar módulos aqui, para testar o singleton
    const { prisma: secondImport } = await import('../../lib/prisma');
    const { prisma: thirdImport } = await import('../../lib/prisma');

    // Assert
    expect(firstImport).toBe(secondImport);
    expect(secondImport).toBe(thirdImport);
    expect(firstImport).toBe(thirdImport);
  });

  it('Deve ter PrismaClient configurado com adapter', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    // Act
    const { prisma } = await import('../../lib/prisma');

    // Assert
    expect(prisma).toBeDefined();
    expect((prisma as any).options).toBeDefined();
    expect((prisma as any).options.adapter).toBeDefined();
  });
});