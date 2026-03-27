import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model';
import { logger } from '@shared/config/logger';
import { NotificacaoError } from './errors';

interface DeletarNotificacaoInput {
  notificacaoId: string;
  usuarioId: string;
}

export async function deletarNotificacaoUseCase(input: DeletarNotificacaoInput) {
  const { notificacaoId, usuarioId } = input;

  try {
    const notificacao = await NotificacaoModel.findOneAndDelete({
      _id: notificacaoId,
      destinatarioId: usuarioId,
    });

    if (!notificacao) {
      throw new NotificacaoError('Notificação não encontrada', 'NOT_FOUND', 404);
    }

    logger.info({ notificacaoId, usuarioId }, '[NOTIFICACAO] Removida');

    return { message: 'Notificação removida', id: notificacaoId };
  } catch (error) {
    if (error instanceof NotificacaoError) throw error;
    logger.error({ error, notificacaoId }, '[NOTIFICACAO] Erro ao deletar');
    throw new NotificacaoError('Erro ao remover notificação', 'DELETE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}