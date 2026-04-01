import { ChamadoStatus, PrioridadeChamado } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';

interface ListarChamadosInput {
  pagina: number;
  limite: number;
  busca?: string;
  status?: string;
  prioridade?: string;
  tecnicoId?: string;
  usuarioId?: string;
  setor?: string;
  servico?: string;
  semTecnico?: boolean;
  dataInicio?: string;
  dataFim?: string;
  ordenarPor?: string;
  ordem?: 'asc' | 'desc';
  usuarioAutenticado: {
    id: string;
    regra: string;
  };
}

export async function listarChamadosUseCase(input: ListarChamadosInput) {
  const {
    pagina, limite, busca = '', status: statusParam, prioridade: prioridadeParam,
    tecnicoId: tecnicoIdParam, usuarioId: usuarioIdParam, setor: setorParam,
    servico: servicoParam, semTecnico = false, dataInicio, dataFim,
    ordenarPor: ordenarPorRaw = 'geradoEm', ordem = 'desc',
    usuarioAutenticado,
  } = input;

  const skip = (pagina - 1) * limite;

  const camposOrdenacao = ['geradoEm', 'atualizadoEm', 'prioridade', 'status', 'OS'] as const;
  type CampoOrdenacao = typeof camposOrdenacao[number];

  const ordenarPor: CampoOrdenacao = camposOrdenacao.includes(ordenarPorRaw as CampoOrdenacao)
    ? (ordenarPorRaw as CampoOrdenacao)
    : 'geradoEm';

  try {
    const where: any = { deletadoEm: null };
    const { regra, id: usuarioId } = usuarioAutenticado;

    if (regra === 'USUARIO') where.usuarioId = usuarioId;
    else if (regra === 'TECNICO') where.tecnicoId = usuarioId;

    if (statusParam) {
      const statusValidos = Object.values(ChamadoStatus);
      const statusFiltro = statusParam
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(s => statusValidos.includes(s as ChamadoStatus)) as ChamadoStatus[];

      if (statusFiltro.length === 1)      where.status = statusFiltro[0];
      else if (statusFiltro.length > 1)   where.status = { in: statusFiltro };
    }

    if (prioridadeParam) {
      const prioridadesValidas = Object.values(PrioridadeChamado);
      const prioridadeFiltro = prioridadeParam
        .split(',')
        .map(p => p.trim().toUpperCase())
        .filter(p => prioridadesValidas.includes(p as PrioridadeChamado)) as PrioridadeChamado[];

      if (prioridadeFiltro.length === 1)    where.prioridade = prioridadeFiltro[0];
      else if (prioridadeFiltro.length > 1) where.prioridade = { in: prioridadeFiltro };
    }

    if (regra === 'ADMIN') {
      if (tecnicoIdParam) where.tecnicoId = tecnicoIdParam;
      if (usuarioIdParam) where.usuarioId = usuarioIdParam;
    }

    if (semTecnico && regra !== 'USUARIO') where.tecnicoId = null;
    if (setorParam  && regra !== 'USUARIO') where.usuario   = { setor: setorParam };

    if (servicoParam) {
      where.servicos = {
        some: {
          servico: { nome: { contains: servicoParam, mode: 'insensitive' }, deletadoEm: null },
        },
      };
    }

    if (dataInicio || dataFim) {
      where.geradoEm = {};
      if (dataInicio) {
        const inicio = new Date(dataInicio);
        if (!isNaN(inicio.getTime())) { inicio.setHours(0, 0, 0, 0); where.geradoEm.gte = inicio; }
      }
      if (dataFim) {
        const fim = new Date(dataFim);
        if (!isNaN(fim.getTime())) { fim.setHours(23, 59, 59, 999); where.geradoEm.lte = fim; }
      }
    }

    if (busca) {
      const buscaOR: any[] = [
        { OS:        { contains: busca, mode: 'insensitive' } },
        { descricao: { contains: busca, mode: 'insensitive' } },
      ];
      if (regra !== 'USUARIO') {
        buscaOR.push({ usuario: { email: { contains: busca, mode: 'insensitive' } } });
        buscaOR.push({ usuario: { nome:  { contains: busca, mode: 'insensitive' } } });
      }
      where.AND = where.AND ? [...where.AND, { OR: buscaOR }] : [{ OR: buscaOR }];
    }

    const orderBy: any[] = [{ [ordenarPor]: ordem }, { geradoEm: 'desc' }];

    const [total, chamados] = await Promise.all([
      prisma.chamado.count({ where }),
      prisma.chamado.findMany({ where, skip, take: limite, orderBy, include: CHAMADO_INCLUDE }),
    ]);

    const totalPaginas = Math.ceil(total / limite);

    const filtrosAtivos: Record<string, any> = {};
    if (statusParam)     filtrosAtivos.status     = statusParam;
    if (prioridadeParam) filtrosAtivos.prioridade  = prioridadeParam;
    if (tecnicoIdParam)  filtrosAtivos.tecnicoId   = tecnicoIdParam;
    if (usuarioIdParam)  filtrosAtivos.usuarioId   = usuarioIdParam;
    if (setorParam)      filtrosAtivos.setor        = setorParam;
    if (servicoParam)    filtrosAtivos.servico      = servicoParam;
    if (semTecnico)      filtrosAtivos.semTecnico   = true;
    if (dataInicio)      filtrosAtivos.dataInicio   = dataInicio;
    if (dataFim)         filtrosAtivos.dataFim      = dataFim;
    if (busca)           filtrosAtivos.busca        = busca;

    logger.info({ total, pagina, limite }, '[CHAMADO] Listagem realizada');

    return {
      chamados: chamados.map(formatarChamadoResposta),
      paginacao: { total, totalPaginas, paginaAtual: pagina, limite, temProxima: pagina < totalPaginas, temAnterior: pagina > 1 },
      ordenacao: { campo: ordenarPor, ordem },
      filtros: Object.keys(filtrosAtivos).length > 0 ? filtrosAtivos : null,
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error }, '[CHAMADO] Erro ao listar');
    throw new ChamadoError('Erro ao listar chamados', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}