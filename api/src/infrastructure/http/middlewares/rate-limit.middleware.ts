import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * Rate Limiter para API geral
 * Limite: 100 requisições por 15 minutos por IP
 * Usado para proteger endpoints gerais da API
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por janela
  standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
  message: 'Too many requests from this IP, please try again later',
  
  // Função para gerar chave única por IP
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  
  // Skip em caso de ambiente de desenvolvimento (opcional)
  skip: (req: Request): boolean => {
    return req.app.get('env') === 'test';
  },
});

/**
 * Rate Limiter para autenticação/login
 * Limite: 5 tentativas por 15 minutos por IP
 * Inclui logging de segurança para tentativas suspeitas
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Limite de 5 tentativas por janela
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req: Request, res: Response) => {
    const email = req.body?.email || 'unknown';
    
    // Log de segurança para tentativas excessivas
    console.warn(
      `[SECURITY] Rate limit exceeded for IP: ${req.ip}, Email: ${email}`
    );
    
    // Resposta customizada
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Please try again later',
    });
  },
  
  // Função para gerar chave única por IP
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  
  // Skip em caso de ambiente de desenvolvimento (opcional)
  skip: (req: Request): boolean => {
    return req.app.get('env') === 'test';
  },
});

/**
 * Rate Limiter para operações de escrita
 * Limite: 20 operações por minuto por IP
 * Protege contra operações de CREATE, UPDATE, DELETE excessivas
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20, // Limite de 20 operações por janela
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many write operations, please slow down',
  
  // Função para gerar chave única por IP
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  
  skip: (req: Request): boolean => {
    return req.app.get('env') === 'test';
  },
});

export default {
  apiLimiter,
  authLimiter,
  writeLimiter,
};