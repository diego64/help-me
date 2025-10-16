import { Router } from 'express';
import { PrismaClient, ChamadoStatus } from '@prisma/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

/**
 * Listar chamados do usuário logado
 * (Apenas o próprio usuário)
 */
router.get('/meus-chamados',
  authMiddleware,
  authorizeRoles('USUARIO'),
  async (req: any, res) => {
    try {
      const chamados = await prisma.chamado.findMany({
        where: { usuarioId: req.user.id },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          services: { include: { service: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(chamados);
    } catch (err) {
      console.error('Erro ao listar chamados do usuário:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados do usuário.' });
    }
  }
);

/**
 * Listar chamados atribuídos ao técnico logado
 */
router.get(
  '/chamados-tecnico',
  authMiddleware,
  authorizeRoles('TECNICO'),
  async (req: any, res) => {
    try {
      const chamados = await prisma.chamado.findMany({
        where: {
          tecnicoId: req.user.id,
          status: 'EM_ATENDIMENTO',
        },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          services: { include: { service: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(chamados);
    } catch (err) {
      console.error('Erro ao listar chamados do técnico:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados do técnico.' });
    }
  }
);

/**
 * Listar todos os chamados aplicando filtros no status
 */
router.get(
  '/todos-chamados',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req, res) => {
    try {
      const { status } = req.query as { status?: string };

      const statusValidos = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO'];

      if (!status) {
        return res.status(400).json({ error: 'O parâmetro "status" é obrigatório.' });
      }

      if (!statusValidos.includes(status)) {
        return res.status(400).json({
          error: `Status inválido. Use um dos seguintes: ${statusValidos.join(', ')}`,
        });
      }

      // Assegurar que o valor de status corresponde a uma das opções válidas definidas
      const statusEnum = status as unknown as ChamadoStatus;

      const chamados = await prisma.chamado.findMany({
        where: { status: statusEnum },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          services: { include: { service: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json(chamados);
    } catch (err) {
      console.error('Erro ao listar chamados por status:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados por status.' });
    }
  }
);

/**
 * Listar chamados ABERTOS
 */
router.get(
  '/abertos',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (_req, res) => {
    try {
      const chamados = await prisma.chamado.findMany({
        where: { status: 'ABERTO' },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          services: { include: { service: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(chamados);
    } catch (err) {
      console.error('Erro ao listar chamados abertos:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados abertos.' });
    }
  }
);

export default router;
