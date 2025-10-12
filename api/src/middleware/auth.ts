import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload, extractTokenFromHeader } from '../auth/jwt';
import { Role } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // tenta extrair token usando helper; se helper não retornar, faz fallback simples
    const token = extractTokenFromHeader(req.headers.authorization) ?? (() => {
      const header = req.headers.authorization;
      if (!header || typeof header !== 'string') return null;
      const parts = header.trim().split(/\s+/);
      if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
      return parts[1];
    })();

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    //Verifica token de acesso
    const decoded = verifyToken(token, 'access');

    req.user = decoded;
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

export function authorizeRoles(...roles: Array<Role | string>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    const userRole = req.user.role as string;

    const allowed = roles.map(r => String(r));
    if (!allowed.includes(userRole)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    return next();
  };
}
