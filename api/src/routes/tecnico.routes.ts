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

router.get(
  '/me',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.usuario) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id: req.usuario.id },
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
      res.status(500).json({ error: 'Erro ao buscar perfil do usuário.' });
    }
  }
);

// Criar Técnico
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { nome, sobrenome, email, password, telefone, ramal } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const tecnico = await prisma.usuario.create({
      data: {
        nome,
        sobrenome,
        email,
        password: hashedPassword,
        telefone,
        ramal,
        regra: 'TECNICO',
        setor: 'TECNOLOGIA_INFORMACAO',
      },
    });

    // Criar horários padrão
    await prisma.expediente.create({ data: { usuarioId: tecnico.id, entrada: '08:00', saida: '16:00' } });

    res.json(tecnico);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Listar todos os Técnicos
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const tecnicos = await prisma.usuario.findMany({
    where: { regra: 'TECNICO' },
    include: { tecnicoDisponibilidade: true },
  });
  res.json(tecnicos);
});

// Editar Perfil
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { nome, sobrenome, email, telefone, ramal } = req.body;

  try {
    const tecnico = await prisma.usuario.update({
      where: { id },
      data: { nome, sobrenome, email, telefone, ramal },
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
    await prisma.usuario.update({ where: { id }, data: { password: hashedPassword } });
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Alterar horários de disponibilidade do Técnico
router.put('/:id/horarios', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { entrada, saida }: { entrada: string; saida: string } = req.body;

  if (!entrada || !saida) return res.status(400).json({ error: 'Campos entrada e saida são obrigatórios.' });

  try {
    // Deletar horários antigos
    await prisma.expediente.deleteMany({ where: { usuarioId: id } });

    // Criar novos horários
    const horario = await prisma.expediente.create({ data: { usuarioId: id, entrada, saida } });

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
    const tecnico = await prisma.usuario.update({ where: { id }, data: { avatarUrl: file.path } });
    res.json({ message: 'Imagem enviada com sucesso', tecnico });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Excluir Técnico e horários
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    await prisma.expediente.deleteMany({ where: { usuarioId: id } });
    await prisma.usuario.delete({ where: { id } });

    res.json({ message: 'Técnico e horários associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
