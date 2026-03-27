import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { FilaError } from './errors';
import { CHAMADO_SELECT } from './selects';
import { criarPaginatedResponse } from './formatters';

interface MeusChamadosInput {
  page: number;
  limit: number;
  usuarioId: string;
  status?: string;
  incluirInativos?: boolean;
}

export async function meusChamadosUseCase(input: MeusChamadosInput) {
  const { page, limit, usuarioId, status, incluirInativos } = input;
  const skip = (page - 1) * limit;

  try {
    const where: any = { usuarioId };

    if (status && Object.values(ChamadoStatus).includes(status as ChamadoStatus)) {
      where.status = status as ChamadoStatus;
    }

    if (!incluirInativos) where.deletadoEm = null;

    const [total, chamados] = await Promise.all([
      prisma.chamado.count({ where }),
      prisma.chamado.findMany({ where, select: CHAMADO_SELECT, orderBy: { geradoEm: 'desc' }, skip, take: limit }),
    ]);

    logger.info({ usuarioId, total }, '[FILA] Meus chamados consultados');

    return criarPaginatedResponse(chamados, total, page, limit);
  } catch (error) {
    if (error instanceof FilaError) throw error;
    logger.error({ error, usuarioId }, '[FILA] Erro ao buscar meus chamados');
    throw new FilaError('Erro ao listar chamados do usuário', 'MEUS_CHAMADOS_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}