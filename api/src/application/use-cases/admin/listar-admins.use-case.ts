import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { AdminError } from './errors';
import { ADMIN_SELECT } from './selects';

interface ListarAdminsInput {
  page: number;
  limit: number;
  incluirInativos: boolean;
}

export async function listarAdminsUseCase(input: ListarAdminsInput) {
  const { page, limit, incluirInativos } = input;
  const skip = (page - 1) * limit;

  const where = {
    regra: 'ADMIN' as const,
    ...(incluirInativos ? {} : { deletadoEm: null, ativo: true }),
  };

  try {
    const [total, admins] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where,
        select: ADMIN_SELECT,
        orderBy: { geradoEm: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    logger.info({ total, page, limit }, '[ADMIN] Listagem realizada');

    return { total, page, limit, totalPages: Math.ceil(total / limit), admins };
  } catch (error) {
    if (error instanceof AdminError) throw error;
    logger.error({ error }, '[ADMIN] Erro ao listar admins');
    throw new AdminError('Erro ao listar administradores', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}