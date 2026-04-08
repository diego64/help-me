import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '@shared/config/logger';

export interface UsuarioAutenticado {
  id: string;
  email: string;
  regra: string;
  setor?: string | null;
}

export interface AuthRequest extends Request {
  usuario?: UsuarioAutenticado;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido.' });
    return;
  }

  const token = authorization.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    logger.error('JWT_SECRET não configurado');
    res.status(500).json({ error: 'Erro de configuração do servidor.' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;

    if (!payload.id || !payload.regra) {
      res.status(401).json({ error: 'Token inválido.' });
      return;
    }

    req.usuario = {
      id: payload.id as string,
      email: payload.email as string,
      regra: payload.regra as string,
      setor: (payload.setor as string | null | undefined) ?? null,
    };

    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.toLowerCase().includes('expir')) {
      res.status(401).json({ error: 'Token expirado.' });
      return;
    }
    res.status(401).json({ error: 'Token inválido.' });
  }
}

export function authorizeRoles(...regras: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      res.status(401).json({ error: 'Não autorizado.' });
      return;
    }
    if (!regras.includes(req.usuario.regra)) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    next();
  };
}
