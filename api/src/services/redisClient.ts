import { createClient, RedisClientType } from 'redis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_BASE = 1000; // 1 segundo
const DEFAULT_TTL = 3600; // 1 hora
const CONNECTION_TIMEOUT = 5000; // 5 segundos

const redisUrl = REDIS_PASSWORD
  ? `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`
  : `redis://${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`;

export const redisClient: RedisClientType = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > MAX_RETRY_ATTEMPTS) {
        console.error(
          `[REDIS] Falha ao conectar após ${MAX_RETRY_ATTEMPTS} tentativas`
        );
        return new Error('Máximo de tentativas de reconexão excedido');
      }

      const delay = Math.min(
        RETRY_DELAY_BASE * Math.pow(2, retries - 1),
        30000 // Max 30 segundos
      );

      console.log(
        `[REDIS] Tentativa de reconexão ${retries}/${MAX_RETRY_ATTEMPTS} em ${delay}ms`
      );

      return delay;
    },
    connectTimeout: CONNECTION_TIMEOUT,
  },
  // Configurações de performance
  commandsQueueMaxLength: 1000,
  disableOfflineQueue: false,
});

redisClient.on('error', (err) => {
  console.error('[REDIS ERROR]', err.message);
});

redisClient.on('connect', () => {
  console.log('[REDIS CONNECT] Conectado ao servidor Redis');
});

redisClient.on('ready', () => {
  console.log('[REDIS READY] Redis pronto para uso');
});

redisClient.on('reconnecting', () => {
  console.log('[REDIS RECONNECTING] Tentando reconectar...');
});

redisClient.on('end', () => {
  console.log('[REDIS END] Conexão encerrada');
});

if (!redisClient.isOpen) {
  redisClient.connect().catch((err) => {
    console.error('[REDIS CONNECT ERROR]', err.message);
  });
}

export function isRedisConnected(): boolean {
  return redisClient.isOpen && redisClient.isReady;
}

