import { Router, Response } from 'express';
import { prisma } from '@infrastructure/database/prisma/client';
import { ChamadoStatus, PrioridadeChamado, NivelTecnico } from '@prisma/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';

export const router: Router = Router();

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const PRIORIDADES_ALTA: PrioridadeChamado[] = ['P1', 'P2', 'P3'];
const PRIORIDADES_BAIXA: PrioridadeChamado[] = ['P4', 'P5'];
const STATUS_FILA: ChamadoStatus[] = [ChamadoStatus.ABERTO, ChamadoStatus.REABERTO];

const ORDEM_PRIORIDADE: Record<PrioridadeChamado, number> = {
  P1: 1, P2: 2, P3: 3, P4: 4, P5: 5,
};

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
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit) || DEFAULT_LIMIT));
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

async function getNivelTecnico(tecnicoId: string): Promise<NivelTecnico | null> {
  const tecnico = await prisma.usuario.findUnique({
    where: { id: tecnicoId },
    select: { nivel: true },
  });
  return tecnico?.nivel ?? null;
}

const CHAMADO_SELECT = {
  id: true,
  OS: true,
  descricao: true,
  descricaoEncerramento: true,
  status: true,
  prioridade: true,
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

// Select mais enxuto para as filas
const FILA_SELECT = {
  id: true,
  OS: true,
  descricao: true,
  status: true,
  prioridade: true,
  geradoEm: true,
  atualizadoEm: true,
  usuario: {
    select: { id: true, nome: true, sobrenome: true, email: true },
  },
  tecnico: {
    select: { id: true, nome: true, sobrenome: true, email: true },
  },
  servicos: {
    select: {
      servico: { select: { id: true, nome: true } },
    },
  },
} as const;

function formatarChamadoFila(chamado: any) {
  const agora = Date.now();
  const abertura = new Date(chamado.geradoEm).getTime();
  const diffMin = Math.floor((agora - abertura) / (1000 * 60));

  let tempoEspera: string;
  if (diffMin < 60) {
    tempoEspera = `${diffMin} min`;
  } else if (diffMin < 1440) {
    tempoEspera = `${Math.floor(diffMin / 60)}h ${diffMin % 60}min`;
  } else {
    tempoEspera = `${Math.floor(diffMin / 1440)}d ${Math.floor((diffMin % 1440) / 60)}h`;
  }

  return {
    id: chamado.id,
    OS: chamado.OS,
    descricao: chamado.descricao,
    status: chamado.status,
    prioridade: chamado.prioridade,
    geradoEm: chamado.geradoEm,
    atualizadoEm: chamado.atualizadoEm,
    tempoEspera,
    usuario: chamado.usuario
      ? {
          id: chamado.usuario.id,
          nome: `${chamado.usuario.nome} ${chamado.usuario.sobrenome}`,
          email: chamado.usuario.email,
        }
      : null,
    tecnico: chamado.tecnico
      ? {
          id: chamado.tecnico.id,
          nome: `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}`,
          email: chamado.tecnico.email,
        }
      : null,
    servicos: chamado.servicos?.map((s: any) => ({
      id: s.servico.id,
      nome: s.servico.nome,
    })) ?? [],
  };
}

/**
 * @swagger
 * tags:
 *   - name: Listagens
 *     description: Listagem e consulta de chamados
 *   - name: Filas
 *     description: Filas de atendimento por prioridade
 */

/**
 * @swagger
 * /api/fila-chamados/fila/resumo:
 *   get:
 *     summary: Resumo das filas por prioridade
 *     description: |
 *       Contagem de chamados aguardando atendimento por fila.
 *       TECNICO N1 vê apenas fila baixa. TECNICO N2/N3 veem apenas fila alta. ADMIN vê ambas.
 *     tags: [Filas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resumo retornado com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao buscar resumo
 */
router.get(
  '/resumo',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      let nivel: NivelTecnico | null = null;

      if (req.usuario!.regra === 'TECNICO') {
        nivel = await getNivelTecnico(req.usuario!.id);
      }

      const mostrarAlta = req.usuario!.regra === 'ADMIN' ||
        nivel === NivelTecnico.N2 ||
        nivel === NivelTecnico.N3;

      const mostrarBaixa = req.usuario!.regra === 'ADMIN' ||
        nivel === NivelTecnico.N1;

      const prioridadesVisiveis = [
        ...(mostrarAlta ? PRIORIDADES_ALTA : []),
        ...(mostrarBaixa ? PRIORIDADES_BAIXA : []),
      ];

      const contagensPorPrioridade = await prisma.chamado.groupBy({
        by: ['prioridade'],
        where: {
          status: { in: STATUS_FILA },
          prioridade: { in: prioridadesVisiveis },
          deletadoEm: null,
        },
        _count: { id: true },
      });

      const porPrioridade: Record<string, number> = Object.fromEntries(
        contagensPorPrioridade.map(c => [c.prioridade, c._count.id])
      );

      const totalAlta = PRIORIDADES_ALTA.reduce((acc, p) => acc + (porPrioridade[p] ?? 0), 0);
      const totalBaixa = PRIORIDADES_BAIXA.reduce((acc, p) => acc + (porPrioridade[p] ?? 0), 0);

      return res.status(200).json({
        filas: {
          ...(mostrarAlta ? {
            alta: {
              total: totalAlta,
              prioridades: {
                P1: porPrioridade['P1'] ?? 0,
                P2: porPrioridade['P2'] ?? 0,
                P3: porPrioridade['P3'] ?? 0,
              },
            },
          } : {}),
          ...(mostrarBaixa ? {
            baixa: {
              total: totalBaixa,
              prioridades: {
                P4: porPrioridade['P4'] ?? 0,
                P5: porPrioridade['P5'] ?? 0,
              },
            },
          } : {}),
        },
        totalGeral: (mostrarAlta ? totalAlta : 0) + (mostrarBaixa ? totalBaixa : 0),
      });
    } catch (err: any) {
      console.error('[FILA RESUMO ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar resumo das filas' });
    }
  }
);

