import { Router, Response } from 'express';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { FilaError } from '@application/use-cases/fila/errors';
import { resumoFilaUseCase } from '@application/use-cases/fila/resumo-fila.use-case';
import { filaAltaUseCase } from '@application/use-cases/fila/fila-alta.use-case';
import { filaBaixaUseCase } from '@application/use-cases/fila/fila-baixa.use-case';
import { meusChamadosUseCase } from '@application/use-cases/fila/meus-chamados.use-case';
import { chamadosAtribuidosUseCase } from '@application/use-cases/fila/chamados-atribuidos.use-case';
import { todosChamadosUseCase } from '@application/use-cases/fila/todos-chamados.use-case';
import { estatisticasUseCase } from '@application/use-cases/fila/estatisticas.use-case';

export const router: Router = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof FilaError) return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

function getPagination(query: any) {
  return {
    page:  Math.max(1, parseInt(query.page) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit) || 10)),
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
router.get('/resumo', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await resumoFilaUseCase({ usuarioId: req.usuario!.id, usuarioRegra: req.usuario!.regra });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

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
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
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
router.get('/alta', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = getPagination(req.query);
    const result = await filaAltaUseCase({ page, limit, usuarioId: req.usuario!.id, usuarioRegra: req.usuario!.regra });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

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
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
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
router.get('/baixa', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = getPagination(req.query);
    const result = await filaBaixaUseCase({ page, limit, usuarioId: req.usuario!.id, usuarioRegra: req.usuario!.regra });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

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
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO] }
 *       - in: query
 *         name: incluirInativos
 *         schema: { type: boolean }
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
router.get('/meus-chamados', authMiddleware, authorizeRoles('USUARIO'), async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = getPagination(req.query);
    const result = await meusChamadosUseCase({
      page, limit,
      usuarioId:      req.usuario!.id,
      status:         req.query.status as string,
      incluirInativos: req.query.incluirInativos === 'true',
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

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
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: ordenacao
 *         schema: { type: string, enum: [recentes, antigos, reabertos] }
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
router.get('/chamados-atribuidos', authMiddleware, authorizeRoles('TECNICO'), async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = getPagination(req.query);
    const result = await chamadosAtribuidosUseCase({
      page, limit,
      tecnicoId:  req.usuario!.id,
      ordenacao:  req.query.ordenacao as string,
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/fila-chamados/todos-chamados:
 *   get:
 *     summary: Lista todos os chamados do sistema (ADMIN)
 *     description: |
 *       Retorna todos os chamados com filtros avançados e paginação. Requer perfil ADMIN.
 *     tags: [Listagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO] }
 *       - in: query
 *         name: tecnicoId
 *         schema: { type: string }
 *       - in: query
 *         name: usuarioId
 *         schema: { type: string }
 *       - in: query
 *         name: setor
 *         schema: { type: string }
 *       - in: query
 *         name: dataInicio
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dataFim
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *       - in: query
 *         name: incluirInativos
 *         schema: { type: boolean }
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
router.get('/todos-chamados', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = getPagination(req.query);
    const result = await todosChamadosUseCase({
      page, limit,
      status:          req.query.status      as string,
      tecnicoId:       req.query.tecnicoId   as string,
      usuarioId:       req.query.usuarioId   as string,
      setor:           req.query.setor       as string,
      dataInicio:      req.query.dataInicio  as string,
      dataFim:         req.query.dataFim     as string,
      busca:           req.query.busca       as string,
      incluirInativos: req.query.incluirInativos === 'true',
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

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
router.get('/estatisticas', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await estatisticasUseCase();
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

export default router;