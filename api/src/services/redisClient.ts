import { createClient } from 'redis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

export const redisClient = createClient({
  url: `redis://${redisHost}:${redisPort}`
});

redisClient.connect();

redisClient.on('connect', () => {
  console.log('[Redis] Conectado com sucesso!');
});

redisClient.on('error', (err) => {
  console.error('[Redis][Erro]', err);
});

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
