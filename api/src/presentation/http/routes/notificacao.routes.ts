import { Router, type IRouter, Response } from 'express';
import { authMiddleware, AuthRequest } from '@infrastructure/http/middlewares/auth';
import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model';

export const router: IRouter = Router();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número da página (começa em 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Quantidade de itens por página (máximo 100)
 *       - in: query
 *         name: naoLidas
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Se `true`, retorna apenas as notificações não lidas
 *     responses:
 *       200:
 *         description: Lista de notificações retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notificacao'
 *                 naoLidas:
 *                   type: integer
 *                   description: Total de notificações não lidas (sem filtro de página)
 *                   example: 5
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       example: 58
 *                     totalPages:
 *                       type: integer
 *                       example: 3
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrev:
 *                       type: boolean
 *                       example: false
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro interno ao listar notificações
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Erro ao listar notificações"
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_LIMIT, MAX_LIMIT);
      const page  = Math.max(1, parseInt(req.query.page as string) || 1);
      const skip  = (page - 1) * limit;
      const apenasNaoLidas = req.query.naoLidas === 'true';

      const where: any = { destinatarioId: req.usuario!.id };
      if (apenasNaoLidas) where.lida = false;

      const [total, notificacoes, naoLidas] = await Promise.all([
        NotificacaoModel.countDocuments(where),
        NotificacaoModel.find(where)
          .sort({ criadoEm: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        NotificacaoModel.countDocuments({ destinatarioId: req.usuario!.id, lida: false }),
      ]);

      return res.json({
        data: notificacoes,
        naoLidas,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao listar notificações' });
    }
  }
);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Todas as notificações marcadas como lidas"
 *                 atualizadas:
 *                   type: integer
 *                   description: Quantidade de documentos efetivamente modificados
 *                   example: 12
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro interno ao marcar notificações
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Erro ao marcar notificações como lidas"
 */
router.patch(
  '/marcar-todas-lidas',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await NotificacaoModel.updateMany(
        { destinatarioId: req.usuario!.id, lida: false },
        { lida: true, lidaEm: new Date() }
      );

      return res.json({
        message: 'Todas as notificações marcadas como lidas',
        atualizadas: result.modifiedCount,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao marcar notificações como lidas' });
    }
  }
);

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
 *         schema:
 *           type: string
 *         description: ID (ObjectId) da notificação
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notificação marcada como lida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Notificação marcada como lida"
 *                 notificacao:
 *                   $ref: '#/components/schemas/Notificacao'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Notificação não encontrada ou não pertence ao usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Notificação não encontrada"
 *       500:
 *         description: Erro interno ao marcar a notificação como lida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Erro ao marcar notificação como lida"
 */
router.patch(
  '/:id/lida',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const notificacao = await NotificacaoModel.findOneAndUpdate(
        { _id: req.params.id, destinatarioId: req.usuario!.id },
        { lida: true, lidaEm: new Date() },
        { new: true }
      );

      if (!notificacao) {
        return res.status(404).json({ error: 'Notificação não encontrada' });
      }

      return res.json({ message: 'Notificação marcada como lida', notificacao });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao marcar notificação como lida' });
    }
  }
);

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
 *         schema:
 *           type: string
 *         description: ID (ObjectId) da notificação
 *         example: "664f1a2b3c4d5e6f7a8b9c0d"
 *     responses:
 *       200:
 *         description: Notificação removida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Notificação removida"
 *                 id:
 *                   type: string
 *                   description: ID da notificação removida
 *                   example: "664f1a2b3c4d5e6f7a8b9c0d"
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Notificação não encontrada ou não pertence ao usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Notificação não encontrada"
 *       500:
 *         description: Erro interno ao remover a notificação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Erro ao remover notificação"
 */
router.delete(
  '/:id',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const notificacao = await NotificacaoModel.findOneAndDelete({
        _id: req.params.id,
        destinatarioId: req.usuario!.id,
      });

      if (!notificacao) {
        return res.status(404).json({ error: 'Notificação não encontrada' });
      }

      return res.json({ message: 'Notificação removida', id: req.params.id });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao remover notificação' });
    }
  }
);

export default router;