import { Router } from 'express';
import multer from 'multer';
import { getStringParamRequired } from '@shared/utils/request-params';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { ChamadoError } from '@application/use-cases/chamado/errors';
import { MIMETYPES_PERMITIDOS } from '@application/use-cases/chamado/helpers/upload-arquivos.helper';
import { listarChamadosUseCase } from '@application/use-cases/chamado/listar-chamados.use-case';
import { abrirChamadoUseCase } from '@application/use-cases/chamado/abrir-chamado.use-case';
import { editarChamadoUseCase } from '@application/use-cases/chamado/editar-chamado.use-case';
import { uploadAnexosUseCase } from '@application/use-cases/chamado/upload-anexos.use-case';
import { listarAnexosUseCase } from '@application/use-cases/chamado/anexos/listar-anexos.use-case';
import { downloadAnexoUseCase } from '@application/use-cases/chamado/anexos/download-anexo.use-case';
import { deletarAnexoUseCase } from '@application/use-cases/chamado/anexos/deletar-anexo.use-case';
import { criarComentarioUseCase } from '@application/use-cases/chamado/comentarios/criar-comentario.use-case';
import { listarComentariosUseCase } from '@application/use-cases/chamado/comentarios/listar-comentarios.use-case';
import { editarComentarioUseCase } from '@application/use-cases/chamado/comentarios/editar-comentario.use-case';
import { deletarComentarioUseCase } from '@application/use-cases/chamado/comentarios/deletar-comentario.use-case';
import { transferirChamadoUseCase } from '@application/use-cases/chamado/transferir-chamado.use-case';
import { listarTransferenciasUseCase } from '@application/use-cases/chamado/transferencias/listar-transferencias.use-case';
import { alterarPrioridadeUseCase } from '@application/use-cases/chamado/alterar-prioridade.use-case';
import { atualizarStatusUseCase } from '@application/use-cases/chamado/atualizar-status.use-case';
import { historicoUseCase }from '@application/use-cases/chamado/historico-chamado.use-case';
import { reabrirChamadoUseCase }from '@application/use-cases/chamado/reabrir-chamado.use-case';
import { cancelarChamadoUseCase } from '@application/use-cases/chamado/cancelar-chamado.use-case';
import { deletarChamadoUseCase }from '@application/use-cases/chamado/deletar-chamado.use-case';
import { vincularChamadoUseCase } from '@application/use-cases/chamado/vincular-chamado.use-case';
import { desvincularChamadoUseCase } from '@application/use-cases/chamado/desvincular-chamado.use-case';
import { hierarquiaChamadoUseCase } from '@application/use-cases/chamado/hierarquia-chamado.use-case';

export const router: Router = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof ChamadoError) return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

function validarDescricao(descricao: string): { valida: boolean; erro?: string } {
  if (!descricao || typeof descricao !== 'string') return { valida: false, erro: 'Descrição é obrigatória' };
  const d = descricao.trim();
  if (d.length < 10)   return { valida: false, erro: 'Descrição deve ter no mínimo 10 caracteres' };
  if (d.length > 5000) return { valida: false, erro: 'Descrição deve ter no máximo 5000 caracteres' };
  return { valida: true };
}

function validarComentario(comentario: string): { valido: boolean; erro?: string } {
  if (!comentario || typeof comentario !== 'string') return { valido: false, erro: 'Comentário é obrigatório' };
  const c = comentario.trim();
  if (c.length < 1)    return { valido: false, erro: 'Comentário não pode ser vazio' };
  if (c.length > 5000) return { valido: false, erro: 'Comentário deve ter no máximo 5000 caracteres' };
  return { valido: true };
}

const MAX_TAMANHO_ARQUIVO    = 5 * 1024 * 1024;
const MAX_ARQUIVOS_POR_ENVIO = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_TAMANHO_ARQUIVO, files: MAX_ARQUIVOS_POR_ENVIO },
  fileFilter: (_req, file, cb) => {
    if (MIMETYPES_PERMITIDOS[file.mimetype]) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
  },
});

function uploadMiddleware(req: any, res: any, next: any) {
  upload.array('arquivos', MAX_ARQUIVOS_POR_ENVIO)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ error: 'Um ou mais arquivos excedem o limite de 5MB' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: `Máximo de ${MAX_ARQUIVOS_POR_ENVIO} arquivos por envio` });
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

/**
 * @swagger
 * tags:
 *   name: Chamados
 *   description: Gerenciamento de chamados
 */

