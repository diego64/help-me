import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from 'vitest';
import { createClient } from 'redis';

vi.mock('redis', () => ({
  createClient: vi.fn()
}));

describe('Redis Client', () => {
  let mockRedisClient: any;
  let connectCallback: any;
  let errorCallback: any;
  let readyCallback: any;
  let reconnectingCallback: any;
  let endCallback: any;

  beforeEach(() => {
    connectCallback = null;
    errorCallback = null;
    readyCallback = null;
    reconnectingCallback = null;
    endCallback = null;

    mockRedisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, callback: any) => {
        if (event === 'connect') {
          connectCallback = callback;
        } else if (event === 'error') {
          errorCallback = callback;
        } else if (event === 'ready') {
          readyCallback = callback;
        } else if (event === 'reconnecting') {
          reconnectingCallback = callback;
        } else if (event === 'end') {
          endCallback = callback;
        }
        return mockRedisClient;
      }),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(0),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(-1),
      incr: vi.fn().mockResolvedValue(1),
      incrBy: vi.fn().mockResolvedValue(1),
      decr: vi.fn().mockResolvedValue(0),
      decrBy: vi.fn().mockResolvedValue(0),
      flushDb: vi.fn().mockResolvedValue('OK'),
      ping: vi.fn().mockResolvedValue('PONG'),
      isOpen: false,
      isReady: true,
    };

    (createClient as any).mockReturnValue(mockRedisClient);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_DB;
  });

  describe('Inicialização do Cliente Redis', () => {
    it('deve criar cliente Redis com URL padrão sem senha quando variáveis não estiverem definidas', async () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;
      delete process.env.REDIS_DB;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redisClient');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379/0',
        socket: {
          reconnectStrategy: expect.any(Function),
          connectTimeout: 5000,
        },
        commandsQueueMaxLength: 1000,
        disableOfflineQueue: false,
      });
      
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });

    it('deve criar cliente Redis com URL customizada com senha quando variáveis estiverem definidas', async () => {
      process.env.REDIS_HOST = 'redis-server';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'custom_password';
      process.env.REDIS_DB = '2';

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redisClient');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://:custom_password@redis-server:6380/2',
        socket: {
          reconnectStrategy: expect.any(Function),
          connectTimeout: 5000,
        },
        commandsQueueMaxLength: 1000,
        disableOfflineQueue: false,
      });
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('deve criar cliente Redis sem senha quando REDIS_PASSWORD estiver vazio', async () => {
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6379';
      process.env.REDIS_PASSWORD = '';
      process.env.REDIS_DB = '0';

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redisClient');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379/0',
        socket: {
          reconnectStrategy: expect.any(Function),
          connectTimeout: 5000,
        },
        commandsQueueMaxLength: 1000,
        disableOfflineQueue: false,
      });
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('deve usar database 0 por padrão quando REDIS_DB não estiver definido', async () => {
      delete process.env.REDIS_DB;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redisClient');

      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/0'),
        })
      );
    });

    it('deve não chamar connect quando isOpen já for true', async () => {
      mockRedisClient.isOpen = true;
      
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redisClient');

      expect(mockRedisClient.connect).not.toHaveBeenCalled();
    });

    it('deve capturar erro ao tentar conectar', async () => {
      const erroConexao = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValueOnce(erroConexao);
      
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redisClient');

      await new Promise(resolve => setImmediate(resolve));
      
      expect(console.error).toHaveBeenCalledWith('[REDIS CONNECT ERROR]', 'Connection failed');
    });
  });

  describe('Event Handlers do Redis', () => {
    it('deve logar mensagem quando evento connect for disparado', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      
      connectCallback();

      expect(console.log).toHaveBeenCalledWith('[REDIS CONNECT] Conectado ao servidor Redis');
    });

    it('deve logar quando evento ready for disparado', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      
      readyCallback();

      expect(console.log).toHaveBeenCalledWith('[REDIS READY] Redis pronto para uso');
    });

    it('deve logar quando evento reconnecting for disparado', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      
      reconnectingCallback();

      expect(console.log).toHaveBeenCalledWith('[REDIS RECONNECTING] Tentando reconectar...');
    });

    it('deve logar quando evento end for disparado', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('end', expect.any(Function));
      
      endCallback();

      expect(console.log).toHaveBeenCalledWith('[REDIS END] Conexão encerrada');
    });

    it('deve logar erro quando evento error for disparado', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));

      const erro = new Error('Falha na conexão');
      errorCallback(erro);

      expect(console.error).toHaveBeenCalledWith('[REDIS ERROR]', 'Falha na conexão');
    });
  });

  describe('Estratégia de Reconexão', () => {
    it('deve implementar exponential backoff para tentativas de reconexão', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      expect(reconnectStrategy(1)).toBe(1000);
      expect(reconnectStrategy(2)).toBe(2000);
      expect(reconnectStrategy(3)).toBe(4000);
      expect(reconnectStrategy(4)).toBe(8000);
      expect(reconnectStrategy(5)).toBe(16000);
    });

    it('deve limitar delay máximo a 30 segundos', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      const delay5 = reconnectStrategy(5);
      expect(delay5).toBe(16000);
      expect(delay5).toBeLessThanOrEqual(30000);
      
      const delay6 = reconnectStrategy(6);
      expect(delay6).toBeInstanceOf(Error);
    });

    it('deve retornar erro após 5 tentativas', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      const resultado = reconnectStrategy(6);

      expect(resultado).toBeInstanceOf(Error);
      expect((resultado as Error).message).toBe('Máximo de tentativas de reconexão excedido');
    });

    it('deve logar mensagem de tentativa de reconexão', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      reconnectStrategy(3);

      expect(console.log).toHaveBeenCalledWith(
        '[REDIS] Tentativa de reconexão 3/5 em 4000ms'
      );
    });

    it('deve logar erro quando exceder máximo de tentativas', async () => {
      vi.resetModules();
      await import('../../services/redisClient');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      reconnectStrategy(6);

      expect(console.error).toHaveBeenCalledWith(
        '[REDIS] Falha ao conectar após 5 tentativas'
      );
    });
  });

  describe('cacheSet', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve armazenar valor com TTL customizado quando fornecido', async () => {
      vi.resetModules();
      const { cacheSet } = await import('../../services/redisClient');

      await cacheSet('chave-teste', 'valor-teste', 7200);

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste', { EX: 7200 });
    });

    it('deve armazenar valor com TTL padrão (3600s) quando não fornecido', async () => {
      vi.resetModules();
      const { cacheSet } = await import('../../services/redisClient');

      await cacheSet('chave-teste', 'valor-teste');

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste', { EX: 3600 });
    });

    it('deve serializar objeto para JSON ao armazenar', async () => {
      vi.resetModules();
      const { cacheSet } = await import('../../services/redisClient');
      const objeto = { nome: 'Teste', valor: 123 };

      await cacheSet('chave-objeto', objeto, 3600);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-objeto', 
        JSON.stringify(objeto), 
        { EX: 3600 }
      );
    });

    it('deve retornar sem erro quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheSet } = await import('../../services/redisClient');

      await cacheSet('chave-teste', 'valor-teste');

      expect(console.warn).toHaveBeenCalledWith('[REDIS SET] Redis não conectado, operação ignorada');
    });

    it('deve capturar e logar erro sem propagar exceção', async () => {
      mockRedisClient.set.mockRejectedValueOnce(new Error('Set failed'));
      
      vi.resetModules();
      const { cacheSet } = await import('../../services/redisClient');

      await expect(cacheSet('chave-teste', 'valor-teste')).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalledWith('[REDIS SET ERROR]', expect.any(Object));
    });
  });

  describe('cacheGet', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar valor quando chave existir', async () => {
      vi.resetModules();
      const { cacheGet } = await import('../../services/redisClient');
      mockRedisClient.get.mockResolvedValue('valor-armazenado');

      const resultado = await cacheGet('chave-teste');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe('valor-armazenado');
    });

    it('deve retornar null quando chave não existir', async () => {
      vi.resetModules();
      const { cacheGet } = await import('../../services/redisClient');
      mockRedisClient.get.mockResolvedValue(null);

      const resultado = await cacheGet('chave-inexistente');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-inexistente');
      expect(resultado).toBeNull();
    });

    it('deve retornar null quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheGet } = await import('../../services/redisClient');

      const resultado = await cacheGet('chave-teste');

      expect(resultado).toBeNull();
      expect(console.warn).toHaveBeenCalledWith('[REDIS GET] Redis não conectado, retornando null');
    });

    it('deve retornar null em caso de erro', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Get failed'));
      
      vi.resetModules();
      const { cacheGet } = await import('../../services/redisClient');

      const resultado = await cacheGet('chave-teste');

      expect(resultado).toBeNull();
      expect(console.error).toHaveBeenCalledWith('[REDIS GET ERROR]', expect.any(Object));
    });
  });

  describe('cacheDel', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve deletar uma chave com sucesso', async () => {
      vi.resetModules();
      const { cacheDel } = await import('../../services/redisClient');
      mockRedisClient.del.mockResolvedValue(1);

      const resultado = await cacheDel('chave-teste');

      expect(mockRedisClient.del).toHaveBeenCalledWith(['chave-teste']);
      expect(resultado).toBe(1);
    });

    it('deve deletar múltiplas chaves', async () => {
      vi.resetModules();
      const { cacheDel } = await import('../../services/redisClient');
      mockRedisClient.del.mockResolvedValue(3);

      const resultado = await cacheDel('chave1', 'chave2', 'chave3');

      expect(mockRedisClient.del).toHaveBeenCalledWith(['chave1', 'chave2', 'chave3']);
      expect(resultado).toBe(3);
    });

    it('deve retornar 0 quando não houver chaves para deletar', async () => {
      vi.resetModules();
      const { cacheDel } = await import('../../services/redisClient');

      const resultado = await cacheDel();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheDel } = await import('../../services/redisClient');

      const resultado = await cacheDel('chave-teste');

      expect(resultado).toBe(0);
      expect(console.warn).toHaveBeenCalledWith('[REDIS DEL] Redis não conectado, operação ignorada');
    });

    it('deve retornar 0 em caso de erro', async () => {
      mockRedisClient.del.mockRejectedValueOnce(new Error('Del failed'));
      
      vi.resetModules();
      const { cacheDel } = await import('../../services/redisClient');

      const resultado = await cacheDel('chave-teste');

      expect(resultado).toBe(0);
      expect(console.error).toHaveBeenCalledWith('[REDIS DEL ERROR]', expect.any(Object));
    });
  });

  describe('cacheDelPattern', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve deletar chaves que correspondem ao padrão', async () => {
      vi.resetModules();
      const { cacheDelPattern } = await import('../../services/redisClient');
      mockRedisClient.keys.mockResolvedValue(['usuario:1', 'usuario:2', 'usuario:3']);
      mockRedisClient.del.mockResolvedValue(3);

      const resultado = await cacheDelPattern('usuario:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('usuario:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(['usuario:1', 'usuario:2', 'usuario:3']);
      expect(resultado).toBe(3);
    });

    it('deve retornar 0 quando nenhuma chave corresponder ao padrão', async () => {
      vi.resetModules();
      const { cacheDelPattern } = await import('../../services/redisClient');
      mockRedisClient.keys.mockResolvedValue([]);

      const resultado = await cacheDelPattern('inexistente:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('inexistente:*');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheDelPattern } = await import('../../services/redisClient');

      const resultado = await cacheDelPattern('teste:*');

      expect(resultado).toBe(0);
      expect(console.warn).toHaveBeenCalledWith('[REDIS DEL PATTERN] Redis não conectado, operação ignorada');
    });

    it('deve retornar 0 em caso de erro', async () => {
      mockRedisClient.keys.mockRejectedValueOnce(new Error('Keys failed'));
      
      vi.resetModules();
      const { cacheDelPattern } = await import('../../services/redisClient');

      const resultado = await cacheDelPattern('teste:*');

      expect(resultado).toBe(0);
      expect(console.error).toHaveBeenCalledWith('[REDIS DEL PATTERN ERROR]', expect.any(Object));
    });
  });

  describe('cacheExists', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar true quando chave existir', async () => {
      vi.resetModules();
      const { cacheExists } = await import('../../services/redisClient');
      mockRedisClient.exists.mockResolvedValue(1);

      const resultado = await cacheExists('chave-teste');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe(true);
    });

    it('deve retornar false quando chave não existir', async () => {
      vi.resetModules();
      const { cacheExists } = await import('../../services/redisClient');
      mockRedisClient.exists.mockResolvedValue(0);

      const resultado = await cacheExists('chave-inexistente');

      expect(resultado).toBe(false);
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheExists } = await import('../../services/redisClient');

      const resultado = await cacheExists('chave-teste');

      expect(resultado).toBe(false);
    });

    it('deve retornar false em caso de erro', async () => {
      mockRedisClient.exists.mockRejectedValueOnce(new Error('Exists failed'));
      
      vi.resetModules();
      const { cacheExists } = await import('../../services/redisClient');

      const resultado = await cacheExists('chave-teste');

      expect(resultado).toBe(false);
      expect(console.error).toHaveBeenCalledWith('[REDIS EXISTS ERROR]', expect.any(Object));
    });
  });

  describe('cacheExpire', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve definir TTL para chave existente', async () => {
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redisClient');
      mockRedisClient.expire.mockResolvedValue(1);

      const resultado = await cacheExpire('chave-teste', 7200);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('chave-teste', 7200);
      expect(resultado).toBe(true);
    });

    it('deve retornar false quando chave não existir', async () => {
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redisClient');
      mockRedisClient.expire.mockResolvedValue(0);

      const resultado = await cacheExpire('chave-inexistente', 3600);

      expect(resultado).toBe(false);
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redisClient');

      const resultado = await cacheExpire('chave-teste', 3600);

      expect(resultado).toBe(false);
    });

    it('deve retornar false em caso de erro', async () => {
      mockRedisClient.expire.mockRejectedValueOnce(new Error('Expire failed'));
      
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redisClient');

      const resultado = await cacheExpire('chave-teste', 3600);

      expect(resultado).toBe(false);
      expect(console.error).toHaveBeenCalledWith('[REDIS EXPIRE ERROR]', expect.any(Object));
    });
  });

  describe('cacheTTL', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar TTL restante da chave', async () => {
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redisClient');
      mockRedisClient.ttl.mockResolvedValue(3600);

      const resultado = await cacheTTL('chave-teste');

      expect(mockRedisClient.ttl).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe(3600);
    });

    it('deve retornar -1 quando chave não tiver TTL', async () => {
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redisClient');
      mockRedisClient.ttl.mockResolvedValue(-1);

      const resultado = await cacheTTL('chave-sem-ttl');

      expect(resultado).toBe(-1);
    });

    it('deve retornar -2 quando chave não existir', async () => {
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redisClient');
      mockRedisClient.ttl.mockResolvedValue(-2);

      const resultado = await cacheTTL('chave-inexistente');

      expect(resultado).toBe(-2);
    });

    it('deve retornar -2 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redisClient');

      const resultado = await cacheTTL('chave-teste');

      expect(resultado).toBe(-2);
    });

    it('deve retornar -2 em caso de erro', async () => {
      mockRedisClient.ttl.mockRejectedValueOnce(new Error('TTL failed'));
      
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redisClient');

      const resultado = await cacheTTL('chave-teste');

      expect(resultado).toBe(-2);
      expect(console.error).toHaveBeenCalledWith('[REDIS TTL ERROR]', expect.any(Object));
    });
  });

  describe('cacheIncr', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve incrementar contador em 1 por padrão', async () => {
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redisClient');
      mockRedisClient.incr.mockResolvedValue(1);

      const resultado = await cacheIncr('contador');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('contador');
      expect(resultado).toBe(1);
    });

    it('deve incrementar contador em valor customizado', async () => {
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redisClient');
      mockRedisClient.incrBy.mockResolvedValue(10);

      const resultado = await cacheIncr('contador', 10);

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('contador', 10);
      expect(resultado).toBe(10);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redisClient');

      const resultado = await cacheIncr('contador');

      expect(resultado).toBe(0);
    });

    it('deve retornar 0 em caso de erro', async () => {
      mockRedisClient.incr.mockRejectedValueOnce(new Error('Incr failed'));
      
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redisClient');

      const resultado = await cacheIncr('contador');

      expect(resultado).toBe(0);
      expect(console.error).toHaveBeenCalledWith('[REDIS INCR ERROR]', expect.any(Object));
    });
  });

  describe('cacheDecr', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve decrementar contador em 1 por padrão', async () => {
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redisClient');
      mockRedisClient.decr.mockResolvedValue(9);

      const resultado = await cacheDecr('contador');

      expect(mockRedisClient.decr).toHaveBeenCalledWith('contador');
      expect(resultado).toBe(9);
    });

    it('deve decrementar contador em valor customizado', async () => {
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redisClient');
      mockRedisClient.decrBy.mockResolvedValue(5);

      const resultado = await cacheDecr('contador', 5);

      expect(mockRedisClient.decrBy).toHaveBeenCalledWith('contador', 5);
      expect(resultado).toBe(5);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redisClient');

      const resultado = await cacheDecr('contador');

      expect(resultado).toBe(0);
    });

    it('deve retornar 0 em caso de erro', async () => {
      mockRedisClient.decr.mockRejectedValueOnce(new Error('Decr failed'));
      
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redisClient');

      const resultado = await cacheDecr('contador');

      expect(resultado).toBe(0);
      expect(console.error).toHaveBeenCalledWith('[REDIS DECR ERROR]', expect.any(Object));
    });
  });

  describe('cacheFlush', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve limpar todo o cache com sucesso', async () => {
      vi.resetModules();
      const { cacheFlush } = await import('../../services/redisClient');
      mockRedisClient.flushDb.mockResolvedValue('OK');

      const resultado = await cacheFlush();

      expect(mockRedisClient.flushDb).toHaveBeenCalled();
      expect(resultado).toBe(true);
      expect(console.log).toHaveBeenCalledWith('[REDIS FLUSH] Cache limpo com sucesso');
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheFlush } = await import('../../services/redisClient');

      const resultado = await cacheFlush();

      expect(resultado).toBe(false);
    });

    it('deve retornar false em caso de erro', async () => {
      mockRedisClient.flushDb.mockRejectedValueOnce(new Error('Flush failed'));
      
      vi.resetModules();
      const { cacheFlush } = await import('../../services/redisClient');

      const resultado = await cacheFlush();

      expect(resultado).toBe(false);
      expect(console.error).toHaveBeenCalledWith('[REDIS FLUSH ERROR]', 'Flush failed');
    });
  });

  describe('Funções Utilitárias', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('isRedisConnected deve retornar true quando conectado', async () => {
      vi.resetModules();
      const { isRedisConnected } = await import('../../services/redisClient');

      const resultado = isRedisConnected();

      expect(resultado).toBe(true);
    });

    it('isRedisConnected deve retornar false quando não conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { isRedisConnected } = await import('../../services/redisClient');

      const resultado = isRedisConnected();

      expect(resultado).toBe(false);
    });

    it('cacheInfo deve retornar informações do Redis', async () => {
      vi.resetModules();
      const { cacheInfo } = await import('../../services/redisClient');

      const info = await cacheInfo();

      expect(info).toMatchObject({
        connected: true,
        ready: true,
        host: 'localhost',
        port: 6379,
        db: 0,
      });
    });

    it('cacheHealthCheck deve retornar healthy quando conectado', async () => {
      vi.resetModules();
      const { cacheHealthCheck } = await import('../../services/redisClient');
      mockRedisClient.ping.mockResolvedValue('PONG');

      const health = await cacheHealthCheck();

      expect(health.status).toBe('healthy');
      expect(health).toHaveProperty('latency');
      expect(typeof health.latency).toBe('number');
    });

    it('cacheHealthCheck deve retornar unhealthy quando não conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheHealthCheck } = await import('../../services/redisClient');

      const health = await cacheHealthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Redis não conectado');
    });

    it('cacheHealthCheck deve retornar unhealthy em caso de erro no ping', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Ping failed'));
      
      vi.resetModules();
      const { cacheHealthCheck } = await import('../../services/redisClient');

      const health = await cacheHealthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Ping failed');
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('disconnectRedis deve desconectar gracefully', async () => {
      vi.resetModules();
      const { disconnectRedis } = await import('../../services/redisClient');
      mockRedisClient.quit.mockResolvedValue('OK');

      await disconnectRedis();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('[REDIS DISCONNECT] Desconectado com sucesso');
    });

    it('disconnectRedis não deve chamar quit quando já desconectado', async () => {
      mockRedisClient.isOpen = false;
      
      vi.resetModules();
      const { disconnectRedis } = await import('../../services/redisClient');

      await disconnectRedis();

      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });

    it('disconnectRedis deve capturar erro ao desconectar', async () => {
      mockRedisClient.quit.mockRejectedValueOnce(new Error('Quit failed'));
      
      vi.resetModules();
      const { disconnectRedis } = await import('../../services/redisClient');

      await disconnectRedis();

      expect(console.error).toHaveBeenCalledWith('[REDIS DISCONNECT ERROR]', 'Quit failed');
    });
  });

  describe('waitForRedis', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar true quando Redis estiver pronto', async () => {
      vi.resetModules();
      const { waitForRedis } = await import('../../services/redisClient');

      const resultado = await waitForRedis(1000);

      expect(resultado).toBe(true);
    });

    it('deve retornar false quando timeout for excedido', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { waitForRedis } = await import('../../services/redisClient');

      const resultado = await waitForRedis(100);

      expect(resultado).toBe(false);
    });
  });
});