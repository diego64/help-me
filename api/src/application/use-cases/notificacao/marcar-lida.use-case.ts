import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model';
import { logger } from '@shared/config/logger';
import { NotificacaoError } from './errors';

interface MarcarLidaInput {
  notificacaoId: string;
  usuarioId: string;
}

export async function marcarLidaUseCase(input: MarcarLidaInput) {
  const { notificacaoId, usuarioId } = input;

  try {
    const notificacao = await NotificacaoModel.findOneAndUpdate(
      { _id: notificacaoId, destinatarioId: usuarioId },
      { lida: true, lidaEm: new Date() },
      { new: true }
    );

    if (!notificacao) {
      throw new NotificacaoError('Notificação não encontrada', 'NOT_FOUND', 404);
    }

    logger.info({ notificacaoId, usuarioId }, '[NOTIFICACAO] Marcada como lida');

    return { message: 'Notificação marcada como lida', notificacao };
  } catch (error) {
    if (error instanceof NotificacaoError) throw error;
    logger.error({ error, notificacaoId }, '[NOTIFICACAO] Erro ao marcar como lida');
    throw new NotificacaoError('Erro ao marcar notificação como lida', 'MARK_READ_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}