import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ChamadoStatus } from '@prisma/client';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

export const router: Router = Router();

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

interface ListagemResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

function getPaginationParams(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}


function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): ListagemResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

function validarStatus(status: string): status is ChamadoStatus {
  return Object.values(ChamadoStatus).includes(status as ChamadoStatus);
}

const CHAMADO_SELECT = {
  id: true,
  OS: true,
  descricao: true,
  descricaoEncerramento: true,
  status: true,
  geradoEm: true,
  atualizadoEm: true,
  encerradoEm: true,
  deletadoEm: true,
  usuario: {
    select: {
      id: true,
      nome: true,
      sobrenome: true,
      email: true,
      setor: true,
    },
  },
  tecnico: {
    select: {
      id: true,
      nome: true,
      sobrenome: true,
      email: true,
    },
  },
  servicos: {
    select: {
      id: true,
      servicoId: true,
      servico: {
        select: {
          id: true,
          nome: true,
          descricao: true,
        },
      },
    },
  },
} as const;

/**
 * @swagger
 * tags:
 *   name: Fila de Chamados
 *   description: Endpoints para listagem e consulta de chamados
 */

// ========================================
// MEUS CHAMADOS (USUARIO)
// ========================================

/**
 * @swagger
 * /api/filadechamados/meus-chamados:
 *   get:
 *     summary: Lista os chamados criados pelo usuário autenticado
 *     description: Retorna todos os chamados que foram abertos pelo usuário logado, com paginação. Requer autenticação e perfil USUARIO.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Itens por página
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *         description: Filtrar por status (opcional)
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *         description: Incluir chamados deletados
 *     responses:
 *       200:
 *         description: Lista de chamados retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar chamados
 */
