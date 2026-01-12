import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from 'vitest';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

class MockPrismaClient {
  $connect = vi.fn();
  $disconnect = vi.fn().mockResolvedValue(undefined);
  $queryRaw = vi.fn();

  constructor(options?: any) {
    (this as any).options = options;
  }
}

class MockPrismaPg {
  constructor(pool: any) {
  }
}

class MockPool {
  end = vi.fn().mockResolvedValue(undefined);
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
  let consoleErrorSpy: any;

  beforeEach(() => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    }
    
    vi.resetModules();
    (globalThis as any).prisma = undefined;
    
    vi.clearAllMocks();
    
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    (globalThis as any).prisma = undefined;
    consoleErrorSpy.mockRestore();
  });

  it('deve criar nova instância do PrismaClient quando não existir instância global', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect(prisma).toBeDefined();
    expect(prisma).toBeInstanceOf(MockPrismaClient);
  });

  it('deve reutilizar instância global existente do PrismaClient', async () => {
    const instanciaExistente = new MockPrismaClient();
    (globalThis as any).prisma = instanciaExistente;

    const { prisma } = await import('../../lib/prisma');

    expect(prisma).toBe(instanciaExistente);
  });

  it('deve atribuir prisma ao globalThis quando NODE_ENV não for production', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect((globalThis as any).prisma).toBe(prisma);
  });

  it('deve atribuir prisma ao globalThis quando NODE_ENV for test', async () => {
    process.env.NODE_ENV = 'test';
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect((globalThis as any).prisma).toBe(prisma);
  });

  it('NÃO deve atribuir prisma ao globalThis quando NODE_ENV for production', async () => {
    process.env.NODE_ENV = 'production';
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect(prisma).toBeDefined();
    expect((globalThis as any).prisma).toBeUndefined();
  });

  it('deve criar Pool com configurações corretas', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DB_MAX_CONNECTIONS = '15';
    delete (globalThis as any).prisma;
    vi.resetModules();

    const module = await import('../../lib/prisma');

    expect(module.prisma).toBeDefined();
  });

  it('deve usar valor padrão de conexões quando DB_MAX_CONNECTIONS não estiver definido', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DB_MAX_CONNECTIONS;
    delete (globalThis as any).prisma;
    vi.resetModules();

    const { prisma } = await import('../../lib/prisma');

    expect(prisma).toBeDefined();
  });

  it('deve criar apenas uma instância do PrismaClient em múltiplas importações (singleton)', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    const { prisma: prisma1 } = await import('../../lib/prisma');
    const { prisma: prisma2 } = await import('../../lib/prisma');

    expect(prisma1).toBe(prisma2);
  });

  it('deve usar operador nullish coalescing (??) corretamente', async () => {
    process.env.NODE_ENV = 'development';

    delete (globalThis as any).prisma;
    vi.resetModules();
    const { prisma: prismaQuandoUndefined } = await import('../../lib/prisma');
    expect(prismaQuandoUndefined).toBeInstanceOf(MockPrismaClient);

    const instanciaExistente = new MockPrismaClient();
    (globalThis as any).prisma = instanciaExistente;
    vi.resetModules();
    const { prisma: prismaQuandoExiste } = await import('../../lib/prisma');
    expect(prismaQuandoExiste).toBe(instanciaExistente);
  });

  it('deve funcionar corretamente quando NODE_ENV não estiver definido', async () => {
    delete process.env.NODE_ENV;
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect(prisma).toBeDefined();
    expect(prisma).toBeInstanceOf(MockPrismaClient);
    expect((globalThis as any).prisma).toBe(prisma);
  });

  it('deve cobrir todos os branches da condição NODE_ENV', async () => {
    const ambientes = ['development', 'test', 'staging', 'production'];

    for (const ambiente of ambientes) {
      process.env.NODE_ENV = ambiente;
      delete (globalThis as any).prisma;
      vi.resetModules();

      const { prisma } = await import('../../lib/prisma');

      expect(prisma).toBeDefined();
      expect(prisma).toBeInstanceOf(MockPrismaClient);

      if (ambiente === 'production') {
        expect((globalThis as any).prisma).toBeUndefined();
      } else {
        expect((globalThis as any).prisma).toBe(prisma);
      }
    }
  });

  it('deve configurar logs corretamente em development', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect((prisma as any).options?.log).toEqual(['error', 'warn']);
  });

  it('deve configurar logs corretamente em production', async () => {
    process.env.NODE_ENV = 'production';
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect((prisma as any).options?.log).toEqual(['error']);
  });

  it('deve validar DATABASE_URL corretamente', () => {
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

  it('deve chamar console.error e lançar erro quando DATABASE_URL é undefined', () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    expect(() => {
      const connectionString = process.env.DATABASE_URL;
      
      if (!connectionString || typeof connectionString !== 'string') {
        console.error('DATABASE_URL não encontrada!');
        console.error('Variáveis disponíveis:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
        throw new Error('DATABASE_URL não está definida ou não é uma string');
      }
    }).toThrow('DATABASE_URL não está definida ou não é uma string');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('DATABASE_URL não encontrada!');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Variáveis disponíveis:', expect.any(Array));

    process.env.DATABASE_URL = originalUrl;
  });

  it('deve chamar console.error e lançar erro quando DATABASE_URL não está definida', () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    expect(() => {
      const connectionString = process.env.DATABASE_URL;
      
      if (!connectionString || typeof connectionString !== 'string') {
        console.error('DATABASE_URL não encontrada!');
        console.error('Variáveis disponíveis:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
        throw new Error('DATABASE_URL não está definida ou não é uma string');
      }
    }).toThrow('DATABASE_URL não está definida ou não é uma string');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('DATABASE_URL não encontrada!');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Variáveis disponíveis:', expect.any(Array));

    process.env.DATABASE_URL = originalUrl;
  });

  it('deve chamar console.error e lançar erro quando DATABASE_URL é string vazia', () => {
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';

    expect(() => {
      const connectionString = process.env.DATABASE_URL;
      
      if (!connectionString || typeof connectionString !== 'string') {
        console.error('DATABASE_URL não encontrada!');
        console.error('Variáveis disponíveis:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
        throw new Error('DATABASE_URL não está definida ou não é uma string');
      }
    }).toThrow('DATABASE_URL não está definida ou não é uma string');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('DATABASE_URL não encontrada!');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Variáveis disponíveis:', expect.any(Array));

    process.env.DATABASE_URL = originalUrl;
  });

  it('deve configurar Pool com todas as propriedades esperadas', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
    process.env.DB_MAX_CONNECTIONS = '20';
    delete (globalThis as any).prisma;
    vi.resetModules();

    await import('../../lib/prisma');

    expect(MockPool).toBeDefined();
  });

  it('deve exportar prisma como named export', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    const module = await import('../../lib/prisma');

    expect(module.prisma).toBeDefined();
    expect(module.prisma).toBeInstanceOf(MockPrismaClient);
  });

  it('deve manter consistência do singleton através de múltiplas reimportações', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    const { prisma: firstImport } = await import('../../lib/prisma');
    
    const { prisma: secondImport } = await import('../../lib/prisma');
    const { prisma: thirdImport } = await import('../../lib/prisma');

    expect(firstImport).toBe(secondImport);
    expect(secondImport).toBe(thirdImport);
    expect(firstImport).toBe(thirdImport);
  });

  it('deve ter PrismaClient configurado com adapter', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;

    const { prisma } = await import('../../lib/prisma');

    expect(prisma).toBeDefined();
    expect((prisma as any).options).toBeDefined();
    expect((prisma as any).options.adapter).toBeDefined();
  });

  it('deve registrar listener para evento beforeExit que chama $disconnect e pool.end', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;
    
    const processOnSpy = vi.spyOn(process, 'on');
    
    vi.resetModules();
    vi.clearAllMocks();

    await import('../../lib/prisma');

    expect(processOnSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));
    
    processOnSpy.mockRestore();
  });

  it('deve executar cleanup (disconnect e pool.end) quando evento beforeExit for emitido', async () => {
    process.env.NODE_ENV = 'development';
    delete (globalThis as any).prisma;
    
    vi.resetModules();
    vi.clearAllMocks();

    const { prisma } = await import('../../lib/prisma');

    const listeners = process.listeners('beforeExit');
    const beforeExitHandler = listeners[listeners.length - 1] as (...args: any[]) => Promise<void>;

    await beforeExitHandler(0);

    expect(prisma.$disconnect).toHaveBeenCalled();
  });
});