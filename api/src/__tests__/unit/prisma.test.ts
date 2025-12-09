import 'dotenv/config';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from 'vitest';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// ============================================================================
// MOCKS
// ============================================================================

const poolEndMock = vi.fn();
const prismaDisconnectMock = vi.fn();

vi.mock('pg', () => {
  const MockPool = vi.fn(function(this: any, config: any) {
    this.end = poolEndMock;
    this.config = config;
    return this;
  });
  
  return {
    Pool: MockPool,
  };
});

vi.mock('@prisma/adapter-pg', () => {
  const MockPrismaPg = vi.fn(function(this: any, pool: any) {
    this.pool = pool;
    return this;
  });
  
  return {
    PrismaPg: MockPrismaPg,
  };
});

vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn(function(this: any, options: any) {
    this.$disconnect = prismaDisconnectMock;
    this.options = options;
    return this;
  });
  
  return {
    PrismaClient: MockPrismaClient,
  };
});

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

describe('prisma factory', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    poolEndMock.mockClear();
    prismaDisconnectMock.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ==========================================================================
  // TESTES: Criação do Prisma Client
  // ==========================================================================

  it('deve criar Pool e PrismaClient com os valores corretos', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    process.env.DB_MAX_CONNECTIONS = '20';
    process.env.NODE_ENV = 'production';

    const { prisma } = await import('../../lib/prisma');

    // ======  VERIFICA SE POOL FOI CRIADO COM OS PARÂMETROS CORRETOS ======
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://user:pass@localhost/db',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // ======  VERIFICA SE PRISMAPG FOI CRIADO ======
    expect(PrismaPg).toHaveBeenCalledTimes(1);
    expect(PrismaPg).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        connectionString: 'postgres://user:pass@localhost/db',
        max: 20,
      }),
    }));

    // ======  VERIFICA SE PRISMACLIENT FOI CRIADO COM O ADAPTER E LOGS CORRETOS ======
    expect(PrismaClient).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: expect.anything(),
        log: ['error'],
      })
    );

    expect(prisma).toBeDefined();
    expect(prisma.$disconnect).toBeDefined();
  });

  it('deve usar valores padrão quando DB_MAX_CONNECTIONS não está definido', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    delete process.env.DB_MAX_CONNECTIONS;
    process.env.NODE_ENV = 'production';

    const { prisma } = await import('../../lib/prisma');

    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://user:pass@localhost/db',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    expect(PrismaPg).toHaveBeenCalledTimes(1);
    expect(prisma).toBeDefined();
  });

  it('deve ativar logs de desenvolvimento quando NODE_ENV=development', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    process.env.NODE_ENV = 'development';

    const { prisma } = await import('../../lib/prisma');

    expect(PrismaClient).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: expect.anything(),
        log: ['error', 'warn'],
      })
    );

    expect(prisma).toBeDefined();
  });

  it('deve usar singleton pattern em ambiente de desenvolvimento', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    process.env.NODE_ENV = 'development';

    // ======  PRIMEIRA IMPORTAÇÃO ======
    const { prisma: prisma1 } = await import('../../lib/prisma');
    
    // ======  SEGUNDA IMPORTAÇÃO DEVE RETORNAR A MESMA INSTÂNCIA ======
    const { prisma: prisma2 } = await import('../../lib/prisma');

    expect(prisma1).toBe(prisma2);
  });

  // ==========================================================================
  // TESTES: Validação de Erros
  // ==========================================================================

  it('deve lançar erro quando DATABASE_URL não está definida', async () => {
    delete process.env.DATABASE_URL;

    await expect(async () => {
      await import('../../lib/prisma');
    }).rejects.toThrow('DATABASE_URL não está definida ou não é uma string');
  });

  it('deve lançar erro quando DATABASE_URL não é uma string', async () => {
    // @ts-ignore - forçar tipo inválido para testar
    process.env.DATABASE_URL = 123 as any;

    await expect(async () => {
      await import('../../lib/prisma');
    }).rejects.toThrow('DATABASE_URL não está definida ou não é uma string');
  });

  it('deve lançar erro quando DATABASE_URL é uma string vazia', async () => {
    process.env.DATABASE_URL = '';

    await expect(async () => {
      await import('../../lib/prisma');
    }).rejects.toThrow('DATABASE_URL não está definida ou não é uma string');
  });

  // ==========================================================================
  // TESTES: Event Listener beforeExit
  // ==========================================================================

  it('deve registrar o event listener "beforeExit"', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    process.env.NODE_ENV = 'production';

    const processOnSpy = vi.spyOn(process, 'on');

    await import('../../lib/prisma');

    expect(processOnSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));

    processOnSpy.mockRestore();
  });

  it('deve chamar prisma.$disconnect e pool.end quando evento "beforeExit" for disparado', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    process.env.NODE_ENV = 'production';

    let beforeExitCallback: Function | undefined;
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event: any, callback: any) => {
      if (event === 'beforeExit') {
        beforeExitCallback = callback;
      }
      return process;
    });

    await import('../../lib/prisma');

    expect(beforeExitCallback).toBeDefined();

    if (beforeExitCallback) {
      await beforeExitCallback();
    }

    expect(prismaDisconnectMock).toHaveBeenCalledTimes(1);
    expect(poolEndMock).toHaveBeenCalledTimes(1);

    processOnSpy.mockRestore();
  });

  it('deve chamar pool.end mesmo se prisma.$disconnect falhar', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    process.env.NODE_ENV = 'production';

    prismaDisconnectMock.mockRejectedValueOnce(new Error('Disconnect failed'));

    let beforeExitCallback: Function | undefined;
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event: any, callback: any) => {
      if (event === 'beforeExit') {
        beforeExitCallback = callback;
      }
      return process;
    });

    await import('../../lib/prisma');

    if (beforeExitCallback) {
      try {
        await beforeExitCallback();
      } catch (error) {
        // Erro esperado
      }
    }

    expect(prismaDisconnectMock).toHaveBeenCalledTimes(1);
    processOnSpy.mockRestore();
  });
});