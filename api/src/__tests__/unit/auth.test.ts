import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../../shared/config/logger', () => ({
  logger: mockLogger,
}));

const mockRedisClient = {
  isOpen: false,
  isReady: false,
  connect: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  incr: vi.fn(),
  incrBy: vi.fn(),
  decr: vi.fn(),
  decrBy: vi.fn(),
  flushDb: vi.fn(),
  ping: vi.fn(),
};

let reconnectStrategy: (retries: number) => number | Error;

vi.mock('redis', () => ({
  createClient: vi.fn((config: any) => {
    if (config?.socket?.reconnectStrategy) {
      reconnectStrategy = config.socket.reconnectStrategy;
    }
    return mockRedisClient;
  }),
}));

let redisModule: any;

beforeEach(() => {
  Object.values(mockLogger).forEach(fn => fn.mockClear());
  Object.values(mockRedisClient).forEach(fn => {
    if (typeof fn === 'function' && 'mockClear' in fn) {
      fn.mockClear();
    }
  });
  
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.REDIS_DB = '0';
  delete process.env.REDIS_PASSWORD;
  
  mockRedisClient.isOpen = false;
  mockRedisClient.isReady = false;
  mockRedisClient.connect.mockResolvedValue(undefined);
  mockRedisClient.quit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Redis Client - Configuração', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('deve criar cliente com configuração padrão', async () => {
    const { createClient } = await import('redis');
    await import('../../infrastructure/database/redis/client');

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'redis://localhost:6379/0',
        socket: expect.objectContaining({
          connectTimeout: 5000,
        }),
        commandsQueueMaxLength: 1000,
        disableOfflineQueue: false,
      })
    );
  });

  it('deve criar cliente com senha quando REDIS_PASSWORD estiver definido', async () => {
    process.env.REDIS_PASSWORD = 'secret123';
    vi.resetModules();

    const { createClient } = await import('redis');
    await import('../../infrastructure/database/redis/client');

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'redis://:secret123@localhost:6379/0',
      })
    );
  });

  it('deve usar host customizado', async () => {
    process.env.REDIS_HOST = 'redis.example.com';
    vi.resetModules();

    const { createClient } = await import('redis');
    await import('../../infrastructure/database/redis/client');

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'redis://redis.example.com:6379/0',
      })
    );
  });

  it('deve usar porta customizada', async () => {
    process.env.REDIS_PORT = '6380';
    vi.resetModules();

    const { createClient } = await import('redis');
    await import('../../infrastructure/database/redis/client');

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'redis://localhost:6380/0',
      })
    );
  });

  it('deve usar database customizado', async () => {
    process.env.REDIS_DB = '5';
    vi.resetModules();

    const { createClient } = await import('redis');
    await import('../../infrastructure/database/redis/client');

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'redis://localhost:6379/5',
      })
    );
  });

  it('deve configurar estratégia de reconexão', async () => {
    const { createClient } = await import('redis');
    await import('../../infrastructure/database/redis/client');

    const callArgs = (createClient as any).mock.calls[0][0];
    expect(callArgs.socket.reconnectStrategy).toBeDefined();
    expect(typeof callArgs.socket.reconnectStrategy).toBe('function');
  });
});

