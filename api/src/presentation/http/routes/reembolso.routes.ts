import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { ReembolsoError } from '@application/use-cases/reembolso/errors';
import { MIMETYPES_REEMBOLSO } from '@application/use-cases/reembolso/helpers/upload-comprovantes.helper';
import { criarReembolsoUseCase } from '@application/use-cases/reembolso/criar-reembolso.use-case';
import { listarReembolsosUseCase } from '@application/use-cases/reembolso/listar-reembolsos.use-case';
import { buscarReembolsoUseCase } from '@application/use-cases/reembolso/buscar-reembolso.use-case';
import { cancelarReembolsoUseCase } from '@application/use-cases/reembolso/cancelar-reembolso.use-case';
import { aprovarReembolsoUseCase } from '@application/use-cases/reembolso/aprovar-reembolso.use-case';
import { rejeitarReembolsoUseCase } from '@application/use-cases/reembolso/rejeitar-reembolso.use-case';
import { confirmarPagamentoUseCase } from '@application/use-cases/reembolso/confirmar-pagamento.use-case';
import { uploadComprovanteUseCase } from '@application/use-cases/reembolso/comprovantes/upload-comprovante.use-case';
import { listarComprovantesUseCase } from '@application/use-cases/reembolso/comprovantes/listar-comprovantes.use-case';
import { CategoriaReembolso } from '@prisma/client';

export const router: Router = Router();

function handleError(res: any, err: unknown) {
  if (err instanceof ReembolsoError) return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: 'Erro interno do servidor' });
}

const MAX_TAMANHO_ARQUIVO    = 10 * 1024 * 1024; // 10MB para comprovantes
const MAX_ARQUIVOS_POR_ENVIO = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_TAMANHO_ARQUIVO, files: MAX_ARQUIVOS_POR_ENVIO },
  fileFilter: (_req, file, cb) => {
    if (MIMETYPES_REEMBOLSO[file.mimetype]) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
  },
});

function uploadMiddleware(req: any, res: any, next: any) {
  upload.array('comprovantes', MAX_ARQUIVOS_POR_ENVIO)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ error: 'Um ou mais arquivos excedem o limite de 10MB' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: `Máximo de ${MAX_ARQUIVOS_POR_ENVIO} arquivos por envio` });
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

// POST /reembolsos — qualquer usuário autenticado
router.post('/', authMiddleware, uploadMiddleware, async (req: AuthRequest, res) => {
  try {
    const { descricao, categoria, valor } = req.body;

    if (!descricao || typeof descricao !== 'string' || descricao.trim().length < 10) {
      return res.status(400).json({ error: 'Descrição deve ter no mínimo 10 caracteres' });
    }

    const categoriasValidas = Object.values(CategoriaReembolso);
    if (!categoria || !categoriasValidas.includes(categoria)) {
      return res.status(400).json({ error: `Categoria inválida. Use: ${categoriasValidas.join(', ')}` });
    }

    const valorNum = parseFloat(valor);
    if (isNaN(valorNum) || valorNum <= 0) {
      return res.status(400).json({ error: 'Valor deve ser um número maior que zero' });
    }

    const result = await criarReembolsoUseCase({
      descricao,
      categoria,
      valor:         valorNum,
      arquivos:      (req.files as Express.Multer.File[]) ?? [],
      solicitanteId: req.usuario!.id,
    });

    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /reembolsos
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const pagina = Math.max(1, parseInt(String(req.query.pagina ?? '1'), 10));
    const limite = Math.min(100, Math.max(1, parseInt(String(req.query.limite ?? '20'), 10)));

    const result = await listarReembolsosUseCase({
      pagina,
      limite,
      status:     req.query.status    as string | undefined,
      categoria:  req.query.categoria as string | undefined,
      setor:      req.query.setor     as string | undefined,
      dataInicio: req.query.dataInicio as string | undefined,
      dataFim:    req.query.dataFim    as string | undefined,
      usuarioAutenticado: { id: req.usuario!.id, regra: req.usuario!.regra },
    });

    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /reembolsos/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await buscarReembolsoUseCase({
      id: req.params.id,
      usuarioAutenticado: { id: req.usuario!.id, regra: req.usuario!.regra },
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// DELETE /reembolsos/:id — próprio solicitante (ou ADMIN)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await cancelarReembolsoUseCase({
      id:           req.params.id,
      usuarioId:    req.usuario!.id,
      usuarioRegra: req.usuario!.regra,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// PATCH /reembolsos/:id/aprovar — GESTOR | ADMIN
router.patch('/:id/aprovar', authMiddleware, authorizeRoles('GESTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const result = await aprovarReembolsoUseCase({
      id:          req.params.id,
      aprovadorId: req.usuario!.id,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// PATCH /reembolsos/:id/rejeitar — GESTOR | ADMIN
router.patch('/:id/rejeitar', authMiddleware, authorizeRoles('GESTOR', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { motivoRejeicao } = req.body;
    if (!motivoRejeicao || typeof motivoRejeicao !== 'string' || motivoRejeicao.trim().length < 5) {
      return res.status(400).json({ error: 'Motivo da rejeição deve ter no mínimo 5 caracteres' });
    }

    const result = await rejeitarReembolsoUseCase({
      id:             req.params.id,
      aprovadorId:    req.usuario!.id,
      motivoRejeicao,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// PATCH /reembolsos/:id/pagar — COMPRADOR
router.patch('/:id/pagar', authMiddleware, authorizeRoles('COMPRADOR'), async (req: AuthRequest, res) => {
  try {
    const { comprovantePagamentoUrl } = req.body;

    const result = await confirmarPagamentoUseCase({
      id:                      req.params.id,
      pagadorId:               req.usuario!.id,
      comprovantePagamentoUrl: comprovantePagamentoUrl as string | undefined,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /reembolsos/:id/comprovantes
router.post('/:id/comprovantes', authMiddleware, uploadMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await uploadComprovanteUseCase({
      reembolsoId: req.params.id,
      arquivos:    (req.files as Express.Multer.File[]) ?? [],
      autorId:     req.usuario!.id,
      autorRegra:  req.usuario!.regra,
    });
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /reembolsos/:id/comprovantes
router.get('/:id/comprovantes', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await listarComprovantesUseCase({
      reembolsoId:  req.params.id,
      usuarioId:    req.usuario!.id,
      usuarioRegra: req.usuario!.regra,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
