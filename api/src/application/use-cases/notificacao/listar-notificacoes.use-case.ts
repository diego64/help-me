import NotificacaoModel from '@infrastructure/database/mongodb/notificacao.model';
import { logger } from '@shared/config/logger';
import { NotificacaoError } from './errors';

interface ListarNotificacoesInput {
  usuarioId: string;
  page: number;
  limit: number;
  apenasNaoLidas: boolean;
}

export async function listarNotificacoesUseCase(input: ListarNotificacoesInput) {
  const { usuarioId, page, limit, apenasNaoLidas } = input;
  const skip = (page - 1) * limit;

  try {
    const where: any = { destinatarioId: usuarioId };
    if (apenasNaoLidas) where.lida = false;

    const [total, notificacoes, naoLidas] = await Promise.all([
      NotificacaoModel.countDocuments(where),
      NotificacaoModel.find(where).sort({ criadoEm: -1 }).skip(skip).limit(limit).lean(),
      NotificacaoModel.countDocuments({ destinatarioId: usuarioId, lida: false }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info({ usuarioId, total, naoLidas }, '[NOTIFICACAO] Listagem realizada');

    return {
      data: notificacoes,
      naoLidas,
      pagination: {
        page, limit, total, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  } catch (error) {
    if (error instanceof NotificacaoError) throw error;
    logger.error({ error, usuarioId }, '[NOTIFICACAO] Erro ao listar');
    throw new NotificacaoError('Erro ao listar notificações', 'LIST_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}