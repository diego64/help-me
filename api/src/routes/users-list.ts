import { Router } from 'express';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// Só Admin pode listar usuários
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

// Técnico pode ver seu próprio perfil
router.get('/me', authMiddleware, authorizeRoles('TECNICO', 'USUARIO', 'ADMIN'), async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  res.json(user);
});

export default router;
