import { Router } from 'express';
import { PrismaClient, Sector } from '@prisma/client';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { generateTokenPair, verifyToken } from '../auth/jwt';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Configuração de upload
const upload = multer({ dest: 'uploads/' });

// Interface para criação e edição de usuários
interface UserInput {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phone?: string;
  extension?: string;
  sector: Sector;
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Gera os tokens
    const { accessToken, refreshToken, expiresIn } = generateTokenPair(user);

    // Atualiza o refresh token no banco
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    return res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
      expiresIn,
    });
  } catch (err: any) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
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
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token é obrigatório.' });

  try {
    const payload = verifyToken(refreshToken, 'refresh');
    const user = await prisma.user.findUnique({ where: { id: payload.id } });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
    }

    const { accessToken } = generateTokenPair(user);
    res.json({ accessToken });
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'Refresh token inválido.' });
  }
});

router.get('/me', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
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

// Criar conta de usuário (ADMIN)
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
    try {
      const { firstName, lastName, email, password, phone, extension, sector } = req.body as UserInput;

      if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          phone,
          extension,
          sector,
          role: 'USUARIO',
        },
      });

      return res.status(201).json(user);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// Listar todos os usuários (ADMIN)
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const usuarios = await prisma.user.findMany({
      where: { role: 'USUARIO' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        extension: true,
        sector: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    res.json(usuarios);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Buscar um usuário específico pelo e-mail (somente ADMIN)
router.post('/find-by-email', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'E-mail é obrigatório e deve ser uma string.' });
      }

      const usuario = await prisma.user.findUnique({
        where: { email },
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

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      res.json(usuario);
    } catch (err: any) {
      console.error('Erro ao buscar usuário por e-mail:', err);
      res.status(500).json({ error: 'Erro ao buscar usuário.' });
    }
  }
);


// Editar usuário (ADMIN ou próprio usuário)
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, extension, sector } = req.body as Partial<UserInput>;

    const user = await prisma.user.update({
      where: { id },
      data: { firstName, lastName, email, phone, extension, sector },
    });

    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Alterar senha (ADMIN ou próprio usuário)
router.put('/:id/senha', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body as { password: string };

    if (!password) return res.status(400).json({ error: 'A nova senha é obrigatória.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Excluir usuário (ADMIN ou próprio usuário)
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.chamado.deleteMany({ where: { usuarioId: id } });
    await prisma.user.delete({ where: { id } });

    res.json({ message: 'Usuário e chamados associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Upload de avatar (ADMIN ou próprio usuário)
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), upload.single('avatar'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { avatarUrl: file.path },
    });

    res.json({ message: 'Imagem de perfil atualizada com sucesso.', user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
