import dotenv from 'dotenv';
dotenv.config();

import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import type ms from 'ms';
import { Usuario, Regra } from '@prisma/client';

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
}

export interface TokenPayload extends JwtPayload {
  id: string;
  email?: string;
  regra: Regra;
  type: 'access' | 'refresh';
}

export function generateToken(usuario: Usuario, type: 'access' | 'refresh'): string {
  const payload: TokenPayload = {
    id: usuario.id,
    email: usuario.email,
    regra: usuario.regra,
    type,
  };

  const secret = type === 'access'
    ? process.env.JWT_SECRET
    : process.env.JWT_REFRESH_SECRET;
  const expiresIn = (type === 'access'
    ? process.env.JWT_EXPIRATION || '8h'
    : process.env.JWT_REFRESH_EXPIRATION || '7d') as ms.StringValue;

  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn,
    issuer: 'helpme-api',
    audience: 'helpme-client',
  };

  return jwt.sign(payload, secret!, options);
}

export function generateTokenPair(usuario: Usuario) {
  const accessToken = generateToken(usuario, 'access');
  const refreshToken = generateToken(usuario, 'refresh');
  return { accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRATION || '8h' };
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
    if (error instanceof jwt.TokenExpiredError) throw new Error('Token expirado.');
    if (error instanceof jwt.JsonWebTokenError) throw new Error(`Token inválido: ${error.message}`);
    throw error;
  }
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded || null;
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
  // Validar se o header existe e é uma string
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  // Remover espaços extras e dividir em partes
  const parts = authHeader.trim().split(/\s+/);
  
  // Validar formato: deve ter exatamente 2 partes e começar com "Bearer"
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  const token = parts[1];
  
  // Validar que o token não está vazio e não contém espaços
  if (!token || token.trim() === '' || token.includes(' ')) {
    return null;
  }
  
  return token;
}
