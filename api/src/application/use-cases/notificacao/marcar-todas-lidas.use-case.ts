import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model';
import { logger } from '@shared/config/logger';
import { NotificacaoError } from './errors';

export async function marcarTodasLidasUseCase(usuarioId: string) {
  try {
    const result = await NotificacaoModel.updateMany(
      { destinatarioId: usuarioId, lida: false },
      { lida: true, lidaEm: new Date() }
    );

    logger.info({ usuarioId, atualizadas: result.modifiedCount }, '[NOTIFICACAO] Todas marcadas como lidas');

    return {
      message:    'Todas as notificações marcadas como lidas',
      atualizadas: result.modifiedCount,
    };
  } catch (error) {
    if (error instanceof NotificacaoError) throw error;
    logger.error({ error, usuarioId }, '[NOTIFICACAO] Erro ao marcar todas como lidas');
    throw new NotificacaoError('Erro ao marcar notificações como lidas', 'MARK_ALL_READ_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}