import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { ChamadoError } from '../errors';

interface DeletarComentarioInput {
  chamadoId: string;
  comentarioId: string;
  autorId: string;
  autorRegra: string;
}

export async function deletarComentarioUseCase(input: DeletarComentarioInput) {
  const { chamadoId, comentarioId, autorId, autorRegra } = input;

  try {
    const comentario = await prisma.comentarioChamado.findUnique({
      where:  { id: comentarioId },
      select: { id: true, autorId: true, chamadoId: true, deletadoEm: true },
    });

    if (!comentario || comentario.deletadoEm || comentario.chamadoId !== chamadoId) {
      throw new ChamadoError('Comentário não encontrado', 'NOT_FOUND', 404);
    }

    if (autorRegra !== 'ADMIN' && comentario.autorId !== autorId) {
      throw new ChamadoError('Você só pode remover seus próprios comentários', 'FORBIDDEN', 403);
    }

    await prisma.comentarioChamado.update({
      where: { id: comentarioId },
      data:  { deletadoEm: new Date() },
    });

    logger.info({ chamadoId, comentarioId, autorId }, '[CHAMADO] Comentário deletado');

    return { message: 'Comentário removido com sucesso', id: comentarioId };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId, comentarioId }, '[CHAMADO] Erro ao deletar comentário');
    throw new ChamadoError('Erro ao remover comentário', 'COMENTARIO_DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}