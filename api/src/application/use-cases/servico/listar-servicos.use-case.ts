import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';
import { SERVICO_SELECT } from './selects';

interface ListarServicosInput {
  page: number;
  limit: number;
  incluirInativos?: boolean;
  incluirDeletados?: boolean;
  busca?: string;
}

export async function listarServicosUseCase(input: ListarServicosInput) {
  const { page, limit, incluirInativos, incluirDeletados, busca } = input;
  const skip = (page - 1) * limit;

  try {
    const where: any = {};
    if (!incluirInativos)  where.ativo      = true;
    if (!incluirDeletados) where.deletadoEm = null;
    if (busca) {
      where.OR = [
        { nome:      { contains: busca, mode: 'insensitive' } },
        { descricao: { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [total, servicos] = await Promise.all([
      prisma.servico.count({ where }),
      prisma.servico.findMany({ where, select: SERVICO_SELECT, orderBy: { nome: 'asc' }, skip, take: limit }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info({ total, page, limit }, '[SERVICO] Listagem realizada');

    return {
      data: servicos,
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error }, '[SERVICO] Erro ao listar');
    throw new ServicoError('Erro ao listar serviços', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}