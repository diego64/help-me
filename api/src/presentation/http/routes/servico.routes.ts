import { Router, Response } from 'express';
import { getStringParamRequired, getNumberParamClamped, getBooleanParam, getStringParam } from '@shared/utils/request-params';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { REGRAS_USUARIO } from '@application/use-cases/usuario/selects';
import { ServicoError } from '@application/use-cases/servico/errors';
import { criarServicoUseCase } from '@application/use-cases/servico/criar-servico.use-case';
import { listarServicosUseCase } from '@application/use-cases/servico/listar-servicos.use-case';
import { buscarServicoUseCase } from '@application/use-cases/servico/buscar-servico.use-case';
import { atualizarServicoUseCase } from '@application/use-cases/servico/atualizar-servico.use-case';
import { desativarServicoUseCase } from '@application/use-cases/servico/desativar-servico.use-case';
import { reativarServicoUseCase } from '@application/use-cases/servico/reativar-servico.use-case';
import { deletarServicoUseCase } from '@application/use-cases/servico/deletar-servico.use-case';
import { restaurarServicoUseCase } from '@application/use-cases/servico/restaurar-servico.use-case';

export const router: Router = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof ServicoError) return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

function validarNome(nome: string): { valido: boolean; erro?: string } {
  if (!nome || typeof nome !== 'string') return { valido: false, erro: 'Nome é obrigatório' };
  const n = nome.trim();
  if (n.length < 3)   return { valido: false, erro: 'Nome deve ter no mínimo 3 caracteres' };
  if (n.length > 100) return { valido: false, erro: 'Nome deve ter no máximo 100 caracteres' };
  return { valido: true };
}

function validarDescricao(descricao: string | undefined): { valido: boolean; erro?: string } {
  if (!descricao) return { valido: true };
  if (descricao.length > 500) return { valido: false, erro: 'Descrição deve ter no máximo 500 caracteres' };
  return { valido: true };
}

/**
 * @swagger
 * tags:
 *   name: Serviços
 *   description: Gerenciamento de serviços disponíveis para abertura de chamados
 */

/**
 * @swagger
 * /api/servicos:
 *   post:
 *     summary: Cria um novo serviço
 *     description: Cadastra um novo serviço no sistema. O nome do serviço deve ser único. Requer autenticação e perfil ADMIN.
 *     tags: [Serviços]
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
 *                 minLength: 3
 *                 maxLength: 100
 *               descricao:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Serviço criado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       409:
 *         description: Serviço já existe
 *       500:
 *         description: Erro ao criar serviço
 */
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { nome, descricao } = req.body;
    const vNome = validarNome(nome);
    if (!vNome.valido) return res.status(400).json({ error: vNome.erro });
    const vDesc = validarDescricao(descricao);
    if (!vDesc.valido) return res.status(400).json({ error: vDesc.erro });

    const result = await criarServicoUseCase({ nome, descricao });
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/servicos:
 *   get:
 *     summary: Lista os serviços cadastrados
 *     description: Retorna todos os serviços com paginação e filtros. Por padrão, retorna apenas serviços ativos.
 *     tags: [Serviços]
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
 *         name: incluirInativos
 *         schema: { type: boolean }
 *       - in: query
 *         name: incluirDeletados
 *         schema: { type: boolean }
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de serviços retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao listar serviços
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', ...REGRAS_USUARIO), async (req: AuthRequest, res: Response) => {
  try {
    const result = await listarServicosUseCase({
      page:             getNumberParamClamped(req.query.page,  1,  1),
      limit:            getNumberParamClamped(req.query.limit, 20, 1, 100),
      incluirInativos:  getBooleanParam(req.query.incluirInativos),
      incluirDeletados: getBooleanParam(req.query.incluirDeletados),
      busca:            getStringParam(req.query.busca),
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/servicos/{id}:
 *   get:
 *     summary: Busca um serviço por ID
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Serviço encontrado
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao buscar serviço
 */
router.get('/:id', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', ...REGRAS_USUARIO), async (req: AuthRequest, res: Response) => {
  try {
    const result = await buscarServicoUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/servicos/{id}:
 *   put:
 *     summary: Atualiza os dados de um serviço
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *               descricao:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Serviço atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       409:
 *         description: Nome já está em uso
 *       500:
 *         description: Erro ao atualizar serviço
 */
router.put('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { nome, descricao } = req.body;
    if (nome !== undefined) { const v = validarNome(nome); if (!v.valido) return res.status(400).json({ error: v.erro }); }
    if (descricao !== undefined) { const v = validarDescricao(descricao); if (!v.valido) return res.status(400).json({ error: v.erro }); }

    const result = await atualizarServicoUseCase({ id: getStringParamRequired(req.params.id), nome, descricao });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/servicos/{id}/desativar:
 *   patch:
 *     summary: Desativa um serviço
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Serviço desativado com sucesso
 *       400:
 *         description: Serviço já está desativado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao desativar serviço
 */
router.patch('/:id/desativar', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await desativarServicoUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/servicos/{id}/reativar:
 *   patch:
 *     summary: Reativa um serviço desativado
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Serviço reativado com sucesso
 *       400:
 *         description: Serviço já está ativo ou está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao reativar serviço
 */
router.patch('/:id/reativar', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await reativarServicoUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/servicos/{id}:
 *   delete:
 *     summary: Deleta um serviço (soft delete)
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: permanente
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Serviço deletado com sucesso
 *       400:
 *         description: Serviço tem chamados vinculados
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao deletar serviço
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await deletarServicoUseCase({
      id:         getStringParamRequired(req.params.id),
      permanente: getBooleanParam(req.query.permanente),
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/servicos/{id}/restaurar:
 *   patch:
 *     summary: Restaura um serviço deletado (soft delete)
 *     tags: [Serviços]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Serviço restaurado com sucesso
 *       400:
 *         description: Serviço não está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Serviço não encontrado
 *       500:
 *         description: Erro ao restaurar serviço
 */
router.patch('/:id/restaurar', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await restaurarServicoUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

export default router;