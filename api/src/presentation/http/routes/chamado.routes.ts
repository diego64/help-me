import { Router } from 'express';
import { ChamadoStatus, PrioridadeChamado, NivelTecnico, Regra } from '@prisma/client';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getStringParamRequired } from '@shared/utils/request-params';
import { prisma } from '@infrastructure/database/prisma/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { salvarHistoricoChamado, listarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import ChamadoAtualizacaoModel from '@infrastructure/database/mongodb/atualizacao.chamado.model';
import { minioClient, MINIO_BUCKET, garantirBucket } from '@infrastructure/storage/minio.client';
import { publicarChamadoAberto, publicarChamadoAtribuido, publicarChamadoTransferido, publicarChamadoReaberto, publicarPrioridadeAlterada } from '@infrastructure/messaging/kafka/producers/notificacao.producer';

export const router: Router = Router();

const MIN_DESCRICAO_LENGTH = 10;
const MAX_DESCRICAO_LENGTH = 5000;
const MIN_COMENTARIO_LENGTH = 1;
const MAX_COMENTARIO_LENGTH = 5000;
const REABERTURA_PRAZO_HORAS = 48;
const OS_PREFIX = 'INC';
const OS_PADDING = 4;
const MAX_TAMANHO_ARQUIVO = 5 * 1024 * 1024; // 5MB
const MAX_ARQUIVOS_POR_ENVIO = 5;

const PRIORIDADES_VALIDAS: PrioridadeChamado[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

const DESCRICAO_PRIORIDADE: Record<PrioridadeChamado, string> = {
  P1: 'Alta Prioridade',
  P2: 'Urgente',
  P3: 'Urgente',
  P4: 'Baixa Prioridade',
  P5: 'Baixa Prioridade',
};

const PRIORIDADES_POR_NIVEL: Record<NivelTecnico, PrioridadeChamado[]> = {
  N1: ['P4', 'P5'],
  N2: ['P2', 'P3'],
  N3: ['P1', 'P2', 'P3', 'P4', 'P5'],
};

const NIVEL_POR_PRIORIDADE: Record<PrioridadeChamado, NivelTecnico[]> = {
  P1: ['N3'],
  P2: ['N2', 'N3'],
  P3: ['N2', 'N3'],
  P4: ['N1', 'N3'],
  P5: ['N1', 'N3'],
};

const MIMETYPES_PERMITIDOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_TAMANHO_ARQUIVO,
    files: MAX_ARQUIVOS_POR_ENVIO,
  },
  fileFilter: (_req, file, cb) => {
    if (MIMETYPES_PERMITIDOS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
    }
  },
});

function uploadMiddleware(req: any, res: any, next: any) {
  upload.array('arquivos', MAX_ARQUIVOS_POR_ENVIO)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Um ou mais arquivos excedem o limite de 5MB' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: `Máximo de ${MAX_ARQUIVOS_POR_ENVIO} arquivos por envio` });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

async function uploadArquivos(
  files: Express.Multer.File[],
  chamadoId: string,
  OS: string,
  autorId: string
): Promise<{
  data: {
    chamadoId: string;
    autorId: string;
    nomeArquivo: string;
    nomeOriginal: string;
    mimetype: string;
    tamanho: number;
    bucketMinio: string;
    objetoMinio: string;
  }[];
  erros: string[];
}> {
  await garantirBucket(MINIO_BUCKET);

  const resultados = await Promise.allSettled(
    files.map(async (file) => {
      const extensao = MIMETYPES_PERMITIDOS[file.mimetype];
      const nomeArquivo = `${OS}/${uuidv4()}.${extensao}`;

      await minioClient.putObject(
        MINIO_BUCKET,
        nomeArquivo,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype }
      );

      return {
        chamadoId,
        autorId,
        nomeArquivo,
        nomeOriginal: file.originalname,
        mimetype: file.mimetype,
        tamanho: file.size,
        bucketMinio: MINIO_BUCKET,
        objetoMinio: nomeArquivo,
      };
    })
  );

  const data: any[] = [];
  const erros: string[] = [];

  resultados.forEach((resultado, idx) => {
    if (resultado.status === 'fulfilled') {
      data.push(resultado.value);
    } else {
      erros.push(`Erro ao enviar ${files[idx].originalname}: ${resultado.reason?.message}`);
      console.error(`[MINIO UPLOAD ERROR] ${files[idx].originalname}`, resultado.reason);
    }
  });

  return { data, erros };
}

function validarDescricao(descricao: string): { valida: boolean; erro?: string } {
  if (!descricao || typeof descricao !== 'string') {
    return { valida: false, erro: 'Descrição é obrigatória' };
  }

  const descricaoLimpa = descricao.trim();

  if (descricaoLimpa.length < MIN_DESCRICAO_LENGTH) {
    return {
      valida: false,
      erro: `Descrição deve ter no mínimo ${MIN_DESCRICAO_LENGTH} caracteres`,
    };
  }

  if (descricaoLimpa.length > MAX_DESCRICAO_LENGTH) {
    return {
      valida: false,
      erro: `Descrição deve ter no máximo ${MAX_DESCRICAO_LENGTH} caracteres`,
    };
  }

  return { valida: true };
}

function validarComentario(comentario: string): { valido: boolean; erro?: string } {
  if (!comentario || typeof comentario !== 'string') {
    return { valido: false, erro: 'Comentário é obrigatório' };
  }

  const limpo = comentario.trim();

  if (limpo.length < MIN_COMENTARIO_LENGTH) {
    return { valido: false, erro: 'Comentário não pode ser vazio' };
  }

  if (limpo.length > MAX_COMENTARIO_LENGTH) {
    return {
      valido: false,
      erro: `Comentário deve ter no máximo ${MAX_COMENTARIO_LENGTH} caracteres`,
    };
  }

  return { valido: true };
}

