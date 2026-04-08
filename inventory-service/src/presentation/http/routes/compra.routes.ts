import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '@infrastructure/http/middlewares/auth.middleware';
import { FormaPagamento } from '@/domain/compra/solicitacao-compra.entity';
import { DomainError } from '@/domain/shared/domain.error';
import { parseMoneyOpcional } from '@/shared/money';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { CriarSolicitacaoCompraUseCase } from '@application/use-cases/compra/criar-solicitacao-compra.use-case';
import { AprovarSolicitacaoCompraUseCase } from '@application/use-cases/compra/aprovar-solicitacao-compra.use-case';
import { RejeitarSolicitacaoCompraUseCase } from '@application/use-cases/compra/rejeitar-solicitacao-compra.use-case';
import { ExecutarCompraUseCase } from '@application/use-cases/compra/executar-compra.use-case';
import { CancelarSolicitacaoCompraUseCase } from '@application/use-cases/compra/cancelar-solicitacao-compra.use-case';

const solicitacaoRepo = new PrismaSolicitacaoCompraRepository();
const itemRepo = new PrismaItemInventarioRepository();

const criarSolicitacao = new CriarSolicitacaoCompraUseCase(solicitacaoRepo);
const aprovarSolicitacao = new AprovarSolicitacaoCompraUseCase(solicitacaoRepo);
const rejeitarSolicitacao = new RejeitarSolicitacaoCompraUseCase(solicitacaoRepo);
const executarCompra = new ExecutarCompraUseCase(solicitacaoRepo, itemRepo);
const cancelarSolicitacao = new CancelarSolicitacaoCompraUseCase(solicitacaoRepo);

export const router: Router = Router();

/**
 * @swagger
 * /v1/compras:
 *   post:
 *     summary: Cria uma solicitação de compra
 *     tags: [Compras]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itens]
 *             properties:
 *               fornecedorId:
 *                 type: string
 *               justificativa:
 *                 type: string
 *               observacoes:
 *                 type: string
 *               itens:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [nomeProduto, quantidade]
 *                   properties:
 *                     itemInventarioId:
 *                       type: string
 *                       description: ID do item no inventário (opcional — omitir quando o item ainda não existe)
 *                     nomeProduto:
 *                       type: string
 *                     quantidade:
 *                       type: number
 *                     precoEstimado:
 *                       type: number
 *     responses:
 *       201:
 *         description: Solicitação criada com status PENDENTE
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const solicitacao = await criarSolicitacao.execute({
    solicitadoPor: req.usuario!.id,
    setorSolicitante: req.usuario!.setor ?? null,
    fornecedorId: req.body.fornecedorId,
    justificativa: req.body.justificativa,
    observacoes: req.body.observacoes,
    itens: req.body.itens.map((i: { itemInventarioId?: string; nomeProduto: string; quantidade: number; precoEstimado?: number }) => ({
      itemInventarioId: i.itemInventarioId,
      nomeProduto: i.nomeProduto,
      quantidade: i.quantidade,
      precoEstimado: parseMoneyOpcional(i.precoEstimado, 'precoEstimado'),
    })),
  });

  return res.status(201).json(solicitacao);
});

/**
 * @swagger
 * /v1/compras/{id}/aprovar:
 *   post:
 *     summary: Aprova uma solicitação de compra (PENDENTE → APROVADO)
 *     tags: [Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [formaPagamento, parcelas]
 *             properties:
 *               formaPagamento:
 *                 type: string
 *                 enum: [PIX, DEBITO, BOLETO, CARTAO_CREDITO]
 *               parcelas:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 description: Obrigatório (>= 1) somente para CARTAO_CREDITO; envie 0 para os demais
 *     responses:
 *       200:
 *         description: Solicitação aprovada
 *       400:
 *         description: Campos obrigatórios ausentes ou inválidos
 *       404:
 *         description: Solicitação não encontrada
 *       422:
 *         description: Transição de status inválida
 */
router.post('/:id/aprovar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { formaPagamento, parcelas } = req.body;

  if (!formaPagamento || !Object.values(FormaPagamento).includes(formaPagamento)) {
    throw new DomainError(
      `formaPagamento é obrigatório e deve ser um de: ${Object.values(FormaPagamento).join(', ')}`,
    );
  }
  const parcelasValor = parcelas ?? 0;
  if (!Number.isInteger(parcelasValor) || parcelasValor < 0) {
    throw new DomainError('parcelas deve ser um inteiro maior ou igual a zero');
  }

  const solicitacao = await aprovarSolicitacao.execute({
    id: req.params.id as string,
    aprovadoPor: req.usuario!.id,
    regraAprovador: req.usuario!.regra,
    setorAprovador: req.usuario!.setor ?? null,
    formaPagamento: formaPagamento as FormaPagamento,
    parcelas: parcelasValor,
  });

  return res.status(200).json(solicitacao);
});

/**
 * @swagger
 * /v1/compras/{id}/rejeitar:
 *   post:
 *     summary: Rejeita uma solicitação de compra (PENDENTE → REJEITADO)
 *     tags: [Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motivoRejeicao]
 *             properties:
 *               motivoRejeicao:
 *                 type: string
 *     responses:
 *       200:
 *         description: Solicitação rejeitada
 */
router.post('/:id/rejeitar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const solicitacao = await rejeitarSolicitacao.execute({
    id: req.params.id as string,
    rejeitadoPor: req.usuario!.id,
    motivoRejeicao: req.body.motivoRejeicao,
  });

  return res.status(200).json(solicitacao);
});

/**
 * @swagger
 * /v1/compras/{id}/executar:
 *   post:
 *     summary: Executa a compra (APROVADO → COMPRADO) e registra entrada no estoque
 *     tags: [Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               valorTotal:
 *                 type: number
 *     responses:
 *       200:
 *         description: Compra executada e estoque atualizado
 */
router.post('/:id/executar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const solicitacao = await executarCompra.execute({
    id: req.params.id as string,
    executadoPor: req.usuario!.id,
    valorTotal: parseMoneyOpcional(req.body.valorTotal, 'valorTotal'),
  });

  return res.status(200).json(solicitacao);
});

/**
 * @swagger
 * /v1/compras/{id}/cancelar:
 *   post:
 *     summary: Cancela uma solicitação de compra (PENDENTE|APROVADO → CANCELADO)
 *     tags: [Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Solicitação cancelada
 */
router.post('/:id/cancelar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const solicitacao = await cancelarSolicitacao.execute({ id: req.params.id as string });
  return res.status(200).json(solicitacao);
});

export default router;