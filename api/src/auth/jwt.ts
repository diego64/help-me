import dotenv from 'dotenv';
dotenv.config();

import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import type ms from 'ms';
import { User, Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const JWT_EXPIRATION: ms.StringValue = (process.env.JWT_EXPIRATION || '8h') as ms.StringValue;
const JWT_REFRESH_EXPIRATION: ms.StringValue = (process.env.JWT_REFRESH_EXPIRATION || '7d') as ms.StringValue;

function validateSecrets(): void {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.');
  }

  if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.');
  }

  if (JWT_SECRET === JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes.');
  }
}

validateSecrets();

export interface TokenPayload extends JwtPayload {
  id: string;
  email?: string;
  role: Role;
  type: 'access' | 'refresh';
}

// Exporta generateToken para uso direto se necessário
export function generateToken(user: User, type: 'access' | 'refresh'): string {
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    type,
  };

  const secret = type === 'access' ? JWT_SECRET : JWT_REFRESH_SECRET;
  const expiresIn = type === 'access' ? JWT_EXPIRATION : JWT_REFRESH_EXPIRATION;

  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn,
    issuer: 'helpme-api',
    audience: 'helpme-client',
  };

  return jwt.sign(payload, secret, options);
}

// Gera par de tokens (access + refresh)
export function generateTokenPair(user: User) {
  const accessToken = generateToken(user, 'access');
  const refreshToken = generateToken(user, 'refresh');
  return { accessToken, refreshToken, expiresIn: JWT_EXPIRATION };
}

// Verifica token e garante que seja do tipo correto
export function verifyToken(token: string, type: 'access' | 'refresh' = 'access'): TokenPayload {
  const secret = type === 'access' ? JWT_SECRET : JWT_REFRESH_SECRET;

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'helpme-api',
      audience: 'helpme-client',
    }) as TokenPayload;

    if (decoded.type !== type) {
      throw new Error(`Token inválido: esperado tipo ${type}, recebido ${decoded.type}`);
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw new Error('Token expirado.');
    if (error instanceof jwt.JsonWebTokenError) throw new Error(`Token inválido: ${error.message}`);
    throw error;
  }
}

// Decodifica token sem validar
export function decodeToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded || null;
  } catch {
    return null;
  }
}

// Verifica se token expirou
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded?.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
}

// Extrai token do header Authorization
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}
