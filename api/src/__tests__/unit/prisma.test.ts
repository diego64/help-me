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

vi.mock('pg', () => {
  const MockPool = vi.fn(function(this: any, config: any) {
    this.end = vi.fn();
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
    this.$disconnect = vi.fn();
    this.options = options;
    return this;
  });
  
  return {
    PrismaClient: MockPrismaClient,
  };
});

describe('prisma factory', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

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

  it('deve lançar erro quando DATABASE_URL não está definida', async () => {
    delete process.env.DATABASE_URL;

    await expect(async () => {
      await import('../../lib/prisma');
    }).rejects.toThrow('DATABASE_URL não está definida ou não é uma string');
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
});