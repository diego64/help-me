import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '@infrastructure/http/middlewares/auth.middleware';
import { PrismaCategoriaRepository } from '@infrastructure/repositories/prisma-categoria.repository';
import { CriarCategoriaUseCase } from '@application/use-cases/categoria/criar-categoria.use-case';
import { ListarCategoriasUseCase } from '@application/use-cases/categoria/listar-categorias.use-case';

const categoriaRepo = new PrismaCategoriaRepository();

const criarCategoria = new CriarCategoriaUseCase(categoriaRepo);
const listarCategorias = new ListarCategoriasUseCase(categoriaRepo);

export const router: Router = Router();

/**
 * @swagger
 * /v1/categorias:
 *   get:
 *     summary: Lista categorias
 *     tags: [Categorias]
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
 *         description: Lista de categorias
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const pagina = req.query['pagina'] as string | undefined;
  const limite = req.query['limite'] as string | undefined;

  const categorias = await listarCategorias.execute({
    pagina: pagina ? Number(pagina) : undefined,
    limite: limite ? Number(limite) : undefined,
  });

  return res.status(200).json(categorias);
});

/**
 * @swagger
 * /v1/categorias:
 *   post:
 *     summary: Cria uma nova categoria
 *     tags: [Categorias]
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
 *               descricao:
 *                 type: string
 *     responses:
 *       201:
 *         description: Categoria criada com sucesso
 *       422:
 *         description: Nome já existe ou dados inválidos
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const categoria = await criarCategoria.execute({
    nome: req.body.nome,
    descricao: req.body.descricao,
  });

  return res.status(201).json(categoria);
});

export default router;
