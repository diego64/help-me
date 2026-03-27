import { prisma } from '@infrastructure/database/prisma/client';
import { cacheDel } from '@infrastructure/database/redis/client';
import { logger } from '@shared/config/logger';
import {
  BadRequestError,
  NotFoundError,
} from '@infrastructure/http/middlewares/error.middleware';
import { publishUsuarioDeletado } from '@infrastructure/messaging/kafka/events/usuario.events';

interface DeletarUsuarioInput {
  id: string;
  solicitanteId: string; // ID de quem está deletando (para impedir auto-delete)
  permanente?: boolean;
}


/**
 * Deleta um usuário (soft delete por padrão)
 *
 * FLUXO:
 * 1. Verifica se usuário existe
 * 2. Impede auto-delete (não pode deletar a si mesmo)
 * 3. Soft delete: marca deletadoEm e ativo=false
 * 4. Remove refresh token (invalida sessão ativa)
 * 5. Publica evento no Kafka
 *
 * Hard delete disponível via flag `permanente`
 * USE COM CUIDADO — irreversível
 */
export async function deletarUsuarioUseCase(
  input: DeletarUsuarioInput,
  correlationId?: string
): Promise<void> {
  const { id, solicitanteId, permanente = false } = input;

  // Verifica se existe
  const usuario = await prisma.usuario.findUnique({
    where: { id },
  });

  if (!usuario) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  // Impede auto-delete
  if (id === solicitanteId) {
    throw new BadRequestError('Não é possível deletar sua própria conta.');
  }

  if (permanente) {
    // Hard delete
    await prisma.usuario.delete({ where: { id } });

    logger.warn({ userId: id, solicitanteId }, '[USUARIO] Usuário deletado permanentemente');
  } else {
    // Soft delete
    const usuarioDeletado = await prisma.usuario.update({
      where: { id },
      data: {
        deletadoEm: new Date(),
        ativo: false,
        refreshToken: null, // Invalida sessão ativa
      },
    });

    // Remove refresh token do Redis se existir
    await cacheDel(`refresh:${id}`).catch(() => null);

    await publishUsuarioDeletado(usuarioDeletado, correlationId);

    logger.info({ userId: id, solicitanteId }, '[USUARIO] Usuário desativado com sucesso');
  }

  await prisma.auditoriaAuth.create({
    data: {
      usuarioId: id,
      evento: 'USUARIO_DESATIVADO',
      metadata: {
        correlationId,
        solicitanteId,
        permanente,
      },
    },
  }).catch(err => logger.error({ err }, 'Erro ao registrar auditoria de deleção'));
}