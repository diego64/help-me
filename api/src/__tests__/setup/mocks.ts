import { vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { Regra } from '@prisma/client';

export let currentUserRole: Regra = 'ADMIN';

export const setUserRole = (role: Regra) => {
  currentUserRole = role;
};

export const prismaMock = {
  servico: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

export const authMiddleware = (req: any, res: Response, next: NextFunction) => {
  req.usuario = {
    id: 'test-user-id',
    email: 'test@example.com',
    regra: currentUserRole,
    type: 'access',
  };
  next();
};

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    
    if (!allowedRoles.includes(req.usuario.regra)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    
    next();
  };
};

vi.mock('../../../infrastructure/database/prisma/client', () => ({
  prisma: prismaMock,
}));

vi.mock('../../../infrastructure/http/middlewares/auth', () => ({
  authMiddleware,
  authorizeRoles,
  AuthRequest: class {},
}));