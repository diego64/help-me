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

  beforeEach(() => {
    connectCallback = null;
    errorCallback = null;
    readyCallback = null;

    mockRedisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, callback: any) => {
        if (event === 'connect') {
          connectCallback = callback;
        } else if (event === 'error') {
          errorCallback = callback;
        } else if (event === 'ready') {
          readyCallback = callback;
        }
      }),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      isOpen: false
    };

    (createClient as any).mockReturnValue(mockRedisClient);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Dado que o módulo Redis é importado, Quando inicializar, Então deve criar e conectar o cliente', () => {
    it('deve criar cliente Redis com URL correta usando variáveis de ambiente padrão', async () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;

      await import('../../services/redisClient');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://:redis_helpme_password@localhost:6379',
        socket: {
          reconnectStrategy: expect.any(Function)
        }
      });
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('deve criar cliente Redis com URL customizada quando variáveis de ambiente estiverem definidas', async () => {
      process.env.REDIS_HOST = 'redis-server';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'custom_password';

      vi.resetModules();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('../../services/redisClient');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://:custom_password@redis-server:6380',
        socket: {
          reconnectStrategy: expect.any(Function)
        }
      });
    });
  });

  describe('Dado que o cliente Redis dispara eventos, Quando conectar ou ocorrer erro, Então deve logar adequadamente', () => {
    it('deve logar mensagem de sucesso quando evento connect for disparado', async () => {
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      
      connectCallback();

      expect(console.log).toHaveBeenCalledWith('[REDIS] Conectado com sucesso');
    });

    it('deve logar quando evento ready for disparado', async () => {
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      
      readyCallback();

      expect(console.log).toHaveBeenCalledWith('[REDIS] Redis pronto para uso');
    });

    it('deve logar erro quando evento error for disparado', async () => {
      await import('../../services/redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));

      const erro = new Error('Falha na conexão');
      errorCallback(erro);

      expect(console.error).toHaveBeenCalledWith('[REDIS] Erro:', erro);
    });
  });

  describe('Dado a função cacheSet, Quando armazenar valor, Então deve configurar corretamente com ou sem TTL', () => {
    it('deve armazenar valor com TTL quando TTL for fornecido', async () => {
      const { cacheSet } = await import('../../services/redisClient');

      await cacheSet('chave-teste', 'valor-teste', 3600);

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste', { EX: 3600 });
    });

    it('deve armazenar valor sem TTL quando TTL não for fornecido', async () => {
      const { cacheSet } = await import('../../services/redisClient');

      await cacheSet('chave-teste', 'valor-teste');

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste');
    });
  });

  describe('Dado a função cacheGet, Quando buscar valor, Então deve retornar o valor armazenado', () => {
    it('deve retornar valor quando chave existir', async () => {
      const { cacheGet } = await import('../../services/redisClient');
      mockRedisClient.get.mockResolvedValue('valor-armazenado');

      const resultado = await cacheGet('chave-teste');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe('valor-armazenado');
    });

    it('deve retornar null quando chave não existir', async () => {
      const { cacheGet } = await import('../../services/redisClient');
      mockRedisClient.get.mockResolvedValue(null);

      const resultado = await cacheGet('chave-inexistente');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-inexistente');
      expect(resultado).toBeNull();
    });
  });

  describe('Dado a estratégia de reconexão, Quando houver falhas, Então deve tentar reconectar adequadamente', () => {
    it('deve retornar tempo de espera crescente para tentativas válidas', async () => {
      await import('../../services/redisClient');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      expect(reconnectStrategy(1)).toBe(1000);
      expect(reconnectStrategy(2)).toBe(2000);
      expect(reconnectStrategy(3)).toBe(3000);
    });

    it('deve retornar erro após 3 tentativas', async () => {
      await import('../../services/redisClient');

      const callArgs = (createClient as any).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      const resultado = reconnectStrategy(4);

      expect(resultado).toBeInstanceOf(Error);
      expect((resultado as Error).message).toBe('Máximo de tentativas excedido');
    });
  });
});