import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Criar ADMIN
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { nome, sobrenome, email, password } = req.body;
  if (!email || !password || !nome || !sobrenome) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const admin = await prisma.usuario.create({
        data: { nome, sobrenome, email, password: hashedPassword, regra: 'ADMIN' },
      });
      
      const { password: _, ...adminSemSenha } = admin;
      res.json(adminSemSenha);
      
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Listar todos os ADMINS
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const admins = await prisma.usuario.findMany({ where: { regra: 'ADMIN' } });
    res.json(admins);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Editar ADMIN
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { nome, sobrenome, email, password } = req.body;

  try {
    const data: any = { nome, sobrenome, email };
    if (password) data.password = await bcrypt.hash(password, 10);

    const admin = await prisma.usuario.update({
      where: { id },
      data,
    });
    res.json(admin);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Excluir ADMIN
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    await prisma.usuario.delete({ where: { id } });
    res.json({ message: 'Admin excluído com sucesso' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
