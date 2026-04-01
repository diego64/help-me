import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';
import { TECNICO_SELECT } from './selects';

export async function buscarTecnicoUseCase(id: string) {
  try {
    const tecnico = await prisma.usuario.findUnique({ where: { id }, select: TECNICO_SELECT });

    if (!tecnico || tecnico.regra !== Regra.TECNICO) {
      throw new TecnicoError('Técnico não encontrado', 'NOT_FOUND', 404);
    }

    logger.info({ tecnicoId: id }, '[TECNICO] Encontrado');

    return tecnico;
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error, tecnicoId: id }, '[TECNICO] Erro ao buscar');
    throw new TecnicoError('Erro ao buscar técnico', 'GET_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}