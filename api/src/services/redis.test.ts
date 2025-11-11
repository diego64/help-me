import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from 'redis';

vi.mock('redis', () => ({
  createClient: vi.fn()
}));

describe('Redis Client', () => {
  let mockRedisClient: any;
  let connectCallback: any;
  let errorCallback: any;

  beforeEach(() => {
    connectCallback = null;
    errorCallback = null;

    mockRedisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, callback: any) => {
        if (event === 'connect') {
          connectCallback = callback;
        } else if (event === 'error') {
          errorCallback = callback;
        }
      }),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null)
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

      await import('./redisClient');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379'
      });
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('deve criar cliente Redis com URL customizada quando variáveis de ambiente estiverem definidas', async () => {
      process.env.REDIS_HOST = 'redis-server';
      process.env.REDIS_PORT = '6380';

      vi.resetModules();
      (createClient as any).mockReturnValue(mockRedisClient);

      await import('./redisClient');

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://redis-server:6380'
      });
    });
  });

  describe('Dado que o cliente Redis dispara eventos, Quando conectar ou ocorrer erro, Então deve logar adequadamente', () => {
    it('deve logar mensagem de sucesso quando evento connect for disparado', async () => {
      await import('./redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      
      connectCallback();

      expect(console.log).toHaveBeenCalledWith('[Redis] Conectado com sucesso!');
    });

    it('deve logar erro quando evento error for disparado', async () => {
      await import('./redisClient');

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));

      const erro = new Error('Falha na conexão');
      errorCallback(erro);

      expect(console.error).toHaveBeenCalledWith('[Redis][Erro]', erro);
    });
  });

  describe('Dado a função cacheSet, Quando armazenar valor, Então deve configurar corretamente com ou sem TTL', () => {
    it('deve armazenar valor com TTL quando TTL for fornecido', async () => {
      const { cacheSet } = await import('./redisClient');

      await cacheSet('chave-teste', 'valor-teste', 3600);

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste', { EX: 3600 });
    });

    it('deve armazenar valor sem TTL quando TTL não for fornecido', async () => {
      const { cacheSet } = await import('./redisClient');

      await cacheSet('chave-teste', 'valor-teste');

      expect(mockRedisClient.set).toHaveBeenCalledWith('chave-teste', 'valor-teste');
    });
  });

  describe('Dado a função cacheGet, Quando buscar valor, Então deve retornar o valor armazenado', () => {
    it('deve retornar valor quando chave existir', async () => {
      const { cacheGet } = await import('./redisClient');
      mockRedisClient.get.mockResolvedValue('valor-armazenado');

      const resultado = await cacheGet('chave-teste');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-teste');
      expect(resultado).toBe('valor-armazenado');
    });

    it('deve retornar null quando chave não existir', async () => {
      const { cacheGet } = await import('./redisClient');
      mockRedisClient.get.mockResolvedValue(null);

      const resultado = await cacheGet('chave-inexistente');

      expect(mockRedisClient.get).toHaveBeenCalledWith('chave-inexistente');
      expect(resultado).toBeNull();
    });
  });
});