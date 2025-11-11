import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, RedisClientType } from 'redis';

describe('Redis Client E2E', () => {
  let redisClient: RedisClientType;
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  beforeAll(async () => {
    redisClient = createClient({
      url: `redis://${redisHost}:${redisPort}`
    });

    await redisClient.connect();
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  describe('Dado que o Redis está disponível, Quando realizar operações, Então deve funcionar corretamente', () => {
    it('deve conectar com sucesso ao Redis', async () => {
      expect(redisClient.isOpen).toBe(true);
    });

    it('deve armazenar e recuperar um valor sem TTL', async () => {
      const chave = 'teste:sem-ttl';
      const valor = 'valor-teste';

      await redisClient.set(chave, valor);
      const resultado = await redisClient.get(chave);

      expect(resultado).toBe(valor);

      await redisClient.del(chave);
    });

    it('deve armazenar e recuperar um valor com TTL', async () => {
      const chave = 'teste:com-ttl';
      const valor = 'valor-com-ttl';
      const ttl = 10;

      await redisClient.set(chave, valor, { EX: ttl });
      const resultado = await redisClient.get(chave);
      const ttlAtual = await redisClient.ttl(chave);

      expect(resultado).toBe(valor);
      expect(ttlAtual).toBeGreaterThan(0);
      expect(ttlAtual).toBeLessThanOrEqual(ttl);

      await redisClient.del(chave);
    });

    it('deve retornar null para chave inexistente', async () => {
      const resultado = await redisClient.get('chave:inexistente');
      expect(resultado).toBeNull();
    });

    it('deve sobrescrever valor existente', async () => {
      const chave = 'teste:sobrescrever';
      const valorOriginal = 'valor-original';
      const valorNovo = 'valor-novo';

      await redisClient.set(chave, valorOriginal);
      let resultado = await redisClient.get(chave);
      expect(resultado).toBe(valorOriginal);

      await redisClient.set(chave, valorNovo);
      resultado = await redisClient.get(chave);
      expect(resultado).toBe(valorNovo);

      await redisClient.del(chave);
    });

    it('deve deletar chave existente', async () => {
      const chave = 'teste:deletar';
      const valor = 'valor-deletar';

      await redisClient.set(chave, valor);
      let resultado = await redisClient.get(chave);
      expect(resultado).toBe(valor);

      await redisClient.del(chave);
      resultado = await redisClient.get(chave);
      expect(resultado).toBeNull();
    });

    it('deve atualizar TTL de uma chave existente', async () => {
      const chave = 'teste:atualizar-ttl';
      const valor = 'valor-ttl';

      await redisClient.set(chave, valor, { EX: 5 });
      await redisClient.expire(chave, 20);
      const ttlAtual = await redisClient.ttl(chave);

      expect(ttlAtual).toBeGreaterThan(5);
      expect(ttlAtual).toBeLessThanOrEqual(20);

      await redisClient.del(chave);
    });

    it('deve armazenar múltiplas chaves e recuperá-las', async () => {
      const dados = [
        { chave: 'teste:multi:1', valor: 'valor1' },
        { chave: 'teste:multi:2', valor: 'valor2' },
        { chave: 'teste:multi:3', valor: 'valor3' }
      ];

      for (const item of dados) {
        await redisClient.set(item.chave, item.valor);
      }

      for (const item of dados) {
        const resultado = await redisClient.get(item.chave);
        expect(resultado).toBe(item.valor);
      }

      for (const item of dados) {
        await redisClient.del(item.chave);
      }
    });

    it('deve verificar existência de chave', async () => {
      const chave = 'teste:existe';
      const valor = 'valor-existe';

      let existe = await redisClient.exists(chave);
      expect(existe).toBe(0);

      await redisClient.set(chave, valor);
      existe = await redisClient.exists(chave);
      expect(existe).toBe(1);

      await redisClient.del(chave);
      existe = await redisClient.exists(chave);
      expect(existe).toBe(0);
    });

    it('deve armazenar e recuperar valores JSON', async () => {
      const chave = 'teste:json';
      const objeto = { id: 1, nome: 'Teste', ativo: true };
      const valorJson = JSON.stringify(objeto);

      await redisClient.set(chave, valorJson);
      const resultado = await redisClient.get(chave);
      const objetoRecuperado = JSON.parse(resultado!);

      expect(objetoRecuperado).toEqual(objeto);

      await redisClient.del(chave);
    });

    it('deve incrementar valor numérico', async () => {
      const chave = 'teste:contador';

      await redisClient.set(chave, '0');
      await redisClient.incr(chave);
      await redisClient.incr(chave);
      
      const resultado = await redisClient.get(chave);
      expect(resultado).toBe('2');

      await redisClient.del(chave);
    });
  });

  describe('Dado eventos do Redis, Quando ocorrerem, Então deve tratá-los adequadamente', () => {
    it('deve emitir evento de erro quando houver problema de conexão', async () => {
      const clienteComErro = createClient({
        url: 'redis://host-invalido:9999',
        socket: {
          connectTimeout: 1000,
          reconnectStrategy: () => false
        }
      });

      let erroCapturado = false;
      clienteComErro.on('error', () => {
        erroCapturado = true;
      });

      try {
        await clienteComErro.connect();
      } catch (error) {
        expect(erroCapturado).toBe(true);
      }
    });

    it('deve emitir evento de ready quando conexão estiver pronta', async () => {
      const clienteNovo = createClient({
        url: `redis://${redisHost}:${redisPort}`
      });

      const readyPromise = new Promise<void>((resolve) => {
        clienteNovo.on('ready', () => {
          resolve();
        });
      });

      await clienteNovo.connect();
      await readyPromise;

      expect(clienteNovo.isReady).toBe(true);
      await clienteNovo.quit();
    });
  });

  describe('Dado operações com TTL, Quando tempo expirar, Então chave deve ser removida', () => {
    it('deve remover chave após TTL expirar', async () => {
      const chave = 'teste:expiracao';
      const valor = 'valor-expira';
      const ttl = 2;

      await redisClient.set(chave, valor, { EX: ttl });
      
      let resultado = await redisClient.get(chave);
      expect(resultado).toBe(valor);

      await new Promise(resolve => setTimeout(resolve, (ttl + 1) * 1000));

      resultado = await redisClient.get(chave);
      expect(resultado).toBeNull();
    });
  });

  describe('Dado operações de pipeline, Quando executar múltiplos comandos, Então deve processar em lote', () => {
    it('deve executar múltiplos comandos em pipeline', async () => {
      const pipeline = redisClient.multi();

      pipeline.set('teste:pipe:1', 'valor1');
      pipeline.set('teste:pipe:2', 'valor2');
      pipeline.set('teste:pipe:3', 'valor3');

      await pipeline.exec();

      const valor1 = await redisClient.get('teste:pipe:1');
      const valor2 = await redisClient.get('teste:pipe:2');
      const valor3 = await redisClient.get('teste:pipe:3');

      expect(valor1).toBe('valor1');
      expect(valor2).toBe('valor2');
      expect(valor3).toBe('valor3');

      await redisClient.del(['teste:pipe:1', 'teste:pipe:2', 'teste:pipe:3']);
    });
  });
});