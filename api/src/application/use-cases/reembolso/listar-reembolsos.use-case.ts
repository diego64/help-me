import { CategoriaReembolso, ReembolsoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ReembolsoError } from './errors';
import { REEMBOLSO_INCLUDE } from './selects';
import { formatarReembolsoResposta } from './formatters';

interface ListarReembolsosInput {
  pagina: number;
  limite: number;
  status?: string;
  categoria?: string;
  setor?: string;
  dataInicio?: string;
  dataFim?: string;
  usuarioAutenticado: { id: string; regra: string };
}

export async function listarReembolsosUseCase(input: ListarReembolsosInput) {
  const {
    pagina, limite, status: statusParam, categoria: categoriaParam,
    setor: setorParam, dataInicio, dataFim, usuarioAutenticado,
  } = input;

  const skip = (pagina - 1) * limite;

  try {
    const where: any = { deletadoEm: null };
    const { regra, id } = usuarioAutenticado;

    // USUARIO só vê os próprios
    if (regra === 'USUARIO' || regra === 'TECNICO' || regra === 'INVENTARIANTE') {
      where.solicitanteId = id;
    }
    // COMPRADOR vê apenas os APROVADOS (para poder pagar)
    if (regra === 'COMPRADOR') {
      where.status = ReembolsoStatus.APROVADO;
    }

    if (statusParam && regra !== 'COMPRADOR') {
      const validos = Object.values(ReembolsoStatus);
      const lista   = statusParam.split(',').map(s => s.trim().toUpperCase()).filter(s => validos.includes(s as ReembolsoStatus)) as ReembolsoStatus[];
      if (lista.length === 1)    where.status = lista[0];
      else if (lista.length > 1) where.status = { in: lista };
    }

    if (categoriaParam) {
      const validos = Object.values(CategoriaReembolso);
      const cat     = categoriaParam.toUpperCase();
      if (validos.includes(cat as CategoriaReembolso)) where.categoria = cat;
    }

    if (setorParam && regra !== 'USUARIO') {
      where.setor = setorParam.toUpperCase();
    }

    if (dataInicio || dataFim) {
      where.geradoEm = {};
      if (dataInicio) {
        const d = new Date(dataInicio);
        if (!isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); where.geradoEm.gte = d; }
      }
      if (dataFim) {
        const d = new Date(dataFim);
        if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); where.geradoEm.lte = d; }
      }
    }

    const [total, reembolsos] = await Promise.all([
      prisma.reembolso.count({ where }),
      prisma.reembolso.findMany({ where, skip, take: limite, orderBy: { geradoEm: 'desc' }, include: REEMBOLSO_INCLUDE }),
    ]);

    const totalPaginas = Math.ceil(total / limite);

    logger.info({ total, pagina, limite, regra }, '[REEMBOLSO] Listagem realizada');

    return {
      reembolsos: reembolsos.map(formatarReembolsoResposta),
      paginacao:  { total, totalPaginas, paginaAtual: pagina, limite, temProxima: pagina < totalPaginas, temAnterior: pagina > 1 },
    };
  } catch (error) {
    if (error instanceof ReembolsoError) throw error;
    logger.error({ error }, '[REEMBOLSO] Erro ao listar');
    throw new ReembolsoError('Erro ao listar reembolsos', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}
