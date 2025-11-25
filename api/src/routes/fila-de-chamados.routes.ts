import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ChamadoStatus } from '@prisma/client';
import { authMiddleware, authorizeRoles } from '../middleware/auth';

const router = Router();

// ============================================================================
// LISTAGEM DOS CHAMADOS DO USUARIO LOGADO
// ============================================================================

router.get('/meus-chamados',
  authMiddleware,
  authorizeRoles('USUARIO'),
  async (req: any, res) => {
    try {
      const chamados = await prisma.chamado.findMany({
        where: { usuarioId: req.usuario.id },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          servicos: { include: { servico: { select: { nome: true } } } },
        },
        orderBy: { geradoEm: 'desc' },
      });

      return res.json(chamados);
    } catch (err) {
      console.error('Erro ao listar chamados do usuário:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados do usuário.' });
    }
  }
);

// ============================================================================
// LISTAGEM DOS CHAMADOS ATRIBUIDO AO TECNICO LOGADO
// ============================================================================

router.get('/chamados-atribuidos',
  authMiddleware,
  authorizeRoles('TECNICO'),
  async (req: any, res) => {
    try {
      const chamados = await prisma.chamado.findMany({
        where: {
          tecnicoId: req.usuario.id,
          status: { in: ['EM_ATENDIMENTO', 'REABERTO'] },
        },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          servicos: {
            select: {
              servicoId: true,
              servico: { select: { nome: true } }
            }
          }
        },
        orderBy: { geradoEm: 'desc' },
      });

      const response = chamados.map(chamado => ({
        id: chamado.id,
        OS: chamado.OS,
        descricao: chamado.descricao,
        descricaoEncerramento: chamado.descricaoEncerramento,
        status: chamado.status,
        geradoEm: chamado.geradoEm,
        atualizadoEm: chamado.atualizadoEm,
        encerradoEm: chamado.encerradoEm,
        usuario: chamado.usuario,
        tecnico: chamado.tecnico,
        TipoDeServico: chamado.servicos
      }));

      return res.json(response);
    } catch (err) {
      console.error('Erro ao listar chamados do técnico:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados do técnico.' });
    }
  }
);

// ============================================================================
// LISTAGEM DE TODOS OS CHAMADOS APLICANDO FILTROS NO STATUS
// ============================================================================

router.get('/todos-chamados',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req, res) => {
    try {
      const { status } = req.query as { status?: string };

      const statusValidos = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO', 'REABERTO'];

      if (!status) {
        return res.status(400).json({ error: 'O parâmetro "status" é obrigatório.' });
      }

      if (!statusValidos.includes(status)) {
        return res.status(400).json({
          error: `Status inválido. Use um dos seguintes: ${statusValidos.join(', ')}`,
        });
      }

      // Assegurar que o valor de status corresponde a uma das opções válidas definidas
      const ChamadoStatus = status as unknown as ChamadoStatus;

      const chamados = await prisma.chamado.findMany({
        where: { status: ChamadoStatus },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          servicos: { include: { servico: { select: { nome: true } } } },
        },
        orderBy: { geradoEm: 'desc' },
      });

      return res.status(200).json(chamados);
    } catch (err) {
      console.error('Erro ao listar chamados por status:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados por status.' });
    }
  }
);

// ============================================================================
// LISTAGEM DE TODOS OS CHAMADOS COM STATUS ABERTO
// ============================================================================

router.get('/abertos',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (_req, res) => {
    try {
      const chamados = await prisma.chamado.findMany({
        where: { status: { in: ['ABERTO', 'REABERTO'] } },
        include: {
          usuario: { select: { id: true, email: true } },
          tecnico: { select: { id: true, email: true } },
          servicos: { include: { servico: { select: { nome: true } } } },
        },
        orderBy: { geradoEm: 'desc' },
      });

      return res.json(chamados);
    } catch (err) {
      console.error('Erro ao listar chamados abertos:', err);
      return res.status(500).json({ error: 'Erro ao listar chamados abertos.' });
    }
  }
);

export default router;
