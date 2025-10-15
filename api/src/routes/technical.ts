import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';
import { generateTokenPair, verifyToken } from '../auth/jwt';

const prisma = new PrismaClient();
const router = Router();

// Configuração de upload
const upload = multer({ dest: 'uploads/' });

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verifica se o usuário existe
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    // Verifica a senha
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // Gera tokens (access e refresh)
    const { accessToken, refreshToken, expiresIn } = generateTokenPair(user);

    // Atualiza o refreshToken no banco
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    // Retorna o formato padronizado
    return res.json({
      user: {
        id: user.id,
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
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token não fornecido' });

  try {
    const tokenPayload = verifyToken(refreshToken, 'refresh');

    const user = await prisma.user.findUnique({ where: { id: tokenPayload.id } });
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Refresh token inválido' });
    }

    const { accessToken, expiresIn } = generateTokenPair(user);
    res.json({ accessToken, expiresIn });
  } catch (err: any) {
    return res.status(401).json({ error: err.message || 'Refresh token inválido' });
  }
});

router.get(
  '/me',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
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

// Criar Técnico
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { firstName, lastName, email, password, phone, extension } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const tecnico = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phone,
        extension,
        role: 'TECNICO',
        sector: 'TECNOLOGIA_INFORMACAO',
      },
    });

    // Criar horários padrão
    await prisma.timeSlot.create({ data: { userId: tecnico.id, start: '08:00', end: '16:00' } });

    res.json(tecnico);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Listar todos os Técnicos
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const tecnicos = await prisma.user.findMany({
    where: { role: 'TECNICO' },
    include: { tecnicoDisponibilidade: true },
  });
  res.json(tecnicos);
});


// Editar Perfil
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, phone, extension } = req.body;

  try {
    const tecnico = await prisma.user.update({
      where: { id },
      data: { firstName, lastName, email, phone, extension },
    });
    res.json(tecnico);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Alterar senha do Técnico
router.put('/:id/password', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id }, data: { password: hashedPassword } });
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Alterar horários de disponibilidade do Técnico
router.put('/:id/horarios', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { start, end }: { start: string; end: string } = req.body;

  if (!start || !end) return res.status(400).json({ error: 'Campos start e end são obrigatórios.' });

  try {
    // Deletar horários antigos
    await prisma.timeSlot.deleteMany({ where: { userId: id } });

    // Criar novos horários
    const horario = await prisma.timeSlot.create({ data: { userId: id, start, end } });

    res.json({ message: 'Horário de disponibilidade atualizado com sucesso', horario });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Upload de avatar do Técnico
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), upload.single('avatar'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Arquivo não enviado' });

  try {
    const tecnico = await prisma.user.update({ where: { id }, data: { avatarUrl: file.path } });
    res.json({ message: 'Imagem enviada com sucesso', tecnico });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Excluir Técnico e horários
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    await prisma.timeSlot.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    res.json({ message: 'Técnico e horários associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
