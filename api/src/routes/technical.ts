import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
const router = Router();

// Configuração de upload
const upload = multer({ dest: 'uploads/' });

// Criar conta de Técnico
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { firstName, lastName, email, password, phone, extension } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Senha obrigatória.' });
  }

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
        sector: 'TECNOLOGIA_INFORMACAO'
      },
    });

    // Criar horários padrão
      await prisma.timeSlot.create({
        data: {
          userId: tecnico.id,
          start: '08:00',
          end: '16:00',
        }
      });

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

// Editar Técnico
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
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

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const tecnico = await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Alterar horários de disponibilidade
router.put(
  '/:id/horarios',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { start, end }: { start: string; end: string } = req.body;

    try {
      // Verificar se os horários foram enviados corretamente
      if (!start || !end) {
        return res.status(400).json({ error: 'Os campos start e end são obrigatórios.' });
      }

      // Deletar horário antigo
      await prisma.timeSlot.deleteMany({ where: { userId: id } });

      // Criar novo horário
      const horario = await prisma.timeSlot.create({
        data: { userId: id, start, end },
      });

      res.json({
        message: 'Horário de disponibilidade atualizado com sucesso',
        horario,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Upload de imagem do Técnico
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), upload.single('avatar'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Arquivo não enviado' });

  try {
    const tecnico = await prisma.user.update({
      where: { id },
      data: { avatarUrl: file.path }, // ou salvar no S3 e colocar a URL aqui
    });
    res.json({ message: 'Imagem enviada com sucesso', tecnico });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Excluir Técnico
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {

    await prisma.timeSlot.deleteMany({
      where: { userId: id },
    });

    // Depois, deletar o usuário técnico
    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: 'Técnico e horários associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
