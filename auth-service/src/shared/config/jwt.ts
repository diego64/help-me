import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import type ms from 'ms';
import { Request } from 'express';
import { Usuario, Regra } from '@prisma/client';
import { logger } from '@shared/config/logger';

/**
 * Tamanho máximo permitido para o payload do JWT (em caracteres)
 * Baseado em: Gitlab DoS attacks - previne JWT bombing
 */
const MAX_PAYLOAD_SIZE = 4096;

/**
 * Profundidade máxima permitida para objetos nested no payload
 * Baseado em: DoS attacks com objetos profundamente aninhados
 */
const MAX_OBJECT_DEPTH = 10;

/**
 * Tamanho mínimo de entropia para secrets (bits)
 * Baseado em: CVE reports de secrets fracos
 */
const MIN_SECRET_ENTROPY_BITS = 128;

/**
 * Lista de padrões comuns/fracos em secrets
 * Baseado em: Análise de data breaches e secrets vazados
 */
const WEAK_SECRET_PATTERNS = [
  /^[0-9]+$/,   // Apenas números
  /^[a-z]+$/,   // Apenas letras minúsculas
  /^(.)\1+$/,   // Caracteres repetidos
  /password/i,
  /admin/i,
  /secret/i,
  /qwerty/i,
  /12345/,
];

export interface TokenPayload extends JwtPayload {
  id: string;
  email?: string;
  regra: Regra;
  type: 'access' | 'refresh';
  fingerprint?: string;
  jti: string;
}

/**
 * FINGERPRINT
 * Inspirado em: Google, Facebook token binding
 * Vincula o token ao dispositivo que fez login
 */

/**
 * Gera fingerprint do cliente baseado em User-Agent + IP
 * Detecta token hijacking quando usado de outro dispositivo
 */
export function generateFingerprint(req: Request): string {
  const userAgent = req.get('user-agent') || '';
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown';

  return createHash('sha256')
    .update(`${userAgent}:${ip}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Calcula a entropia de Shannon de uma string
 * Usado para detectar secrets fracos
 */
function calculateEntropy(str: string): number {
  const len = str.length;
  const frequencies = new Map<string, number>();

  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }

  return entropy * len;
}

/**
 * Valida a força de um secret
 * Verifica padrões fracos e entropia mínima
 */
function validateSecretStrength(secret: string, secretName: string): void {
  for (const pattern of WEAK_SECRET_PATTERNS) {
    if (pattern.test(secret)) {
      logger.warn(
        `[SECURITY WARNING] ${secretName} contém padrão fraco. ` +
        `Considere usar um secret mais complexo em produção.`
      );
    }
  }

  const entropy = calculateEntropy(secret);
  if (entropy < MIN_SECRET_ENTROPY_BITS) {
    logger.warn(
      `[SECURITY WARNING] ${secretName} tem entropia baixa (${entropy.toFixed(2)} bits). ` +
      `Recomendado: >= ${MIN_SECRET_ENTROPY_BITS} bits.`
    );
  }
}

/**
 * Valida os secrets JWT
 * Previne: Secrets fracos, idênticos, ou curtos demais
 * Inspirado em: GitHub 2021 secret leakage, AWS key rotation
 */
export function validateSecrets(): void {
  const JWT_SECRET = process.env.JWT_SECRET!;
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.');
  }
  if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.');
  }
  if (JWT_SECRET === JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes.');
  }

  validateSecretStrength(JWT_SECRET, 'JWT_SECRET');
  validateSecretStrength(JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
}

/**
 * Calcula a profundidade máxima de um objeto
 * Previne: DoS attacks com objetos profundamente aninhados
 */
function getObjectDepth(obj: unknown, currentDepth = 0): number {
  if (obj === null || typeof obj !== 'object') {
    return currentDepth;
  }

  let maxDepth = currentDepth;
  for (const value of Object.values(obj as Record<string, unknown>)) {
    const depth = getObjectDepth(value, currentDepth + 1);
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

/**
 * Valida o tamanho e estrutura do payload
 * Previne: JWT bombing, DoS attacks
 * Inspirado em: Gitlab, Shopify vulnerabilities
 */
function validatePayload(payload: unknown): void {
  const payloadStr = JSON.stringify(payload);

  if (payloadStr.length > MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Payload muito grande (${payloadStr.length} chars). ` +
      `Máximo permitido: ${MAX_PAYLOAD_SIZE} chars.`
    );
  }

  const depth = getObjectDepth(payload);
  if (depth > MAX_OBJECT_DEPTH) {
    throw new Error(
      `Payload com objetos muito profundos (${depth} níveis). ` +
      `Máximo permitido: ${MAX_OBJECT_DEPTH} níveis.`
    );
  }
}

/**
 * Gera um JTI criptograficamente seguro
 * Usado para blacklist de tokens no logout
 */
