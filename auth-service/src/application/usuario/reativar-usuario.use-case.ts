import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { BadRequestError, NotFoundError } from '@infrastructure/http/middlewares/error.middleware';
import { publishUsuarioReativado } from '@infrastructure/messaging/kafka/events/usuario.events';

interface ReativarUsuarioOutput {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: string;
  ativo: boolean;
  atualizadoEm: Date;
}

/**
 * Reativa um usuário previamente desativado
 *
 * FLUXO:
 * 1. Verifica se usuário existe
 * 2. Verifica se realmente está desativado
 * 3. Remove soft delete e reativa
 * 4. Publica evento no Kafka
 */
export async function reativarUsuarioUseCase(
  id: string,
  correlationId?: string
): Promise<ReativarUsuarioOutput> {
  // Verifica se existe
  const usuario = await prisma.usuario.findUnique({
    where: { id },
  });

  if (!usuario) {
    throw new NotFoundError('Usuário não encontrado.');
  }

  // Verifica se está desativado
  if (!usuario.deletadoEm && usuario.ativo) {
    throw new BadRequestError('Usuário já está ativo.');
  }

  // Reativa
  const usuarioReativado = await prisma.usuario.update({
    where: { id },
    data: {
      deletadoEm: null,
      ativo: true,
    },
    select: {
      id: true,
      nome: true,
      sobrenome: true,
      email: true,
      regra: true,
      ativo: true,
      atualizadoEm: true,
    },
  });

  // Publica evento
  const usuarioCompleto = await prisma.usuario.findUniqueOrThrow({ where: { id } });
  await publishUsuarioReativado(usuarioCompleto, correlationId);

  await prisma.auditoriaAuth.create({
    data: {
      usuarioId: id,
      evento: 'USUARIO_CRIADO',
      metadata: { correlationId, acao: 'reativacao' },
    },
  }).catch(err => logger.error({ err }, 'Erro ao registrar auditoria de reativação'));

  logger.info({ userId: id }, '[USUARIO] Usuário reativado com sucesso');

  return usuarioReativado;
}