/**
 * @swagger
 * /api/fila-chamados/fila/alta:
 *   get:
 *     summary: Fila de chamados de alta prioridade (P1, P2, P3)
 *     description: |
 *       Retorna chamados ABERTOS ou REABERTOS com prioridade P1, P2 ou P3.
 *       Ordenados por prioridade (P1 primeiro) e depois por data de abertura (mais antigo primeiro).
 *       TECNICO N1 não tem acesso. TECNICO N2 e N3 acessam normalmente. ADMIN acessa sempre.
 *     tags: [Filas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Fila retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Técnico N1 não tem acesso à fila alta
 *       500:
 *         description: Erro ao buscar fila
 */
router.get(
  '/alta',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (req.usuario!.regra === 'TECNICO') {
        const nivel = await getNivelTecnico(req.usuario!.id);
        if (nivel === NivelTecnico.N1) {
          return res.status(403).json({
            error: 'Técnicos N1 não têm acesso à fila de alta prioridade',
          });
        }
      }

      const { page, limit, skip } = getPaginationParams(req.query);

      const where = {
        status: { in: STATUS_FILA },
        prioridade: { in: PRIORIDADES_ALTA },
        deletadoEm: null,
      };

      const [total, chamados] = await Promise.all([
        prisma.chamado.count({ where }),
        prisma.chamado.findMany({
          where,
          select: FILA_SELECT,
          orderBy: { geradoEm: 'asc' },
          take: limit,
          skip,
        }),
      ]);

      // Ordenar por prioridade e desempatar por data
      const ordenados = [...chamados].sort((a, b) => {
        const diffPrioridade =
          ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade];
        if (diffPrioridade !== 0) return diffPrioridade;
        return new Date(a.geradoEm).getTime() - new Date(b.geradoEm).getTime();
      });

      return res.status(200).json({
        fila: 'ALTA',
        prioridades: PRIORIDADES_ALTA,
        ...createPaginatedResponse(ordenados.map(formatarChamadoFila), total, page, limit),
      });
    } catch (err: any) {
      console.error('[FILA ALTA ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar fila de alta prioridade' });
    }
  }
);

