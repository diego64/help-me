import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ChamadoStatus } from '@prisma/client';
import { authMiddleware, authorizeRoles } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Fila de chamados
 *   description: Endpoints para listagem e consulta de chamados
 */

// ========================================
// LISTAGEM DOS CHAMADOS DO USUARIO LOGADO
// ========================================

/**
 * @swagger
 * /api/listagens/meus-chamados:
 *   get:
 *     summary: Lista os chamados criados pelo usuário autenticado
 *     description: Retorna todos os chamados que foram abertos pelo usuário logado, incluindo informações do técnico responsável e serviços relacionados. Ordenados por data de criação (mais recentes primeiro). Requer autenticação e perfil USUARIO.
 *     tags: [Fila de chamados]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de chamados retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   OS:
 *                     type: string
 *                   descricao:
 *                     type: string
 *                   descricaoEncerramento:
 *                     type: string
 *                     nullable: true
 *                   status:
 *                     type: string
 *                     enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *                   geradoEm:
 *                     type: string
 *                     format: date-time
 *                   atualizadoEm:
 *                     type: string
 *                     format: date-time
 *                   encerradoEm:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   usuario:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                   tecnico:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                   servicos:
 *                     type: array
 *                     items:
 *                       type: object
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil USUARIO)
 *       500:
 *         description: Erro ao listar chamados do usuário
 */
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

// ==========================================================
// LISTAGEM DOS CHAMADOS ATRIBUIDO AO TECNICO LOGADO
// ==========================================================

/**
 * @swagger
 * /api/listagens/chamados-atribuidos:
 *   get:
 *     summary: Lista os chamados atribuídos ao técnico autenticado
 *     description: Retorna todos os chamados que estão atualmente atribuídos ao técnico logado e que estão com status EM_ATENDIMENTO ou REABERTO. Inclui informações do usuário solicitante e serviços relacionados. Ordenados por data de criação (mais recentes primeiro). Requer autenticação e perfil TECNICO.
 *     tags: [Fila de chamados]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de chamados atribuídos retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   OS:
 *                     type: string
 *                   descricao:
 *                     type: string
 *                   descricaoEncerramento:
 *                     type: string
 *                     nullable: true
 *                   status:
 *                     type: string
 *                     enum: [EM_ATENDIMENTO, REABERTO]
 *                   geradoEm:
 *                     type: string
 *                     format: date-time
 *                   atualizadoEm:
 *                     type: string
 *                     format: date-time
 *                   encerradoEm:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   usuario:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                   tecnico:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                   TipoDeServico:
 *                     type: array
 *                     items:
 *                       type: object
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil TECNICO)
 *       500:
 *         description: Erro ao listar chamados do técnico
 */
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

// ==========================================================
// LISTAGEM DE TODOS OS CHAMADOS APLICANDO FILTROS NO STATUS
// ==========================================================

/**
 * @swagger
 * /api/listagens/todos-chamados:
 *   get:
 *     summary: Lista todos os chamados filtrados por status
 *     description: Retorna todos os chamados do sistema filtrados por um status específico. Requer autenticação e perfil ADMIN.
 *     tags: [Fila de chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *         description: Status do chamado para filtrar
 *     responses:
 *       200:
 *         description: Lista de chamados retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: Parâmetro status ausente ou inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       500:
 *         description: Erro ao listar chamados por status
 */
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

// ================================================
// LISTAGEM DE TODOS OS CHAMADOS COM STATUS ABERTO
// ================================================

/**
 * @swagger
 * /api/listagens/abertos:
 *   get:
 *     summary: Lista todos os chamados abertos ou reabertos
 *     description: Retorna todos os chamados que estão com status ABERTO ou REABERTO, disponíveis para atribuição a técnicos. Inclui informações do usuário solicitante e serviços relacionados. Ordenados por data de criação (mais recentes primeiro). Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Fila de chamados]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de chamados abertos retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   OS:
 *                     type: string
 *                   descricao:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [ABERTO, REABERTO]
 *                   geradoEm:
 *                     type: string
 *                     format: date-time
 *                   usuario:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                   tecnico:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                   servicos:
 *                     type: array
 *                     items:
 *                       type: object
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou TECNICO)
 *       500:
 *         description: Erro ao listar chamados abertos
 */
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