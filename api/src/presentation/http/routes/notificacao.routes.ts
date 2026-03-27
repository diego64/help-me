import { Router, type IRouter, Response } from 'express';
import { authMiddleware, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { NotificacaoError } from '@application/use-cases/notificacao/errors';
import { listarNotificacoesUseCase }  from '@application/use-cases/notificacao/listar-notificacoes.use-case';
import { marcarLidaUseCase }          from '@application/use-cases/notificacao/marcar-lida.use-case';
import { marcarTodasLidasUseCase }    from '@application/use-cases/notificacao/marcar-todas-lidas.use-case';
import { deletarNotificacaoUseCase }  from '@application/use-cases/notificacao/deletar-notificacao.use-case';

export const router: IRouter = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof NotificacaoError) return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

/**
 * @swagger
 * tags:
 *   name: Notificações
 *   description: Gerenciamento de notificações do usuário autenticado
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Notificacao:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "664f1a2b3c4d5e6f7a8b9c0d"
 *         destinatarioId:
 *           type: string
 *           example: "user_abc123"
 *         lida:
 *           type: boolean
 *           example: false
 *         lidaEm:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: null
 *         criadoEm:
 *           type: string
 *           format: date-time
 *           example: "2024-05-10T14:30:00.000Z"
 */

/**
 * @swagger
 * /api/notificacoes:
 *   get:
 *     summary: Lista notificações do usuário autenticado
 *     description: >
 *       Retorna a lista paginada de notificações do usuário autenticado.
 *       Permite filtrar apenas as não lidas via query param `naoLidas=true`.
 *       O total de notificações não lidas é sempre retornado, independente do filtro aplicado.
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: naoLidas
 *         schema: { type: string, enum: [true, false] }
 *     responses:
 *       200:
 *         description: Lista de notificações retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro interno ao listar notificações
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await listarNotificacoesUseCase({
      usuarioId:      req.usuario!.id,
      page:           Math.max(1, parseInt(req.query.page as string) || 1),
      limit:          Math.min(100, parseInt(req.query.limit as string) || 20),
      apenasNaoLidas: req.query.naoLidas === 'true',
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/notificacoes/marcar-todas-lidas:
 *   patch:
 *     summary: Marca todas as notificações do usuário como lidas
 *     description: >
 *       Marca todas as notificações não lidas do usuário autenticado como lidas de uma só vez.
 *       **Atenção:** este endpoint deve ser declarado antes de `/{id}/lida` no roteador
 *       para evitar conflito com o parâmetro dinâmico `{id}`.
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Todas as notificações marcadas como lidas com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro interno ao marcar notificações
 */
router.patch('/marcar-todas-lidas', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await marcarTodasLidasUseCase(req.usuario!.id);
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/notificacoes/{id}/lida:
 *   patch:
 *     summary: Marca uma notificação como lida
 *     description: >
 *       Marca uma notificação específica como lida, desde que ela pertença
 *       ao usuário autenticado. Retorna a notificação atualizada.
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notificação marcada como lida com sucesso
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Notificação não encontrada
 *       500:
 *         description: Erro interno ao marcar a notificação
 */
router.patch('/:id/lida', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await marcarLidaUseCase({
      notificacaoId: String(req.params.id),
      usuarioId:     req.usuario!.id,
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/notificacoes/{id}:
 *   delete:
 *     summary: Remove uma notificação
 *     description: >
 *       Remove permanentemente uma notificação do banco de dados,
 *       desde que ela pertença ao usuário autenticado.
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notificação removida com sucesso
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Notificação não encontrada
 *       500:
 *         description: Erro interno ao remover a notificação
 */
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await deletarNotificacaoUseCase({
      notificacaoId: String(req.params.id),
      usuarioId:     req.usuario!.id,
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

export default router;