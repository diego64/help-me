import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

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
        logger.error(
          { maxRetries: MAX_RETRY_ATTEMPTS },
          'Falha ao conectar Redis após múltiplas tentativas'
        );
        return new Error('Máximo de tentativas de reconexão excedido');
      }

      const delay = Math.min(
        RETRY_DELAY_BASE * Math.pow(2, retries - 1),
        30000 // Max 30 segundos
      );

      logger.info(
        { tentativa: retries, maxTentativas: MAX_RETRY_ATTEMPTS, delay },
        'Tentativa de reconexão Redis'
      );

      return delay;
    },
    connectTimeout: CONNECTION_TIMEOUT,
  },
  commandsQueueMaxLength: 1000,
  disableOfflineQueue: false,
});

redisClient.on('error', (err) => {
  logger.error({ err }, 'Erro no cliente Redis');
});

redisClient.on('connect', () => {
  logger.info('Cliente Redis conectado');
});

redisClient.on('ready', () => {
  logger.info('Cliente Redis pronto');
});

redisClient.on('reconnecting', () => {
  logger.info('Tentando reconectar ao Redis');
});

redisClient.on('end', () => {
  logger.info('Conexão Redis encerrada');
});

if (!redisClient.isOpen) {
  redisClient.connect().catch((err) => {
    logger.error({ err }, 'Erro ao conectar ao Redis');
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

export async function cacheSet(
  key: string,
  value: string | object,
  ttl?: number
): Promise<void> {
  try {
    if (!isRedisConnected()) {
      logger.warn('Redis não conectado, operação SET ignorada');
      return;
    }

    const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
    const ttlToUse = ttl || DEFAULT_TTL;

    await redisClient.set(key, valueToStore, { EX: ttlToUse });
  } catch (err: any) {
    logger.error({ err, key }, 'Erro ao executar SET no Redis');
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    if (!isRedisConnected()) {
      logger.warn('Redis não conectado, operação GET retornando null');
      return null;
    }

    return await redisClient.get(key);
  } catch (err: any) {
    logger.error({ err, key }, 'Erro ao executar GET no Redis');
    return null;
  }
}

export async function cacheDel(...keys: string[]): Promise<number> {
  try {
    if (!isRedisConnected()) {
      logger.warn('Redis não conectado, operação DEL ignorada');
      return 0;
    }

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redisClient.del(keys);
    return deleted;
  } catch (err: any) {
    logger.error({ err, keys }, 'Erro ao executar DEL no Redis');
    return 0;
  }
}

export async function cacheDelPattern(pattern: string): Promise<number> {
  try {
    if (!isRedisConnected()) {
      logger.warn('Redis não conectado, operação DEL PATTERN ignorada');
      return 0;
    }

    const keys = await redisClient.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redisClient.del(keys);
    return deleted;
  } catch (err: any) {
    logger.error({ err, pattern }, 'Erro ao executar DEL PATTERN no Redis');
    return 0;
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  try {
    if (!isRedisConnected()) {
      return false;
    }

    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (err: any) {
    logger.error({ err, key }, 'Erro ao executar EXISTS no Redis');
    return false;
  }
}

export async function cacheExpire(key: string, ttl: number): Promise<boolean> {
  try {
    if (!isRedisConnected()) {
      return false;
    }

    const result = await redisClient.expire(key, ttl);
    return result === 1;
  } catch (err: any) {
    logger.error({ err, key, ttl }, 'Erro ao executar EXPIRE no Redis');
    return false;
  }
}

export async function cacheTTL(key: string): Promise<number> {
  try {
    if (!isRedisConnected()) {
      return -2;
    }

    return await redisClient.ttl(key);
  } catch (err: any) {
    logger.error({ err, key }, 'Erro ao executar TTL no Redis');
    return -2;
  }
}

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
    logger.error({ err, key, increment }, 'Erro ao executar INCR no Redis');
    return 0;
  }
}

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
    logger.error({ err, key, decrement }, 'Erro ao executar DECR no Redis');
    return 0;
  }
}

// Limpa todo o cache

export async function cacheFlush(): Promise<boolean> {
  try {
    if (!isRedisConnected()) {
      return false;
    }

    await redisClient.flushDb();
    logger.info('Cache Redis limpo com sucesso');
    return true;
  } catch (err: any) {
    logger.error({ err }, 'Erro ao executar FLUSH no Redis');
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
      logger.info('Redis desconectado com sucesso');
    }
  } catch (err: any) {
    logger.error({ err }, 'Erro ao desconectar Redis');
  }
}

export default redisClient;