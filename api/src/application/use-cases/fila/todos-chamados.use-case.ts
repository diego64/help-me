import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { FilaError } from './errors';
import { CHAMADO_SELECT } from './selects';
import { criarPaginatedResponse } from './formatters';

interface TodosChamadosInput {
  page: number;
  limit: number;
  status?: string;
  tecnicoId?: string;
  usuarioId?: string;
  setor?: string;
  dataInicio?: string;
  dataFim?: string;
  busca?: string;
  incluirInativos?: boolean;
}

export async function todosChamadosUseCase(input: TodosChamadosInput) {
  const { page, limit, status, tecnicoId, usuarioId, setor, dataInicio, dataFim, busca, incluirInativos } = input;
  const skip = (page - 1) * limit;

  try {
    if (status && !Object.values(ChamadoStatus).includes(status as ChamadoStatus)) {
      throw new FilaError('Status inválido', 'INVALID_STATUS', 400);
    }

    const where: any = {};

    if (status)    where.status    = status as ChamadoStatus;
    if (tecnicoId) where.tecnicoId = tecnicoId;
    if (usuarioId) where.usuarioId = usuarioId;
    if (setor)     where.usuario   = { setor };

    if (dataInicio || dataFim) {
      where.geradoEm = {};
      if (dataInicio) where.geradoEm.gte = new Date(dataInicio);
      if (dataFim) {
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);
        where.geradoEm.lte = fim;
      }
    }

    if (busca) {
      where.OR = [
        { OS:        { contains: busca, mode: 'insensitive' } },
        { descricao: { contains: busca, mode: 'insensitive' } },
      ];
    }

    if (!incluirInativos) where.deletadoEm = null;

    const [total, chamados] = await Promise.all([
      prisma.chamado.count({ where }),
      prisma.chamado.findMany({ where, select: CHAMADO_SELECT, orderBy: { geradoEm: 'desc' }, skip, take: limit }),
    ]);

    logger.info({ total, page, limit }, '[FILA] Todos os chamados consultados');

    return criarPaginatedResponse(chamados, total, page, limit);
  } catch (error) {
    if (error instanceof FilaError) throw error;
    logger.error({ error }, '[FILA] Erro ao listar todos os chamados');
    throw new FilaError('Erro ao listar chamados', 'TODOS_CHAMADOS_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}