/**
 * @swagger
 * /api/chamados:
 *   get:
 *     summary: Lista chamados com filtros, busca e paginação
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limite
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO] }
 *       - in: query
 *         name: prioridade
 *         schema: { type: string, enum: [P1, P2, P3, P4, P5] }
 *       - in: query
 *         name: tecnicoId
 *         schema: { type: string }
 *       - in: query
 *         name: usuarioId
 *         schema: { type: string }
 *       - in: query
 *         name: setor
 *         schema: { type: string }
 *       - in: query
 *         name: servico
 *         schema: { type: string }
 *       - in: query
 *         name: semTecnico
 *         schema: { type: boolean }
 *       - in: query
 *         name: dataInicio
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dataFim
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: ordenarPor
 *         schema: { type: string, enum: [geradoEm, atualizadoEm, prioridade, status, OS], default: geradoEm }
 *       - in: query
 *         name: ordem
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Lista de chamados retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao listar chamados
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await listarChamadosUseCase({
      pagina:     Math.max(1, parseInt(req.query.pagina as string) || 1),
      limite:     Math.min(100, Math.max(1, parseInt(req.query.limite as string) || 20)),
      busca:      (req.query.busca as string)?.trim(),
      status:     req.query.status     as string,
      prioridade: req.query.prioridade as string,
      tecnicoId:  req.query.tecnicoId  as string,
      usuarioId:  req.query.usuarioId  as string,
      setor:      req.query.setor      as string,
      servico:    req.query.servico    as string,
      semTecnico: req.query.semTecnico === 'true',
      dataInicio: req.query.dataInicio as string,
      dataFim:    req.query.dataFim    as string,
      ordenarPor: req.query.ordenarPor as string,
      ordem:      (req.query.ordem as 'asc' | 'desc') || 'desc',
      usuarioAutenticado: { id: req.usuario!.id, regra: req.usuario!.regra },
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/abertura-chamado:
 *   post:
 *     summary: Abre um novo chamado de suporte
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [descricao, servico]
 *             properties:
 *               descricao:
 *                 type: string
 *               servico:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items: { type: string }
 *               arquivos:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Chamado criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao criar o chamado
 */