/**
 * @swagger
 * /api/fila-chamados/fila/baixa:
 *   get:
 *     summary: Fila de chamados de baixa prioridade (P4, P5)
 *     description: |
 *       Retorna chamados ABERTOS ou REABERTOS com prioridade P4 ou P5.
 *       Ordenados por prioridade (P4 primeiro) e depois por data de abertura (mais antigo primeiro).
 *       TECNICO N2 e N3 não têm acesso. TECNICO N1 acessa normalmente. ADMIN acessa sempre.
 *     tags: [Filas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Fila retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Técnico N2/N3 não tem acesso à fila baixa
 *       500:
 *         description: Erro ao buscar fila
 */
router.get(
  '/baixa',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (req.usuario!.regra === 'TECNICO') {
        const nivel = await getNivelTecnico(req.usuario!.id);
        if (nivel === NivelTecnico.N2 || nivel === NivelTecnico.N3) {
          return res.status(403).json({
            error: `Técnicos ${nivel} não têm acesso à fila de baixa prioridade`,
          });
        }
      }

      const { page, limit, skip } = getPaginationParams(req.query);

      const where = {
        status: { in: STATUS_FILA },
        prioridade: { in: PRIORIDADES_BAIXA },
        deletadoEm: null,
      };

      const [total, chamados] = await Promise.all([
        prisma.chamado.count({ where }),
        prisma.chamado.findMany({
          where,
          select: FILA_SELECT,
          orderBy: { geradoEm: 'asc' },
          take: limit,
          skip,
        }),
      ]);

      const ordenados = [...chamados].sort((a, b) => {
        const diffPrioridade =
          ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade];
        if (diffPrioridade !== 0) return diffPrioridade;
        return new Date(a.geradoEm).getTime() - new Date(b.geradoEm).getTime();
      });

      return res.status(200).json({
        fila: 'BAIXA',
        prioridades: PRIORIDADES_BAIXA,
        ...createPaginatedResponse(ordenados.map(formatarChamadoFila), total, page, limit),
      });
    } catch (err: any) {
      console.error('[FILA BAIXA ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar fila de baixa prioridade' });
    }
  }
);

