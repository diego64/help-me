import { Router } from 'express';
import { PrismaClient, Setor } from '@prisma/client';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { generateTokenPair, verifyToken } from '../auth/jwt';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Configuração de upload
const upload = multer({ dest: 'uploads/' });

// Interface para criação e edição de usuários
interface usuarioInput {
  nome: string;
  sobrenome: string;
  email: string;
  password?: string;
  telefone?: string;
  ramal?: string;
  setor: Setor;
}

// Criar conta de usuário
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
    try {
      const { nome, sobrenome, email, password, telefone, ramal, setor } = req.body as usuarioInput;

      if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

      const hashedPassword = await bcrypt.hash(password, 10);

      const usuario = await prisma.usuario.create({
        data: {
          nome,
          sobrenome,
          email,
          password: hashedPassword,
          telefone,
          ramal,
          setor,
          regra: 'USUARIO',
        },
      });

      return res.status(201).json(usuario);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// Listar todos os usuários
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { regra: 'USUARIO' },
      select: {
        id: true,
        nome: true,
        sobrenome: true,
        email: true,
        telefone: true,
        ramal: true,
        setor: true,
        avatarUrl: true,
        geradoEm: true,
      },
    });

    res.json(usuarios);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// Buscar um usuário específico pelo e-mail
router.post('/email', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'E-mail é obrigatório e deve ser uma string.' });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { email },
        select: {
          id: true,
          nome: true,
          sobrenome: true,
          email: true,
          telefone: true,
          ramal: true,
          setor: true,
          regra: true,
          avatarUrl: true,
          geradoEm: true,
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

// Editar usuário
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { nome, sobrenome, email, telefone, ramal, setor } = req.body as Partial<usuarioInput>;

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { nome, sobrenome, email, telefone, ramal, setor },
    });

    res.json(usuario);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Alterar senha
router.put('/:id/senha', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body as { password: string };

    if (!password) return res.status(400).json({ error: 'A nova senha é obrigatória.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.usuario.update({
      where: { id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Excluir usuário
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.chamado.deleteMany({ where: { usuarioId: id } });
    await prisma.usuario.delete({ where: { id } });

    res.json({ message: 'Usuário e chamados associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Upload de avatar
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), upload.single('avatar'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Arquivo não enviado.' });

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data: { avatarUrl: file.path },
    });

    res.json({ message: 'Imagem de perfil atualizada com sucesso.', usuario });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
