import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { cacheIncr, cacheExpire, cacheGet, cacheSet } from '@infrastructure/database/redis/client';
import { logger } from '@shared/config/logger';

/**
 * CONFIGURAÇÃO
 * Inspirado em: GitHub API, Stripe, Cloudflare
 */

const RATE_LIMITS = {
  API: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
  AUTH: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    blockDurationMs: 30 * 60 * 1000,
  },
  WRITE: {
    windowMs: 60 * 1000,
    max: 20,
  },
  REGISTER: {
    windowMs: 60 * 60 * 1000,
    max: 3,
  },
} as const;

const TRUSTED_IPS = new Set([
  '127.0.0.1',
  '::1',
  ...(process.env.TRUSTED_IPS?.split(',').map(ip => ip.trim()) ?? []),
]);

/**
 * Normaliza IPv6 para evitar bypass
 * Remove notação ::ffff: de IPv4-mapped IPv6 addresses
 * ex: ::ffff:192.168.1.1 → 192.168.1.1
 */
function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

/**
 * Extrai IP real do cliente considerando proxies
 * Normaliza IPv6 manualmente para evitar bypass
 * Inspirado em: Cloudflare CF-Connecting-IP, AWS ELB
 */
function getClientIp(req: Request): string {
  const forwarded = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  const realIp = (req.headers['x-real-ip'] as string);
  const ip = forwarded || realIp || req.ip || 'unknown';
  return normalizeIp(ip);
}

/**
 * Verifica se o IP é confiável (bypass rate limit)
 */
function isTrustedIp(ip: string): boolean {
  return TRUSTED_IPS.has(ip);
}

/**
 * Skip function padrão — bypassa em testes e IPs confiáveis
 */
function defaultSkip(req: Request): boolean {
  if (req.app.get('env') === 'test') return true;
  const ip = getClientIp(req);
  return isTrustedIp(ip);
}

/**
 * Registra violação de rate limit e aplica bloqueio progressivo
 * 1ª violação: 5 min | 2ª–3ª: 15 min | 4ª+: 60 min
 * Inspirado em: Google Account Protection, AWS GuardDuty
 */
async function applyProgressiveBlock(ip: string, endpoint: string): Promise<number> {
  try {
    const violationKey = `rate:violations:${endpoint}:${ip}`;
    const violations = await cacheIncr(violationKey);

    if (violations === 1) {
      await cacheExpire(violationKey, 60 * 60 * 24);
    }

    let blockSeconds: number;
    if (violations <= 1)      blockSeconds = 5 * 60;
    else if (violations <= 3) blockSeconds = 15 * 60;
    else                      blockSeconds = 60 * 60;

    const blockKey = `rate:block:${endpoint}:${ip}`;
    await cacheSet(blockKey, String(violations), blockSeconds);

    logger.warn(
      { ip, endpoint, violations, blockSeconds },
      'Rate limit progressivo aplicado'
    );

    return blockSeconds;
  } catch {
    return 5 * 60;
  }
}

/**
 * Verifica se o IP está bloqueado por violações anteriores
 * Retorna segundos restantes de bloqueio ou 0 se não bloqueado
 */
async function getBlockedSeconds(ip: string, endpoint: string): Promise<number> {
  try {
    const blockKey = `rate:block:${endpoint}:${ip}`;
    const blocked = await cacheGet(blockKey);
    if (!blocked) return 0;

    const { cacheTTL } = await import('@infrastructure/database/redis/client');
    const ttl = await cacheTTL(blockKey);
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

/**
 * Rate limiter geral da API
 * Limite: 100 requisições por 15 minutos por IP
 *
 * Headers retornados (RFC 6585):
 * - RateLimit-Limit: limite máximo
 * - RateLimit-Remaining: requisições restantes
 * - RateLimit-Reset: timestamp de reset
 */
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.API.windowMs,
  max: RATE_LIMITS.API.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
    retryAfter: RATE_LIMITS.API.windowMs / 1000,
  },
  keyGenerator: (req) => getClientIp(req),
  skip: defaultSkip,
});

/**
 * Rate limiter para endpoints de autenticação
 * Limite: 5 tentativas por 15 minutos por IP
 * Com bloqueio progressivo e logging de segurança
 *
 * Inspirado em: GitHub (10 tentativas), Google (5 tentativas + CAPTCHA)
 */
export const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.windowMs,
  max: RATE_LIMITS.AUTH.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: defaultSkip,

  handler: async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const email = (req.body as { email?: string })?.email ?? 'unknown';

    const blockSeconds = await applyProgressiveBlock(ip, 'auth');

    logger.warn(
      {
        ip,
        email,
        endpoint: req.path,
        blockSeconds,
        userAgent: req.get('user-agent'),
      },
      '[SECURITY] Rate limit de autenticação excedido'
    );

    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Too many failed attempts. Please try again later.',
      retryAfter: blockSeconds,
    });
  },
});

/**
 * Rate limiter para operações de escrita
 * Limite: 20 operações por minuto por IP
 * Inspirado em: Stripe write rate limits, GitHub mutation limits
 */
export const writeLimiter = rateLimit({
  windowMs: RATE_LIMITS.WRITE.windowMs,
  max: RATE_LIMITS.WRITE.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many write operations',
    message: 'Please slow down and try again later',
    retryAfter: RATE_LIMITS.WRITE.windowMs / 1000,
  },
  keyGenerator: (req) => getClientIp(req),
  skip: defaultSkip,
});

/**
 * Rate limiter para criação de usuários
 * Limite: 3 contas por IP por hora
 * Inspirado em: Twitter, Discord, GitHub signup limits
 */
export const registerLimiter = rateLimit({
  windowMs: RATE_LIMITS.REGISTER.windowMs,
  max: RATE_LIMITS.REGISTER.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: defaultSkip,

  handler: async (req: Request, res: Response) => {
    const ip = getClientIp(req);

    const blockSeconds = await applyProgressiveBlock(ip, 'register');

    logger.warn(
      { ip, endpoint: req.path, blockSeconds },
      '[SECURITY] Rate limit de registro excedido'
    );

    res.status(429).json({
      error: 'Too many accounts created',
      message: 'Account creation limit reached. Please try again later.',
      retryAfter: blockSeconds,
    });
  },
});

/**
 * Middleware que verifica bloqueios progressivos do Redis
 * Deve ser aplicado ANTES dos rate limiters nos endpoints críticos
 *
 * Diferente do rate limiter padrão (que conta requisições),
 * este verifica bloqueios explícitos aplicados por violações anteriores
 * Inspirado em: Cloudflare Bot Management, AWS WAF
 */
export async function checkProgressiveBlock(endpoint: string) {
  return async (req: Request, res: Response, next: Function) => {
    if (defaultSkip(req)) return next();

    const ip = getClientIp(req);
    const blockedSeconds = await getBlockedSeconds(ip, endpoint);

    if (blockedSeconds > 0) {
      logger.warn(
        { ip, endpoint, blockedSeconds },
        '[SECURITY] Requisição bloqueada por violação anterior'
      );

      return res.status(429).json({
        error: 'IP temporarily blocked',
        message: 'Your IP has been temporarily blocked due to suspicious activity.',
        retryAfter: blockedSeconds,
      });
    }

    return next();
  };
}

export default {
  apiLimiter,
  authLimiter,
  writeLimiter,
  registerLimiter,
  checkProgressiveBlock,
};