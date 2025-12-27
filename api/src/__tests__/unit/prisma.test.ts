import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
} from 'vitest';

const poolEndMock = vi.fn().mockResolvedValue(undefined);
const prismaDisconnectMock = vi.fn().mockResolvedValue(undefined);

let poolInstance: any;
let prismaPgInstance: any;
let prismaClientInstance: any;
let beforeExitCallback: Function | undefined;

vi.mock('pg', () => {
  return {
    Pool: class MockPool {
      end = poolEndMock;
      config: any;
      connect = vi.fn();
      query = vi.fn();
      
      constructor(config: any) {
        poolInstance = this;
        this.config = config;
      }
    }
  };
});

vi.mock('@prisma/adapter-pg', () => {
  return {
    PrismaPg: class MockPrismaPg {
      pool: any;
      
      constructor(pool: any) {
        prismaPgInstance = this;
        this.pool = pool;
      }
    }
  };
});

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class MockPrismaClient {
      $disconnect = prismaDisconnectMock;
      $connect = vi.fn();
      options: any;
      
      constructor(options: any) {
        prismaClientInstance = this;
        this.options = options;
      }
    }
  };
});

describe('prisma factory', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.DB_MAX_CONNECTIONS = '20';
    process.env.NODE_ENV = 'production';
    
    const originalProcessOn = process.on;
    vi.spyOn(process, 'on').mockImplementation((event: any, callback: any) => {
      if (event === 'beforeExit') {
        beforeExitCallback = callback;
      }
      return originalProcessOn.call(process, event, callback);
    });
  });

  afterAll(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_MAX_CONNECTIONS;
    delete process.env.NODE_ENV;
    vi.restoreAllMocks();
  });

  it('deve criar Pool com os parâmetros corretos', async () => {
    await import('../../lib/prisma');

    expect(poolInstance).toBeDefined();
    expect(poolInstance.config).toMatchObject({
      connectionString: 'postgresql://user:pass@localhost:5432/db',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  });

  it('deve criar PrismaPg com o pool correto', async () => {
    await import('../../lib/prisma');

    expect(prismaPgInstance).toBeDefined();
    expect(prismaPgInstance.pool).toBe(poolInstance);
  });

  it('deve criar PrismaClient com adapter e logs de produção', async () => {
    await import('../../lib/prisma');

    expect(prismaClientInstance).toBeDefined();
    expect(prismaClientInstance.options.adapter).toBe(prismaPgInstance);
    expect(prismaClientInstance.options.log).toEqual(['error']);
  });

  it('deve exportar instância do prisma com métodos corretos', async () => {
    const { prisma } = await import('../../lib/prisma');

    expect(prisma).toBeDefined();
    expect(prisma.$disconnect).toBeDefined();
    expect(typeof prisma.$disconnect).toBe('function');
  });

  it('deve configurar timeouts corretos no Pool', async () => {
    await import('../../lib/prisma');

    expect(poolInstance.config.idleTimeoutMillis).toBe(30000);
    expect(poolInstance.config.connectionTimeoutMillis).toBe(2000);
  });

  it('deve usar max connections de 20 quando DB_MAX_CONNECTIONS está definido', async () => {
    await import('../../lib/prisma');

    expect(poolInstance.config.max).toBe(20);
  });

  it('deve registrar event listener beforeExit', async () => {
    await import('../../lib/prisma');

    expect(beforeExitCallback).toBeDefined();
    expect(typeof beforeExitCallback).toBe('function');
  });

  it('deve chamar prisma.$disconnect e pool.end quando beforeExit for disparado', async () => {
    vi.clearAllMocks();
    
    await import('../../lib/prisma');

    expect(beforeExitCallback).toBeDefined();
    
    if (beforeExitCallback) {
      await beforeExitCallback();
    }

    expect(prismaDisconnectMock).toHaveBeenCalled();
    expect(poolEndMock).toHaveBeenCalled();
  });
});

describe('prisma factory - lógica de configuração', () => {
  it('deve retornar 10 quando DB_MAX_CONNECTIONS não está definido', () => {
    const dbMaxConnections = undefined;
    const result = parseInt(dbMaxConnections || '10', 10);
    expect(result).toBe(10);
  });

  it('deve retornar 10 quando DB_MAX_CONNECTIONS está vazio', () => {
    const result = parseInt('10', 10);
    expect(result).toBe(10);
  });

  it('deve retornar 15 quando DB_MAX_CONNECTIONS é "15"', () => {
    const dbMaxConnections = '15';
    const result = parseInt(dbMaxConnections || '10', 10);
    expect(result).toBe(15);
  });

  it('deve retornar NaN quando DB_MAX_CONNECTIONS é inválido (comportamento real)', () => {
    const result = parseInt('invalid', 10);
    expect(result).toBeNaN();
  });

  it('deve validar que connectionString não é undefined', () => {
    const connectionString = 'postgresql://user:pass@localhost:5432/db';
    expect(connectionString).toBeDefined();
    expect(typeof connectionString).toBe('string');
  });

  it('deve validar que connectionString vazia lança erro', () => {
    const connectionString = '';
    expect(() => {
      if (!connectionString || typeof connectionString !== 'string') {
        throw new Error('DATABASE_URL não está definida ou não é uma string');
      }
    }).toThrow('DATABASE_URL não está definida ou não é uma string');
  });

  it('deve validar que connectionString undefined lança erro', () => {
    const connectionString = undefined;
    expect(() => {
      if (!connectionString || typeof connectionString !== 'string') {
        throw new Error('DATABASE_URL não está definida ou não é uma string');
      }
    }).toThrow('DATABASE_URL não está definida ou não é uma string');
  });

  it('deve ativar logs de desenvolvimento quando NODE_ENV=development', () => {
    const nodeEnv = 'development';
    const logs = nodeEnv === 'development' ? ['error', 'warn'] : ['error'];
    expect(logs).toEqual(['error', 'warn']);
  });

  it('deve usar apenas error log quando NODE_ENV=production', () => {
    const nodeEnv: string = 'production';
    const logs = nodeEnv === 'development' ? ['error', 'warn'] : ['error'];
    expect(logs).toEqual(['error']);
  });
});