router.post('/abertura-chamado', authMiddleware, authorizeRoles('USUARIO'), uploadMiddleware, async (req: AuthRequest, res) => {
  try {
    const { descricao, servico } = req.body;
    const v = validarDescricao(descricao);
    if (!v.valida) return res.status(400).json({ error: v.erro });

    const result = await abrirChamadoUseCase({
      descricao,
      servico,
      arquivos:    (req.files as Express.Multer.File[]) ?? [],
      usuarioId:   req.usuario!.id,
      usuarioNome: req.usuario!.nome,
    });
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}:
 *   patch:
 *     summary: Edita a descrição de um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chamado atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao editar chamado
 */
router.patch('/:id', authMiddleware, authorizeRoles('USUARIO', 'ADMIN'), uploadMiddleware, async (req: AuthRequest, res) => {
  try {
    const { descricao } = req.body;
    if (descricao) { const v = validarDescricao(descricao); if (!v.valida) return res.status(400).json({ error: v.erro }); }

    const result = await editarChamadoUseCase({
      id:           getStringParamRequired(req.params.id),
      descricao,
      arquivos:     (req.files as Express.Multer.File[]) ?? [],
      usuarioId:    req.usuario!.id,
      usuarioRegra: req.usuario!.regra,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/anexos:
 *   post:
 *     summary: Faz upload de anexos ao chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Anexos enviados com sucesso
 *       400:
 *         description: Arquivo inválido
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao fazer upload
 */
router.post('/:id/anexos', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), uploadMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await uploadAnexosUseCase({
      chamadoId: getStringParamRequired(req.params.id),
      arquivos:  (req.files as Express.Multer.File[]) ?? [],
      autorId:   req.usuario!.id,
    });
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/anexos:
 *   get:
 *     summary: Lista os anexos de um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de anexos retornada com sucesso
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao listar anexos
 */
router.get('/:id/anexos', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await listarAnexosUseCase(getStringParamRequired(req.params.id));
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/anexos/{anexoId}/download:
 *   get:
 *     summary: Gera URL de download de um anexo (válida por 10 minutos)
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: anexoId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: URL de download gerada com sucesso
 *       404:
 *         description: Anexo não encontrado
 *       500:
 *         description: Erro ao gerar URL
 */
router.get('/:id/anexos/:anexoId/download', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await downloadAnexoUseCase({ chamadoId: getStringParamRequired(req.params.id), anexoId: getStringParamRequired(req.params.anexoId) });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/anexos/{anexoId}:
 *   delete:
 *     summary: Remove um anexo (soft delete)
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: anexoId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Anexo removido com sucesso
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Anexo não encontrado
 *       500:
 *         description: Erro ao remover anexo
 */
router.delete('/:id/anexos/:anexoId', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await deletarAnexoUseCase({ chamadoId: getStringParamRequired(req.params.id), anexoId: getStringParamRequired(req.params.anexoId), autorId: req.usuario!.id, autorRegra: req.usuario!.regra });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/comentarios:
 *   post:
 *     summary: Adiciona um comentário ao chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Comentário criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Sem permissão para comentário interno
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao criar comentário
 */
router.post('/:id/comentarios', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { comentario, visibilidadeInterna = false } = req.body;
    const v = validarComentario(comentario);
    if (!v.valido) return res.status(400).json({ error: v.erro });

    const result = await criarComentarioUseCase({ chamadoId: getStringParamRequired(req.params.id), comentario, visibilidadeInterna, autorId: req.usuario!.id, autorRegra: req.usuario!.regra });
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/comentarios:
 *   get:
 *     summary: Lista os comentários de um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de comentários retornada com sucesso
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao listar comentários
 */
router.get('/:id/comentarios', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await listarComentariosUseCase({ chamadoId: getStringParamRequired(req.params.id), regra: req.usuario!.regra });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/comentarios/{comentarioId}:
 *   put:
 *     summary: Edita um comentário
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: comentarioId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Comentário atualizado com sucesso
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Comentário não encontrado
 *       500:
 *         description: Erro ao editar comentário
 */
router.put('/:id/comentarios/:comentarioId', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const { comentario } = req.body;
    const v = validarComentario(comentario);
    if (!v.valido) return res.status(400).json({ error: v.erro });

    const result = await editarComentarioUseCase({ chamadoId: getStringParamRequired(req.params.id), comentarioId: getStringParamRequired(req.params.comentarioId), comentario, autorId: req.usuario!.id, autorRegra: req.usuario!.regra });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/comentarios/{comentarioId}:
 *   delete:
 *     summary: Remove um comentário (soft delete)
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: comentarioId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Comentário removido com sucesso
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Comentário não encontrado
 *       500:
 *         description: Erro ao remover comentário
 */
router.delete('/:id/comentarios/:comentarioId', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await deletarComentarioUseCase({ chamadoId: getStringParamRequired(req.params.id), comentarioId: getStringParamRequired(req.params.comentarioId), autorId: req.usuario!.id, autorRegra: req.usuario!.regra });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/transferir:
 *   patch:
 *     summary: Transfere um chamado para outro técnico
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chamado transferido com sucesso
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Chamado ou técnico não encontrado
 *       500:
 *         description: Erro ao transferir chamado
 */
router.patch('/:id/transferir', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const { tecnicoNovoId, motivo } = req.body;
    if (!tecnicoNovoId || typeof tecnicoNovoId !== 'string') return res.status(400).json({ error: 'ID do novo técnico é obrigatório' });
    const v = validarDescricao(motivo);
    if (!v.valida) return res.status(400).json({ error: 'Motivo inválido: ' + v.erro });

    const result = await transferirChamadoUseCase({
      id:           getStringParamRequired(req.params.id),
      tecnicoNovoId,
      motivo,
      usuarioId:    req.usuario!.id,
      usuarioNome:  req.usuario!.nome,
      usuarioEmail: req.usuario!.email,
      usuarioRegra: req.usuario!.regra,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/transferencias:
 *   get:
 *     summary: Lista o histórico de transferências de um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Histórico retornado com sucesso
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao buscar transferências
 */
router.get('/:id/transferencias', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const result = await listarTransferenciasUseCase(getStringParamRequired(req.params.id));
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/prioridade:
 *   patch:
 *     summary: Altera a prioridade de um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Prioridade atualizada com sucesso
 *       400:
 *         description: Prioridade inválida
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao alterar prioridade
 */
router.patch('/:id/prioridade', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const result = await alterarPrioridadeUseCase({
      id:           getStringParamRequired(req.params.id),
      prioridade:   req.body.prioridade,
      motivo:       req.body.motivo,
      usuarioId:    req.usuario!.id,
      usuarioNome:  req.usuario!.nome,
      usuarioEmail: req.usuario!.email,
      usuarioRegra: req.usuario!.regra,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/status:
 *   patch:
 *     summary: Atualiza o status de um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status atualizado com sucesso
 *       400:
 *         description: Status inválido
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao atualizar status
 */
router.patch('/:id/status', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const result = await atualizarStatusUseCase({
      id:                    getStringParamRequired(req.params.id),
      status:                req.body.status,
      descricaoEncerramento: req.body.descricaoEncerramento,
      atualizacaoDescricao:  req.body.atualizacaoDescricao,
      usuarioId:             req.usuario!.id,
      usuarioNome:           req.usuario!.nome,
      usuarioEmail:          req.usuario!.email,
      usuarioRegra:          req.usuario!.regra,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/historico:
 *   get:
 *     summary: Busca o histórico de atualizações de um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Histórico retornado com sucesso
 *       500:
 *         description: Erro ao buscar histórico
 */
router.get('/:id/historico', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await historicoUseCase(getStringParamRequired(req.params.id));
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/reabrir-chamado:
 *   patch:
 *     summary: Reabre um chamado encerrado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chamado reaberto com sucesso
 *       400:
 *         description: Chamado não pode ser reaberto
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao reabrir chamado
 */
router.patch('/:id/reabrir-chamado', authMiddleware, authorizeRoles('USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await reabrirChamadoUseCase({
      id:                   getStringParamRequired(req.params.id),
      atualizacaoDescricao: req.body?.atualizacaoDescricao,
      usuarioId:            req.usuario!.id,
      usuarioNome:          req.usuario!.nome,
      usuarioEmail:         req.usuario!.email,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/cancelar-chamado:
 *   patch:
 *     summary: Cancela um chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chamado cancelado com sucesso
 *       400:
 *         description: Chamado já cancelado, encerrado ou falta justificativa
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao cancelar chamado
 */
router.patch('/:id/cancelar-chamado', authMiddleware, authorizeRoles('USUARIO', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { descricaoEncerramento } = req.body;
    const v = validarDescricao(descricaoEncerramento);
    if (!v.valida) return res.status(400).json({ error: 'Justificativa do cancelamento inválida: ' + v.erro });

    const result = await cancelarChamadoUseCase({
      id:                    getStringParamRequired(req.params.id),
      descricaoEncerramento,
      usuarioId:             req.usuario!.id,
      usuarioNome:           req.usuario!.nome,
      usuarioEmail:          req.usuario!.email,
      usuarioRegra:          req.usuario!.regra,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}:
 *   delete:
 *     summary: Desativa um chamado (soft delete) — ADMIN only
 *     tags: [Chamados]
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
 *         description: Chamado desativado com sucesso
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao deletar chamado
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const result = await deletarChamadoUseCase({ id: getStringParamRequired(req.params.id), permanente: req.query.permanente === 'true' });
    res.json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/vincular:
 *   post:
 *     summary: Vincula um chamado filho ao chamado pai
 *     tags: [Chamados]
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
 *             required: [filhoId]
 *             properties:
 *               filhoId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chamado vinculado com sucesso
 *       400:
 *         description: Vínculo inválido
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado pai ou filho não encontrado
 *       500:
 *         description: Erro ao vincular chamado
 */
router.post('/:id/vincular', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const { filhoId } = req.body;
    if (!filhoId || typeof filhoId !== 'string') return res.status(400).json({ error: 'filhoId é obrigatório' });

    const result = await vincularChamadoUseCase({
      paiId:        getStringParamRequired(req.params.id),
      filhoId,
      usuarioId:    req.usuario!.id,
      usuarioNome:  req.usuario!.nome,
      usuarioEmail: req.usuario!.email,
      usuarioRegra: req.usuario!.regra,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/vincular/{filhoId}:
 *   delete:
 *     summary: Desvincula um chamado filho do pai
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: filhoId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chamado desvinculado com sucesso
 *       400:
 *         description: Chamado não é filho do pai informado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao desvincular chamado
 */
router.delete('/:id/vincular/:filhoId', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  try {
    const result = await desvincularChamadoUseCase({
      paiId:        getStringParamRequired(req.params.id),
      filhoId:      getStringParamRequired(req.params.filhoId),
      usuarioId:    req.usuario!.id,
      usuarioRegra: req.usuario!.regra,
    });
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

/**
 * @swagger
 * /api/chamados/{id}/hierarquia:
 *   get:
 *     summary: Retorna a árvore hierárquica completa do chamado
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Hierarquia retornada com sucesso
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao buscar hierarquia
 */
router.get('/:id/hierarquia', authMiddleware, authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'), async (req: AuthRequest, res) => {
  try {
    const result = await hierarquiaChamadoUseCase(getStringParamRequired(req.params.id));
    res.status(200).json(result);
  } catch (err) { handleError(res, err); }
});

export default router;