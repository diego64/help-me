import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ServicoError } from './errors';
import { SERVICO_SELECT_BASICO } from './selects';

export async function restaurarServicoUseCase(id: string) {
  try {
    const servico = await prisma.servico.findUnique({
      where:  { id },
      select: { id: true, nome: true, deletadoEm: true },
    });

    if (!servico) throw new ServicoError('Serviço não encontrado', 'NOT_FOUND', 404);
    if (!servico.deletadoEm) throw new ServicoError('Serviço não está deletado', 'NOT_DELETED', 400);

    const restaurado = await prisma.servico.update({
      where:  { id },
      data:   { deletadoEm: null, ativo: true },
      select: SERVICO_SELECT_BASICO,
    });

    logger.info({ servicoId: id, nome: servico.nome }, '[SERVICO] Restaurado');

    return { message: 'Serviço restaurado com sucesso', servico: restaurado };
  } catch (error) {
    if (error instanceof ServicoError) throw error;
    logger.error({ error, servicoId: id }, '[SERVICO] Erro ao restaurar');
    throw new ServicoError('Erro ao restaurar serviço', 'RESTORE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}