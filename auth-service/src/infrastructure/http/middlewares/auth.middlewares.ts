import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '@shared/config/jwt';
import { Regra } from '@prisma/client';
import { cacheGet } from '@infrastructure/database/redis/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';

export interface AuthRequest extends Request {
  usuario?: {
    id: string;
    nome: string;
    sobrenome: string;
    email: string;
    regra: Regra;
  };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const decoded = verifyToken(token, 'access');

    // Verificar blacklist no Redis (tokens revogados via logout)
    if (decoded.jti) {
      const blacklisted = await cacheGet(`jwt:blacklist:${decoded.jti}`);
      if (blacklisted) {
        return res.status(401).json({ error: 'Token revogado. Faça login novamente.' });
      }
    }

    if (!decoded.id) {
      return res.status(401).json({ error: 'Token inválido: ID do usuário ausente.' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id, ativo: true, deletadoEm: null },
      select: {
        id: true,
        nome: true,
        sobrenome: true,
        email: true,
        regra: true,
      },
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo.' });
    }

    req.usuario = usuario;

    return next();
  } catch (err) {
    logger.error({ err }, 'authMiddleware error');

    const msg = err instanceof Error ? err.message : '';
    if (msg.toLowerCase().includes('expir')) {
      return res.status(401).json({ error: 'Token expirado.' });
    }

    return res.status(401).json({ error: 'Token inválido.' });
  }
}

export function authorizeRoles(...regras: Regra[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    if (!regras.includes(req.usuario.regra)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    return next();
  };
}