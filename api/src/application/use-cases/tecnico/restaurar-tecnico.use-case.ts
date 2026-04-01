import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';
import { TECNICO_SELECT } from './selects';

export async function restaurarTecnicoUseCase(id: string) {
  try {
    const tecnico = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true, email: true, deletadoEm: true },
    });

    if (!tecnico || tecnico.regra !== Regra.TECNICO) throw new TecnicoError('Técnico não encontrado', 'NOT_FOUND', 404);
    if (!tecnico.deletadoEm) throw new TecnicoError('Técnico não está deletado', 'NOT_DELETED', 400);

    const restaurado = await prisma.usuario.update({
      where:  { id },
      data:   { deletadoEm: null, ativo: true },
      select: TECNICO_SELECT,
    });

    logger.info({ tecnicoId: id, email: tecnico.email }, '[TECNICO] Restaurado');

    return { message: 'Técnico restaurado com sucesso', tecnico: restaurado };
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error, tecnicoId: id }, '[TECNICO] Erro ao restaurar');
    throw new TecnicoError('Erro ao restaurar técnico', 'RESTORE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}