describe('Redis Client - Estratégia de Reconexão', () => {
  beforeEach(async () => {
    vi.resetModules();
    await import('../../infrastructure/database/redis/client');
  });

  it('deve retornar delay exponencial para tentativas válidas', () => {
    expect(reconnectStrategy(1)).toBe(1000);
    expect(reconnectStrategy(2)).toBe(2000);
    expect(reconnectStrategy(3)).toBe(4000);
    expect(reconnectStrategy(4)).toBe(8000);
  });

  it('deve limitar delay máximo a 30 segundos', () => {
    const delay = reconnectStrategy(5);
    
    if (typeof delay === 'number') {
      expect(delay).toBeLessThanOrEqual(30000);
    }
  });

  it('deve retornar erro após exceder tentativas máximas', () => {
    const result = reconnectStrategy(6);
    
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('Máximo de tentativas');
  });

  it('deve calcular delay corretamente para múltiplas tentativas', () => {
    // Tentativa 1: 1000ms
    // Tentativa 2: 2000ms  
    // Tentativa 3: 4000ms
    // Tentativa 4: 8000ms
    // Tentativa 5: 16000ms (< 30000, OK)
    
    const delays = [1, 2, 3, 4, 5].map(n => reconnectStrategy(n));
    
    expect(delays.every(d => typeof d === 'number')).toBe(true);
    expect(delays.every(d => typeof d === 'number' && d <= 30000)).toBe(true);
  });

  it('deve retornar Error para tentativa maior que máximo', () => {
    const results = [6, 7, 8, 10].map(n => reconnectStrategy(n));
    
    expect(results.every(r => r instanceof Error)).toBe(true);
  });
});

describe('Redis Client - Event Listeners', () => {
  it('deve registrar listeners para todos os eventos necessários', async () => {
    vi.resetModules();
    const eventHandlers = new Map<string, Function>();
    
    mockRedisClient.on.mockImplementation((event: string, handler: Function) => {
      eventHandlers.set(event, handler);
      return mockRedisClient;
    });

    await import('../../infrastructure/database/redis/client');

    expect(eventHandlers.has('error')).toBe(true);
    expect(eventHandlers.has('connect')).toBe(true);
    expect(eventHandlers.has('ready')).toBe(true);
    expect(eventHandlers.has('reconnecting')).toBe(true);
    expect(eventHandlers.has('end')).toBe(true);
  });
});

describe('Redis Client - Conexão Inicial', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('deve tentar conectar se cliente não estiver aberto', async () => {
    mockRedisClient.isOpen = false;
    
    await import('../../infrastructure/database/redis/client');

    expect(mockRedisClient.connect).toHaveBeenCalled();
  });

  it('não deve conectar se cliente já estiver aberto', async () => {
    mockRedisClient.isOpen = true;

    await import('../../infrastructure/database/redis/client');

    expect(mockRedisClient.connect).not.toHaveBeenCalled();
  });

  it('deve tratar erro de conexão sem lançar exceção', async () => {
    mockRedisClient.isOpen = false;
    mockRedisClient.connect.mockRejectedValue(new Error('Connection refused'));

    // Não deve lançar erro
    await expect(
      import('../../infrastructure/database/redis/client')
    ).resolves.toBeDefined();
  });
});

describe('isRedisConnected', () => {
  beforeEach(async () => {
    vi.resetModules();
    redisModule = await import('../../infrastructure/database/redis/client');
  });

  it('deve retornar true quando Redis estiver conectado e pronto', () => {
    mockRedisClient.isOpen = true;
    mockRedisClient.isReady = true;

    expect(redisModule.isRedisConnected()).toBe(true);
  });

  it('deve retornar false quando Redis não estiver aberto', () => {
    mockRedisClient.isOpen = false;
    mockRedisClient.isReady = true;

    expect(redisModule.isRedisConnected()).toBe(false);
  });

  it('deve retornar false quando Redis não estiver pronto', () => {
    mockRedisClient.isOpen = true;
    mockRedisClient.isReady = false;

    expect(redisModule.isRedisConnected()).toBe(false);
  });

  it('deve retornar false quando Redis não estiver aberto nem pronto', () => {
    mockRedisClient.isOpen = false;
    mockRedisClient.isReady = false;

    expect(redisModule.isRedisConnected()).toBe(false);
  });
});

