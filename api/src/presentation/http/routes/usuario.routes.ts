import path from 'path';
import { Router, Response } from 'express';
import multer from 'multer';
import { Regra } from '@prisma/client';
import { getStringParamRequired, getNumberParamClamped, getBooleanParam, getStringParam } from '@shared/utils/request-params';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { UsuarioError } from '@application/use-cases/usuario/errors';
import { listarUsuariosUseCase } from '@application/use-cases/usuario/listar-usuarios.use-case';
import { buscarUsuarioUseCase } from '@application/use-cases/usuario/buscar-usuario.use-case';
import { buscarUsuarioPorEmailUseCase } from '@application/use-cases/usuario/buscar-usuario-por-email.use-case';
import { atualizarUsuarioUseCase } from '@application/use-cases/usuario/atualizar-usuario.use-case';
import { uploadAvatarUsuarioUseCase } from '@application/use-cases/usuario/upload-avatar.use-case';
import { deletarUsuarioUseCase } from '@application/use-cases/usuario/deletar-usuario.use-case';
import { restaurarUsuarioUseCase } from '@application/use-cases/usuario/restaurar-usuario.use-case';

export const router: Router = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof UsuarioError) return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarEmail(email: string): { valido: boolean; erro?: string } {
  if (!email || typeof email !== 'string') return { valido: false, erro: 'Email é obrigatório' };
  if (!EMAIL_REGEX.test(email)) return { valido: false, erro: 'Email inválido' };
  return { valido: true };
}

function validarNome(nome: string, campo: string): { valido: boolean; erro?: string } {
  if (!nome || typeof nome !== 'string') return { valido: false, erro: `${campo} é obrigatório` };
  const n = nome.trim();
  if (n.length < 2)   return { valido: false, erro: `${campo} deve ter no mínimo 2 caracteres` };
  if (n.length > 100) return { valido: false, erro: `${campo} deve ter no máximo 100 caracteres` };
  return { valido: true };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, 'uploads/avatars'),
    filename:    (_req, file,  cb) => cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de arquivo não permitido. Use: JPEG, PNG ou WEBP'));
  },
});

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Gerenciamento de usuários do sistema
 */

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Lista todos os usuários
 *     description: Retorna todos os usuários com perfil USUARIO. Utiliza cache Redis e paginação. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
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
 *         name: setor
 *         schema: { type: string }
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de usuários retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar usuários
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await listarUsuariosUseCase({
      page:             getNumberParamClamped(req.query.page,  1,  1),
      limit:            getNumberParamClamped(req.query.limit, 20, 1, 100),
      incluirInativos:  getBooleanParam(req.query.incluirInativos),
      incluirDeletados: getBooleanParam(req.query.incluirDeletados),
      setor:            getStringParam(req.query.setor),
      busca:            getStringParam(req.query.busca),
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/usuarios/email:
 *   post:
 *     summary: Busca um usuário por email
 *     description: Localiza um usuário através do email. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *       400:
 *         description: Email não fornecido ou inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao buscar usuário
 */
router.post('/email', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
    const v = validarEmail(email);
    if (!v.valido) return res.status(400).json({ error: v.erro });

    const result = await buscarUsuarioPorEmailUseCase(email);
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Busca um usuário por ID
 *     description: Retorna os detalhes de um usuário específico. Requer autenticação e perfil ADMIN ou o próprio USUARIO.
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao buscar usuário
 */
router.get('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getStringParamRequired(req.params.id);

    if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
      return res.status(403).json({ error: 'Você só pode visualizar seu próprio perfil' });
    }

    const result = await buscarUsuarioUseCase(id);
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Atualiza os dados de um usuário
 *     description: |
 *       Permite editar informações de perfil.
 *       Alteração de senha é responsabilidade do auth-service.
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuário atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       409:
 *         description: Email já em uso
 *       500:
 *         description: Erro ao atualizar usuário
 */
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getStringParamRequired(req.params.id);
    const { nome, sobrenome, email, telefone, ramal, setor } = req.body;

    if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
      return res.status(403).json({ error: 'Você só pode editar seu próprio perfil' });
    }

    if (nome      !== undefined) { const v = validarNome(nome,      'Nome');      if (!v.valido) return res.status(400).json({ error: v.erro }); }
    if (sobrenome !== undefined) { const v = validarNome(sobrenome, 'Sobrenome'); if (!v.valido) return res.status(400).json({ error: v.erro }); }
    if (email     !== undefined) { const v = validarEmail(email);                 if (!v.valido) return res.status(400).json({ error: v.erro }); }

    const result = await atualizarUsuarioUseCase({ id, nome, sobrenome, email, telefone, ramal, setor, solicitanteRegra: req.usuario!.regra });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/usuarios/{id}/avatar:
 *   post:
 *     summary: Faz upload da foto de perfil
 *     description: Permite enviar avatar (JPEG, PNG, WEBP, max 5MB).
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar enviado com sucesso
 *       400:
 *         description: Arquivo inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao fazer upload
 */
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getStringParamRequired(req.params.id);

    if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
      return res.status(403).json({ error: 'Você só pode fazer upload do seu próprio avatar' });
    }

    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const result = await uploadAvatarUsuarioUseCase({ id, filename: req.file.filename });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     summary: Deleta um usuário (soft delete)
 *     description: Marca o usuário como deletado. Requer autenticação e perfil ADMIN ou o próprio USUARIO.
 *     tags: [Usuários]
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
 *         description: Usuário deletado com sucesso
 *       400:
 *         description: Usuário tem chamados vinculados
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao deletar usuário
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN', 'USUARIO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getStringParamRequired(req.params.id);

    if (req.usuario!.regra === Regra.USUARIO && req.usuario!.id !== id) {
      return res.status(403).json({ error: 'Você só pode deletar sua própria conta' });
    }

    const result = await deletarUsuarioUseCase({
      id,
      permanente: getBooleanParam(req.query.permanente),
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/usuarios/{id}/restaurar:
 *   patch:
 *     summary: Restaura um usuário deletado
 *     description: Remove a marcação de deleção. Requer autenticação e perfil ADMIN.
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Usuário restaurado com sucesso
 *       400:
 *         description: Usuário não está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro ao restaurar usuário
 */
router.patch('/:id/restaurar', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await restaurarUsuarioUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

export default router;