function normalizarServicos(servico: any): string[] {
  if (servico == null) return [];

  if (Array.isArray(servico)) {
    return servico
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  if (typeof servico === 'string') {
    const nome = servico.trim();
    return nome.length > 0 ? [nome] : [];
  }

  return [];
}

async function verificarExpedienteTecnico(tecnicoId: string): Promise<boolean> {
  const expedientes = await prisma.expediente.findMany({
    where: { usuarioId: tecnicoId, ativo: true, deletadoEm: null },
    select: { entrada: true, saida: true },
  });

  if (!expedientes.length) return false;

  const agora = new Date();
  const horaAtual = agora.getHours() + agora.getMinutes() / 60;

  return expedientes.some(exp => {
    const entrada = new Date(exp.entrada);
    const saida = new Date(exp.saida);
    const horarioEntrada = entrada.getHours() + entrada.getMinutes() / 60;
    const horarioSaida = saida.getHours() + saida.getMinutes() / 60;
    return horaAtual >= horarioEntrada && horaAtual <= horarioSaida;
  });
}

async function gerarNumeroOS(): Promise<string> {
  return await prisma.$transaction(async (tx) => {
    const ultimoChamado = await tx.chamado.findFirst({
      where: { OS: { startsWith: OS_PREFIX } },
      orderBy: { OS: 'desc' },
      select: { OS: true },
    });

    let novoNumero = 1;

    if (ultimoChamado?.OS) {
      const numeroAnterior = parseInt(ultimoChamado.OS.replace(OS_PREFIX, ''), 10);
      if (!isNaN(numeroAnterior)) {
        novoNumero = numeroAnterior + 1;
      }
    }

    const numeroFormatado = String(novoNumero).padStart(OS_PADDING, '0');
    return `${OS_PREFIX}${numeroFormatado}`;
  });
}

async function buscarUltimoTecnico(chamadoId: string): Promise<string | null> {
  try {
    const historicoTecnico = await ChamadoAtualizacaoModel.findOne(
      { chamadoId, tipo: 'STATUS', para: 'EM_ATENDIMENTO' },
      { autorId: 1 },
      { sort: { dataHora: -1 } }
    );
    return historicoTecnico?.autorId || null;
  } catch (error) {
    console.error('[BUSCAR TECNICO ERROR]', error);
    return null;
  }
}

function formatarChamadoResposta(chamado: any) {
  return {
    id: chamado.id,
    OS: chamado.OS,
    descricao: chamado.descricao,
    descricaoEncerramento: chamado.descricaoEncerramento,
    status: chamado.status,
    prioridade: chamado.prioridade,
    prioridadeDescricao: chamado.prioridade
      ? DESCRICAO_PRIORIDADE[chamado.prioridade as PrioridadeChamado]
      : null,
    prioridadeAlteradaEm: chamado.prioridadeAlterada ?? null,
    prioridadeAlteradaPor: chamado.alteradorPrioridade
      ? {
          id: chamado.alteradorPrioridade.id,
          nome: `${chamado.alteradorPrioridade.nome} ${chamado.alteradorPrioridade.sobrenome}`,
          email: chamado.alteradorPrioridade.email,
        }
      : null,
    geradoEm: chamado.geradoEm,
    atualizadoEm: chamado.atualizadoEm,
    encerradoEm: chamado.encerradoEm,
    usuario: chamado.usuario
      ? {
          id: chamado.usuario.id,
          nome: chamado.usuario.nome,
          sobrenome: chamado.usuario.sobrenome,
          email: chamado.usuario.email,
        }
      : null,
    tecnico: chamado.tecnico
      ? {
          id: chamado.tecnicoId,
          nome: chamado.tecnico.nome,
          email: chamado.tecnico.email,
        }
      : null,
    servicos:
      chamado.servicos?.map((s: any) => ({
        id: s.servico.id,
        nome: s.servico.nome,
      })) || [],
  };
}

const CHAMADO_INCLUDE = {
  usuario: { select: { id: true, nome: true, sobrenome: true, email: true, setor: true } },
  tecnico: { select: { id: true, nome: true, sobrenome: true, email: true, nivel: true } },
  alteradorPrioridade: { select: { id: true, nome: true, sobrenome: true, email: true } },
  servicos: {
    include: { servico: { select: { id: true, nome: true } } },
  },
} as const;

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
 *     description: |
 *       Retorna chamados paginados com filtros opcionais.
 *       - **ADMIN**: vê todos os chamados
 *       - **TECNICO**: vê apenas chamados atribuídos a ele
 *       - **USUARIO**: vê apenas seus próprios chamados
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página (começa em 1)
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Itens por página (máx 100)
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Busca por OS, descrição, nome ou email do usuário
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *         description: Filtrar por status (aceita múltiplos separados por vírgula)
 *       - in: query
 *         name: prioridade
 *         schema:
 *           type: string
 *           enum: [P1, P2, P3, P4, P5]
 *         description: Filtrar por prioridade (aceita múltiplos separados por vírgula)
 *       - in: query
 *         name: tecnicoId
 *         schema:
 *           type: string
 *         description: Filtrar por técnico responsável (somente ADMIN)
 *       - in: query
 *         name: usuarioId
 *         schema:
 *           type: string
 *         description: Filtrar por usuário que abriu (somente ADMIN)
 *       - in: query
 *         name: setor
 *         schema:
 *           type: string
 *         description: Filtrar por setor do usuário (somente ADMIN e TECNICO)
 *       - in: query
 *         name: servico
 *         schema:
 *           type: string
 *         description: Filtrar pelo nome do serviço (busca parcial)
 *       - in: query
 *         name: semTecnico
 *         schema:
 *           type: boolean
 *         description: Listar apenas chamados sem técnico atribuído (somente ADMIN e TECNICO)
 *       - in: query
 *         name: dataInicio
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar chamados criados a partir desta data (YYYY-MM-DD)
 *       - in: query
 *         name: dataFim
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar chamados criados até esta data (YYYY-MM-DD)
 *       - in: query
 *         name: ordenarPor
 *         schema:
 *           type: string
 *           enum: [geradoEm, atualizadoEm, prioridade, status, OS]
 *           default: geradoEm
 *       - in: query
 *         name: ordem
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Lista de chamados retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao listar chamados
 */
router.get(
  '/',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      // ── Paginação ──
      const pagina = Math.max(1, parseInt(req.query.pagina as string) || 1);
      const limite = Math.min(100, Math.max(1, parseInt(req.query.limite as string) || 20));
      const skip   = (pagina - 1) * limite;

      // ── Busca textual ──
      const busca = (req.query.busca as string)?.trim() || '';

      // ── Filtros ──
      const statusParam     = req.query.status     as string | undefined;
      const prioridadeParam = req.query.prioridade as string | undefined;
      const tecnicoIdParam  = req.query.tecnicoId  as string | undefined;
      const usuarioIdParam  = req.query.usuarioId  as string | undefined;
      const setorParam      = req.query.setor       as string | undefined;
      const servicoParam    = req.query.servico     as string | undefined;
      const semTecnico      = req.query.semTecnico === 'true';
      const dataInicio      = req.query.dataInicio  as string | undefined;
      const dataFim         = req.query.dataFim     as string | undefined;

      // ── Ordenação ──
      const camposOrdenacao = ['geradoEm', 'atualizadoEm', 'prioridade', 'status', 'OS'] as const;
      type CampoOrdenacao = typeof camposOrdenacao[number];

      const ordenarPorRaw = (req.query.ordenarPor as string) || 'geradoEm';
      const ordenarPor: CampoOrdenacao = camposOrdenacao.includes(ordenarPorRaw as CampoOrdenacao)
        ? (ordenarPorRaw as CampoOrdenacao)
        : 'geradoEm';

      const ordem = req.query.ordem === 'asc' ? 'asc' : 'desc';

      // ── WHERE base ──
      const where: any = { deletadoEm: null };
      const regra = req.usuario!.regra;

      // Escopo automático por role
      if (regra === 'USUARIO') {
        where.usuarioId = req.usuario!.id;
      } else if (regra === 'TECNICO') {
        where.tecnicoId = req.usuario!.id;
      }

      // ── Filtro de status (aceita múltiplos separados por vírgula) ──
      if (statusParam) {
        const statusValidos = Object.values(ChamadoStatus);
        const statusFiltro = statusParam
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(s => statusValidos.includes(s as ChamadoStatus)) as ChamadoStatus[];

        if (statusFiltro.length === 1) {
          where.status = statusFiltro[0];
        } else if (statusFiltro.length > 1) {
          where.status = { in: statusFiltro };
        }
      }

      // ── Filtro de prioridade (aceita múltiplos separados por vírgula) ──
      if (prioridadeParam) {
        const prioridadesValidas = Object.values(PrioridadeChamado);
        const prioridadeFiltro = prioridadeParam
          .split(',')
          .map(p => p.trim().toUpperCase())
          .filter(p => prioridadesValidas.includes(p as PrioridadeChamado)) as PrioridadeChamado[];

        if (prioridadeFiltro.length === 1) {
          where.prioridade = prioridadeFiltro[0];
        } else if (prioridadeFiltro.length > 1) {
          where.prioridade = { in: prioridadeFiltro };
        }
      }

      // ── Filtros exclusivos do ADMIN ──
      if (regra === 'ADMIN') {
        if (tecnicoIdParam) where.tecnicoId = tecnicoIdParam;
        if (usuarioIdParam) where.usuarioId = usuarioIdParam;
      }

      // ── Chamados sem técnico (ADMIN e TECNICO) ──
      if (semTecnico && regra !== 'USUARIO') {
        where.tecnicoId = null;
      }

      // ── Filtro por setor do usuário (ADMIN e TECNICO) ──
      if (setorParam && regra !== 'USUARIO') {
        where.usuario = { setor: setorParam };
      }

      // ── Filtro por serviço (busca parcial, case-insensitive) ──
      if (servicoParam) {
        where.servicos = {
          some: {
            servico: {
              nome: { contains: servicoParam, mode: 'insensitive' },
              deletadoEm: null,
            },
          },
        };
      }

      // ── Filtro por período de criação ──
      if (dataInicio || dataFim) {
        where.geradoEm = {};
        if (dataInicio) {
          const inicio = new Date(dataInicio);
          if (!isNaN(inicio.getTime())) {
            inicio.setHours(0, 0, 0, 0);
            where.geradoEm.gte = inicio;
          }
        }
        if (dataFim) {
          const fim = new Date(dataFim);
          if (!isNaN(fim.getTime())) {
            fim.setHours(23, 59, 59, 999);
            where.geradoEm.lte = fim;
          }
        }
      }

      // ── Busca textual ──
      if (busca) {
        const buscaOR: any[] = [
          { OS:        { contains: busca, mode: 'insensitive' } },
          { descricao: { contains: busca, mode: 'insensitive' } },
        ];

        // ADMIN e TECNICO podem buscar por nome/email do usuário
        if (regra !== 'USUARIO') {
          buscaOR.push({ usuario: { email: { contains: busca, mode: 'insensitive' } } });
          buscaOR.push({ usuario: { nome:  { contains: busca, mode: 'insensitive' } } });
        }

        where.AND = where.AND
          ? [...where.AND, { OR: buscaOR }]
          : [{ OR: buscaOR }];
      }

      // ── Ordenação ──
      // prioridade: P1 < P2 < P3... é alfabeticamente correto, então string sort funciona
      const orderBy: any[] = [{ [ordenarPor]: ordem }, { geradoEm: 'desc' }];

      // ── Query em paralelo ──
      const [total, chamados] = await Promise.all([
        prisma.chamado.count({ where }),
        prisma.chamado.findMany({
          where,
          skip,
          take: limite,
          orderBy,
          include: CHAMADO_INCLUDE,
        }),
      ]);

      const totalPaginas = Math.ceil(total / limite);

      // ── Filtros ativos (feedback para o cliente) ──
      const filtrosAtivos: Record<string, any> = {};
      if (statusParam)     filtrosAtivos.status      = statusParam;
      if (prioridadeParam) filtrosAtivos.prioridade   = prioridadeParam;
      if (tecnicoIdParam)  filtrosAtivos.tecnicoId    = tecnicoIdParam;
      if (usuarioIdParam)  filtrosAtivos.usuarioId    = usuarioIdParam;
      if (setorParam)      filtrosAtivos.setor         = setorParam;
      if (servicoParam)    filtrosAtivos.servico       = servicoParam;
      if (semTecnico)      filtrosAtivos.semTecnico    = true;
      if (dataInicio)      filtrosAtivos.dataInicio    = dataInicio;
      if (dataFim)         filtrosAtivos.dataFim       = dataFim;
      if (busca)           filtrosAtivos.busca         = busca;

      return res.status(200).json({
        chamados: chamados.map(formatarChamadoResposta),
        paginacao: {
          total,
          totalPaginas,
          paginaAtual: pagina,
          limite,
          temProxima:  pagina < totalPaginas,
          temAnterior: pagina > 1,
        },
        ordenacao: { campo: ordenarPor, ordem },
        filtros: Object.keys(filtrosAtivos).length > 0 ? filtrosAtivos : null,
      });
    } catch (err: any) {
      console.error('[CHAMADO LIST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar chamados' });
    }
  }
);

