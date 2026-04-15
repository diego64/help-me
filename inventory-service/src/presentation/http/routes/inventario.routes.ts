import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '@infrastructure/http/middlewares/auth.middleware';
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository';
import { PrismaCategoriaRepository } from '@infrastructure/repositories/prisma-categoria.repository';
import { PrismaEstoqueSetorRepository } from '@infrastructure/repositories/prisma-estoque-setor.repository';
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository';
import { RegistrarItemUseCase } from '@application/use-cases/inventario/registrar-item.use-case';
import { ListarItensUseCase } from '@application/use-cases/inventario/listar-itens.use-case';
import { ConsultarItemUseCase } from '@application/use-cases/inventario/consultar-item.use-case';
import { AtualizarItemUseCase } from '@application/use-cases/inventario/atualizar-item.use-case';
import { DestinarItemSetorUseCase } from '@application/use-cases/inventario/destinar-item-setor.use-case';
import { ConsultarEstoqueSetorUseCase } from '@application/use-cases/inventario/consultar-estoque-setor.use-case';
import { LocalizarItemUseCase } from '@application/use-cases/inventario/localizar-item.use-case';
import { ConsultarItemPorNumeroUseCase } from '@application/use-cases/inventario/consultar-item-por-numero.use-case';
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity';

const itemRepo = new PrismaItemInventarioRepository();
const categoriaRepo = new PrismaCategoriaRepository();
const estoqueSetorRepo = new PrismaEstoqueSetorRepository();
const solicitacaoRepo = new PrismaSolicitacaoCompraRepository();

const registrarItem = new RegistrarItemUseCase(itemRepo, categoriaRepo, solicitacaoRepo);
const listarItens = new ListarItensUseCase(itemRepo);
const consultarItem = new ConsultarItemUseCase(itemRepo);
const atualizarItem = new AtualizarItemUseCase(itemRepo, categoriaRepo);
const destinarItemSetor = new DestinarItemSetorUseCase(itemRepo, estoqueSetorRepo);
const consultarEstoqueSetor = new ConsultarEstoqueSetorUseCase(estoqueSetorRepo);
const localizarItem = new LocalizarItemUseCase(itemRepo, estoqueSetorRepo);
const consultarItemPorNumero = new ConsultarItemPorNumeroUseCase(itemRepo);

export const router: Router = Router();

/**
 * @swagger
 * /v1/inventario:
 *   get:
 *     summary: Lista itens do inventário
 *     tags: [Inventário]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: nome
 *         schema:
 *           type: string
 *         description: Filtro por nome (busca parcial, case-insensitive)
 *       - in: query
 *         name: categoriaId
 *         schema:
 *           type: string
 *       - in: query
 *         name: estoqueCritico
 *         schema:
 *           type: boolean
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
 *         description: Lista de itens
 */
const semId = (item: ItemInventario) => ({
  numero: item.numero,
  nome: item.nome,
  sku: item.sku,
  descricao: item.descricao,
  unidade: item.unidade,
  estoqueAtual: item.estoqueAtual,
  estoqueMinimo: item.estoqueMinimo,
  estoqueCritico: item.estoqueCritico,
  categoriaId: item.categoriaId,
  ocNumero: item.ocNumero,
  criadoPor: item.criadoPor,
  criadoEm: item.criadoEm,
  atualizadoEm: item.atualizadoEm,
});

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const nome = req.query['nome'] as string | undefined;
  const categoriaId = req.query['categoriaId'] as string | undefined;
  const estoqueCritico = req.query['estoqueCritico'] as string | undefined;
  const pagina = req.query['pagina'] as string | undefined;
  const limite = req.query['limite'] as string | undefined;

  const itens = await listarItens.execute({
    nome,
    categoriaId,
    estoqueCritico: estoqueCritico === 'true' ? true : estoqueCritico === 'false' ? false : undefined,
    pagina: pagina ? Number(pagina) : undefined,
    limite: limite ? Number(limite) : undefined,
  });

  return res.status(200).json(itens.map(semId));
});

