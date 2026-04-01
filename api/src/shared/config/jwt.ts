import jwt, { JwtPayload } from 'jsonwebtoken';
import { Regra } from '@prisma/client';

const MAX_PAYLOAD_SIZE = 4096;
const MAX_OBJECT_DEPTH = 10;
const MIN_SECRET_ENTROPY_BITS = 128;
const WEAK_SECRET_PATTERNS = [
  /^[0-9]+$/,
  /^[a-z]+$/,
  /^(.)\1+$/,
  /password/i,
  /admin/i,
  /secret/i,
  /qwerty/i,
  /12345/,
];

function calculateEntropy(str: string): number {
  const len = str.length;
  const frequencies = new Map<string, number>();
  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }
  return entropy * len;
}

function validateSecretStrength(secret: string, secretName: string): void {
  for (const pattern of WEAK_SECRET_PATTERNS) {
    if (pattern.test(secret)) {
      console.warn(`[SECURITY WARNING] ${secretName} contém padrão fraco.`);
    }
  }
  const entropy = calculateEntropy(secret);
  if (entropy < MIN_SECRET_ENTROPY_BITS) {
    console.warn(`[SECURITY WARNING] ${secretName} tem entropia baixa (${entropy.toFixed(2)} bits).`);
  }
}

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

export interface TokenPayload extends JwtPayload {
  id: string;
  email?: string;
  regra: Regra;
  type: 'access' | 'refresh';
}

export function verifyToken(token: string, type: 'access' | 'refresh' = 'access'): TokenPayload {
  const secret = type === 'access'
    ? process.env.JWT_SECRET
    : process.env.JWT_REFRESH_SECRET;

  try {
    const decoded = jwt.verify(token, secret!, {
      algorithms: ['HS256'],
      issuer: 'helpme-api',
      audience: 'helpme-client',
    }) as TokenPayload;

    if (decoded.type !== type) {
      throw new Error(`Token inválido: esperado tipo ${type}, recebido ${decoded.type}`);
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

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload | null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded?.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (authHeader.includes('\r') || authHeader.includes('\n')) {
    console.warn('[SECURITY] CRLF injection attempt detected');
    return null;
  }
  if (/[\x00-\x1F]/.test(authHeader)) {
    console.warn('[SECURITY] Control characters detected');
    return null;
  }
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  const token = parts[1];
  if (!token || token.trim() === '' || token.includes(' ')) return null;
  if (token.length > 8000) {
    console.warn('[SECURITY] Suspiciously large token detected');
    return null;
  }
  return token;
}

export const securityUtils = {
  calculateEntropy,
  MAX_PAYLOAD_SIZE,
  MAX_OBJECT_DEPTH,
  MIN_SECRET_ENTROPY_BITS,
};