import { Router, Response } from 'express';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth.middlewares';
import { writeLimiter, registerLimiter } from '@infrastructure/http/middlewares/rate-limit.middleware';
import { getStringParam, getStringParamRequired, getNumberParamClamped, getBooleanParam, getEnumParam } from '@shared/utils/request-params';
import { criarUsuarioUseCase } from '@application/usuario/criar-usuario.use-case';
import { listarUsuariosUseCase } from '@application/usuario/listar-usuarios.use-case';
import { buscarUsuarioPorIdUseCase } from '@application/usuario/buscar-usuario.use-case';
import { atualizarUsuarioUseCase } from '@application/usuario/atualizar-usuario.use-case';
import { deletarUsuarioUseCase } from '@application/usuario/deletar-usuario.use-case';
import { reativarUsuarioUseCase } from '@application/usuario/reativar-usuario.use-case';
import { Regra } from '@prisma/client';

export const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Gerenciamento de usuários
 */

/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: Cria um novo usuário
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - sobrenome
 *               - email
 *               - password
 *               - regra
 *             properties:
 *               nome:
 *                 type: string
 *                 example: João
 *               sobrenome:
 *                 type: string
 *                 example: Silva
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               regra:
 *                 type: string
 *                 enum: [ADMIN, TECNICO, USUARIO]
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       409:
 *         description: Email já cadastrado
 */
router.post(
  '/',
  authMiddleware,
  authorizeRoles(Regra.ADMIN),
  registerLimiter,
  async (req: AuthRequest, res: Response) => {
    const correlationId = req.headers['x-correlation-id'] as string;

    const result = await criarUsuarioUseCase(
      {
        nome: req.body.nome,
        sobrenome: req.body.sobrenome,
        email: req.body.email,
        password: req.body.password,
        regra: req.body.regra,
      },
      correlationId
    );

    return res.status(201).json(result);
  }
);

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Lista todos os usuários com paginação e filtros
 *     tags: [Usuários]
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
 *         name: regra
 *         schema:
 *           type: string
 *           enum: [ADMIN, TECNICO, USUARIO]
 *       - in: query
 *         name: ativo
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: incluirDeletados
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de usuários
 */
router.get(
  '/',
  authMiddleware,
  authorizeRoles(Regra.ADMIN),
  async (req: AuthRequest, res: Response) => {
    const page  = getNumberParamClamped(req.query.page,  1,  1);
    const limit = getNumberParamClamped(req.query.limit, 10, 1, 100);
    const regra = getEnumParam(req.query.regra, Object.values(Regra));
    const ativo = req.query.ativo !== undefined
      ? getBooleanParam(req.query.ativo)
      : undefined;
    const incluirDeletados = getBooleanParam(req.query.incluirDeletados);
    const busca = getStringParam(req.query.busca);

    const result = await listarUsuariosUseCase({
      page,
      limit,
      regra,
      ativo,
      incluirDeletados,
      busca,
    });

    return res.status(200).json(result);
  }
);

/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Busca um usuário por ID
 *     tags: [Usuários]
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
 *         description: Usuário encontrado
 *       404:
 *         description: Usuário não encontrado
 */
router.get(
  '/:id',
  authMiddleware,
  authorizeRoles(Regra.ADMIN),
  async (req: AuthRequest, res: Response) => {
    const id = getStringParamRequired(req.params.id);
    const result = await buscarUsuarioPorIdUseCase(id);
    return res.status(200).json(result);
  }
);

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Atualiza dados de um usuário
 *     tags: [Usuários]
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
 *         description: Usuário atualizado
 *       404:
 *         description: Usuário não encontrado
 */
router.put(
  '/:id',
  authMiddleware,
  authorizeRoles(Regra.ADMIN),
  writeLimiter,
  async (req: AuthRequest, res: Response) => {
    const id = getStringParamRequired(req.params.id);
    const correlationId = req.headers['x-correlation-id'] as string;

    const result = await atualizarUsuarioUseCase(
      {
        id,
        nome:      req.body.nome,
        sobrenome: req.body.sobrenome,
        email:     req.body.email,
        password:  req.body.password,
        regra:     req.body.regra,
        ativo:     req.body.ativo,
      },
      correlationId
    );

    return res.status(200).json(result);
  }
);

/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     summary: Desativa um usuário (soft delete)
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: permanente
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Usuário desativado
 *       400:
 *         description: Não pode deletar a si mesmo
 *       404:
 *         description: Usuário não encontrado
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles(Regra.ADMIN),
  writeLimiter,
  async (req: AuthRequest, res: Response) => {
    const id = getStringParamRequired(req.params.id);
    const permanente = getBooleanParam(req.query.permanente);
    const correlationId = req.headers['x-correlation-id'] as string;

    await deletarUsuarioUseCase(
      {
        id,
        solicitanteId: req.usuario!.id,
        permanente,
      },
      correlationId
    );

    return res.status(200).json({
      message: permanente
        ? 'Usuário excluído permanentemente.'
        : 'Usuário desativado com sucesso.',
      id,
    });
  }
);

/**
 * @swagger
 * /api/usuarios/{id}/reativar:
 *   patch:
 *     summary: Reativa um usuário desativado
 *     tags: [Usuários]
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
 *         description: Usuário reativado
 *       400:
 *         description: Usuário já está ativo
 *       404:
 *         description: Usuário não encontrado
 */
router.patch(
  '/:id/reativar',
  authMiddleware,
  authorizeRoles(Regra.ADMIN),
  writeLimiter,
  async (req: AuthRequest, res: Response) => {
    const id = getStringParamRequired(req.params.id);
    const correlationId = req.headers['x-correlation-id'] as string;

    const result = await reativarUsuarioUseCase(id, correlationId);

    return res.status(200).json({
      message: 'Usuário reativado com sucesso.',
      usuario: result,
    });
  }
);

export default router;