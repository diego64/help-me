import { ChamadoStatus } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';

interface CancelarChamadoInput {
  id: string;
  descricaoEncerramento: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioRegra: string;
}

export async function cancelarChamadoUseCase(input: CancelarChamadoInput) {
  const { id, descricaoEncerramento, usuarioId, usuarioNome, usuarioEmail, usuarioRegra } = input;

  try {
    const chamado = await prisma.chamado.findUnique({
      where:  { id },
      select: { id: true, OS: true, status: true, usuarioId: true },
    });

    if (!chamado) throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);

    if (usuarioRegra === 'USUARIO' && chamado.usuarioId !== usuarioId) {
      throw new ChamadoError('Você não tem permissão para cancelar este chamado', 'FORBIDDEN', 403);
    }

    if (chamado.status === ChamadoStatus.ENCERRADO) {
      throw new ChamadoError('Não é possível cancelar um chamado encerrado', 'INVALID_STATUS', 400);
    }

    if (chamado.status === ChamadoStatus.CANCELADO) {
      throw new ChamadoError('Este chamado já está cancelado', 'ALREADY_CANCELLED', 400);
    }

    const chamadoCancelado = await prisma.$transaction(async (tx) =>
      tx.chamado.update({
        where: { id },
        data:  { status: ChamadoStatus.CANCELADO, descricaoEncerramento: descricaoEncerramento.trim(), encerradoEm: new Date(), atualizadoEm: new Date() },
        include: CHAMADO_INCLUDE,
      })
    );

    salvarHistoricoChamado({
      chamadoId:  chamadoCancelado.id,
      tipo:       'CANCELAMENTO',
      de:         chamado.status,
      para:       ChamadoStatus.CANCELADO,
      descricao:  descricaoEncerramento.trim(),
      autorId:    usuarioId,
      autorNome:  usuarioNome,
      autorEmail: usuarioEmail,
    }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao salvar histórico'));

    logger.info({ chamadoId: id, usuarioId }, '[CHAMADO] Chamado cancelado');

    return { message: 'Chamado cancelado com sucesso', chamado: formatarChamadoResposta(chamadoCancelado) };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao cancelar');
    throw new ChamadoError('Erro ao cancelar o chamado', 'CANCEL_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}