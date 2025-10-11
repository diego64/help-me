import { Router } from 'express';
import { PrismaClient, Sector } from '@prisma/client';
import bcrypt from 'bcrypt';
import multer from 'multer';
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

/**
 * Criar conta de Usuário
 * Permissão: Qualquer (público)
 */
router.post('/',
  authMiddleware,
  authorizeRoles('ADMIN'), 
  async (req, res) => {
    try {
      const { firstName, lastName, email, password, phone, extension, sector } = req.body as UserInput;

      if (!password) {
        return res.status(400).json({ error: 'Senha obrigatória.' });
      }

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
});

/**
 * Listar todos os usuários
 * Permissão: ADMIN
 */
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

/**
 * Editar usuário
 * Permissão: ADMIN (ou o próprio usuário)
 */
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

/**
 * Alterar senha do usuário
 * Permissão: ADMIN ou o próprio usuário
 */
router.put('/:id/senha', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body as { password: string };

    if (!password) {
      return res.status(400).json({ error: 'A nova senha é obrigatória.' });
    }

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

/**
 * Excluir usuário
 * Permissão: ADMIN (ou o próprio usuário)
 * Ao excluir um usuário, seus chamados também são removidos.
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Excluir todos os chamados do usuário
    await prisma.chamado.deleteMany({
      where: { usuarioId: id },
    });

    // Excluir o usuário
    await prisma.user.delete({ where: { id } });

    res.json({ message: 'Usuário e chamados associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Upload de imagem do Usuário
 * Permissão: ADMIN ou o próprio usuário
 */
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), upload.single('avatar'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Arquivo não enviado.' });
  }

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
