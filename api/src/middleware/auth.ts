import {
  Request,
  Response,
  NextFunction
} from 'express';
import {
  verifyToken,
  TokenPayload,
  extractTokenFromHeader
} from '../auth/jwt';
import { Regra } from '@prisma/client';
import { cacheGet } from '../services/redisClient';

export interface AuthRequest extends Request {
  usuario?: TokenPayload;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Extrair token do header
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    // Verificar e decodificar token
    const decoded = verifyToken(token, 'access');

    // Verificar blacklist no Redis
    if (decoded && decoded.jti) {
      const blacklisted = await cacheGet(`jwt:blacklist:${decoded.jti}`);
      if (blacklisted) {
        return res.status(401).json({ error: 'Token revogado. Faça login novamente.' });
      }
    }

    req.usuario = decoded;
    return next();
  } catch (err: any) {
    console.error('authMiddleware error:', err);

    const msg = err instanceof Error ? err.message : 'Invalid token';
    if (msg.toLowerCase().includes('expir')) {
      return res.status(401).json({ error: 'Token expirado.' });
    }

    return res.status(401).json({ error: 'Token inválido.' });
  }
}

export function authorizeRoles(...regra: Array<Regra | string>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    const regraDeUsuario = req.usuario.regra as string;

    const allowed = regra.map(r => String(r));
    if (!allowed.includes(regraDeUsuario)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    return next();
  };
}