/**
 * @swagger
 * /api/chamados/abertura-chamado:
 *   post:
 *     summary: Abre um novo chamado de suporte
 *     description: |
 *       Cria um novo chamado via multipart/form-data. Prioridade padrão é P4.
 *       Aceita até 5 arquivos opcionais (máx 5MB cada): jpg, png, gif, webp, pdf, docx, xlsx, txt, csv.
 *       Requer autenticação e perfil USUARIO.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - descricao
 *               - servico
 *             properties:
 *               descricao:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *               servico:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *               arquivos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 5
 *     responses:
 *       201:
 *         description: Chamado criado com sucesso
 *       400:
 *         description: Dados inválidos, serviço não encontrado ou arquivo inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro ao criar o chamado
 */
router.post(
  '/abertura-chamado',
  authMiddleware,
  authorizeRoles('USUARIO'),
  uploadMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const { descricao, servico } = req.body;
      const arquivos = (req.files as Express.Multer.File[]) ?? [];

      const validacao = validarDescricao(descricao);
      if (!validacao.valida) {
        return res.status(400).json({ error: validacao.erro });
      }

      const servicosArray = normalizarServicos(servico);
      if (!servicosArray.length) {
        return res.status(400).json({
          error: 'É obrigatório informar pelo menos um serviço válido',
        });
      }

      const [encontrarServico, OS] = await Promise.all([
        prisma.servico.findMany({
          where: { nome: { in: servicosArray }, ativo: true, deletadoEm: null },
          select: { id: true, nome: true },
        }),
        gerarNumeroOS(),
      ]);

      const nomesEncontrados = encontrarServico.map((s) => s.nome);
      const nomesNaoEncontrados = servicosArray.filter(
        (n) => !nomesEncontrados.includes(n)
      );

      if (nomesNaoEncontrados.length > 0) {
        return res.status(400).json({
          error: `Serviços não encontrados ou inativos: ${nomesNaoEncontrados.join(', ')}`,
        });
      }

      let anexosData: any[] = [];
      let errosUpload: string[] = [];

      if (arquivos.length > 0) {
        const resultado = await uploadArquivos(arquivos, '', OS, req.usuario!.id);
        anexosData = resultado.data;
        errosUpload = resultado.erros;
      }

      const chamado = await prisma.$transaction(async (tx) => {
        const novoChamado = await tx.chamado.create({
          data: {
            OS,
            descricao: descricao.trim(),
            usuarioId: req.usuario!.id,
            status: ChamadoStatus.ABERTO,
            prioridade: PrioridadeChamado.P4,
            servicos: {
              create: encontrarServico.map((s) => ({
                servico: { connect: { id: s.id } },
              })),
            },
          },
          include: CHAMADO_INCLUDE,
        });

        if (anexosData.length > 0) {
          await tx.anexoChamado.createMany({
            data: anexosData.map((a) => ({ ...a, chamadoId: novoChamado.id })),
          });
        }

        return novoChamado;
      });

      salvarHistoricoChamado({
        chamadoId: chamado.id,
        tipo: 'ABERTURA',
        de: undefined,
        para: ChamadoStatus.ABERTO,
        descricao: chamado.descricao,
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => console.error('[SAVE HISTORICO ERROR]', err));

      prisma.usuario.findMany({
        where: {
          regra: 'TECNICO',
          nivel: { in: NIVEL_POR_PRIORIDADE[PrioridadeChamado.P4] },
          ativo: true,
          deletadoEm: null,
        },
        select: { id: true, email: true, nome: true, nivel: true },
      }).then((tecnicos) =>
        publicarChamadoAberto({
          chamadoId: chamado.id,
          chamadoOS: chamado.OS,
          prioridade: PrioridadeChamado.P4,
          descricao: chamado.descricao,
          usuarioNome: `${req.usuario!.nome}`,
          usuarioSetor: (chamado.usuario as any)?.setor ?? '',
          servicos: encontrarServico.map((s) => s.nome),
          tecnicos: tecnicos.map((t) => ({
            id: t.id,
            email: t.email,
            nome: t.nome,
            nivel: t.nivel!,
          })),
        })
      ).catch(err => console.error('[KAFKA PUBLISH ERROR]', err));

      return res.status(201).json({
        ...formatarChamadoResposta(chamado),
        anexos: {
          enviados: anexosData.length,
          erros: errosUpload.length > 0 ? errosUpload : undefined,
        },
      });
    } catch (err: any) {
      console.error('[CHAMADO CREATE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar o chamado' });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}:
 *   patch:
 *     summary: Edita a descrição de um chamado
 *     description: |
 *       Permite editar a descrição e/ou adicionar até 5 novos anexos opcionais.
 *       Apenas o USUARIO dono do chamado ou ADMIN podem editar.
 *       Chamado deve estar em status ABERTO ou REABERTO.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               descricao:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *               arquivos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 5
 *     responses:
 *       200:
 *         description: Chamado atualizado com sucesso
 *       400:
 *         description: Dados inválidos ou chamado não pode ser editado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao editar chamado
 */
