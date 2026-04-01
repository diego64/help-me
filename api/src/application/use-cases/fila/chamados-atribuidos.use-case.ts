import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { FilaError } from './errors';
import { CHAMADO_SELECT } from './selects';
import { criarPaginatedResponse } from './formatters';

interface ChamadosAtribuidosInput {
  page: number;
  limit: number;
  tecnicoId: string;
  ordenacao?: string;
}

export async function chamadosAtribuidosUseCase(input: ChamadosAtribuidosInput) {
  const { page, limit, tecnicoId, ordenacao } = input;
  const skip = (page - 1) * limit;

  try {
    const where = {
      tecnicoId,
      status:     { in: [ChamadoStatus.EM_ATENDIMENTO, ChamadoStatus.REABERTO] },
      deletadoEm: null,
    };

    let orderBy: any = { geradoEm: 'desc' };
    if (ordenacao === 'antigos')   orderBy = { geradoEm: 'asc' };
    if (ordenacao === 'reabertos') orderBy = [{ status: 'desc' }, { geradoEm: 'desc' }];

    const [total, chamados] = await Promise.all([
      prisma.chamado.count({ where }),
      prisma.chamado.findMany({ where, select: CHAMADO_SELECT, orderBy, skip, take: limit }),
    ]);

    logger.info({ tecnicoId, total }, '[FILA] Chamados atribuídos consultados');

    return criarPaginatedResponse(chamados, total, page, limit);
  } catch (error) {
    if (error instanceof FilaError) throw error;
    logger.error({ error, tecnicoId }, '[FILA] Erro ao buscar chamados atribuídos');
    throw new FilaError('Erro ao listar chamados do técnico', 'ATRIBUIDOS_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}