import { Router } from 'express';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { getStringParam, getStringParamRequired, getNumberParamClamped } from '@shared/utils/request-params';
import { AdminError } from '@application/use-cases/admin/errors';
import { listarAdminsUseCase } from '@application/use-cases/admin/listar-admins.use-case';
import { buscarAdminUseCase } from '@application/use-cases/admin/buscar-admin.use-case';
import { atualizarAdminUseCase } from '@application/use-cases/admin/atualizar-admin.use-case';
import { deletarAdminUseCase } from '@application/use-cases/admin/deletar-admin.use-case';
import { reativarAdminUseCase } from '@application/use-cases/admin/reativar-admin.use-case';

export const router: Router = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof AdminError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

/**
 * @swagger
 * tags:
 *   name: Administradores
 *   description: Gerenciamento de usuários administradores
 */

/**
 * @swagger
 * /api/admin:
 *   get:
 *     summary: Lista todos os administradores
 *     description: Retorna uma lista paginada de administradores. Requer autenticação e permissão de ADMIN.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: incluirInativos
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: Lista de administradores retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const result = await listarAdminsUseCase({
      page:            getNumberParamClamped(req.query.page,  1,  1),
      limit:           getNumberParamClamped(req.query.limit, 10, 1, 100),
      incluirInativos: getStringParam(req.query.incluirInativos) === 'true',
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/admin/{id}:
 *   get:
 *     summary: Busca um administrador por ID
 *     tags: [Admin]
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
 *         description: Administrador encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Administrador não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const result = await buscarAdminUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/admin/{id}:
 *   put:
 *     summary: Atualiza campos de perfil do administrador
 *     description: Atualiza setor, telefone, ramal e avatarUrl. Alteração de nome, email e senha é responsabilidade do auth-service.
 *     tags: [Admin]
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
 *             properties:
 *               setor:
 *                 type: string
 *                 enum: [ADMINISTRACAO, ALMOXARIFADO, CALL_CENTER, COMERCIAL, DEPARTAMENTO_PESSOAL, FINANCEIRO, JURIDICO, LOGISTICA, MARKETING, QUALIDADE, RECURSOS_HUMANOS, TECNOLOGIA_INFORMACAO]
 *               telefone:
 *                 type: string
 *               ramal:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *               ativo:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Administrador atualizado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Administrador não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const result = await atualizarAdminUseCase({
      id:        getStringParamRequired(req.params.id),
      setor:     req.body.setor,
      telefone:  req.body.telefone,
      ramal:     req.body.ramal,
      avatarUrl: req.body.avatarUrl,
      ativo:     req.body.ativo,
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/admin/{id}:
 *   delete:
 *     summary: Desativa um administrador (soft delete)
 *     tags: [Admin]
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
 *         description: Administrador desativado com sucesso
 *       400:
 *         description: Não é possível deletar a si mesmo
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Administrador não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const result = await deletarAdminUseCase({
      id:            getStringParamRequired(req.params.id),
      solicitanteId: req.usuario!.id,
      permanente:    getStringParam(req.query.permanente) === 'true',
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/admin/{id}/reativar:
 *   patch:
 *     summary: Reativa um administrador desativado
 *     tags: [Admin]
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
 *         description: Administrador reativado com sucesso
 *       400:
 *         description: Administrador já está ativo
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 *       404:
 *         description: Administrador não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.patch('/:id/reativar', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const result = await reativarAdminUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

export default router;