router.patch(
  '/:id',
  authMiddleware,
  authorizeRoles('USUARIO', 'ADMIN'),
  uploadMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const { descricao } = req.body;
      const arquivos = (req.files as Express.Multer.File[]) ?? [];

      if (!descricao && arquivos.length === 0) {
        return res.status(400).json({
          error: 'Informe uma nova descrição ou ao menos um arquivo para atualizar',
        });
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: {
          id: true, OS: true, status: true,
          usuarioId: true, deletadoEm: true,
        },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (req.usuario!.regra === 'USUARIO' && chamado.usuarioId !== req.usuario!.id) {
        return res.status(403).json({ error: 'Você só pode editar chamados criados por você' });
      }

      const statusEditaveis: ChamadoStatus[] = [
        ChamadoStatus.ABERTO,
        ChamadoStatus.REABERTO,
      ];

      if (!statusEditaveis.includes(chamado.status)) {
        return res.status(400).json({
          error: `Chamado com status ${chamado.status} não pode ser editado. Permitido: ${statusEditaveis.join(', ')}`,
        });
      }

      if (descricao) {
        const validacao = validarDescricao(descricao);
        if (!validacao.valida) {
          return res.status(400).json({ error: validacao.erro });
        }
      }

      let anexosData: any[] = [];
      let errosUpload: string[] = [];

      if (arquivos.length > 0) {
        const resultado = await uploadArquivos(arquivos, id, chamado.OS, req.usuario!.id);
        anexosData = resultado.data;
        errosUpload = resultado.erros;
      }

      const chamadoAtualizado = await prisma.$transaction(async (tx) => {
        const updated = await tx.chamado.update({
          where: { id },
          data: {
            ...(descricao ? { descricao: descricao.trim() } : {}),
            atualizadoEm: new Date(),
          },
          include: CHAMADO_INCLUDE,
        });

        if (anexosData.length > 0) {
          await tx.anexoChamado.createMany({ data: anexosData });
        }

        return updated;
      });

      console.log('[CHAMADO EDITADO]', {
        id,
        OS: chamado.OS,
        descricaoAlterada: !!descricao,
        anexosAdicionados: anexosData.length,
        editadoPor: req.usuario!.id,
      });

      return res.status(200).json({
        message: 'Chamado atualizado com sucesso',
        chamado: formatarChamadoResposta(chamadoAtualizado),
        anexos: {
          adicionados: anexosData.length,
          erros: errosUpload.length > 0 ? errosUpload : undefined,
        },
      });
    } catch (err: any) {
      console.error('[CHAMADO EDIT ERROR]', err);
      return res.status(500).json({ error: 'Erro ao editar o chamado' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - arquivos
 *             properties:
 *               arquivos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 5
 *     responses:
 *       201:
 *         description: Anexos enviados com sucesso
 *       400:
 *         description: Arquivo inválido
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao fazer upload
 */
router.post(
  '/:id/anexos',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  uploadMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const arquivos = (req.files as Express.Multer.File[]) ?? [];

      if (arquivos.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: { id: true, OS: true, status: true, deletadoEm: true },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({ error: 'Não é possível anexar arquivos em chamados cancelados' });
      }

      if (chamado.status === ChamadoStatus.ENCERRADO) {
        return res.status(400).json({ error: 'Não é possível anexar arquivos em chamados encerrados' });
      }

      const { data: anexosData, erros } = await uploadArquivos(
        arquivos, id, chamado.OS, req.usuario!.id
      );

      if (anexosData.length > 0) {
        await prisma.anexoChamado.createMany({ data: anexosData });
      }

      console.log('[ANEXOS UPLOAD]', {
        chamadoId: id,
        OS: chamado.OS,
        enviados: anexosData.length,
        erros: erros.length,
        autorId: req.usuario!.id,
      });

      return res.status(201).json({
        message: `${anexosData.length} arquivo(s) anexado(s) com sucesso`,
        enviados: anexosData.length,
        erros: erros.length > 0 ? erros : undefined,
      });
    } catch (err: any) {
      console.error('[ANEXO UPLOAD ERROR]', err);
      return res.status(500).json({ error: 'Erro ao fazer upload dos arquivos' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de anexos retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao listar anexos
 */
router.get(
  '/:id/anexos',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: { id: true, OS: true, deletadoEm: true },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      const anexos = await prisma.anexoChamado.findMany({
        where: { chamadoId: id, deletadoEm: null },
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true,
          nomeOriginal: true,
          mimetype: true,
          tamanho: true,
          criadoEm: true,
          autor: { select: { id: true, nome: true, sobrenome: true, email: true } },
        },
      });

      return res.status(200).json({
        chamadoOS: chamado.OS,
        total: anexos.length,
        anexos: anexos.map(a => ({
          id: a.id,
          nomeOriginal: a.nomeOriginal,
          mimetype: a.mimetype,
          tamanho: a.tamanho,
          criadoEm: a.criadoEm,
          autor: {
            id: a.autor.id,
            nome: `${a.autor.nome} ${a.autor.sobrenome}`,
            email: a.autor.email,
          },
        })),
      });
    } catch (err: any) {
      console.error('[ANEXO LIST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar anexos' });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}/anexos/{anexoId}/download:
 *   get:
 *     summary: Gera URL de download de um anexo
 *     description: Retorna uma URL assinada com validade de 10 minutos para download seguro direto do MinIO.
 *     tags: [Chamados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: anexoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: URL de download gerada com sucesso
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Anexo não encontrado
 *       500:
 *         description: Erro ao gerar URL
 */
router.get(
  '/:id/anexos/:anexoId/download',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const chamadoId = getStringParamRequired(req.params.id);
      const anexoId   = getStringParamRequired(req.params.anexoId);

      const anexo = await prisma.anexoChamado.findUnique({
        where: { id: anexoId },
        select: {
          id: true, chamadoId: true, nomeOriginal: true,
          mimetype: true, tamanho: true, bucketMinio: true,
          objetoMinio: true, deletadoEm: true,
        },
      });

      if (!anexo || anexo.deletadoEm || anexo.chamadoId !== chamadoId) {
        return res.status(404).json({ error: 'Anexo não encontrado' });
      }

      const url = await minioClient.presignedGetObject(
        anexo.bucketMinio,
        anexo.objetoMinio,
        10 * 60
      );

      return res.status(200).json({
        url,
        expiraEm: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        arquivo: {
          id: anexo.id,
          nomeOriginal: anexo.nomeOriginal,
          mimetype: anexo.mimetype,
          tamanho: anexo.tamanho,
        },
      });
    } catch (err: any) {
      console.error('[ANEXO DOWNLOAD ERROR]', err);
      return res.status(500).json({ error: 'Erro ao gerar URL de download' });
    }
  }
);

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
 *         schema:
 *           type: string
 *       - in: path
 *         name: anexoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Anexo removido com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Anexo não encontrado
 *       500:
 *         description: Erro ao remover anexo
 */
router.delete(
  '/:id/anexos/:anexoId',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const chamadoId = getStringParamRequired(req.params.id);
      const anexoId   = getStringParamRequired(req.params.anexoId);

      const anexo = await prisma.anexoChamado.findUnique({
        where: { id: anexoId },
        select: { id: true, chamadoId: true, autorId: true, deletadoEm: true },
      });

      if (!anexo || anexo.deletadoEm || anexo.chamadoId !== chamadoId) {
        return res.status(404).json({ error: 'Anexo não encontrado' });
      }

      if (req.usuario!.regra !== 'ADMIN' && anexo.autorId !== req.usuario!.id) {
        return res.status(403).json({ error: 'Você só pode remover seus próprios anexos' });
      }

      await prisma.anexoChamado.update({
        where: { id: anexoId },
        data: { deletadoEm: new Date() },
      });

      return res.status(200).json({ message: 'Anexo removido com sucesso', id: anexoId });
    } catch (err: any) {
      console.error('[ANEXO DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover anexo' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comentario
 *             properties:
 *               comentario:
 *                 type: string
 *                 maxLength: 5000
 *               visibilidadeInterna:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Comentário criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão para comentário interno
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao criar comentário
 */
router.post(
  '/:id/comentarios',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const { comentario, visibilidadeInterna = false } = req.body;

      const validacao = validarComentario(comentario);
      if (!validacao.valido) {
        return res.status(400).json({ error: validacao.erro });
      }

      if (visibilidadeInterna && req.usuario!.regra === 'USUARIO') {
        return res.status(403).json({
          error: 'Usuários não podem criar comentários internos',
        });
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: { id: true, OS: true, status: true, deletadoEm: true },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({
          error: 'Não é possível comentar em chamados cancelados',
        });
      }

      const novoComentario = await prisma.comentarioChamado.create({
        data: {
          chamadoId: id,
          autorId: req.usuario!.id,
          comentario: comentario.trim(),
          visibilidadeInterna: Boolean(visibilidadeInterna),
        },
        select: {
          id: true,
          comentario: true,
          visibilidadeInterna: true,
          criadoEm: true,
          atualizadoEm: true,
          autor: {
            select: { id: true, nome: true, sobrenome: true, email: true, regra: true },
          },
        },
      });

      console.log('[COMENTARIO CRIADO]', {
        chamadoId: id,
        OS: chamado.OS,
        autorId: req.usuario!.id,
        visibilidadeInterna,
      });

      return res.status(201).json({
        message: 'Comentário adicionado com sucesso',
        comentario: {
          id: novoComentario.id,
          comentario: novoComentario.comentario,
          visibilidadeInterna: novoComentario.visibilidadeInterna,
          criadoEm: novoComentario.criadoEm,
          atualizadoEm: novoComentario.atualizadoEm,
          autor: {
            id: novoComentario.autor.id,
            nome: `${novoComentario.autor.nome} ${novoComentario.autor.sobrenome}`,
            email: novoComentario.autor.email,
            regra: novoComentario.autor.regra,
          },
        },
      });
    } catch (err: any) {
      console.error('[COMENTARIO CREATE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar comentário' });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}/comentarios:
 *   get:
 *     summary: Lista os comentários de um chamado
 *     description: USUARIO não visualiza comentários com visibilidadeInterna true.
 *     tags: [Chamados]
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
 *         description: Lista de comentários retornada com sucesso
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao listar comentários
 */
router.get(
  '/:id/comentarios',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: { id: true, OS: true, deletadoEm: true },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      const where: any = { chamadoId: id, deletadoEm: null };

      if (req.usuario!.regra === 'USUARIO') {
        where.visibilidadeInterna = false;
      }

      const comentarios = await prisma.comentarioChamado.findMany({
        where,
        orderBy: { criadoEm: 'asc' },
        select: {
          id: true,
          comentario: true,
          visibilidadeInterna: true,
          criadoEm: true,
          atualizadoEm: true,
          autor: {
            select: { id: true, nome: true, sobrenome: true, email: true, regra: true },
          },
        },
      });

      return res.status(200).json({
        chamadoOS: chamado.OS,
        total: comentarios.length,
        comentarios: comentarios.map(c => ({
          id: c.id,
          comentario: c.comentario,
          visibilidadeInterna: c.visibilidadeInterna,
          criadoEm: c.criadoEm,
          atualizadoEm: c.atualizadoEm,
          autor: {
            id: c.autor.id,
            nome: `${c.autor.nome} ${c.autor.sobrenome}`,
            email: c.autor.email,
            regra: c.autor.regra,
          },
        })),
      });
    } catch (err: any) {
      console.error('[COMENTARIO LIST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar comentários' });
    }
  }
);

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
 *         schema:
 *           type: string
 *       - in: path
 *         name: comentarioId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comentario
 *             properties:
 *               comentario:
 *                 type: string
 *                 maxLength: 5000
 *     responses:
 *       200:
 *         description: Comentário atualizado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Comentário não encontrado
 *       500:
 *         description: Erro ao editar comentário
 */
router.put(
  '/:id/comentarios/:comentarioId',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const chamadoId    = getStringParamRequired(req.params.id);
      const comentarioId = getStringParamRequired(req.params.comentarioId);
      const { comentario } = req.body;

      const validacao = validarComentario(comentario);
      if (!validacao.valido) {
        return res.status(400).json({ error: validacao.erro });
      }

      const comentarioExistente = await prisma.comentarioChamado.findUnique({
        where: { id: comentarioId },
        select: {
          id: true, autorId: true, chamadoId: true, deletadoEm: true,
          chamado: { select: { status: true } },
        },
      });

      if (!comentarioExistente || comentarioExistente.deletadoEm || comentarioExistente.chamadoId !== chamadoId) {
        return res.status(404).json({ error: 'Comentário não encontrado' });
      }

      if (req.usuario!.regra !== 'ADMIN' && comentarioExistente.autorId !== req.usuario!.id) {
        return res.status(403).json({ error: 'Você só pode editar seus próprios comentários' });
      }

      if (comentarioExistente.chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({ error: 'Não é possível editar comentários de chamados cancelados' });
      }

      const atualizado = await prisma.comentarioChamado.update({
        where: { id: comentarioId },
        data: { comentario: comentario.trim() },
        select: {
          id: true,
          comentario: true,
          visibilidadeInterna: true,
          criadoEm: true,
          atualizadoEm: true,
          autor: {
            select: { id: true, nome: true, sobrenome: true, email: true, regra: true },
          },
        },
      });

      return res.status(200).json({
        message: 'Comentário atualizado com sucesso',
        comentario: {
          id: atualizado.id,
          comentario: atualizado.comentario,
          visibilidadeInterna: atualizado.visibilidadeInterna,
          criadoEm: atualizado.criadoEm,
          atualizadoEm: atualizado.atualizadoEm,
          autor: {
            id: atualizado.autor.id,
            nome: `${atualizado.autor.nome} ${atualizado.autor.sobrenome}`,
            email: atualizado.autor.email,
            regra: atualizado.autor.regra,
          },
        },
      });
    } catch (err: any) {
      console.error('[COMENTARIO UPDATE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao editar comentário' });
    }
  }
);

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
 *         schema:
 *           type: string
 *       - in: path
 *         name: comentarioId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comentário removido com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Comentário não encontrado
 *       500:
 *         description: Erro ao remover comentário
 */
