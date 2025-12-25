import { createClient, RedisClientType } from 'redis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || 'redis_helpme_password';

export const redisClient: RedisClientType = createClient({
  url: `redis://:${redisPassword}@${redisHost}:${redisPort}`,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 3) {
        console.error('[REDIS] Falha ao conectar após 3 tentativas');
        return new Error('Máximo de tentativas excedido');
      }
      return retries * 1000; // Retry após 1s, 2s, 3s
    }
  }
});

redisClient.on('error', (err) => {
  console.error('[REDIS] Erro:', err);
});

redisClient.on('connect', () => {
  console.log('[REDIS] Conectado com sucesso');
});

redisClient.on('ready', () => {
  console.log('[REDIS] Redis pronto para uso');
});

if (!redisClient.isOpen) {
  redisClient.connect().catch((err) => {
    console.error('[REDIS] Erro ao conectar automaticamente:', err);
  });
}

// Funções de cache
export async function cacheSet(key: string, value: string, ttl?: number) {
  if (ttl) {
    await redisClient.set(key, value, { EX: ttl });
  } else {
    await redisClient.set(key, value);
  }
}

export async function cacheGet(key: string) {
  return await redisClient.get(key);
}