export function generateJti(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Gera um token JWT (access ou refresh)
 *
 * MELHORIAS DE SEGURANÇA APLICADAS:
 * - Fingerprint do dispositivo (previne token hijacking)
 * - JTI criptograficamente seguro (permite blacklist)
 * - Validação de tamanho de payload (previne DoS)
 * - Algoritmo fixo HS256 (previne algorithm confusion)
 * - Issuer e audience fixos (previne token confusion)
 * - Logger estruturado (sem dados sensíveis)
 *
 * Inspirado em: Auth0 CVE-2015-9235, Uber 2016 breach,
 * Google/Facebook token binding
 */
export function generateToken(
  usuario: Usuario,
  type: 'access' | 'refresh',
  req?: Request
): string {
  const payload: TokenPayload = {
    id: usuario.id,
    email: usuario.email,
    regra: usuario.regra,
    type,
    jti: generateJti(),
    // Fingerprint apenas no access token — vincula ao dispositivo
    // Inspirado em: Google, Facebook token binding
    ...(type === 'access' && req ? { fingerprint: generateFingerprint(req) } : {}),
  };

  try {
    validatePayload(payload);
  } catch (error) {
    logger.error({ error }, '[SECURITY] Token generation blocked');
    throw error;
  }

  const secret = type === 'access'
    ? process.env.JWT_SECRET
    : process.env.JWT_REFRESH_SECRET;

  const expiresIn = (type === 'access'
    ? process.env.JWT_EXPIRES_IN || '15m'
    : process.env.JWT_REFRESH_EXPIRES_IN || '7d') as ms.StringValue;

  const options: SignOptions = {
    algorithm: 'HS256',         // Fixo — previne algorithm confusion
    expiresIn,
    issuer: 'helpme-api',       // Fixo — previne token confusion
    audience: 'helpme-client',  // Fixo — previne token confusion
  };

  if (process.env.NODE_ENV === 'development') {
    logger.debug({
      type,
      userId: usuario.id,
      regra: usuario.regra,
      expiresIn,
      hasFingerprint: !!payload.fingerprint,
    }, '[JWT] Token gerado');
  }

  return jwt.sign(payload, secret!, options);
}

/**
 * Gera um par de tokens (access + refresh)
 *
 * O access token recebe fingerprint do dispositivo quando `req` é fornecido
 * O refresh token não recebe fingerprint — é usado apenas para renovar o access
 *
 * NOTA: Em produção, implementar rotação de refresh tokens
 * para prevenir token reuse attacks
 * Inspirado em: Facebook 2018, Twitter 2020 session management issues
 */
export function generateTokenPair(usuario: Usuario, req?: Request) {
  const accessToken  = generateToken(usuario, 'access', req);
  const refreshToken = generateToken(usuario, 'refresh');

  return {
    accessToken,
    refreshToken,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  };
}

/**
 * Verifica e decodifica um token JWT
 *
 * PROTEÇÕES APLICADAS:
 * - Validação de algoritmo (previne algorithm confusion)
 * - Validação de issuer/audience (previne token confusion)
 * - Validação de tipo (previne token type mismatch)
 * - Mensagens de erro seguras (previne information leakage)
 *
 * Inspirado em: Auth0 CVE-2015-9235, multi-tenant vulnerabilities
 */
export function verifyToken(token: string, type: 'access' | 'refresh' = 'access'): TokenPayload {
  const secret = type === 'access'
    ? process.env.JWT_SECRET
    : process.env.JWT_REFRESH_SECRET;

  try {
    const decoded = jwt.verify(token, secret!, {
      algorithms: ['HS256'],      // CRÍTICO: apenas HS256
      issuer: 'helpme-api',
      audience: 'helpme-client',
    }) as TokenPayload;

    if (decoded.type !== type) {
      throw new Error(`Token inválido: esperado tipo ${type}, recebido ${decoded.type}`);
    }

    if (process.env.NODE_ENV === 'development') {
      logger.debug({
        type: decoded.type,
        userId: decoded.id,
        regra: decoded.regra,
        jti: decoded.jti,
      }, '[JWT] Token verificado');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expirado.');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      const errorMsg = process.env.NODE_ENV === 'development'
        ? error.message
        : 'assinatura ou formato inválido';
      throw new Error(`Token inválido: ${errorMsg}`);
    }
    throw error;
  }
}

/**
 * Decodifica um token sem verificar a assinatura
 *
 * AVISO DE SEGURANÇA: Use apenas para inspeção, NUNCA para autenticação
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded ?? null;
  } catch {
    return null;
  }
}

/**
 * Verifica se um token está expirado
 *
 * NOTA: Usa apenas o campo exp, não verifica assinatura
 * Para verificação completa, use verifyToken()
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded?.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Extrai token do header Authorization
 *
 * PROTEÇÕES APLICADAS:
 * - Validação contra CRLF injection
 * - Validação de formato estrito
 * - Validação contra null bytes e caracteres de controle
 *
 * Inspirado em: HTTP header injection vulnerabilities
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;

  if (authHeader.includes('\r') || authHeader.includes('\n')) {
    logger.warn('[SECURITY] CRLF injection attempt detected in Authorization header');
    return null;
  }

  if (/[\x00-\x1F]/.test(authHeader)) {
    logger.warn('[SECURITY] Control characters detected in Authorization header');
    return null;
  }

  const parts = authHeader.trim().split(/\s+/);

  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') return null;

  const token = parts[1];

  if (!token || token.trim() === '' || token.includes(' ')) return null;

  if (token.length > 8000) {
    logger.warn({ length: token.length }, '[SECURITY] Suspiciously large token detected');
    return null;
  }

  return token;
}

/**
 * Verifica se um refresh token deve ser rotacionado
 * Inspirado em: Facebook 2018, Twitter 2020 session management
 */
export function shouldRotateRefreshToken(decoded: TokenPayload): boolean {
  if (!decoded.exp) return false;

  const timeUntilExpiration = decoded.exp * 1000 - Date.now();
  const oneDayInMs = 24 * 60 * 60 * 1000;

  return timeUntilExpiration < oneDayInMs;
}

export const securityUtils = {
  calculateEntropy,
  getObjectDepth,
  validatePayload,
  shouldRotateRefreshToken,
  generateJti,
  generateFingerprint,
  MAX_PAYLOAD_SIZE,
  MAX_OBJECT_DEPTH,
  MIN_SECRET_ENTROPY_BITS,
};