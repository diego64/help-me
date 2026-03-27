import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { Regra } from '@prisma/client';
import { getStringParamRequired, getNumberParamClamped, getBooleanParam, getStringParam } from '@shared/utils/request-params';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { TecnicoError } from '@application/use-cases/tecnico/errors';
import { listarTecnicosUseCase } from '@application/use-cases/tecnico/listar-tecnicos.use-case';
import { buscarTecnicoUseCase } from '@application/use-cases/tecnico/buscar-tecnico.use-case';
import { atualizarTecnicoUseCase } from '@application/use-cases/tecnico/atualizar-tecnico.use-case';
import { atualizarHorariosUseCase } from '@application/use-cases/tecnico/atualizar-horarios.use-case';
import { alterarNivelUseCase } from '@application/use-cases/tecnico/alterar-nivel.use-case';
import { uploadAvatarUseCase } from '@application/use-cases/tecnico/upload-avatar.use-case';
import { deletarTecnicoUseCase } from '@application/use-cases/tecnico/deletar-tecnico.use-case';
import { restaurarTecnicoUseCase } from '@application/use-cases/tecnico/restaurar-tecnico.use-case';

export const router: Router = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof TecnicoError) return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

const EMAIL_REGEX   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORARIO_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

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

function validarHorario(horario: string, campo: string): { valido: boolean; erro?: string } {
  if (!horario || typeof horario !== 'string') return { valido: false, erro: `${campo} é obrigatório` };
  if (!HORARIO_REGEX.test(horario)) return { valido: false, erro: `${campo} deve estar no formato HH:MM (ex: 08:00)` };
  return { valido: true };
}

function validarIntervaloHorario(entrada: string, saida: string): { valido: boolean; erro?: string } {
  const [eH, eM] = entrada.split(':').map(Number);
  const [sH, sM] = saida.split(':').map(Number);
  if ((sH * 60 + sM) <= (eH * 60 + eM)) return { valido: false, erro: 'Horário de saída deve ser posterior ao horário de entrada' };
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
 *   name: Técnicos
 *   description: Gerenciamento de usuários técnicos e seus horários de atendimento
 */

/**
 * @swagger
 * /api/tecnicos:
 *   get:
 *     summary: Lista todos os técnicos
 *     description: Retorna todos os usuários com perfil TECNICO, incluindo informações de disponibilidade. Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
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
 *         name: nivel
 *         schema: { type: string, enum: [N1, N2, N3] }
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de técnicos retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao listar técnicos
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await listarTecnicosUseCase({
      page:             getNumberParamClamped(req.query.page,  1,  1),
      limit:            getNumberParamClamped(req.query.limit, 20, 1, 100),
      incluirInativos:  getBooleanParam(req.query.incluirInativos),
      incluirDeletados: getBooleanParam(req.query.incluirDeletados),
      setor:            getStringParam(req.query.setor),
      nivel:            getStringParam(req.query.nivel),
      busca:            getStringParam(req.query.busca),
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   get:
 *     summary: Busca um técnico por ID
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Técnico encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao buscar técnico
 */
router.get('/:id', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await buscarTecnicoUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   put:
 *     summary: Atualiza os dados de um técnico
 *     description: |
 *       Permite editar informações de perfil do técnico.
 *       Alteração de senha é responsabilidade do auth-service.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Técnico atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       409:
 *         description: Email já em uso
 *       500:
 *         description: Erro ao atualizar técnico
 */
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getStringParamRequired(req.params.id);
    const { nome, sobrenome, email, telefone, ramal, setor } = req.body;

    if (req.usuario!.regra === Regra.TECNICO && req.usuario!.id !== id) {
      return res.status(403).json({ error: 'Você só pode editar seu próprio perfil' });
    }

    if (nome      !== undefined) { const v = validarNome(nome,      'Nome');      if (!v.valido) return res.status(400).json({ error: v.erro }); }
    if (sobrenome !== undefined) { const v = validarNome(sobrenome, 'Sobrenome'); if (!v.valido) return res.status(400).json({ error: v.erro }); }
    if (email     !== undefined) { const v = validarEmail(email);                 if (!v.valido) return res.status(400).json({ error: v.erro }); }

    const result = await atualizarTecnicoUseCase({ id, nome, sobrenome, email, telefone, ramal, setor, solicitanteRegra: req.usuario!.regra });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/tecnicos/{id}/horarios:
 *   put:
 *     summary: Atualiza o horário de expediente do técnico
 *     tags: [Técnicos]
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entrada, saida]
 *             properties:
 *               entrada:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *               saida:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *     responses:
 *       200:
 *         description: Horário atualizado com sucesso
 *       400:
 *         description: Validação falhou
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao atualizar horário
 */
router.put('/:id/horarios', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { entrada, saida } = req.body;
    const vE = validarHorario(entrada, 'Horário de entrada');
    if (!vE.valido) return res.status(400).json({ error: vE.erro });
    const vS = validarHorario(saida, 'Horário de saída');
    if (!vS.valido) return res.status(400).json({ error: vS.erro });
    const vI = validarIntervaloHorario(entrada, saida);
    if (!vI.valido) return res.status(400).json({ error: vI.erro });

    const result = await atualizarHorariosUseCase({ id: getStringParamRequired(req.params.id), entrada, saida });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/tecnicos/{id}/nivel:
 *   patch:
 *     summary: Altera o nível de um técnico
 *     description: N1 atende P4/P5, N2 atende P2/P3, N3 atende qualquer prioridade.
 *     tags: [Técnicos]
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
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nivel]
 *             properties:
 *               nivel:
 *                 type: string
 *                 enum: [N1, N2, N3]
 *     responses:
 *       200:
 *         description: Nível atualizado com sucesso
 *       400:
 *         description: Nível inválido ou técnico já possui o nível informado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao alterar nível
 */
router.patch('/:id/nivel', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await alterarNivelUseCase({
      id:            getStringParamRequired(req.params.id),
      nivel:         req.body.nivel,
      solicitanteId: req.usuario!.id,
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/tecnicos/{id}/avatar:
 *   post:
 *     summary: Faz upload da foto de perfil do técnico
 *     description: Permite enviar uma imagem de avatar (JPEG, PNG, WEBP, max 5MB).
 *     tags: [Técnicos]
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
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao fazer upload
 */
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const id = getStringParamRequired(req.params.id);

    if (req.usuario!.regra === Regra.TECNICO && req.usuario!.id !== id) {
      return res.status(403).json({ error: 'Você só pode fazer upload do seu próprio avatar' });
    }

    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

    const result = await uploadAvatarUseCase({ id, filename: req.file.filename });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   delete:
 *     summary: Deleta um técnico (soft delete)
 *     tags: [Técnicos]
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
 *         description: Técnico deletado com sucesso
 *       400:
 *         description: Técnico tem chamados vinculados
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao deletar técnico
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await deletarTecnicoUseCase({
      id:         getStringParamRequired(req.params.id),
      permanente: getBooleanParam(req.query.permanente),
    });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/tecnicos/{id}/restaurar:
 *   patch:
 *     summary: Restaura um técnico deletado
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Técnico restaurado com sucesso
 *       400:
 *         description: Técnico não está deletado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Técnico não encontrado
 *       500:
 *         description: Erro ao restaurar técnico
 */
router.patch('/:id/restaurar', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await restaurarTecnicoUseCase(getStringParamRequired(req.params.id));
    res.json(result);
  } catch (err) { handleError(res, err); }
});

export default router;