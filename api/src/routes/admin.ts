import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { generateTokenPair, verifyToken, TokenPayload } from '../auth/jwt';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Gera tokens
    const { accessToken, refreshToken } = generateTokenPair(user);

    res.json({ accessToken, refreshToken });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Não autorizado.' });

  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: null },
  });

  res.json({ message: 'Logout realizado com sucesso.' });
});

router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token não fornecido' });
  }

  try {
    const decoded = verifyToken(refreshToken, 'refresh');
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    const newTokens = generateTokenPair(user);
    res.json(newTokens);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

router.get(
  '/me',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          extension: true,
          sector: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      res.json(user);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar perfil do usuário.' });
    }
  }
);

router.post(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    const { firstName, lastName, email, password } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const admin = await prisma.user.create({
        data: { firstName, lastName, email, password: hashedPassword, role: 'ADMIN' },
      });
      res.json(admin);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Listar todos os Admins
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    res.json(admins);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
