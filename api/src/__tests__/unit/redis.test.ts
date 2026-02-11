import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from 'redis';

vi.mock('redis', () => ({
  createClient: vi.fn(),
}));

vi.mock('../../shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../../shared/config/logger';

describe('Redis Client - Cobertura Completa', () => {
  let mockRedisClient: any;
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = new Map();

    mockRedisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
      on: vi.fn((event: string, callback: Function) => {
        eventHandlers.set(event, callback);
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

  describe('1. Inicialização e Configuração', () => {
    describe('1.1. Criação do cliente com configurações padrão', () => {
      it('deve criar cliente com valores padrão quando variáveis não estiverem definidas', async () => {
        delete process.env.REDIS_HOST;
        delete process.env.REDIS_PORT;
        delete process.env.REDIS_PASSWORD;
        delete process.env.REDIS_DB;

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

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

      it('deve registrar todos os event handlers corretamente', async () => {
        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
        expect(mockRedisClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
        expect(mockRedisClient.on).toHaveBeenCalledWith('end', expect.any(Function));
        expect(eventHandlers.size).toBe(5);
      });
    });

    describe('1.2. Criação do cliente com configurações customizadas', () => {
      it('deve criar cliente com URL contendo senha', async () => {
        process.env.REDIS_HOST = 'redis-server';
        process.env.REDIS_PORT = '6380';
        process.env.REDIS_PASSWORD = 'custom_password';
        process.env.REDIS_DB = '2';

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(createClient).toHaveBeenCalledWith({
          url: 'redis://:custom_password@redis-server:6380/2',
          socket: {
            reconnectStrategy: expect.any(Function),
            connectTimeout: 5000,
          },
          commandsQueueMaxLength: 1000,
          disableOfflineQueue: false,
        });
      });

      it('deve criar cliente sem senha quando REDIS_PASSWORD estiver vazio', async () => {
        process.env.REDIS_HOST = 'localhost';
        process.env.REDIS_PORT = '6379';
        process.env.REDIS_PASSWORD = '';
        process.env.REDIS_DB = '0';

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(createClient).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'redis://localhost:6379/0',
          })
        );
      });

      it('deve usar database 0 quando REDIS_DB não estiver definido', async () => {
        delete process.env.REDIS_DB;

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(createClient).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('/0'),
          })
        );
      });

      it('deve usar database customizado quando REDIS_DB for definido', async () => {
        process.env.REDIS_DB = '5';

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(createClient).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('/5'),
          })
        );
      });

      it('deve tratar REDIS_PORT como número', async () => {
        process.env.REDIS_PORT = '7000';

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(createClient).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining(':7000'),
          })
        );
      });
    });

    describe('1.3. Comportamento da conexão inicial', () => {
      it('deve não chamar connect quando isOpen já for true', async () => {
        mockRedisClient.isOpen = true;

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(mockRedisClient.connect).not.toHaveBeenCalled();
      });

      it('deve chamar connect quando isOpen for false', async () => {
        mockRedisClient.isOpen = false;

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
      });

      it('deve capturar erro ao tentar conectar', async () => {
        const erroConexao = new Error('Connection failed');
        mockRedisClient.connect.mockRejectedValueOnce(erroConexao);

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        await new Promise((resolve) => setImmediate(resolve));

        expect(logger.error).toHaveBeenCalledWith(
          { err: erroConexao },
          'Erro ao conectar ao Redis'
        );
      });

      it('deve capturar erro com mensagem customizada', async () => {
        const erroCustomizado = new Error('Custom connection error message');
        mockRedisClient.connect.mockRejectedValueOnce(erroCustomizado);

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        await import('../../infrastructure/database/redis/client');

        await new Promise((resolve) => setImmediate(resolve));

        expect(logger.error).toHaveBeenCalledWith(
          { err: erroCustomizado },
          'Erro ao conectar ao Redis'
        );
      });
    });
  });

  describe('2. Event Handlers', () => {
    beforeEach(async () => {
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);
      await import('../../infrastructure/database/redis/client');
    });

    it('deve logar quando evento "connect" for disparado', () => {
      const connectHandler = eventHandlers.get('connect');
      expect(connectHandler).toBeDefined();

      connectHandler!();

      expect(logger.info).toHaveBeenCalledWith('Cliente Redis conectado');
    });

    it('deve logar quando evento "ready" for disparado', () => {
      const readyHandler = eventHandlers.get('ready');
      expect(readyHandler).toBeDefined();

      readyHandler!();

      expect(logger.info).toHaveBeenCalledWith('Cliente Redis pronto');
    });

    it('deve logar quando evento "reconnecting" for disparado', () => {
      const reconnectingHandler = eventHandlers.get('reconnecting');
      expect(reconnectingHandler).toBeDefined();

      reconnectingHandler!();

      expect(logger.info).toHaveBeenCalledWith('Tentando reconectar ao Redis');
    });

    it('deve logar quando evento "end" for disparado', () => {
      const endHandler = eventHandlers.get('end');
      expect(endHandler).toBeDefined();

      endHandler!();

      expect(logger.info).toHaveBeenCalledWith('Conexão Redis encerrada');
    });

    it('deve logar erro quando evento "error" for disparado', () => {
      const errorHandler = eventHandlers.get('error');
      expect(errorHandler).toBeDefined();

      const erro = new Error('Falha na conexão');
      errorHandler!(erro);

      expect(logger.error).toHaveBeenCalledWith(
        { err: erro },
        'Erro no cliente Redis'
      );
    });

    it('deve logar erro com diferentes tipos de erro', () => {
      const errorHandler = eventHandlers.get('error');

      const erros = [
        new Error('Connection timeout'),
        new Error('Authentication failed'),
        new Error('Network error'),
        { message: 'Object error' },
      ];

      erros.forEach((erro) => {
        errorHandler!(erro);
        expect(logger.error).toHaveBeenCalledWith(
          { err: erro },
          'Erro no cliente Redis'
        );
      });
    });
  });

  describe('3. Estratégia de Reconexão', () => {
    let reconnectStrategy: Function;

    beforeEach(async () => {
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);
      await import('../../infrastructure/database/redis/client');

      const callArgs = (createClient as any).mock.calls[0][0];
      reconnectStrategy = callArgs.socket.reconnectStrategy;
    });

    it('deve implementar exponential backoff corretamente', () => {
      expect(reconnectStrategy(1)).toBe(1000);
      expect(reconnectStrategy(2)).toBe(2000);
      expect(reconnectStrategy(3)).toBe(4000);
      expect(reconnectStrategy(4)).toBe(8000);
      expect(reconnectStrategy(5)).toBe(16000);
    });

    it('deve limitar delay máximo a 30 segundos', () => {
      const delay5 = reconnectStrategy(5);
      expect(delay5).toBe(16000);
      expect(delay5).toBeLessThanOrEqual(30000);
    });

    it('deve retornar erro após 5 tentativas', () => {
      const resultado = reconnectStrategy(6);

      expect(resultado).toBeInstanceOf(Error);
      expect((resultado as Error).message).toBe(
        'Máximo de tentativas de reconexão excedido'
      );
    });

    it('deve retornar erro para tentativas maiores que 5', () => {
      expect(reconnectStrategy(7)).toBeInstanceOf(Error);
      expect(reconnectStrategy(10)).toBeInstanceOf(Error);
      expect(reconnectStrategy(100)).toBeInstanceOf(Error);
    });

    it('deve logar tentativas de reconexão com informações corretas', () => {
      reconnectStrategy(1);
      expect(logger.info).toHaveBeenCalledWith(
        { tentativa: 1, maxTentativas: 5, delay: 1000 },
        'Tentativa de reconexão Redis'
      );

      reconnectStrategy(3);
      expect(logger.info).toHaveBeenCalledWith(
        { tentativa: 3, maxTentativas: 5, delay: 4000 },
        'Tentativa de reconexão Redis'
      );
    });

    it('deve logar erro ao exceder máximo de tentativas', () => {
      reconnectStrategy(6);

      expect(logger.error).toHaveBeenCalledWith(
        { maxRetries: 5 },
        'Falha ao conectar Redis após múltiplas tentativas'
      );
    });

    it('deve calcular delay corretamente para múltiplas tentativas', () => {
      const delays = [
        { retry: 1, expected: 1000 },
        { retry: 2, expected: 2000 },
        { retry: 3, expected: 4000 },
        { retry: 4, expected: 8000 },
        { retry: 5, expected: 16000 },
      ];

      delays.forEach(({ retry, expected }) => {
        expect(reconnectStrategy(retry)).toBe(expected);
      });
    });
  });

  describe('4. Operações de Cache - SET', () => {
    let cacheSet: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheSet = module.cacheSet;
    });

    it('deve armazenar string com TTL customizado', async () => {
      await cacheSet('chave-teste', 'valor-teste', 7200);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-teste',
        'valor-teste',
        { EX: 7200 }
      );
    });

    it('deve armazenar string com TTL padrão (3600s)', async () => {
      await cacheSet('chave-teste', 'valor-teste');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-teste',
        'valor-teste',
        { EX: 3600 }
      );
    });

    it('deve serializar objeto simples para JSON', async () => {
      const objeto = { nome: 'Teste', valor: 123 };

      await cacheSet('chave-objeto', objeto, 3600);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-objeto',
        JSON.stringify(objeto),
        { EX: 3600 }
      );
    });

    it('deve serializar objeto complexo para JSON', async () => {
      const objetoComplexo = {
        id: 1,
        nome: 'Teste',
        dados: {
          nested: true,
          array: [1, 2, 3],
        },
        timestamp: new Date().toISOString(),
      };

      await cacheSet('chave-complexa', objetoComplexo, 1800);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-complexa',
        JSON.stringify(objetoComplexo),
        { EX: 1800 }
      );
    });

    it('deve armazenar array como JSON', async () => {
      const array = [1, 2, 3, 4, 5];

      await cacheSet('chave-array', array);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-array',
        JSON.stringify(array),
        { EX: 3600 }
      );
    });

    it('deve armazenar com TTL zero (usa default por ser falsy)', async () => {
      await cacheSet('chave-teste', 'valor', 0);

      // TTL 0 é falsy, então usa DEFAULT_TTL (3600)
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-teste',
        'valor',
        { EX: 3600 }
      );
    });

    it('deve armazenar com TTL undefined (usa default)', async () => {
      await cacheSet('chave-teste', 'valor', undefined);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-teste',
        'valor',
        { EX: 3600 }
      );
    });

    it('deve armazenar com TTL null (usa default)', async () => {
      await cacheSet('chave-teste', 'valor', null as any);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'chave-teste',
        'valor',
        { EX: 3600 }
      );
    });

    it('deve retornar sem erro quando Redis não estiver conectado (isOpen false)', async () => {
      mockRedisClient.isOpen = false;

      await cacheSet('chave-teste', 'valor-teste');

      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis não conectado, operação SET ignorada'
      );
    });

    it('deve retornar sem erro quando Redis não estiver pronto (isReady false)', async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = false;

      await cacheSet('chave-teste', 'valor-teste');

      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis não conectado, operação SET ignorada'
      );
    });

    it('deve capturar e logar erro do Redis', async () => {
      const erroSet = new Error('Set failed');
      mockRedisClient.set.mockRejectedValueOnce(erroSet);

      await expect(cacheSet('chave-teste', 'valor-teste')).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        { err: erroSet, key: 'chave-teste' },
        'Erro ao executar SET no Redis'
      );
    });

    it('deve capturar erro com diferentes mensagens', async () => {
      const erros = [
        new Error('Connection lost'),
        new Error('Timeout'),
        { message: 'Custom error' },
      ];

      for (const erro of erros) {
        mockRedisClient.set.mockRejectedValueOnce(erro);
        await cacheSet('chave', 'valor');

        expect(logger.error).toHaveBeenCalledWith(
          { err: erro, key: 'chave' },
          'Erro ao executar SET no Redis'
        );
      }
    });
  });

  describe('5. Operações de Cache - GET', () => {
    let cacheGet: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheGet = module.cacheGet;
    });

    it('deve retornar valor quando chave existir', async () => {
      mockRedisClient.get.mockResolvedValue('valor-armazenado');

      const resultado = await cacheGet('chave-teste');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe('valor-armazenado');
    });

    it('deve retornar null quando chave não existir', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const resultado = await cacheGet('chave-inexistente');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-inexistente');
      expect(resultado).toBeNull();
    });

    it('deve retornar valor JSON serializado', async () => {
      const objetoJson = JSON.stringify({ test: 'data' });
      mockRedisClient.get.mockResolvedValue(objetoJson);

      const resultado = await cacheGet('chave-json');

      expect(resultado).toBe(objetoJson);
    });

    it('deve retornar string vazia', async () => {
      mockRedisClient.get.mockResolvedValue('');

      const resultado = await cacheGet('chave-vazia');

      expect(resultado).toBe('');
    });

    it('deve retornar null quando Redis não estiver conectado (isOpen false)', async () => {
      mockRedisClient.isOpen = false;

      const resultado = await cacheGet('chave-teste');

      expect(resultado).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis não conectado, operação GET retornando null'
      );
    });

    it('deve retornar null quando Redis não estiver pronto (isReady false)', async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = false;

      const resultado = await cacheGet('chave-teste');

      expect(resultado).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('deve retornar null em caso de erro', async () => {
      const erroGet = new Error('Get failed');
      mockRedisClient.get.mockRejectedValueOnce(erroGet);

      const resultado = await cacheGet('chave-teste');

      expect(resultado).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroGet, key: 'chave-teste' },
        'Erro ao executar GET no Redis'
      );
    });

    it('deve tratar múltiplos erros consecutivos', async () => {
      const erros = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3'),
      ];

      for (const erro of erros) {
        mockRedisClient.get.mockRejectedValueOnce(erro);
        const resultado = await cacheGet('chave');

        expect(resultado).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
          { err: erro, key: 'chave' },
          'Erro ao executar GET no Redis'
        );
      }
    });
  });

  describe('6. Operações de Cache - DEL', () => {
    let cacheDel: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheDel = module.cacheDel;
    });

    it('deve deletar uma chave com sucesso', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const resultado = await cacheDel('chave-teste');

      expect(mockRedisClient.del).toHaveBeenCalledWith(['chave-teste']);
      expect(resultado).toBe(1);
    });

    it('deve deletar múltiplas chaves', async () => {
      mockRedisClient.del.mockResolvedValue(3);

      const resultado = await cacheDel('chave1', 'chave2', 'chave3');

      expect(mockRedisClient.del).toHaveBeenCalledWith(['chave1', 'chave2', 'chave3']);
      expect(resultado).toBe(3);
    });

    it('deve deletar grande quantidade de chaves', async () => {
      const chaves = Array.from({ length: 100 }, (_, i) => `chave${i}`);
      mockRedisClient.del.mockResolvedValue(100);

      const resultado = await cacheDel(...chaves);

      expect(mockRedisClient.del).toHaveBeenCalledWith(chaves);
      expect(resultado).toBe(100);
    });

    it('deve retornar 0 quando não houver chaves para deletar', async () => {
      const resultado = await cacheDel();

      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando array de chaves estiver vazio', async () => {
      const resultado = await cacheDel(...[]);

      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando chave não existir', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const resultado = await cacheDel('chave-inexistente');

      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheDel('chave-teste');

      expect(resultado).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis não conectado, operação DEL ignorada'
      );
    });

    it('deve retornar 0 em caso de erro', async () => {
      const erroDel = new Error('Del failed');
      mockRedisClient.del.mockRejectedValueOnce(erroDel);

      const resultado = await cacheDel('chave-teste');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroDel, keys: ['chave-teste'] },
        'Erro ao executar DEL no Redis'
      );
    });

    it('deve logar erro com múltiplas chaves', async () => {
      const erroDel = new Error('Del failed');
      mockRedisClient.del.mockRejectedValueOnce(erroDel);

      await cacheDel('chave1', 'chave2');

      expect(logger.error).toHaveBeenCalledWith(
        { err: erroDel, keys: ['chave1', 'chave2'] },
        'Erro ao executar DEL no Redis'
      );
    });
  });

  describe('7. Operações de Cache - DEL PATTERN', () => {
    let cacheDelPattern: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheDelPattern = module.cacheDelPattern;
    });

    it('deve deletar chaves que correspondem ao padrão', async () => {
      mockRedisClient.keys.mockResolvedValue(['usuario:1', 'usuario:2', 'usuario:3']);
      mockRedisClient.del.mockResolvedValue(3);

      const resultado = await cacheDelPattern('usuario:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('usuario:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'usuario:1',
        'usuario:2',
        'usuario:3',
      ]);
      expect(resultado).toBe(3);
    });

    it('deve deletar com padrão complexo', async () => {
      mockRedisClient.keys.mockResolvedValue(['cache:user:123', 'cache:user:456']);
      mockRedisClient.del.mockResolvedValue(2);

      const resultado = await cacheDelPattern('cache:user:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('cache:user:*');
      expect(resultado).toBe(2);
    });

    it('deve retornar 0 quando nenhuma chave corresponder', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const resultado = await cacheDelPattern('inexistente:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('inexistente:*');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
      expect(resultado).toBe(0);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheDelPattern('teste:*');

      expect(resultado).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis não conectado, operação DEL PATTERN ignorada'
      );
    });

    it('deve retornar 0 em caso de erro ao buscar chaves', async () => {
      const erroKeys = new Error('Keys failed');
      mockRedisClient.keys.mockRejectedValueOnce(erroKeys);

      const resultado = await cacheDelPattern('teste:*');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroKeys, pattern: 'teste:*' },
        'Erro ao executar DEL PATTERN no Redis'
      );
    });

    it('deve retornar 0 em caso de erro ao deletar chaves', async () => {
      mockRedisClient.keys.mockResolvedValue(['chave1', 'chave2']);
      const erroDel = new Error('Del failed');
      mockRedisClient.del.mockRejectedValueOnce(erroDel);

      const resultado = await cacheDelPattern('test:*');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroDel, pattern: 'test:*' },
        'Erro ao executar DEL PATTERN no Redis'
      );
    });

    it('deve deletar grande quantidade de chaves por padrão', async () => {
      const chaves = Array.from({ length: 1000 }, (_, i) => `session:${i}`);
      mockRedisClient.keys.mockResolvedValue(chaves);
      mockRedisClient.del.mockResolvedValue(1000);

      const resultado = await cacheDelPattern('session:*');

      expect(resultado).toBe(1000);
    });
  });

  describe('8. Operações de Cache - EXISTS', () => {
    let cacheExists: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheExists = module.cacheExists;
    });

    it('deve retornar true quando chave existir', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const resultado = await cacheExists('chave-teste');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe(true);
    });

    it('deve retornar false quando chave não existir', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const resultado = await cacheExists('chave-inexistente');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('chave-inexistente');
      expect(resultado).toBe(false);
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheExists('chave-teste');

      expect(resultado).toBe(false);
      expect(mockRedisClient.exists).not.toHaveBeenCalled();
    });

    it('deve retornar false em caso de erro', async () => {
      const erroExists = new Error('Exists failed');
      mockRedisClient.exists.mockRejectedValueOnce(erroExists);

      const resultado = await cacheExists('chave-teste');

      expect(resultado).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroExists, key: 'chave-teste' },
        'Erro ao executar EXISTS no Redis'
      );
    });

    it('deve verificar múltiplas chaves sequencialmente', async () => {
      mockRedisClient.exists
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      expect(await cacheExists('chave1')).toBe(true);
      expect(await cacheExists('chave2')).toBe(false);
      expect(await cacheExists('chave3')).toBe(true);
    });
  });

  describe('9. Operações de Cache - EXPIRE', () => {
    let cacheExpire: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheExpire = module.cacheExpire;
    });

    it('deve definir TTL para chave existente', async () => {
      mockRedisClient.expire.mockResolvedValue(1);

      const resultado = await cacheExpire('chave-teste', 7200);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('chave-teste', 7200);
      expect(resultado).toBe(true);
    });

    it('deve retornar false quando chave não existir', async () => {
      mockRedisClient.expire.mockResolvedValue(0);

      const resultado = await cacheExpire('chave-inexistente', 3600);

      expect(resultado).toBe(false);
    });

    it('deve definir TTL curto (1 segundo)', async () => {
      mockRedisClient.expire.mockResolvedValue(1);

      const resultado = await cacheExpire('chave-temporaria', 1);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('chave-temporaria', 1);
      expect(resultado).toBe(true);
    });

    it('deve definir TTL longo (1 dia)', async () => {
      mockRedisClient.expire.mockResolvedValue(1);

      const resultado = await cacheExpire('chave-longa', 86400);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('chave-longa', 86400);
      expect(resultado).toBe(true);
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheExpire('chave-teste', 3600);

      expect(resultado).toBe(false);
      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    it('deve retornar false em caso de erro', async () => {
      const erroExpire = new Error('Expire failed');
      mockRedisClient.expire.mockRejectedValueOnce(erroExpire);

      const resultado = await cacheExpire('chave-teste', 3600);

      expect(resultado).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroExpire, key: 'chave-teste', ttl: 3600 },
        'Erro ao executar EXPIRE no Redis'
      );
    });
  });

  describe('10. Operações de Cache - TTL', () => {
    let cacheTTL: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheTTL = module.cacheTTL;
    });

    it('deve retornar TTL restante da chave', async () => {
      mockRedisClient.ttl.mockResolvedValue(3600);

      const resultado = await cacheTTL('chave-teste');

      expect(mockRedisClient.ttl).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe(3600);
    });

    it('deve retornar -1 quando chave não tiver TTL', async () => {
      mockRedisClient.ttl.mockResolvedValue(-1);

      const resultado = await cacheTTL('chave-sem-ttl');

      expect(resultado).toBe(-1);
    });

    it('deve retornar -2 quando chave não existir', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);

      const resultado = await cacheTTL('chave-inexistente');

      expect(resultado).toBe(-2);
    });

    it('deve retornar TTL específico (100 segundos)', async () => {
      mockRedisClient.ttl.mockResolvedValue(100);

      const resultado = await cacheTTL('chave');

      expect(resultado).toBe(100);
    });

    it('deve retornar -2 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheTTL('chave-teste');

      expect(resultado).toBe(-2);
      expect(mockRedisClient.ttl).not.toHaveBeenCalled();
    });

    it('deve retornar -2 em caso de erro', async () => {
      const erroTTL = new Error('TTL failed');
      mockRedisClient.ttl.mockRejectedValueOnce(erroTTL);

      const resultado = await cacheTTL('chave-teste');

      expect(resultado).toBe(-2);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroTTL, key: 'chave-teste' },
        'Erro ao executar TTL no Redis'
      );
    });
  });

  describe('11. Operações de Cache - INCR', () => {
    let cacheIncr: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheIncr = module.cacheIncr;
    });

    it('deve incrementar contador em 1 por padrão', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      const resultado = await cacheIncr('contador');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('contador');
      expect(resultado).toBe(1);
    });

    it('deve incrementar contador em valor customizado', async () => {
      mockRedisClient.incrBy.mockResolvedValue(10);

      const resultado = await cacheIncr('contador', 10);

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('contador', 10);
      expect(resultado).toBe(10);
    });

    it('deve incrementar em valores grandes', async () => {
      mockRedisClient.incrBy.mockResolvedValue(1000);

      const resultado = await cacheIncr('contador', 1000);

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('contador', 1000);
      expect(resultado).toBe(1000);
    });

    it('deve usar incr quando increment for 1', async () => {
      mockRedisClient.incr.mockResolvedValue(5);

      const resultado = await cacheIncr('views', 1);

      expect(mockRedisClient.incr).toHaveBeenCalledWith('views');
      expect(mockRedisClient.incrBy).not.toHaveBeenCalled();
      expect(resultado).toBe(5);
    });

    it('deve usar incrBy quando increment for diferente de 1', async () => {
      mockRedisClient.incrBy.mockResolvedValue(25);

      const resultado = await cacheIncr('score', 5);

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('score', 5);
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
      expect(resultado).toBe(25);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheIncr('contador');

      expect(resultado).toBe(0);
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });

    it('deve retornar 0 em caso de erro', async () => {
      const erroIncr = new Error('Incr failed');
      mockRedisClient.incr.mockRejectedValueOnce(erroIncr);

      const resultado = await cacheIncr('contador');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroIncr, key: 'contador', increment: 1 },
        'Erro ao executar INCR no Redis'
      );
    });

    it('deve retornar 0 em caso de erro no incrBy', async () => {
      const erroIncrBy = new Error('IncrBy failed');
      mockRedisClient.incrBy.mockRejectedValueOnce(erroIncrBy);

      const resultado = await cacheIncr('contador', 5);

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroIncrBy, key: 'contador', increment: 5 },
        'Erro ao executar INCR no Redis'
      );
    });
  });

  describe('12. Operações de Cache - DECR', () => {
    let cacheDecr: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheDecr = module.cacheDecr;
    });

    it('deve decrementar contador em 1 por padrão', async () => {
      mockRedisClient.decr.mockResolvedValue(9);

      const resultado = await cacheDecr('contador');

      expect(mockRedisClient.decr).toHaveBeenCalledWith('contador');
      expect(resultado).toBe(9);
    });

    it('deve decrementar contador em valor customizado', async () => {
      mockRedisClient.decrBy.mockResolvedValue(5);

      const resultado = await cacheDecr('contador', 5);

      expect(mockRedisClient.decrBy).toHaveBeenCalledWith('contador', 5);
      expect(resultado).toBe(5);
    });

    it('deve decrementar em valores grandes', async () => {
      mockRedisClient.decrBy.mockResolvedValue(0);

      const resultado = await cacheDecr('estoque', 100);

      expect(mockRedisClient.decrBy).toHaveBeenCalledWith('estoque', 100);
      expect(resultado).toBe(0);
    });

    it('deve usar decr quando decrement for 1', async () => {
      mockRedisClient.decr.mockResolvedValue(99);

      const resultado = await cacheDecr('tentativas', 1);

      expect(mockRedisClient.decr).toHaveBeenCalledWith('tentativas');
      expect(mockRedisClient.decrBy).not.toHaveBeenCalled();
      expect(resultado).toBe(99);
    });

    it('deve usar decrBy quando decrement for diferente de 1', async () => {
      mockRedisClient.decrBy.mockResolvedValue(50);

      const resultado = await cacheDecr('creditos', 10);

      expect(mockRedisClient.decrBy).toHaveBeenCalledWith('creditos', 10);
      expect(mockRedisClient.decr).not.toHaveBeenCalled();
      expect(resultado).toBe(50);
    });

    it('deve retornar 0 quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheDecr('contador');

      expect(resultado).toBe(0);
      expect(mockRedisClient.decr).not.toHaveBeenCalled();
    });

    it('deve retornar 0 em caso de erro', async () => {
      const erroDecr = new Error('Decr failed');
      mockRedisClient.decr.mockRejectedValueOnce(erroDecr);

      const resultado = await cacheDecr('contador');

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroDecr, key: 'contador', decrement: 1 },
        'Erro ao executar DECR no Redis'
      );
    });

    it('deve retornar 0 em caso de erro no decrBy', async () => {
      const erroDecrBy = new Error('DecrBy failed');
      mockRedisClient.decrBy.mockRejectedValueOnce(erroDecrBy);

      const resultado = await cacheDecr('contador', 3);

      expect(resultado).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroDecrBy, key: 'contador', decrement: 3 },
        'Erro ao executar DECR no Redis'
      );
    });
  });

  describe('13. Operações de Cache - FLUSH', () => {
    let cacheFlush: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      cacheFlush = module.cacheFlush;
    });

    it('deve limpar todo o cache com sucesso', async () => {
      mockRedisClient.flushDb.mockResolvedValue('OK');

      const resultado = await cacheFlush();

      expect(mockRedisClient.flushDb).toHaveBeenCalled();
      expect(resultado).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Cache Redis limpo com sucesso');
    });

    it('deve retornar false quando Redis não estiver conectado', async () => {
      mockRedisClient.isOpen = false;
      mockRedisClient.isReady = false;

      const resultado = await cacheFlush();

      expect(resultado).toBe(false);
      expect(mockRedisClient.flushDb).not.toHaveBeenCalled();
    });

    it('deve retornar false em caso de erro', async () => {
      const erroFlush = new Error('Flush failed');
      mockRedisClient.flushDb.mockRejectedValueOnce(erroFlush);

      const resultado = await cacheFlush();

      expect(resultado).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: erroFlush },
        'Erro ao executar FLUSH no Redis'
      );
    });

    it('deve logar sucesso apenas uma vez', async () => {
      mockRedisClient.flushDb.mockResolvedValue('OK');

      await cacheFlush();

      const infoCalls = (logger.info as any).mock.calls.filter(
        (call: any[]) => call[0] === 'Cache Redis limpo com sucesso'
      );
      expect(infoCalls.length).toBe(1);
    });
  });

  describe('14. Funções Utilitárias', () => {
    let isRedisConnected: Function;
    let waitForRedis: Function;
    let cacheInfo: Function;
    let cacheHealthCheck: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      isRedisConnected = module.isRedisConnected;
      waitForRedis = module.waitForRedis;
      cacheInfo = module.cacheInfo;
      cacheHealthCheck = module.cacheHealthCheck;
    });

    describe('14.1. isRedisConnected', () => {
      it('deve retornar true quando conectado e pronto', () => {
        mockRedisClient.isOpen = true;
        mockRedisClient.isReady = true;

        expect(isRedisConnected()).toBe(true);
      });

      it('deve retornar false quando não conectado (isOpen false)', () => {
        mockRedisClient.isOpen = false;
        mockRedisClient.isReady = true;

        expect(isRedisConnected()).toBe(false);
      });

      it('deve retornar false quando não pronto (isReady false)', () => {
        mockRedisClient.isOpen = true;
        mockRedisClient.isReady = false;

        expect(isRedisConnected()).toBe(false);
      });

      it('deve retornar false quando ambos forem false', () => {
        mockRedisClient.isOpen = false;
        mockRedisClient.isReady = false;

        expect(isRedisConnected()).toBe(false);
      });
    });

    describe('14.2. waitForRedis', () => {
      it('deve retornar true quando Redis estiver pronto', async () => {
        mockRedisClient.isOpen = true;
        mockRedisClient.isReady = true;

        const resultado = await waitForRedis(1000);

        expect(resultado).toBe(true);
      });

      it('deve retornar false quando timeout for excedido', async () => {
        mockRedisClient.isOpen = false;
        mockRedisClient.isReady = false;

        const resultado = await waitForRedis(100);

        expect(resultado).toBe(false);
      }, 10000);

      it('deve aguardar até Redis ficar pronto', async () => {
        mockRedisClient.isOpen = false;
        mockRedisClient.isReady = false;

        setTimeout(() => {
          mockRedisClient.isOpen = true;
          mockRedisClient.isReady = true;
        }, 50);

        const resultado = await waitForRedis(500);

        expect(resultado).toBe(true);
      });

      it('deve usar timeout padrão de 10000ms', async () => {
        mockRedisClient.isOpen = true;
        mockRedisClient.isReady = true;

        const resultado = await waitForRedis();

        expect(resultado).toBe(true);
      });

      it('deve aguardar múltiplas verificações antes de timeout', async () => {
        mockRedisClient.isOpen = false;
        mockRedisClient.isReady = false;

        const startTime = Date.now();
        const resultado = await waitForRedis(300);
        const elapsed = Date.now() - startTime;

        expect(resultado).toBe(false);
        expect(elapsed).toBeGreaterThanOrEqual(250);
      }, 10000);
    });

    describe('14.3. cacheInfo', () => {
      it('deve retornar informações corretas do Redis', async () => {
        mockRedisClient.isOpen = true;
        mockRedisClient.isReady = true;

        const info = await cacheInfo();

        expect(info).toMatchObject({
          connected: true,
          ready: true,
          host: 'localhost',
          port: 6379,
          db: 0,
        });
      });

      it('deve refletir estado desconectado', async () => {
        mockRedisClient.isOpen = false;
        mockRedisClient.isReady = false;

        const info = await cacheInfo();

        expect(info.connected).toBe(false);
        expect(info.ready).toBe(false);
      });

      it('deve retornar informações com configurações customizadas', async () => {
        process.env.REDIS_HOST = 'custom-redis';
        process.env.REDIS_PORT = '6380';
        process.env.REDIS_DB = '3';

        vi.resetModules();
        (createClient as any).mockClear();
        (createClient as any).mockReturnValue(mockRedisClient);

        const module = await import('../../infrastructure/database/redis/client');
        const info = await module.cacheInfo();

        expect(info.host).toBe('custom-redis');
        expect(info.port).toBe(6380);
        expect(info.db).toBe(3);
      });
    });

    describe('14.4. cacheHealthCheck', () => {
      it('deve retornar healthy quando conectado', async () => {
        mockRedisClient.ping.mockResolvedValue('PONG');

        const health = await cacheHealthCheck();

        expect(health.status).toBe('healthy');
        expect(health).toHaveProperty('latency');
        expect(typeof health.latency).toBe('number');
        expect(health.latency).toBeGreaterThanOrEqual(0);
      });

      it('deve calcular latência corretamente', async () => {
        mockRedisClient.ping.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 10))
        );

        const health = await cacheHealthCheck();

        expect(health.status).toBe('healthy');
        expect(health.latency).toBeGreaterThanOrEqual(0);
      });

      it('deve retornar unhealthy quando não conectado', async () => {
        mockRedisClient.isOpen = false;
        mockRedisClient.isReady = false;

        const health = await cacheHealthCheck();

        expect(health.status).toBe('unhealthy');
        expect(health.error).toBe('Redis não conectado');
        expect(health.latency).toBeUndefined();
      });

      it('deve retornar unhealthy em caso de erro no ping', async () => {
        mockRedisClient.ping.mockRejectedValueOnce(new Error('Ping failed'));

        const health = await cacheHealthCheck();

        expect(health.status).toBe('unhealthy');
        expect(health.error).toBe('Ping failed');
        expect(health.latency).toBeUndefined();
      });

      it('deve tratar diferentes tipos de erro', async () => {
        const erros = [
          new Error('Network error'),
          new Error('Timeout'),
          { message: 'Custom error' },
        ];

        for (const erro of erros) {
          mockRedisClient.ping.mockRejectedValueOnce(erro);
          const health = await cacheHealthCheck();

          expect(health.status).toBe('unhealthy');
          expect(health.error).toBe(
            erro instanceof Error ? erro.message : 'Custom error'
          );
        }
      });
    });
  });

  describe('15. Graceful Shutdown', () => {
    let disconnectRedis: Function;

    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      const module = await import('../../infrastructure/database/redis/client');
      disconnectRedis = module.disconnectRedis;
    });

    it('deve desconectar gracefully quando conectado', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await disconnectRedis();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Redis desconectado com sucesso');
    });

    it('não deve chamar quit quando já desconectado', async () => {
      mockRedisClient.isOpen = false;

      await disconnectRedis();

      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });

    it('deve capturar erro ao desconectar', async () => {
      const erroQuit = new Error('Quit failed');
      mockRedisClient.quit.mockRejectedValueOnce(erroQuit);

      await disconnectRedis();

      expect(logger.error).toHaveBeenCalledWith(
        { err: erroQuit },
        'Erro ao desconectar Redis'
      );
    });

    it('deve tratar múltiplas tentativas de desconexão', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await disconnectRedis();
      
      // Segunda chamada: isOpen ainda é true, então quit é chamado novamente
      await disconnectRedis();

      // Sem proteção de estado, quit será chamado 2 vezes
      expect(mockRedisClient.quit).toHaveBeenCalledTimes(2);
    });

    it('deve capturar diferentes tipos de erro ao desconectar', async () => {
      const erros = [
        new Error('Network error'),
        new Error('Already closed'),
        { message: 'Custom error' },
      ];

      for (const erro of erros) {
        mockRedisClient.isOpen = true;
        mockRedisClient.quit.mockRejectedValueOnce(erro);

        await disconnectRedis();

        expect(logger.error).toHaveBeenCalledWith(
          { err: erro },
          'Erro ao desconectar Redis'
        );
      }
    });
  });

  describe('16. Cenários de Integração e Edge Cases', () => {
    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);
    });

    it('deve lidar com reconexão durante operação', async () => {
      const { cacheSet } = await import('../../infrastructure/database/redis/client');

      mockRedisClient.isOpen = false;
      await cacheSet('teste', 'valor');
      expect(logger.warn).toHaveBeenCalled();

      mockRedisClient.isOpen = true;
      await cacheSet('teste', 'valor');
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('deve lidar com múltiplas operações simultâneas', async () => {
      const { cacheSet, cacheGet, cacheExists } = await import(
        '../../infrastructure/database/redis/client'
      );

      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue('valor');
      mockRedisClient.exists.mockResolvedValue(1);

      const promises = [
        cacheSet('key1', 'value1'),
        cacheGet('key2'),
        cacheExists('key3'),
      ];

      await Promise.all(promises);

      expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.exists).toHaveBeenCalledTimes(1);
    });

    it('deve lidar com valores especiais no cache', async () => {
      const { cacheSet } = await import('../../infrastructure/database/redis/client');

      // Testa null - será serializado como objeto
      await cacheSet('special', null as any);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'special',
        'null', // JSON.stringify(null) = 'null'
        expect.any(Object)
      );

      // Testa undefined - typeof undefined !== 'object', então passa direto
      mockRedisClient.set.mockClear();
      await cacheSet('special', undefined as any);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'special',
        undefined, // undefined passa como está (não é objeto)
        expect.any(Object)
      );

      // Testa número zero - typeof 0 === 'number', não é objeto
      mockRedisClient.set.mockClear();
      await cacheSet('special', 0 as any);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'special',
        0, // number passa direto
        expect.any(Object)
      );

      // Testa boolean false - typeof false === 'boolean', não é objeto
      mockRedisClient.set.mockClear();
      await cacheSet('special', false as any);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'special',
        false, // boolean passa direto
        expect.any(Object)
      );

      // Testa string vazia
      mockRedisClient.set.mockClear();
      await cacheSet('special', '');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'special',
        '', // string passa direto
        expect.any(Object)
      );
    });

    it('deve lidar com objetos circulares sem lançar erro', async () => {
      const { cacheSet } = await import('../../infrastructure/database/redis/client');

      const circular: any = { a: 1 };
      circular.self = circular;

      // JSON.stringify lança erro, mas o código captura e loga
      // Então a promise resolve normalmente (não rejeita)
      await expect(cacheSet('circular', circular)).resolves.toBeUndefined();

      // Verifica que o erro foi logado
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(TypeError),
          key: 'circular'
        }),
        'Erro ao executar SET no Redis'
      );
    });

    it('deve lidar com TTL negativo', async () => {
      const { cacheExpire } = await import('../../infrastructure/database/redis/client');

      mockRedisClient.expire.mockResolvedValue(1);

      await cacheExpire('key', -1);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('key', -1);
    });

    it('deve lidar com chaves vazias', async () => {
      const { cacheSet, cacheGet, cacheDel } = await import(
        '../../infrastructure/database/redis/client'
      );

      await cacheSet('', 'valor');
      expect(mockRedisClient.set).toHaveBeenCalledWith('', 'valor', expect.any(Object));

      await cacheGet('');
      expect(mockRedisClient.get).toHaveBeenCalledWith('');

      await cacheDel('');
      expect(mockRedisClient.del).toHaveBeenCalledWith(['']);
    });

    it('deve lidar com padrões vazios no delPattern', async () => {
      const { cacheDelPattern } = await import(
        '../../infrastructure/database/redis/client'
      );

      mockRedisClient.keys.mockResolvedValue([]);

      const resultado = await cacheDelPattern('');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('');
      expect(resultado).toBe(0);
    });

    it('deve manter consistência em operações sequenciais', async () => {
      const { cacheSet, cacheGet, cacheIncr, cacheDel } = await import(
        '../../infrastructure/database/redis/client'
      );

      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue('10');
      mockRedisClient.incr.mockResolvedValue(11);
      mockRedisClient.del.mockResolvedValue(1);

      await cacheSet('contador', '10');
      const valor = await cacheGet('contador');
      await cacheIncr('contador');
      await cacheDel('contador');

      expect(valor).toBe('10');
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.get).toHaveBeenCalled();
      expect(mockRedisClient.incr).toHaveBeenCalled();
      expect(mockRedisClient.del).toHaveBeenCalled();
    });
  });

  describe('17. Testes de Limites e Performance', () => {
    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      mockRedisClient.isReady = true;

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);
    });

    it('deve lidar com valores muito grandes', async () => {
      const { cacheSet } = await import('../../infrastructure/database/redis/client');

      const valorGrande = 'x'.repeat(1000000); // 1MB
      await cacheSet('big-value', valorGrande);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'big-value',
        valorGrande,
        expect.any(Object)
      );
    });

    it('deve lidar com muitas chaves no delPattern', async () => {
      const { cacheDelPattern } = await import(
        '../../infrastructure/database/redis/client'
      );

      const chavesGrandes = Array.from({ length: 10000 }, (_, i) => `key:${i}`);
      mockRedisClient.keys.mockResolvedValue(chavesGrandes);
      mockRedisClient.del.mockResolvedValue(10000);

      const resultado = await cacheDelPattern('key:*');

      expect(resultado).toBe(10000);
      expect(mockRedisClient.del).toHaveBeenCalledWith(chavesGrandes);
    });

    it('deve lidar com TTL muito longo', async () => {
      const { cacheSet } = await import('../../infrastructure/database/redis/client');

      const umAno = 31536000; // segundos em um ano
      await cacheSet('long-ttl', 'valor', umAno);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'long-ttl',
        'valor',
        { EX: umAno }
      );
    });

    it('deve lidar com incrementos/decrementos grandes', async () => {
      const { cacheIncr, cacheDecr } = await import(
        '../../infrastructure/database/redis/client'
      );

      mockRedisClient.incrBy.mockResolvedValue(1000000);
      mockRedisClient.decrBy.mockResolvedValue(0);

      await cacheIncr('counter', 1000000);
      await cacheDecr('counter', 1000000);

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('counter', 1000000);
      expect(mockRedisClient.decrBy).toHaveBeenCalledWith('counter', 1000000);
    });
  });

  describe('18. Testes de Configuração Avançada', () => {
    it('deve configurar connectTimeout corretamente', async () => {
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../infrastructure/database/redis/client');

      const callArgs = (createClient as any).mock.calls[0][0];
      expect(callArgs.socket.connectTimeout).toBe(5000);
    });

    it('deve configurar commandsQueueMaxLength', async () => {
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../infrastructure/database/redis/client');

      const callArgs = (createClient as any).mock.calls[0][0];
      expect(callArgs.commandsQueueMaxLength).toBe(1000);
    });

    it('deve configurar disableOfflineQueue', async () => {
      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../infrastructure/database/redis/client');

      const callArgs = (createClient as any).mock.calls[0][0];
      expect(callArgs.disableOfflineQueue).toBe(false);
    });

    it('deve criar URL correta com todos os parâmetros', async () => {
      process.env.REDIS_HOST = 'prod-redis.example.com';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'super_secret_password_123';
      process.env.REDIS_DB = '5';

      vi.resetModules();
      (createClient as any).mockClear();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../infrastructure/database/redis/client');

      const callArgs = (createClient as any).mock.calls[0][0];
      expect(callArgs.url).toBe(
        'redis://:super_secret_password_123@prod-redis.example.com:6380/5'
      );
    });
  });
});