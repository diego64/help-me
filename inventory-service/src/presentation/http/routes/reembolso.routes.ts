import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '@infrastructure/http/middlewares/auth.middleware';
import { parseMoney } from '@/shared/money';
import { PrismaReembolsoRepository } from '@infrastructure/repositories/prisma-reembolso.repository';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { CriarReembolsoUseCase } from '@application/use-cases/reembolso/criar-reembolso.use-case';
import { AprovarReembolsoUseCase } from '@application/use-cases/reembolso/aprovar-reembolso.use-case';
import { RejeitarReembolsoUseCase } from '@application/use-cases/reembolso/rejeitar-reembolso.use-case';
import { ProcessarReembolsoUseCase } from '@application/use-cases/reembolso/processar-reembolso.use-case';

const reembolsoRepo = new PrismaReembolsoRepository();
const solicitacaoRepo = new PrismaSolicitacaoCompraRepository();

const criarReembolso = new CriarReembolsoUseCase(reembolsoRepo, solicitacaoRepo);
const aprovarReembolso = new AprovarReembolsoUseCase(reembolsoRepo);
const rejeitarReembolso = new RejeitarReembolsoUseCase(reembolsoRepo);
const processarReembolso = new ProcessarReembolsoUseCase(reembolsoRepo);

export const router: Router = Router();

/**
 * @swagger
 * /v1/reembolsos:
 *   post:
 *     summary: Cria uma solicitação de reembolso
 *     tags: [Reembolsos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [valor, descricao]
 *             properties:
 *               solicitacaoCompraId:
 *                 type: string
 *               valor:
 *                 type: number
 *               descricao:
 *                 type: string
 *               nfe:
 *                 type: string
 *               dataEmissao:
 *                 type: string
 *                 format: date-time
 *               cnpjFornecedor:
 *                 type: string
 *               observacoes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Reembolso criado com status PENDENTE
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const reembolso = await criarReembolso.execute({
    solicitadoPor: req.usuario!.id,
    solicitacaoCompraId: req.body.solicitacaoCompraId,
    valor: parseMoney(req.body.valor, 'valor'),
    descricao: req.body.descricao,
    nfe: req.body.nfe,
    dataEmissao: req.body.dataEmissao ? new Date(req.body.dataEmissao) : undefined,
    cnpjFornecedor: req.body.cnpjFornecedor,
    observacoes: req.body.observacoes,
  });

  return res.status(201).json(reembolso);
});

/**
 * @swagger
 * /v1/reembolsos/{id}/aprovar:
 *   post:
 *     summary: Aprova um reembolso (PENDENTE → APROVADO)
 *     tags: [Reembolsos]
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
 *         description: Reembolso aprovado
 */
router.post('/:id/aprovar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const reembolso = await aprovarReembolso.execute({
    id: req.params.id as string,
    aprovadoPor: req.usuario!.id,
  });

  return res.status(200).json(reembolso);
});

/**
 * @swagger
 * /v1/reembolsos/{id}/rejeitar:
 *   post:
 *     summary: Rejeita um reembolso (PENDENTE → REJEITADO)
 *     tags: [Reembolsos]
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
 *         description: Reembolso rejeitado
 */
router.post('/:id/rejeitar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const reembolso = await rejeitarReembolso.execute({
    id: req.params.id as string,
    rejeitadoPor: req.usuario!.id,
    motivoRejeicao: req.body.motivoRejeicao,
  });

  return res.status(200).json(reembolso);
});

/**
 * @swagger
 * /v1/reembolsos/{id}/processar:
 *   post:
 *     summary: Processa o pagamento do reembolso (APROVADO → PAGO)
 *     tags: [Reembolsos]
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
 *         description: Reembolso marcado como pago
 */
router.post('/:id/processar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const reembolso = await processarReembolso.execute({
    id: req.params.id as string,
    processadoPor: req.usuario!.id,
  });

  return res.status(200).json(reembolso);
});

export default router;