describe('waitForRedis', () => {
  beforeEach(async () => {
    vi.resetModules();
    redisModule = await import('../../infrastructure/database/redis/client');
  });

  it('deve retornar true quando Redis estiver conectado imediatamente', async () => {
    mockRedisClient.isOpen = true;
    mockRedisClient.isReady = true;

    const result = await redisModule.waitForRedis(1000);
    expect(result).toBe(true);
  });

  it('deve retornar true quando Redis conectar dentro do timeout', async () => {
    mockRedisClient.isOpen = false;
    mockRedisClient.isReady = false;

    setTimeout(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    }, 200);

    const result = await redisModule.waitForRedis(1000);
    expect(result).toBe(true);
  });

  it('deve retornar false quando timeout expirar', async () => {
    mockRedisClient.isOpen = false;
    mockRedisClient.isReady = false;

    const result = await redisModule.waitForRedis(100);
    expect(result).toBe(false);
  });

  it('deve usar timeout padrão de 10000ms', async () => {
    mockRedisClient.isOpen = false;
    mockRedisClient.isReady = false;

    const startTime = Date.now();
    const resultPromise = redisModule.waitForRedis();
    
    setTimeout(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    }, 100);

    await resultPromise;
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(elapsed).toBeLessThan(10000);
  });
});

describe('cacheSet', () => {
  beforeEach(async () => {
    vi.resetModules();
    redisModule = await import('../../infrastructure/database/redis/client');
    mockRedisClient.isOpen = true;
    mockRedisClient.isReady = true;
  });

  it('deve salvar string com TTL padrão', async () => {
    mockRedisClient.set.mockResolvedValue('OK');

    await redisModule.cacheSet('key1', 'value1');

    expect(mockRedisClient.set).toHaveBeenCalledWith('key1', 'value1', { EX: 3600 });
  });

  it('deve salvar string com TTL customizado', async () => {
    mockRedisClient.set.mockResolvedValue('OK');

    await redisModule.cacheSet('key1', 'value1', 7200);

    expect(mockRedisClient.set).toHaveBeenCalledWith('key1', 'value1', { EX: 7200 });
  });

  it('deve serializar objeto para JSON', async () => {
    mockRedisClient.set.mockResolvedValue('OK');
    const obj = { name: 'John', age: 30 };

    await redisModule.cacheSet('user:1', obj);

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'user:1',
      JSON.stringify(obj),
      { EX: 3600 }
    );
  });

  it('não deve executar quando Redis não estiver conectado', async () => {
    mockRedisClient.isOpen = false;

    await redisModule.cacheSet('key1', 'value1');

    expect(mockRedisClient.set).not.toHaveBeenCalled();
  });

  it('deve tratar erro silenciosamente quando operação falhar', async () => {
    mockRedisClient.set.mockRejectedValue(new Error('SET failed'));

    // Não deve lançar erro
    await expect(
      redisModule.cacheSet('key1', 'value1')
    ).resolves.toBeUndefined();
  });
});

describe('cacheGet', () => {
  beforeEach(async () => {
    vi.resetModules();
    redisModule = await import('../../infrastructure/database/redis/client');
    mockRedisClient.isOpen = true;
    mockRedisClient.isReady = true;
  });

  it('deve retornar valor quando chave existir', async () => {
    mockRedisClient.get.mockResolvedValue('cached-value');

    const result = await redisModule.cacheGet('key1');

    expect(result).toBe('cached-value');
    expect(mockRedisClient.get).toHaveBeenCalledWith('key1');
  });

  it('deve retornar null quando chave não existir', async () => {
    mockRedisClient.get.mockResolvedValue(null);

    const result = await redisModule.cacheGet('key-inexistente');

    expect(result).toBeNull();
  });

  it('deve retornar null quando Redis não estiver conectado', async () => {
    mockRedisClient.isOpen = false;

    const result = await redisModule.cacheGet('key1');

    expect(result).toBeNull();
  });

  it('deve retornar null quando operação falhar', async () => {
    mockRedisClient.get.mockRejectedValue(new Error('GET failed'));

    const result = await redisModule.cacheGet('key1');

    expect(result).toBeNull();
  });
});