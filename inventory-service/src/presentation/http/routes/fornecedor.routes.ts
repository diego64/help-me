import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '@infrastructure/http/middlewares/auth.middleware';
import { PrismaFornecedorRepository } from '@infrastructure/repositories/prisma-fornecedor.repository';
import { CriarFornecedorUseCase } from '@application/use-cases/fornecedor/criar-fornecedor.use-case';
import { ListarFornecedoresUseCase } from '@application/use-cases/fornecedor/listar-fornecedores.use-case';

const fornecedorRepo = new PrismaFornecedorRepository();

const criarFornecedor = new CriarFornecedorUseCase(fornecedorRepo);
const listarFornecedores = new ListarFornecedoresUseCase(fornecedorRepo);

export const router: Router = Router();

/**
 * @swagger
 * /v1/fornecedores:
 *   get:
 *     summary: Lista fornecedores
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Lista de fornecedores
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const pagina = req.query['pagina'] as string | undefined;
  const limite = req.query['limite'] as string | undefined;

  const fornecedores = await listarFornecedores.execute({
    pagina: pagina ? Number(pagina) : undefined,
    limite: limite ? Number(limite) : undefined,
  });

  return res.status(200).json(fornecedores);
});

/**
 * @swagger
 * /v1/fornecedores:
 *   post:
 *     summary: Cadastra um novo fornecedor
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome]
 *             properties:
 *               nome:
 *                 type: string
 *               cnpj:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               telefone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Fornecedor cadastrado com sucesso
 *       422:
 *         description: CNPJ já cadastrado ou dados inválidos
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const fornecedor = await criarFornecedor.execute({
    nome: req.body.nome,
    cnpj: req.body.cnpj,
    email: req.body.email,
    telefone: req.body.telefone,
  });

  return res.status(201).json(fornecedor);
});

export default router;
