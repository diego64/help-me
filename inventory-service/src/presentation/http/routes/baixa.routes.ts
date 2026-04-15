import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '@infrastructure/http/middlewares/auth.middleware';
import { PrismaBaixaRepository } from '@infrastructure/repositories/prisma-baixa.repository';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { CriarBaixaUseCase } from '@application/use-cases/baixa/criar-baixa.use-case';
import { AprovarBaixaTecnicoUseCase } from '@application/use-cases/baixa/aprovar-baixa-tecnico.use-case';
import { AprovarBaixaGestorUseCase } from '@application/use-cases/baixa/aprovar-baixa-gestor.use-case';
import { RejeitarBaixaUseCase } from '@application/use-cases/baixa/rejeitar-baixa.use-case';
import { ExecutarBaixaUseCase } from '@application/use-cases/baixa/executar-baixa.use-case';

const baixaRepo = new PrismaBaixaRepository();
const itemRepo = new PrismaItemInventarioRepository();

const criarBaixa = new CriarBaixaUseCase(baixaRepo, itemRepo);
const aprovarTecnico = new AprovarBaixaTecnicoUseCase(baixaRepo);
const aprovarGestor = new AprovarBaixaGestorUseCase(baixaRepo);
const rejeitarBaixa = new RejeitarBaixaUseCase(baixaRepo);
const executarBaixa = new ExecutarBaixaUseCase(baixaRepo, itemRepo);

export const router: Router = Router();

/**
 * @swagger
 * /v1/baixas:
 *   post:
 *     summary: Cria uma solicitação de baixa
 *     tags: [Baixas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [justificativa, itens]
 *             properties:
 *               justificativa:
 *                 type: string
 *               observacoes:
 *                 type: string
 *               itens:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [numeroInventario, quantidade]
 *                   properties:
 *                     numeroInventario:
 *                       type: string
 *                       description: Número do inventário do item (ex. INV000001)
 *                     quantidade:
 *                       type: number
 *                     motivo:
 *                       type: string
 *     responses:
 *       201:
 *         description: Baixa criada com status PENDENTE
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const baixa = await criarBaixa.execute({
    solicitadoPor: req.usuario!.id,
    perfilSolicitante: req.usuario!.regra,
    justificativa: req.body.justificativa,
    observacoes: req.body.observacoes,
    itens: req.body.itens,
  });

  return res.status(201).json(baixa);
});

/**
 * @swagger
 * /v1/baixas/{id}/aprovar-tecnico:
 *   post:
 *     summary: Aprovação técnica da baixa (PENDENTE → APROVADO_TECNICO)
 *     tags: [Baixas]
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
 *         description: Baixa aprovada pelo técnico
 */
router.post('/:id/aprovar-tecnico', authMiddleware, async (req: AuthRequest, res: Response) => {
  const baixa = await aprovarTecnico.execute({
    id: req.params.id as string,
    aprovadoPor: req.usuario!.id,
  });

  return res.status(200).json(baixa);
});

/**
 * @swagger
 * /v1/baixas/{id}/aprovar-gestor:
 *   post:
 *     summary: Aprovação do gestor da baixa (APROVADO_TECNICO → APROVADO_GESTOR)
 *     tags: [Baixas]
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
 *         description: Baixa aprovada pelo gestor
 */
router.post('/:id/aprovar-gestor', authMiddleware, async (req: AuthRequest, res: Response) => {
  const baixa = await aprovarGestor.execute({
    id: req.params.id as string,
    aprovadoPor: req.usuario!.id,
  });

  return res.status(200).json(baixa);
});

/**
 * @swagger
 * /v1/baixas/{id}/rejeitar:
 *   post:
 *     summary: Rejeita uma baixa (PENDENTE|APROVADO_TECNICO → REJEITADO)
 *     tags: [Baixas]
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
 *         description: Baixa rejeitada
 */
router.post('/:id/rejeitar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const baixa = await rejeitarBaixa.execute({
    id: req.params.id as string,
    rejeitadoPor: req.usuario!.id,
    motivoRejeicao: req.body.motivoRejeicao,
  });

  return res.status(200).json(baixa);
});

/**
 * @swagger
 * /v1/baixas/{id}/executar:
 *   post:
 *     summary: Executa a baixa (APROVADO_GESTOR → CONCLUIDO) e registra saída do estoque
 *     tags: [Baixas]
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
 *         description: Baixa concluída e estoque atualizado
 */
router.post('/:id/executar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const baixa = await executarBaixa.execute({
    id: req.params.id as string,
    executadoPor: req.usuario!.id,
  });

  return res.status(200).json(baixa);
});

export default router;