/**
 * @swagger
 * /v1/inventario:
 *   post:
 *     summary: Registra um novo item no inventário
 *     tags: [Inventário]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, sku, unidade, quantidade, categoriaId, ocNumero]
 *             properties:
 *               nome:
 *                 type: string
 *               sku:
 *                 type: string
 *                 description: SKU base. Para quantidade > 1 serão gerados SKU-01, SKU-02...
 *               descricao:
 *                 type: string
 *               unidade:
 *                 type: string
 *                 enum: [UN, KG, M, CX, L, PC]
 *               quantidade:
 *                 type: integer
 *                 minimum: 1
 *                 description: Unidades físicas a registrar — cada uma recebe um número de inventário próprio
 *               estoqueMinimo:
 *                 type: number
 *               categoriaId:
 *                 type: string
 *               ocNumero:
 *                 type: string
 *                 description: Número da Ordem de Compra de origem (ex. OC0000001) — obrigatório para auditoria
 *     responses:
 *       201:
 *         description: Item registrado com sucesso
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const item = await registrarItem.execute({
    nome: req.body.nome,
    sku: req.body.sku,
    descricao: req.body.descricao,
    unidade: req.body.unidade as UnidadeMedida,
    quantidade: req.body.quantidade,
    estoqueMinimo: req.body.estoqueMinimo,
    categoriaId: req.body.categoriaId,
    ocNumero: req.body.ocNumero,
    criadoPor: req.usuario!.id,
  });

  return res.status(201).json(item);
});

/**
 * @swagger
 * /v1/inventario/setor/{setor}:
 *   get:
 *     summary: Consulta estoque de todos os itens de um setor
 *     tags: [Inventário]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: setor
 *         required: true
 *         schema:
 *           type: string
 *         description: Nome do setor (ex. TECNOLOGIA_INFORMACAO, RECURSOS_HUMANOS)
 *     responses:
 *       200:
 *         description: Lista de itens e suas quantidades no setor
 */
router.get('/setor/:setor', authMiddleware, async (req: AuthRequest, res: Response) => {
  const itens = await consultarEstoqueSetor.execute(req.params.setor as string);
  return res.status(200).json(itens);
});

/**
 * @swagger
 * /v1/inventario/numero/{numero}/localizar:
 *   get:
 *     summary: Localiza um item pelo número do inventário e mostra sua distribuição por setores
 *     tags: [Inventário]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: numero
 *         required: true
 *         schema:
 *           type: string
 *         description: Número do inventário (ex. INV000001)
 *     responses:
 *       200:
 *         description: Item encontrado com estoque geral e distribuição por setor
 *       404:
 *         description: Item não encontrado
 */
router.get('/numero/:numero/localizar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const resultado = await localizarItem.execute(req.params.numero as string);
  return res.status(200).json(resultado);
});

/**
 * @swagger
 * /v1/inventario/numero/{numero}:
 *   get:
 *     summary: Consulta um item pelo número do inventário com histórico de movimentações
 *     tags: [Inventário]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: numero
 *         required: true
 *         schema:
 *           type: string
 *         description: Número do inventário (ex. INV000001)
 *     responses:
 *       200:
 *         description: Item encontrado com movimentações
 *       404:
 *         description: Item não encontrado
 */
router.get('/numero/:numero', authMiddleware, async (req: AuthRequest, res: Response) => {
  const resultado = await consultarItemPorNumero.execute(req.params.numero as string);
  return res.status(200).json(resultado);
});

/**
 * @swagger
 * /v1/inventario/{id}:
 *   get:
 *     summary: Consulta um item por ID com histórico de movimentações
 *     tags: [Inventário]
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
 *         description: Item encontrado com movimentações
 *       404:
 *         description: Item não encontrado
 */
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const resultado = await consultarItem.execute(req.params.id as string);
  return res.status(200).json(resultado);
});

/**
 * @swagger
 * /v1/inventario/destinar:
 *   post:
 *     summary: Destina um item para um setor pelo número do inventário (subtrai do estoque geral)
 *     tags: [Inventário]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [numeroInventario, setor, quantidade]
 *             properties:
 *               numeroInventario:
 *                 type: string
 *                 description: Número do inventário do item (ex. INV000001)
 *               setor:
 *                 type: string
 *                 description: Nome do setor de destino (ex. TECNOLOGIA_INFORMACAO)
 *               quantidade:
 *                 type: integer
 *                 minimum: 1
 *               observacoes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item destinado com sucesso
 *       404:
 *         description: Item não encontrado
 *       422:
 *         description: Estoque insuficiente
 */
router.post('/destinar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const resultado = await destinarItemSetor.execute({
    numeroInventario: req.body.numeroInventario,
    setor: req.body.setor,
    quantidade: req.body.quantidade,
    realizadoPor: req.usuario!.id,
    observacoes: req.body.observacoes,
  });
  return res.status(200).json(resultado);
});

/**
 * @swagger
 * /v1/inventario/{id}:
 *   patch:
 *     summary: Atualiza dados de um item
 *     tags: [Inventário]
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
 *         description: Item atualizado
 *       404:
 *         description: Item não encontrado
 */
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const item = await atualizarItem.execute({
    id: req.params.id as string,
    nome: req.body.nome,
    descricao: req.body.descricao,
    unidade: req.body.unidade as UnidadeMedida | undefined,
    estoqueMinimo: req.body.estoqueMinimo,
    categoriaId: req.body.categoriaId,
  });

  return res.status(200).json(item);
});

export default router;