export async function waitForRedis(timeout = 10000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (isRedisConnected()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Define um valor no cache com TTL opcional
 *
 * @param key - Chave do cache
 * @param value - Valor a ser armazenado (string ou objeto)
 * @param ttl - Tempo de vida em segundos (opcional)
 */
export async function cacheSet(
  key: string,
  value: string | object,
  ttl?: number
): Promise<void> {
  try {
    if (!isRedisConnected()) {
      console.warn('[REDIS SET] Redis não conectado, operação ignorada');
      return;
    }

    const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
    const ttlToUse = ttl || DEFAULT_TTL;

    await redisClient.set(key, valueToStore, { EX: ttlToUse });
  } catch (err: any) {
    console.error('[REDIS SET ERROR]', { key, error: err.message });
  }
}

/**
 * Obtém um valor do cache
 *
 * @param key - Chave do cache
 * @returns Valor armazenado ou null se não encontrado
 */
export async function cacheGet(key: string): Promise<string | null> {
  try {
    if (!isRedisConnected()) {
      console.warn('[REDIS GET] Redis não conectado, retornando null');
      return null;
    }

    return await redisClient.get(key);
  } catch (err: any) {
    console.error('[REDIS GET ERROR]', { key, error: err.message });
    return null;
  }
}

/**
 * Deleta uma ou mais chaves do cache
 *
 * @param keys - Chave(s) a serem deletadas
 * @returns Número de chaves deletadas
 */
export async function cacheDel(...keys: string[]): Promise<number> {
  try {
    if (!isRedisConnected()) {
      console.warn('[REDIS DEL] Redis não conectado, operação ignorada');
      return 0;
    }

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redisClient.del(keys);
    return deleted;
  } catch (err: any) {
    console.error('[REDIS DEL ERROR]', { keys, error: err.message });
    return 0;
  }
}

/**
 * Deleta todas as chaves que correspondem a um padrão
 *
 * @param pattern - Padrão de busca (ex: "usuarios:*")
 * @returns Número de chaves deletadas
 */
export async function cacheDelPattern(pattern: string): Promise<number> {
  try {
    if (!isRedisConnected()) {
      console.warn('[REDIS DEL PATTERN] Redis não conectado, operação ignorada');
      return 0;
    }

    const keys = await redisClient.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redisClient.del(keys);
    return deleted;
  } catch (err: any) {
    console.error('[REDIS DEL PATTERN ERROR]', { pattern, error: err.message });
    return 0;
  }
}

/**
 * Verifica se uma chave existe
 *
 * @param key - Chave a ser verificada
 * @returns true se existe, false caso contrário
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    if (!isRedisConnected()) {
      return false;
    }

    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (err: any) {
    console.error('[REDIS EXISTS ERROR]', { key, error: err.message });
    return false;
  }
}

/**
 * Define o TTL de uma chave existente
 *
 * @param key - Chave
 * @param ttl - Tempo de vida em segundos
 * @returns true se sucesso (chave existe), false caso contrário
 */
export async function cacheExpire(key: string, ttl: number): Promise<boolean> {
  try {
    if (!isRedisConnected()) {
      return false;
    }

    const result = await redisClient.expire(key, ttl);
    return result === 1;
  } catch (err: any) {
    console.error('[REDIS EXPIRE ERROR]', { key, ttl, error: err.message });
    return false;
  }
}

/**
 * Obtém o TTL restante de uma chave
 *
 * @param key - Chave
 * @returns TTL em segundos ou -1 se não tem TTL, -2 se não existe
 */
export async function cacheTTL(key: string): Promise<number> {
  try {
    if (!isRedisConnected()) {
      return -2;
    }

    return await redisClient.ttl(key);
  } catch (err: any) {
    console.error('[REDIS TTL ERROR]', { key, error: err.message });
    return -2;
  }
}

/**
 * Incrementa um contador
 *
 * @param key - Chave do contador
 * @param increment - Valor a incrementar (padrão: 1)
 * @returns Novo valor do contador
 */
export async function cacheIncr(key: string, increment = 1): Promise<number> {
  try {
    if (!isRedisConnected()) {
      return 0;
    }

    if (increment === 1) {
      return await redisClient.incr(key);
    } else {
      return await redisClient.incrBy(key, increment);
    }
  } catch (err: any) {
    console.error('[REDIS INCR ERROR]', { key, increment, error: err.message });
    return 0;
  }
}

/**
 * Decrementa um contador
 *
 * @param key - Chave do contador
 * @param decrement - Valor a decrementar (padrão: 1)
 * @returns Novo valor do contador
 */
export async function cacheDecr(key: string, decrement = 1): Promise<number> {
  try {
    if (!isRedisConnected()) {
      return 0;
    }

    if (decrement === 1) {
      return await redisClient.decr(key);
    } else {
      return await redisClient.decrBy(key, decrement);
    }
  } catch (err: any) {
    console.error('[REDIS DECR ERROR]', { key, decrement, error: err.message });
    return 0;
  }
}

/**
 * Limpa todo o cache (USE COM CUIDADO!)
 *
 * @returns true se sucesso, false caso contrário
 */
export async function cacheFlush(): Promise<boolean> {
  try {
    if (!isRedisConnected()) {
      return false;
    }

    await redisClient.flushDb();
    console.log('[REDIS FLUSH] Cache limpo com sucesso');
    return true;
  } catch (err: any) {
    console.error('[REDIS FLUSH ERROR]', err.message);
    return false;
  }
}

export async function cacheInfo(): Promise<{
  connected: boolean;
  ready: boolean;
  host: string;
  port: number;
  db: number;
}> {
  return {
    connected: redisClient.isOpen,
    ready: redisClient.isReady,
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: REDIS_DB,
  };
}

export async function cacheHealthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
}> {
  try {
    if (!isRedisConnected()) {
      return {
        status: 'unhealthy',
        error: 'Redis não conectado',
      };
    }

    const startTime = Date.now();
    await redisClient.ping();
    const latency = Date.now() - startTime;

    return {
      status: 'healthy',
      latency,
    };
  } catch (err: any) {
    return {
      status: 'unhealthy',
      error: err.message,
    };
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log('[REDIS DISCONNECT] Desconectado com sucesso');
    }
  } catch (err: any) {
    console.error('[REDIS DISCONNECT ERROR]', err.message);
  }
}

process.on('SIGINT', async () => {
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectRedis();
  process.exit(0);
});

export default redisClient;