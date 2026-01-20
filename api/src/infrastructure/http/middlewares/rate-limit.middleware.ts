import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições por IP
  message: {
    error: 'Muitas requisições deste IP, tente novamente em 15 minutos',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Apenas 5 tentativas de login
  skipSuccessfulRequests: true,
  message: {
    error: 'Muitas tentativas de login falhadas',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`[SECURITY] Rate limit excedido para login: ${req.ip} - ${req.body?.email || 'unknown'}`);
    
    res.status(429).json({
      error: 'Muitas tentativas de login',
      message: 'Você excedeu o número de tentativas de login. Aguarde 15 minutos.',
    });
  }
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20, // 20 operações de escrita por minuto
  message: {
    error: 'Muitas operações de escrita',
    retryAfter: '1 minuto'
  },
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});