router.delete(
  '/:id/comentarios/:comentarioId',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO', 'USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const chamadoId    = getStringParamRequired(req.params.id);
      const comentarioId = getStringParamRequired(req.params.comentarioId);

      const comentario = await prisma.comentarioChamado.findUnique({
        where: { id: comentarioId },
        select: { id: true, autorId: true, chamadoId: true, deletadoEm: true },
      });

      if (!comentario || comentario.deletadoEm || comentario.chamadoId !== chamadoId) {
        return res.status(404).json({ error: 'Comentário não encontrado' });
      }

      if (req.usuario!.regra !== 'ADMIN' && comentario.autorId !== req.usuario!.id) {
        return res.status(403).json({ error: 'Você só pode remover seus próprios comentários' });
      }

      await prisma.comentarioChamado.update({
        where: { id: comentarioId },
        data: { deletadoEm: new Date() },
      });

      return res.status(200).json({ message: 'Comentário removido com sucesso', id: comentarioId });
    } catch (err: any) {
      console.error('[COMENTARIO DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover comentário' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tecnicoNovoId
 *               - motivo
 *             properties:
 *               tecnicoNovoId:
 *                 type: string
 *               motivo:
 *                 type: string
 *                 minLength: 10
 *     responses:
 *       200:
 *         description: Chamado transferido com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado ou técnico não encontrado
 *       500:
 *         description: Erro ao transferir chamado
 */
router.patch(
  '/:id/transferir',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const { tecnicoNovoId, motivo } = req.body;

      if (!tecnicoNovoId || typeof tecnicoNovoId !== 'string') {
        return res.status(400).json({ error: 'ID do novo técnico é obrigatório' });
      }

      const validacaoMotivo = validarDescricao(motivo);
      if (!validacaoMotivo.valida) {
        return res.status(400).json({ error: 'Motivo inválido: ' + validacaoMotivo.erro });
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: {
          id: true, OS: true, status: true, prioridade: true,
          tecnicoId: true, deletadoEm: true,
          tecnico: { select: { nome: true, sobrenome: true } },
        },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      const statusPermitidos: ChamadoStatus[] = [
        ChamadoStatus.ABERTO,
        ChamadoStatus.EM_ATENDIMENTO,
        ChamadoStatus.REABERTO,
      ];

      if (!statusPermitidos.includes(chamado.status)) {
        return res.status(400).json({
          error: `Chamado com status ${chamado.status} não pode ser transferido. Permitido: ${statusPermitidos.join(', ')}`,
        });
      }

      if (req.usuario!.regra === 'TECNICO' && chamado.tecnicoId !== req.usuario!.id) {
        return res.status(403).json({ error: 'Você só pode transferir chamados atribuídos a você' });
      }

      if (chamado.tecnicoId === tecnicoNovoId) {
        return res.status(400).json({ error: 'O chamado já está atribuído a este técnico' });
      }

      const tecnicoNovo = await prisma.usuario.findUnique({
        where: { id: tecnicoNovoId },
        select: {
          id: true, nome: true, sobrenome: true, email: true,
          regra: true, nivel: true, ativo: true, deletadoEm: true,
        },
      });

      if (!tecnicoNovo || tecnicoNovo.regra !== Regra.TECNICO) {
        return res.status(404).json({ error: 'Técnico destino não encontrado' });
      }

      if (!tecnicoNovo.ativo || tecnicoNovo.deletadoEm) {
        return res.status(400).json({ error: 'Técnico destino está inativo ou deletado' });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const transferencia = await tx.transferenciaChamado.create({
          data: {
            chamadoId: id,
            tecnicoAnteriorId: chamado.tecnicoId,
            tecnicoNovoId,
            motivo: motivo.trim(),
            transferidoPor: req.usuario!.id,
          },
        });

        const chamadoAtualizado = await tx.chamado.update({
          where: { id },
          data: { tecnicoId: tecnicoNovoId, atualizadoEm: new Date() },
          include: CHAMADO_INCLUDE,
        });

        return { transferencia, chamadoAtualizado };
      });

      salvarHistoricoChamado({
        chamadoId: id,
        tipo: 'TRANSFERENCIA',
        de: chamado.tecnicoId ?? undefined,
        para: tecnicoNovoId,
        descricao: motivo.trim(),
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => console.error('[SAVE HISTORICO ERROR]', err));

      console.log('[CHAMADO TRANSFERIDO]', {
        id, OS: chamado.OS,
        tecnicoAnterior: chamado.tecnicoId,
        tecnicoNovo: tecnicoNovoId,
        transferidoPor: req.usuario!.id,
      });

      publicarChamadoTransferido({
        chamadoId: id,
        chamadoOS: chamado.OS,
        prioridade: chamado.prioridade,
        motivo: motivo.trim(),
        tecnicoAnteriorNome: chamado.tecnico
          ? `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}`
          : 'N/A',
        tecnicoNovo: {
          id: tecnicoNovo.id,
          email: tecnicoNovo.email,
          nome: `${tecnicoNovo.nome} ${tecnicoNovo.sobrenome}`,
          nivel: tecnicoNovo.nivel,
        },
      }).catch(err => console.error('[KAFKA PUBLISH ERROR]', err));

      return res.status(200).json({
        message: `Chamado ${chamado.OS} transferido com sucesso`,
        transferencia: {
          id: resultado.transferencia.id,
          tecnicoAnterior: chamado.tecnicoId ?? null,
          tecnicoNovo: {
            id: tecnicoNovo.id,
            nome: `${tecnicoNovo.nome} ${tecnicoNovo.sobrenome}`,
            email: tecnicoNovo.email,
            nivel: tecnicoNovo.nivel,
          },
          motivo: motivo.trim(),
          transferidoEm: resultado.transferencia.transferidoEm,
        },
        chamado: formatarChamadoResposta(resultado.chamadoAtualizado),
      });
    } catch (err: any) {
      console.error('[CHAMADO TRANSFERIR ERROR]', err);
      return res.status(500).json({ error: 'Erro ao transferir chamado' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Histórico de transferências retornado com sucesso
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao buscar transferências
 */
router.get(
  '/:id/transferencias',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: { id: true, OS: true, deletadoEm: true },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      const transferencias = await prisma.transferenciaChamado.findMany({
        where: { chamadoId: id },
        orderBy: { transferidoEm: 'desc' },
        select: {
          id: true,
          motivo: true,
          transferidoEm: true,
          tecnicoAnterior: {
            select: { id: true, nome: true, sobrenome: true, email: true, nivel: true },
          },
          tecnicoNovo: {
            select: { id: true, nome: true, sobrenome: true, email: true, nivel: true },
          },
          transferidor: {
            select: { id: true, nome: true, sobrenome: true, email: true, regra: true },
          },
        },
      });

      return res.status(200).json({
        chamadoOS: chamado.OS,
        total: transferencias.length,
        transferencias: transferencias.map(t => ({
          id: t.id,
          motivo: t.motivo,
          transferidoEm: t.transferidoEm,
          tecnicoAnterior: t.tecnicoAnterior
            ? {
                id: t.tecnicoAnterior.id,
                nome: `${t.tecnicoAnterior.nome} ${t.tecnicoAnterior.sobrenome}`,
                email: t.tecnicoAnterior.email,
                nivel: t.tecnicoAnterior.nivel,
              }
            : null,
          tecnicoNovo: {
            id: t.tecnicoNovo.id,
            nome: `${t.tecnicoNovo.nome} ${t.tecnicoNovo.sobrenome}`,
            email: t.tecnicoNovo.email,
            nivel: t.tecnicoNovo.nivel,
          },
          transferidoPor: {
            id: t.transferidor.id,
            nome: `${t.transferidor.nome} ${t.transferidor.sobrenome}`,
            email: t.transferidor.email,
            regra: t.transferidor.regra,
          },
        })),
      });
    } catch (err: any) {
      console.error('[CHAMADO TRANSFERENCIAS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar transferências' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prioridade
 *             properties:
 *               prioridade:
 *                 type: string
 *                 enum: [P1, P2, P3, P4, P5]
 *               motivo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Prioridade atualizada com sucesso
 *       400:
 *         description: Prioridade inválida
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao alterar prioridade
 */
router.patch(
  '/:id/prioridade',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const { prioridade, motivo } = req.body;

      if (!prioridade || !PRIORIDADES_VALIDAS.includes(prioridade as PrioridadeChamado)) {
        return res.status(400).json({
          error: `Prioridade inválida. Use: ${PRIORIDADES_VALIDAS.join(', ')}`,
        });
      }

      if (req.usuario!.regra === 'TECNICO') {
        const tecnico = await prisma.usuario.findUnique({
          where: { id: req.usuario!.id },
          select: { nivel: true },
        });

        if (!tecnico || tecnico.nivel !== NivelTecnico.N3) {
          return res.status(403).json({
            error: 'Somente técnicos N3 podem reclassificar a prioridade de chamados',
          });
        }
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: {
          id: true, OS: true, prioridade: true, status: true, deletadoEm: true,
          tecnico: { select: { id: true, email: true, nome: true, sobrenome: true, nivel: true } },
        },
      });

      if (!chamado || chamado.deletadoEm) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({ error: 'Não é possível alterar a prioridade de um chamado cancelado' });
      }

      if (chamado.status === ChamadoStatus.ENCERRADO) {
        return res.status(400).json({ error: 'Não é possível alterar a prioridade de um chamado encerrado' });
      }

      if (chamado.prioridade === prioridade) {
        return res.status(400).json({ error: `Chamado já possui a prioridade ${prioridade}` });
      }

      const chamadoAtualizado = await prisma.chamado.update({
        where: { id },
        data: {
          prioridade: prioridade as PrioridadeChamado,
          prioridadeAlterada: new Date(),
          prioridadeAlteradaPor: req.usuario!.id,
        },
        include: CHAMADO_INCLUDE,
      });

      salvarHistoricoChamado({
        chamadoId: chamadoAtualizado.id,
        tipo: 'PRIORIDADE',
        de: chamado.prioridade,
        para: prioridade,
        descricao: motivo?.trim() || `Prioridade alterada de ${chamado.prioridade} para ${prioridade}`,
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => console.error('[SAVE HISTORICO ERROR]', err));

      console.log('[CHAMADO PRIORIDADE UPDATED]', {
        id, OS: chamado.OS,
        prioridadeAnterior: chamado.prioridade,
        prioridadeNova: prioridade,
        alteradoPor: req.usuario!.id,
      });

      if (chamado.tecnico) {
        publicarPrioridadeAlterada({
          chamadoId: id,
          chamadoOS: chamado.OS,
          prioridadeAnterior: chamado.prioridade,
          prioridadeNova: prioridade,
          tecnico: {
            id: chamado.tecnico.id,
            email: chamado.tecnico.email,
            nome: `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}`,
            nivel: chamado.tecnico.nivel,
          },
          alteradoPorNome: req.usuario!.nome,
        }).catch(err => console.error('[KAFKA PUBLISH ERROR]', err));
      }

      return res.status(200).json({
        message: `Prioridade do chamado ${chamado.OS} atualizada para ${prioridade} (${DESCRICAO_PRIORIDADE[prioridade as PrioridadeChamado]})`,
        chamado: formatarChamadoResposta(chamadoAtualizado),
      });
    } catch (err: any) {
      console.error('[CHAMADO PRIORIDADE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao alterar prioridade do chamado' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [EM_ATENDIMENTO, ENCERRADO, CANCELADO]
 *               descricaoEncerramento:
 *                 type: string
 *                 minLength: 10
 *               atualizacaoDescricao:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status atualizado com sucesso
 *       400:
 *         description: Status inválido ou falta descrição de encerramento
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão, fora do expediente ou nível incompatível
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao atualizar status
 */
router.patch(
  '/:id/status',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const { status, descricaoEncerramento, atualizacaoDescricao } = req.body as {
        status: ChamadoStatus;
        descricaoEncerramento?: string;
        atualizacaoDescricao?: string;
      };

      const statusValidos: ChamadoStatus[] = [
        ChamadoStatus.EM_ATENDIMENTO,
        ChamadoStatus.ENCERRADO,
        ChamadoStatus.CANCELADO,
      ];

      if (!statusValidos.includes(status)) {
        return res.status(400).json({
          error: `Status inválido. Use: ${statusValidos.join(', ')}`,
        });
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        include: CHAMADO_INCLUDE,
      });

      if (!chamado) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({ error: 'Chamados cancelados não podem ser alterados' });
      }

      if (chamado.status === ChamadoStatus.ENCERRADO && req.usuario!.regra === 'TECNICO') {
        return res.status(403).json({ error: 'Chamados encerrados não podem ser alterados por técnicos' });
      }

      if (req.usuario!.regra === 'TECNICO' && status === ChamadoStatus.CANCELADO) {
        return res.status(403).json({ error: 'Técnicos não podem cancelar chamados' });
      }

      const dataToUpdate: any = { status, atualizadoEm: new Date() };

      if (status === ChamadoStatus.ENCERRADO) {
        const validacao = validarDescricao(descricaoEncerramento || '');
        if (!validacao.valida) {
          return res.status(400).json({
            error: 'Descrição de encerramento inválida: ' + validacao.erro,
          });
        }
        dataToUpdate.encerradoEm = new Date();
        dataToUpdate.descricaoEncerramento = descricaoEncerramento!.trim();
      }

      if (status === ChamadoStatus.EM_ATENDIMENTO && req.usuario!.regra === 'TECNICO') {
        const dentroExpediente = await verificarExpedienteTecnico(req.usuario!.id);
        if (!dentroExpediente) {
          return res.status(403).json({ error: 'Chamado só pode ser assumido dentro do horário de trabalho' });
        }

        const tecnico = await prisma.usuario.findUnique({
          where: { id: req.usuario!.id },
          select: { nivel: true },
        });

        if (tecnico?.nivel) {
          const prioridadesPermitidas = PRIORIDADES_POR_NIVEL[tecnico.nivel];
          if (!prioridadesPermitidas.includes(chamado.prioridade)) {
            return res.status(403).json({
              error: `Técnico ${tecnico.nivel} não pode assumir chamados com prioridade ${chamado.prioridade}. Permitido: ${prioridadesPermitidas.join(', ')}`,
            });
          }
        }

        dataToUpdate.tecnicoId = req.usuario!.id;
      }

      const chamadoAtualizado = await prisma.$transaction(async (tx) => {
        return await tx.chamado.update({
          where: { id },
          data: dataToUpdate,
          include: CHAMADO_INCLUDE,
        });
      });

      const descricaoHistorico = atualizacaoDescricao?.trim() ||
        (status === ChamadoStatus.EM_ATENDIMENTO ? 'Chamado assumido pelo técnico'
          : status === ChamadoStatus.ENCERRADO ? 'Chamado encerrado'
          : status === ChamadoStatus.CANCELADO ? 'Chamado cancelado'
          : 'Alteração de status');

      salvarHistoricoChamado({
        chamadoId: chamadoAtualizado.id,
        tipo: 'STATUS',
        de: chamado.status,
        para: status,
        descricao: descricaoHistorico,
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => console.error('[SAVE HISTORICO ERROR]', err));

      if (status === ChamadoStatus.EM_ATENDIMENTO) {
        prisma.usuario.findUnique({
          where: { id: req.usuario!.id },
          select: { id: true, email: true, nome: true, sobrenome: true, nivel: true },
        }).then((tecnico) => {
          if (!tecnico) return;
          return publicarChamadoAtribuido({
            chamadoId: chamadoAtualizado.id,
            chamadoOS: chamadoAtualizado.OS,
            prioridade: chamadoAtualizado.prioridade,
            descricao: chamadoAtualizado.descricao,
            tecnico: {
              id: tecnico.id,
              email: tecnico.email,
              nome: `${tecnico.nome} ${tecnico.sobrenome}`,
              nivel: tecnico.nivel,
            },
            usuarioNome: chamadoAtualizado.usuario
              ? `${chamadoAtualizado.usuario.nome} ${chamadoAtualizado.usuario.sobrenome}`
              : '',
          });
        }).catch(err => console.error('[KAFKA PUBLISH ERROR]', err));
      }

      return res.status(200).json(formatarChamadoResposta(chamadoAtualizado));
    } catch (err: any) {
      console.error('[CHAMADO STATUS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar status do chamado' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Histórico retornado com sucesso
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro ao buscar histórico
 */
router.get(
  '/:id/historico',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const historico = await listarHistoricoChamado(id);
      return res.status(200).json(historico);
    } catch (err: any) {
      console.error('[CHAMADO HISTORICO ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               atualizacaoDescricao:
 *                 type: string
 *                 minLength: 10
 *     responses:
 *       200:
 *         description: Chamado reaberto com sucesso
 *       400:
 *         description: Chamado não pode ser reaberto
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao reabrir chamado
 */
router.patch(
  '/:id/reabrir-chamado',
  authMiddleware,
  authorizeRoles('USUARIO'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      //const { atualizacaoDescricao } = req.body as { atualizacaoDescricao?: string };
      const { atualizacaoDescricao } = (req.body ?? {}) as { atualizacaoDescricao?: string };
      
      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: {
          id: true, OS: true, descricao: true, status: true, prioridade: true,
          usuarioId: true, tecnicoId: true, encerradoEm: true,
          usuario: { select: { nome: true, sobrenome: true } },
          tecnico: { select: { id: true, email: true, nome: true, sobrenome: true, nivel: true } },
        },
      });

      if (!chamado) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (chamado.usuarioId !== req.usuario!.id) {
        return res.status(403).json({ error: 'Você só pode reabrir chamados criados por você' });
      }

      if (chamado.status !== ChamadoStatus.ENCERRADO) {
        return res.status(400).json({ error: 'Somente chamados encerrados podem ser reabertos' });
      }

      if (!chamado.encerradoEm) {
        return res.status(400).json({ error: 'Data de encerramento não encontrada' });
      }

      const diffHoras =
        (new Date().getTime() - new Date(chamado.encerradoEm).getTime()) / (1000 * 60 * 60);

      if (diffHoras > REABERTURA_PRAZO_HORAS) {
        return res.status(400).json({
          error: `Só é possível reabrir até ${REABERTURA_PRAZO_HORAS} horas após o encerramento`,
        });
      }

      let tecnicoId = chamado.tecnicoId;
      if (!tecnicoId) {
        tecnicoId = await buscarUltimoTecnico(chamado.id);
      }

      const chamadoAtualizado = await prisma.$transaction(async (tx) => {
        return await tx.chamado.update({
          where: { id },
          data: {
            status: ChamadoStatus.REABERTO,
            atualizadoEm: new Date(),
            encerradoEm: null,
            descricaoEncerramento: null,
            tecnicoId: tecnicoId || null,
          },
          include: CHAMADO_INCLUDE,
        });
      });

      ChamadoAtualizacaoModel.create({
        chamadoId: chamadoAtualizado.id,
        dataHora: new Date(),
        tipo: 'REABERTURA',
        de: ChamadoStatus.ENCERRADO,
        para: ChamadoStatus.REABERTO,
        descricao: atualizacaoDescricao?.trim() || 'Chamado reaberto pelo usuário dentro do prazo',
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => console.error('[SAVE HISTORICO ERROR]', err));

      const tecnicoParaNotificar = chamado.tecnico ?? (
        tecnicoId
          ? await prisma.usuario.findUnique({
              where: { id: tecnicoId },
              select: { id: true, email: true, nome: true, sobrenome: true, nivel: true },
            }).catch(() => null)
          : null
      );

      if (tecnicoParaNotificar) {
        publicarChamadoReaberto({
          chamadoId: chamado.id,
          chamadoOS: chamado.OS,
          prioridade: chamado.prioridade,
          descricao: chamado.descricao,
          usuarioNome: chamado.usuario
            ? `${chamado.usuario.nome} ${chamado.usuario.sobrenome}`
            : req.usuario!.nome,
          tecnico: {
            id: tecnicoParaNotificar.id,
            email: tecnicoParaNotificar.email,
            nome: `${tecnicoParaNotificar.nome} ${(tecnicoParaNotificar as any).sobrenome ?? ''}`.trim(),
            nivel: tecnicoParaNotificar.nivel,
          },
        }).catch(err => console.error('[KAFKA PUBLISH ERROR]', err));
      }

      return res.status(200).json(formatarChamadoResposta(chamadoAtualizado));
    } catch (err: any) {
      console.error('[CHAMADO REABRIR ERROR]', err);
      return res.status(500).json({ error: 'Erro ao reabrir chamado' });
    }
  }
);

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
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - descricaoEncerramento
 *             properties:
 *               descricaoEncerramento:
 *                 type: string
 *                 minLength: 10
 *     responses:
 *       200:
 *         description: Chamado cancelado com sucesso
 *       400:
 *         description: Chamado já cancelado, encerrado ou falta justificativa
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao cancelar chamado
 */
router.patch(
  '/:id/cancelar-chamado',
  authMiddleware,
  authorizeRoles('USUARIO', 'ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const { descricaoEncerramento } = req.body;

      const validacao = validarDescricao(descricaoEncerramento);
      if (!validacao.valida) {
        return res.status(400).json({
          error: 'Justificativa do cancelamento inválida: ' + validacao.erro,
        });
      }

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: { id: true, OS: true, status: true, usuarioId: true },
      });

      if (!chamado) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (req.usuario!.regra === 'USUARIO' && chamado.usuarioId !== req.usuario!.id) {
        return res.status(403).json({ error: 'Você não tem permissão para cancelar este chamado' });
      }

      if (chamado.status === ChamadoStatus.ENCERRADO) {
        return res.status(400).json({ error: 'Não é possível cancelar um chamado encerrado' });
      }

      if (chamado.status === ChamadoStatus.CANCELADO) {
        return res.status(400).json({ error: 'Este chamado já está cancelado' });
      }

      const chamadoCancelado = await prisma.$transaction(async (tx) => {
        return await tx.chamado.update({
          where: { id },
          data: {
            status: ChamadoStatus.CANCELADO,
            descricaoEncerramento: descricaoEncerramento.trim(),
            encerradoEm: new Date(),
            atualizadoEm: new Date(),
          },
          include: CHAMADO_INCLUDE,
        });
      });

      salvarHistoricoChamado({
        chamadoId: chamadoCancelado.id,
        tipo: 'CANCELAMENTO',
        de: chamado.status,
        para: ChamadoStatus.CANCELADO,
        descricao: descricaoEncerramento.trim(),
        autorId: req.usuario!.id,
        autorNome: req.usuario!.nome,
        autorEmail: req.usuario!.email,
      }).catch(err => console.error('[SAVE HISTORICO ERROR]', err));

      return res.status(200).json({
        message: 'Chamado cancelado com sucesso',
        chamado: formatarChamadoResposta(chamadoCancelado),
      });
    } catch (err: any) {
      console.error('[CHAMADO CANCELAR ERROR]', err);
      return res.status(500).json({ error: 'Erro ao cancelar o chamado' });
    }
  }
);

/**
 * @swagger
 * /api/chamados/{id}:
 *   delete:
 *     summary: Desativa um chamado (soft delete)
 *     tags: [Chamados]
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
 *         description: Chamado desativado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Chamado não encontrado
 *       500:
 *         description: Erro ao deletar chamado
 */
router.delete(
  '/:id',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const id = getStringParamRequired(req.params.id);
      const permanente = req.query.permanente === 'true';

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        select: { id: true, OS: true, status: true },
      });

      if (!chamado) {
        return res.status(404).json({ error: 'Chamado não encontrado' });
      }

      if (permanente) {
        await prisma.$transaction(async (tx) => {
          await tx.ordemDeServico.deleteMany({ where: { chamadoId: id } });
          await tx.chamado.delete({ where: { id } });
        });

        return res.json({ message: `Chamado ${chamado.OS} excluído permanentemente`, id });
      }

      await prisma.chamado.update({
        where: { id },
        data: { deletadoEm: new Date() },
      });

      return res.json({ message: `Chamado ${chamado.OS} excluído com sucesso`, id });
    } catch (err: any) {
      console.error('[CHAMADO DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao deletar o chamado' });
    }
  }
);

export default router;