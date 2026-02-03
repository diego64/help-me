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

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import { logger } from '../../shared/config/logger';

describe('Redis Client', () => {
  let mockRedisClient: any;
  let connectCallback: any;
  let errorCallback: any;
  let readyCallback: any;
  let reconnectingCallback: any;
  let endCallback: any;

  beforeEach(() => {
    vi.clearAllMocks();

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
  });

  afterEach(() => {
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

      await import('../../services/redis');

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

      await import('../../services/redis');

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

      await import('../../services/redis');

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

      await import('../../services/redis');

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

      await import('../../services/redis');

      expect(mockRedisClient.connect).not.toHaveBeenCalled();
    });

    it('deve capturar erro ao tentar conectar', async () => {
      const erroConexao = new Error('Connection failed');
      mockRedisClient.connect.mockRejectedValueOnce(erroConexao);
      
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redis');

      await new Promise(resolve => setImmediate(resolve));
      
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroConexao },
        'Erro ao conectar ao Redis'
      );
    });
  });

  describe('Event Handlers do Redis', () => {
    it('deve logar mensagem quando evento connect for disparado', async () => {
      vi.resetModules();
      await import('../../services/redis');

      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      
      connectCallback();

      expect(logger.info).toHaveBeenCalledWith('Cliente Redis conectado');
    });

    it('deve logar quando evento ready for disparado', async () => {
      vi.resetModules();
      await import('../../services/redis');

      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      
      readyCallback();

      expect(logger.info).toHaveBeenCalledWith('Cliente Redis pronto');
    });

    it('deve logar quando evento reconnecting for disparado', async () => {
      vi.resetModules();
      await import('../../services/redis');

      expect(mockRedisClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      
      reconnectingCallback();

      expect(logger.info).toHaveBeenCalledWith('Tentando reconectar ao Redis');
    });

    it('deve logar quando evento end for disparado', async () => {
      vi.resetModules();
      await import('../../services/redis');

      expect(mockRedisClient.on).toHaveBeenCalledWith('end', expect.any(Function));
      
      endCallback();

      expect(logger.info).toHaveBeenCalledWith('Conexão Redis encerrada');
    });

    it('deve logar erro quando evento error for disparado', async () => {
      vi.resetModules();
      await import('../../services/redis');

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));

      const erro = new Error('Falha na conexão');
      errorCallback(erro);

      expect(logger.error).toHaveBeenCalledWith({ err: erro }, 'Erro no cliente Redis');
    });
  });

  describe('Estratégia de Reconexão', () => {
    it('deve implementar exponential backoff para tentativas de reconexão', async () => {
      vi.resetModules();
      await import('../../services/redis');

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
      await import('../../services/redis');

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
      await import('../../services/redis');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      const resultado = reconnectStrategy(6);

      expect(resultado).toBeInstanceOf(Error);
      expect((resultado as Error).message).toBe('Máximo de tentativas de reconexão excedido');
    });

    it('deve logar mensagem de tentativa de reconexão', async () => {
      vi.resetModules();
      await import('../../services/redis');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      reconnectStrategy(3);

      expect(logger.info).toHaveBeenCalledWith(
        { tentativa: 3, maxTentativas: 5, delay: 4000 },
        'Tentativa de reconexão Redis'
      );
    });

    it('deve logar erro quando exceder máximo de tentativas', async () => {
      vi.resetModules();
      await import('../../services/redis');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      reconnectStrategy(6);

      expect(logger.error).toHaveBeenCalledWith(
        { maxRetries: 5 },
        'Falha ao conectar Redis após múltiplas tentativas'
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
      const { cacheSet } = await import('../../services/redis');

      await cacheSet('chave-teste', 'valor-teste', 7200);

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste', { EX: 7200 });
    });

    it('deve armazenar valor com TTL padrão (3600s) quando não fornecido', async () => {
      vi.resetModules();
      const { cacheSet } = await import('../../services/redis');

      await cacheSet('chave-teste', 'valor-teste');

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste', { EX: 3600 });
    });

    it('deve serializar objeto para JSON ao armazenar', async () => {
      vi.resetModules();
      const { cacheSet } = await import('../../services/redis');
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
      const { cacheSet } = await import('../../services/redis');

      await cacheSet('chave-teste', 'valor-teste');

      expect(logger.warn).toHaveBeenCalledWith('Redis não conectado, operação SET ignorada');
    });

    it('deve capturar e logar erro sem propagar exceção', async () => {
      const erroSet = new Error('Set failed');
      mockRedisClient.set.mockRejectedValueOnce(erroSet);
      
      vi.resetModules();
      const { cacheSet } = await import('../../services/redis');

      await expect(cacheSet('chave-teste', 'valor-teste')).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroSet, key: 'chave-teste' },
        'Erro ao executar SET no Redis'
      );
    });
  });

  describe('cacheGet', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar valor quando chave existir', async () => {
      vi.resetModules();
      const { cacheGet } = await import('../../services/redis');
      mockRedisClient.get.mockResolvedValue('valor-armazenado');

      const resultado = await cacheGet('chave-teste');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe('valor-armazenado');
    });

    it('deve retornar null quando chave não existir', async () => {
      vi.resetModules();
      const { cacheGet } = await import('../../services/redis');
      mockRedisClient.get.mockResolvedValue(null);

      const resultado = await cacheGet('chave-inexistente');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-inexistente');
      expect(resultado).toBeNull();
    });

    it('deve retornar null quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheGet } = await import('../../services/redis');

      const resultado = await cacheGet('chave-teste');

      expect(resultado).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Redis não conectado, operação GET retornando null');
    });

    it('deve retornar null em caso de erro', async () => {
      const erroGet = new Error('Get failed');
      mockRedisClient.get.mockRejectedValueOnce(erroGet);
      
      vi.resetModules();
      const { cacheGet } = await import('../../services/redis');

      const resultado = await cacheGet('chave-teste');

      expect(resultado).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroGet, key: 'chave-teste' },
        'Erro ao executar GET no Redis'
      );
    });
  });

  describe('cacheDel', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve deletar uma chave com sucesso', async () => {
      vi.resetModules();
      const { cacheDel } = await import('../../services/redis');
      mockRedisClient.del.mockResolvedValue(1);

      const resultado = await cacheDel('chave-teste');

      expect(mockRedisClient.del).toHaveBeenCalledWith(['chave-teste']);
      expect(resultado).toBe(1);
    });

    it('deve deletar múltiplas chaves', async () => {
      vi.resetModules();
      const { cacheDel } = await import('../../services/redis');
      mockRedisClient.del.mockResolvedValue(3);

      const resultado = await cacheDel('chave1', 'chave2', 'chave3');

      expect(mockRedisClient.del).toHaveBeenCalledWith(['chave1', 'chave2', 'chave3']);
      expect(resultado).toBe(3);
    });

    it('deve retornar 0 quando não houver chaves para deletar', async () => {
      vi.resetModules();
      const { cacheDel } = await import('../../services/redis');

      const resultado = await cacheDel();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheDel } = await import('../../services/redis');

      const resultado = await cacheDel('chave-teste');

      expect(resultado).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Redis não conectado, operação DEL ignorada');
    });

    it('deve retornar 0 em caso de erro', async () => {
      const erroDel = new Error('Del failed');
      mockRedisClient.del.mockRejectedValueOnce(erroDel);
      
      vi.resetModules();
      const { cacheDel } = await import('../../services/redis');

      const resultado = await cacheDel('chave-teste');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroDel, keys: ['chave-teste'] },
        'Erro ao executar DEL no Redis'
      );
    });
  });

  describe('cacheDelPattern', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve deletar chaves que correspondem ao padrão', async () => {
      vi.resetModules();
      const { cacheDelPattern } = await import('../../services/redis');
      mockRedisClient.keys.mockResolvedValue(['usuario:1', 'usuario:2', 'usuario:3']);
      mockRedisClient.del.mockResolvedValue(3);

      const resultado = await cacheDelPattern('usuario:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('usuario:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(['usuario:1', 'usuario:2', 'usuario:3']);
      expect(resultado).toBe(3);
    });

    it('deve retornar 0 quando nenhuma chave corresponder ao padrão', async () => {
      vi.resetModules();
      const { cacheDelPattern } = await import('../../services/redis');
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
      const { cacheDelPattern } = await import('../../services/redis');

      const resultado = await cacheDelPattern('teste:*');

      expect(resultado).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Redis não conectado, operação DEL PATTERN ignorada');
    });

    it('deve retornar 0 em caso de erro', async () => {
      const erroKeys = new Error('Keys failed');
      mockRedisClient.keys.mockRejectedValueOnce(erroKeys);
      
      vi.resetModules();
      const { cacheDelPattern } = await import('../../services/redis');

      const resultado = await cacheDelPattern('teste:*');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroKeys, pattern: 'teste:*' },
        'Erro ao executar DEL PATTERN no Redis'
      );
    });
  });

  describe('cacheExists', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar true quando chave existir', async () => {
      vi.resetModules();
      const { cacheExists } = await import('../../services/redis');
      mockRedisClient.exists.mockResolvedValue(1);

      const resultado = await cacheExists('chave-teste');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe(true);
    });

    it('deve retornar false quando chave não existir', async () => {
      vi.resetModules();
      const { cacheExists } = await import('../../services/redis');
      mockRedisClient.exists.mockResolvedValue(0);

      const resultado = await cacheExists('chave-inexistente');

      expect(resultado).toBe(false);
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheExists } = await import('../../services/redis');

      const resultado = await cacheExists('chave-teste');

      expect(resultado).toBe(false);
    });

    it('deve retornar false em caso de erro', async () => {
      const erroExists = new Error('Exists failed');
      mockRedisClient.exists.mockRejectedValueOnce(erroExists);
      
      vi.resetModules();
      const { cacheExists } = await import('../../services/redis');

      const resultado = await cacheExists('chave-teste');

      expect(resultado).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroExists, key: 'chave-teste' },
        'Erro ao executar EXISTS no Redis'
      );
    });
  });

  describe('cacheExpire', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve definir TTL para chave existente', async () => {
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redis');
      mockRedisClient.expire.mockResolvedValue(1);

      const resultado = await cacheExpire('chave-teste', 7200);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('chave-teste', 7200);
      expect(resultado).toBe(true);
    });

    it('deve retornar false quando chave não existir', async () => {
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redis');
      mockRedisClient.expire.mockResolvedValue(0);

      const resultado = await cacheExpire('chave-inexistente', 3600);

      expect(resultado).toBe(false);
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redis');

      const resultado = await cacheExpire('chave-teste', 3600);

      expect(resultado).toBe(false);
    });

    it('deve retornar false em caso de erro', async () => {
      const erroExpire = new Error('Expire failed');
      mockRedisClient.expire.mockRejectedValueOnce(erroExpire);
      
      vi.resetModules();
      const { cacheExpire } = await import('../../services/redis');

      const resultado = await cacheExpire('chave-teste', 3600);

      expect(resultado).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroExpire, key: 'chave-teste', ttl: 3600 },
        'Erro ao executar EXPIRE no Redis'
      );
    });
  });

  describe('cacheTTL', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar TTL restante da chave', async () => {
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redis');
      mockRedisClient.ttl.mockResolvedValue(3600);

      const resultado = await cacheTTL('chave-teste');

      expect(mockRedisClient.ttl).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe(3600);
    });

    it('deve retornar -1 quando chave não tiver TTL', async () => {
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redis');
      mockRedisClient.ttl.mockResolvedValue(-1);

      const resultado = await cacheTTL('chave-sem-ttl');

      expect(resultado).toBe(-1);
    });

    it('deve retornar -2 quando chave não existir', async () => {
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redis');
      mockRedisClient.ttl.mockResolvedValue(-2);

      const resultado = await cacheTTL('chave-inexistente');

      expect(resultado).toBe(-2);
    });

    it('deve retornar -2 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redis');

      const resultado = await cacheTTL('chave-teste');

      expect(resultado).toBe(-2);
    });

    it('deve retornar -2 em caso de erro', async () => {
      const erroTTL = new Error('TTL failed');
      mockRedisClient.ttl.mockRejectedValueOnce(erroTTL);
      
      vi.resetModules();
      const { cacheTTL } = await import('../../services/redis');

      const resultado = await cacheTTL('chave-teste');

      expect(resultado).toBe(-2);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroTTL, key: 'chave-teste' },
        'Erro ao executar TTL no Redis'
      );
    });
  });

  describe('cacheIncr', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve incrementar contador em 1 por padrão', async () => {
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redis');
      mockRedisClient.incr.mockResolvedValue(1);

      const resultado = await cacheIncr('contador');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('contador');
      expect(resultado).toBe(1);
    });

    it('deve incrementar contador em valor customizado', async () => {
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redis');
      mockRedisClient.incrBy.mockResolvedValue(10);

      const resultado = await cacheIncr('contador', 10);

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('contador', 10);
      expect(resultado).toBe(10);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redis');

      const resultado = await cacheIncr('contador');

      expect(resultado).toBe(0);
    });

    it('deve retornar 0 em caso de erro', async () => {
      const erroIncr = new Error('Incr failed');
      mockRedisClient.incr.mockRejectedValueOnce(erroIncr);
      
      vi.resetModules();
      const { cacheIncr } = await import('../../services/redis');

      const resultado = await cacheIncr('contador');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroIncr, key: 'contador', increment: 1 },
        'Erro ao executar INCR no Redis'
      );
    });
  });

  describe('cacheDecr', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve decrementar contador em 1 por padrão', async () => {
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redis');
      mockRedisClient.decr.mockResolvedValue(9);

      const resultado = await cacheDecr('contador');

      expect(mockRedisClient.decr).toHaveBeenCalledWith('contador');
      expect(resultado).toBe(9);
    });

    it('deve decrementar contador em valor customizado', async () => {
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redis');
      mockRedisClient.decrBy.mockResolvedValue(5);

      const resultado = await cacheDecr('contador', 5);

      expect(mockRedisClient.decrBy).toHaveBeenCalledWith('contador', 5);
      expect(resultado).toBe(5);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redis');

      const resultado = await cacheDecr('contador');

      expect(resultado).toBe(0);
    });

    it('deve retornar 0 em caso de erro', async () => {
      const erroDecr = new Error('Decr failed');
      mockRedisClient.decr.mockRejectedValueOnce(erroDecr);
      
      vi.resetModules();
      const { cacheDecr } = await import('../../services/redis');

      const resultado = await cacheDecr('contador');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroDecr, key: 'contador', decrement: 1 },
        'Erro ao executar DECR no Redis'
      );
    });
  });

  describe('cacheFlush', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve limpar todo o cache com sucesso', async () => {
      vi.resetModules();
      const { cacheFlush } = await import('../../services/redis');
      mockRedisClient.flushDb.mockResolvedValue('OK');

      const resultado = await cacheFlush();

      expect(mockRedisClient.flushDb).toHaveBeenCalled();
      expect(resultado).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Cache Redis limpo com sucesso');
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { cacheFlush } = await import('../../services/redis');

      const resultado = await cacheFlush();

      expect(resultado).toBe(false);
    });

    it('deve retornar false em caso de erro', async () => {
      const erroFlush = new Error('Flush failed');
      mockRedisClient.flushDb.mockRejectedValueOnce(erroFlush);
      
      vi.resetModules();
      const { cacheFlush } = await import('../../services/redis');

      const resultado = await cacheFlush();

      expect(resultado).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroFlush },
        'Erro ao executar FLUSH no Redis'
      );
    });
  });

  describe('Funções Utilitárias', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('isRedisConnected deve retornar true quando conectado', async () => {
      vi.resetModules();
      const { isRedisConnected } = await import('../../services/redis');

      const resultado = isRedisConnected();

      expect(resultado).toBe(true);
    });

    it('isRedisConnected deve retornar false quando não conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { isRedisConnected } = await import('../../services/redis');

      const resultado = isRedisConnected();

      expect(resultado).toBe(false);
    });

    it('cacheInfo deve retornar informações do Redis', async () => {
      vi.resetModules();
      const { cacheInfo } = await import('../../services/redis');

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
      const { cacheHealthCheck } = await import('../../services/redis');
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
      const { cacheHealthCheck } = await import('../../services/redis');

      const health = await cacheHealthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Redis não conectado');
    });

    it('cacheHealthCheck deve retornar unhealthy em caso de erro no ping', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Ping failed'));
      
      vi.resetModules();
      const { cacheHealthCheck } = await import('../../services/redis');

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
      const { disconnectRedis } = await import('../../services/redis');
      mockRedisClient.quit.mockResolvedValue('OK');

      await disconnectRedis();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Redis desconectado com sucesso');
    });

    it('disconnectRedis não deve chamar quit quando já desconectado', async () => {
      mockRedisClient.isOpen = false;
      
      vi.resetModules();
      const { disconnectRedis } = await import('../../services/redis');

      await disconnectRedis();

      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });

    it('disconnectRedis deve capturar erro ao desconectar', async () => {
      const erroQuit = new Error('Quit failed');
      mockRedisClient.quit.mockRejectedValueOnce(erroQuit);
      
      vi.resetModules();
      const { disconnectRedis } = await import('../../services/redis');

      await disconnectRedis();

      expect(logger.error).toHaveBeenCalledWith(
        { err: erroQuit },
        'Erro ao desconectar Redis'
      );
    });

    it('deve desconectar gracefully ao receber SIGINT', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      vi.resetModules();
      await import('../../services/redis');
      mockRedisClient.quit.mockResolvedValue('OK');

      const sigintListeners = process.listeners('SIGINT');
      const sigintHandler = sigintListeners[sigintListeners.length - 1] as () => Promise<void>;
      
      if (sigintHandler) {
        await sigintHandler();
        
        expect(mockRedisClient.quit).toHaveBeenCalled();
        expect(processExitSpy).toHaveBeenCalledWith(0);
      }
      
      processExitSpy.mockRestore();
    });

    it('deve desconectar gracefully ao receber SIGTERM', async () => {
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      
      vi.resetModules();
      await import('../../services/redis');
      mockRedisClient.quit.mockResolvedValue('OK');

      const sigtermListeners = process.listeners('SIGTERM');
      const sigtermHandler = sigtermListeners[sigtermListeners.length - 1] as () => Promise<void>;
      
      if (sigtermHandler) {
        await sigtermHandler();
        
        expect(mockRedisClient.quit).toHaveBeenCalled();
        expect(processExitSpy).toHaveBeenCalledWith(0);
      }
      
      processExitSpy.mockRestore();
    });
  });

  describe('waitForRedis', () => {
    beforeEach(() => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;
    });

    it('deve retornar true quando Redis estiver pronto', async () => {
      vi.resetModules();
      const { waitForRedis } = await import('../../services/redis');

      const resultado = await waitForRedis(1000);

      expect(resultado).toBe(true);
    });

    it('deve retornar false quando timeout for excedido', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;
      
      vi.resetModules();
      const { waitForRedis } = await import('../../services/redis');

      const resultado = await waitForRedis(100);

      expect(resultado).toBe(false);
    });
  });
});