router.get(
  '/meus-chamados',
  authMiddleware,
  authorizeRoles('USUARIO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { status, incluirInativos } = req.query;

      // Construir filtros
      const where: any = {
        usuarioId: req.usuario!.id,
      };

      if (status && validarStatus(status as string)) {
        where.status = status as ChamadoStatus;
      }

      if (incluirInativos !== 'true') {
        where.deletadoEm = null;
      }

      // Buscar total e chamados em paralelo
      const [total, chamados] = await Promise.all([
        prisma.chamado.count({ where }),
        prisma.chamado.findMany({
          where,
          select: CHAMADO_SELECT,
          orderBy: { geradoEm: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      const response = createPaginatedResponse(chamados, total, page, limit);

      res.json(response);
    } catch (err: any) {
      console.error('[LISTAGEM MEUS CHAMADOS ERROR]', err);
      res.status(500).json({
        error: 'Erro ao listar chamados do usuário',
      });
    }
  }
);

// ========================================
// CHAMADOS ATRIBUÍDOS (TECNICO)
// ========================================

/**
 * @swagger
 * /api/filadechamados/chamados-atribuidos:
 *   get:
 *     summary: Lista os chamados atribuídos ao técnico autenticado
 *     description: Retorna todos os chamados que estão atualmente atribuídos ao técnico logado e que estão com status EM_ATENDIMENTO ou REABERTO. Requer autenticação e perfil TECNICO.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - in: query
 *         name: prioridade
 *         schema:
 *           type: string
 *           enum: [recentes, antigos, reabertos]
 *         description: Ordenação customizada
 *     responses:
 *       200:
 *         description: Lista de chamados atribuídos retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar chamados
 */
router.get(
  '/chamados-atribuidos',
  authMiddleware,
  authorizeRoles('TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { prioridade } = req.query;

      const where = {
        tecnicoId: req.usuario!.id,
        status: { in: [ChamadoStatus.EM_ATENDIMENTO, ChamadoStatus.REABERTO] },
        deletadoEm: null,
      };

      // Definir ordenação
      let orderBy: any = { geradoEm: 'desc' };

      if (prioridade === 'antigos') {
        orderBy = { geradoEm: 'asc' };
      } else if (prioridade === 'reabertos') {
        orderBy = [{ status: 'desc' }, { geradoEm: 'desc' }];
      }

      // Buscar em paralelo
      const [total, chamados] = await Promise.all([
        prisma.chamado.count({ where }),
        prisma.chamado.findMany({
          where,
          select: CHAMADO_SELECT,
          orderBy,
          skip,
          take: limit,
        }),
      ]);

      const response = createPaginatedResponse(chamados, total, page, limit);

      res.json(response);
    } catch (err: any) {
      console.error('[LISTAGEM ATRIBUIDOS ERROR]', err);
      res.status(500).json({
        error: 'Erro ao listar chamados do técnico',
      });
    }
  }
);

// ========================================
// TODOS OS CHAMADOS (ADMIN)
// ========================================

/**
 * @swagger
 * /api/filadechamados/todos-chamados:
 *   get:
 *     summary: Lista todos os chamados do sistema
 *     description: Retorna todos os chamados do sistema com filtros avançados e paginação. Requer autenticação e perfil ADMIN.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *         description: Filtrar por status
 *       - in: query
 *         name: tecnicoId
 *         schema:
 *           type: string
 *         description: Filtrar por técnico
 *       - in: query
 *         name: usuarioId
 *         schema:
 *           type: string
 *         description: Filtrar por usuário
 *       - in: query
 *         name: setor
 *         schema:
 *           type: string
 *         description: Filtrar por setor do usuário
 *       - in: query
 *         name: dataInicio
 *         schema:
 *           type: string
 *           format: date
 *         description: Data inicial (YYYY-MM-DD)
 *       - in: query
 *         name: dataFim
 *         schema:
 *           type: string
 *           format: date
 *         description: Data final (YYYY-MM-DD)
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *         description: Incluir chamados deletados
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Buscar em OS ou descrição
 *     responses:
 *       200:
 *         description: Lista de chamados retornada com sucesso
 *       400:
 *         description: Parâmetros inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar chamados
 */
router.get(
  '/todos-chamados',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const {
        status,
        tecnicoId,
        usuarioId,
        setor,
        dataInicio,
        dataFim,
        incluirInativos,
        busca,
      } = req.query;

      // Construir filtros
      const where: any = {};

      // Filtro de status
      if (status) {
        if (!validarStatus(status as string)) {
          return res.status(400).json({
            error: 'Status inválido',
            statusValidos: Object.values(ChamadoStatus),
          });
        }
        where.status = status as ChamadoStatus;
      }

      // Filtro de técnico
      if (tecnicoId) {
        where.tecnicoId = tecnicoId as string;
      }

      // Filtro de usuário
      if (usuarioId) {
        where.usuarioId = usuarioId as string;
      }

      // Filtro de setor (via usuário)
      if (setor) {
        where.usuario = {
          setor: setor as string,
        };
      }

      // Filtro de data
      if (dataInicio || dataFim) {
        where.geradoEm = {};

        if (dataInicio) {
          where.geradoEm.gte = new Date(dataInicio as string);
        }

        if (dataFim) {
          const fimDate = new Date(dataFim as string);
          fimDate.setHours(23, 59, 59, 999);
          where.geradoEm.lte = fimDate;
        }
      }

      // Filtro de busca (OS ou descrição)
      if (busca) {
        where.OR = [
          { OS: { contains: busca as string, mode: 'insensitive' } },
          { descricao: { contains: busca as string, mode: 'insensitive' } },
        ];
      }

      // Filtro de soft delete
      if (incluirInativos !== 'true') {
        where.deletadoEm = null;
      }

      // Buscar em paralelo
      const [total, chamados] = await Promise.all([
        prisma.chamado.count({ where }),
        prisma.chamado.findMany({
          where,
          select: CHAMADO_SELECT,
          orderBy: { geradoEm: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      const response = createPaginatedResponse(chamados, total, page, limit);

      res.json(response);
    } catch (err: any) {
      console.error('[LISTAGEM TODOS CHAMADOS ERROR]', err);
      res.status(500).json({
        error: 'Erro ao listar chamados',
      });
    }
  }
);

// ========================================
// CHAMADOS ABERTOS (FILA)
// ========================================

/**
 * @swagger
 * /api/filadechamados/abertos:
 *   get:
 *     summary: Lista todos os chamados abertos ou reabertos (fila)
 *     description: Retorna todos os chamados que estão com status ABERTO ou REABERTO, disponíveis para atribuição a técnicos. Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - in: query
 *         name: setor
 *         schema:
 *           type: string
 *         description: Filtrar por setor do usuário
 *       - in: query
 *         name: ordenacao
 *         schema:
 *           type: string
 *           enum: [recentes, antigos, prioridade]
 *         description: Ordenação (prioridade = reabertos primeiro)
 *     responses:
 *       200:
 *         description: Lista de chamados abertos retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar chamados abertos
 */
router.get(
  '/abertos',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page, limit, skip } = getPaginationParams(req.query);
      const { setor, ordenacao } = req.query;

      // Construir filtros
      const where: any = {
        status: { in: [ChamadoStatus.ABERTO, ChamadoStatus.REABERTO] },
        deletadoEm: null,
      };

      // Filtro de setor
      if (setor) {
        where.usuario = {
          setor: setor as string,
        };
      }

      // Definir ordenação
      let orderBy: any = { geradoEm: 'desc' };

      if (ordenacao === 'antigos') {
        orderBy = { geradoEm: 'asc' };
      } else if (ordenacao === 'prioridade') {
        // Reabertos primeiro, depois por data
        orderBy = [{ status: 'desc' }, { geradoEm: 'desc' }];
      }

      // Buscar em paralelo
      const [total, chamados] = await Promise.all([
        prisma.chamado.count({ where }),
        prisma.chamado.findMany({
          where,
          select: CHAMADO_SELECT,
          orderBy,
          skip,
          take: limit,
        }),
      ]);

      const response = createPaginatedResponse(chamados, total, page, limit);

      res.json(response);
    } catch (err: any) {
      console.error('[LISTAGEM ABERTOS ERROR]', err);
      res.status(500).json({
        error: 'Erro ao listar chamados abertos',
      });
    }
  }
);

// ========================================
// ESTATÍSTICAS DE CHAMADOS (DASHBOARD)
// ========================================

/**
 * @swagger
 * /api/filadechamados/estatisticas:
 *   get:
 *     summary: Retorna estatísticas gerais de chamados
 *     description: Retorna contadores de chamados por status, técnicos e outras métricas. Requer autenticação e perfil ADMIN.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas retornadas com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao buscar estatísticas
 */
router.get(
  '/estatisticas',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const [
        totalChamados,
        abertos,
        emAtendimento,
        encerrados,
        cancelados,
        reabertos,
        semTecnico,
        porSetor,
      ] = await Promise.all([
        prisma.chamado.count({ where: { deletadoEm: null } }),
        prisma.chamado.count({
          where: { status: ChamadoStatus.ABERTO, deletadoEm: null },
        }),
        prisma.chamado.count({
          where: { status: ChamadoStatus.EM_ATENDIMENTO, deletadoEm: null },
        }),
        prisma.chamado.count({
          where: { status: ChamadoStatus.ENCERRADO, deletadoEm: null },
        }),
        prisma.chamado.count({
          where: { status: ChamadoStatus.CANCELADO, deletadoEm: null },
        }),
        prisma.chamado.count({
          where: { status: ChamadoStatus.REABERTO, deletadoEm: null },
        }),
        prisma.chamado.count({
          where: { tecnicoId: null, deletadoEm: null },
        }),
        prisma.chamado.groupBy({
          by: ['usuarioId'],
          where: { deletadoEm: null },
          _count: true,
        }),
      ]);

      const estatisticas = {
        total: totalChamados,
        porStatus: {
          abertos,
          emAtendimento,
          encerrados,
          cancelados,
          reabertos,
        },
        pendentes: abertos + reabertos,
        semTecnico,
        timestamp: new Date().toISOString(),
      };

      res.json(estatisticas);
    } catch (err: any) {
      console.error('[ESTATISTICAS ERROR]', err);
      res.status(500).json({
        error: 'Erro ao buscar estatísticas',
      });
    }
  }
);

export default router;