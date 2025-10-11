import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Criar conta de Admin
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { firstName, lastName, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const admin = await prisma.user.create({
      data: { firstName, lastName, email, password: hashedPassword, role: 'ADMIN' },
    });
    res.json(admin);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Listar todos os Admins
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
  res.json(admins);
});

// Editar Admin
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, password } = req.body;

  try {
    const data: any = { firstName, lastName, email };
    if (password) data.password = await bcrypt.hash(password, 10);

    const admin = await prisma.user.update({
      where: { id },
      data,
    });
    res.json(admin);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Excluir Admin
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Admin excluído com sucesso' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;