/**
 * @swagger
 * /api/fila-chamados/meus-chamados:
 *   get:
 *     summary: Lista os chamados criados pelo usuário autenticado
 *     description: Retorna todos os chamados abertos pelo usuário logado, com paginação. Requer perfil USUARIO.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista retornada com sucesso
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

      const where: any = { usuarioId: req.usuario!.id };

      if (status && validarStatus(status as string)) {
        where.status = status as ChamadoStatus;
      }

      if (incluirInativos !== 'true') {
        where.deletadoEm = null;
      }

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

      return res.json(createPaginatedResponse(chamados, total, page, limit));
    } catch (err: any) {
      console.error('[LISTAGEM MEUS CHAMADOS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar chamados do usuário' });
    }
  }
);

/**
 * @swagger
 * /api/fila-chamados/chamados-atribuidos:
 *   get:
 *     summary: Lista os chamados atribuídos ao técnico autenticado
 *     description: Retorna chamados em EM_ATENDIMENTO ou REABERTO atribuídos ao técnico logado. Requer perfil TECNICO.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *       - in: query
 *         name: ordenacao
 *         schema:
 *           type: string
 *           enum: [recentes, antigos, reabertos]
 *     responses:
 *       200:
 *         description: Lista retornada com sucesso
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
      const { ordenacao } = req.query;

      const where = {
        tecnicoId: req.usuario!.id,
        status: { in: [ChamadoStatus.EM_ATENDIMENTO, ChamadoStatus.REABERTO] },
        deletadoEm: null,
      };

      let orderBy: any = { geradoEm: 'desc' };
      if (ordenacao === 'antigos') {
        orderBy = { geradoEm: 'asc' };
      } else if (ordenacao === 'reabertos') {
        orderBy = [{ status: 'desc' }, { geradoEm: 'desc' }];
      }

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

      return res.json(createPaginatedResponse(chamados, total, page, limit));
    } catch (err: any) {
      console.error('[LISTAGEM ATRIBUIDOS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar chamados do técnico' });
    }
  }
);

/**
 * @swagger
 * /api/fila-chamados/todos-chamados:
 *   get:
 *     summary: Lista todos os chamados do sistema (ADMIN)
 *     description: |
 *       Retorna todos os chamados com filtros avançados e paginação. Requer perfil ADMIN.
 *       Filtros disponíveis: status, técnico, usuário, setor, período, busca por OS/descrição.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *       - in: query
 *         name: tecnicoId
 *         schema:
 *           type: string
 *       - in: query
 *         name: usuarioId
 *         schema:
 *           type: string
 *       - in: query
 *         name: setor
 *         schema:
 *           type: string
 *       - in: query
 *         name: dataInicio
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dataFim
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Busca por OS ou descrição
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista retornada com sucesso
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
        status, tecnicoId, usuarioId, setor,
        dataInicio, dataFim, incluirInativos, busca,
      } = req.query;

      const where: any = {};

      if (status) {
        if (!validarStatus(status as string)) {
          return res.status(400).json({
            error: 'Status inválido',
            statusValidos: Object.values(ChamadoStatus),
          });
        }
        where.status = status as ChamadoStatus;
      }

      if (tecnicoId) where.tecnicoId = tecnicoId as string;
      if (usuarioId) where.usuarioId = usuarioId as string;

      if (setor) {
        where.usuario = { setor: setor as string };
      }

      if (dataInicio || dataFim) {
        where.geradoEm = {};
        if (dataInicio) where.geradoEm.gte = new Date(dataInicio as string);
        if (dataFim) {
          const fimDate = new Date(dataFim as string);
          fimDate.setHours(23, 59, 59, 999);
          where.geradoEm.lte = fimDate;
        }
      }

      if (busca) {
        where.OR = [
          { OS: { contains: busca as string, mode: 'insensitive' } },
          { descricao: { contains: busca as string, mode: 'insensitive' } },
        ];
      }

      if (incluirInativos !== 'true') {
        where.deletadoEm = null;
      }

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

      return res.json(createPaginatedResponse(chamados, total, page, limit));
    } catch (err: any) {
      console.error('[LISTAGEM TODOS CHAMADOS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar chamados' });
    }
  }
);

/**
 * @swagger
 * /api/fila-chamados/estatisticas:
 *   get:
 *     summary: Estatísticas gerais de chamados
 *     description: Retorna contadores por status, prioridade e outras métricas. Requer perfil ADMIN.
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
        porPrioridade,
      ] = await Promise.all([
        prisma.chamado.count({ where: { deletadoEm: null } }),
        prisma.chamado.count({ where: { status: ChamadoStatus.ABERTO, deletadoEm: null } }),
        prisma.chamado.count({ where: { status: ChamadoStatus.EM_ATENDIMENTO, deletadoEm: null } }),
        prisma.chamado.count({ where: { status: ChamadoStatus.ENCERRADO, deletadoEm: null } }),
        prisma.chamado.count({ where: { status: ChamadoStatus.CANCELADO, deletadoEm: null } }),
        prisma.chamado.count({ where: { status: ChamadoStatus.REABERTO, deletadoEm: null } }),
        prisma.chamado.count({ where: { tecnicoId: null, deletadoEm: null } }),
        prisma.chamado.groupBy({
          by: ['prioridade'],
          where: { deletadoEm: null },
          _count: { id: true },
        }),
      ]);

      const prioridadeMap = Object.fromEntries(
        porPrioridade.map(p => [p.prioridade, p._count.id])
      );

      return res.json({
        total: totalChamados,
        porStatus: {
          abertos,
          emAtendimento,
          encerrados,
          cancelados,
          reabertos,
        },
        porPrioridade: {
          P1: prioridadeMap['P1'] ?? 0,
          P2: prioridadeMap['P2'] ?? 0,
          P3: prioridadeMap['P3'] ?? 0,
          P4: prioridadeMap['P4'] ?? 0,
          P5: prioridadeMap['P5'] ?? 0,
        },
        filaAlta: (prioridadeMap['P1'] ?? 0) + (prioridadeMap['P2'] ?? 0) + (prioridadeMap['P3'] ?? 0),
        filaBaixa: (prioridadeMap['P4'] ?? 0) + (prioridadeMap['P5'] ?? 0),
        pendentes: abertos + reabertos,
        semTecnico,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[ESTATISTICAS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
  }
);

export default router;