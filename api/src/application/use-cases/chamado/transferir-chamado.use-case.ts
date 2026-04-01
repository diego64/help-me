import { ChamadoStatus, Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { publicarChamadoTransferido } from '@infrastructure/messaging/kafka/producers/notificacao.producer';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';

interface TransferirChamadoInput {
  id: string;
  tecnicoNovoId: string;
  motivo: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioRegra: string;
}

export async function transferirChamadoUseCase(input: TransferirChamadoInput) {
  const { id, tecnicoNovoId, motivo, usuarioId, usuarioNome, usuarioEmail, usuarioRegra } = input;

  try {
    const chamado = await prisma.chamado.findUnique({
      where:  { id },
      select: { id: true, OS: true, status: true, prioridade: true, tecnicoId: true, deletadoEm: true, tecnico: { select: { nome: true, sobrenome: true } } },
    });

    if (!chamado || chamado.deletadoEm) throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);

    const statusPermitidos: ChamadoStatus[] = [ChamadoStatus.ABERTO, ChamadoStatus.EM_ATENDIMENTO, ChamadoStatus.REABERTO];
    if (!statusPermitidos.includes(chamado.status)) {
      throw new ChamadoError(`Chamado com status ${chamado.status} não pode ser transferido`, 'INVALID_STATUS', 400);
    }

    if (usuarioRegra === 'TECNICO' && chamado.tecnicoId !== usuarioId) {
      throw new ChamadoError('Você só pode transferir chamados atribuídos a você', 'FORBIDDEN', 403);
    }

    if (chamado.tecnicoId === tecnicoNovoId) {
      throw new ChamadoError('O chamado já está atribuído a este técnico', 'SAME_TECNICO', 400);
    }

    const tecnicoNovo = await prisma.usuario.findUnique({
      where:  { id: tecnicoNovoId },
      select: { id: true, nome: true, sobrenome: true, email: true, regra: true, nivel: true, ativo: true, deletadoEm: true },
    });

    if (!tecnicoNovo || tecnicoNovo.regra !== Regra.TECNICO) throw new ChamadoError('Técnico destino não encontrado', 'NOT_FOUND', 404);
    if (!tecnicoNovo.ativo || tecnicoNovo.deletadoEm) throw new ChamadoError('Técnico destino está inativo ou deletado', 'TECNICO_INACTIVE', 400);

    const resultado = await prisma.$transaction(async (tx) => {
      const transferencia = await tx.transferenciaChamado.create({
        data: { chamadoId: id, tecnicoAnteriorId: chamado.tecnicoId, tecnicoNovoId, motivo: motivo.trim(), transferidoPor: usuarioId },
      });
      const chamadoAtualizado = await tx.chamado.update({
        where: { id }, data: { tecnicoId: tecnicoNovoId, atualizadoEm: new Date() }, include: CHAMADO_INCLUDE,
      });
      return { transferencia, chamadoAtualizado };
    });

    salvarHistoricoChamado({
      chamadoId:  id,
      tipo:       'TRANSFERENCIA',
      de:         chamado.tecnicoId ?? undefined,
      para:       tecnicoNovoId,
      descricao:  motivo.trim(),
      autorId:    usuarioId,
      autorNome:  usuarioNome,
      autorEmail: usuarioEmail,
    }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao salvar histórico'));

    publicarChamadoTransferido({
      chamadoId:          id,
      chamadoOS:          chamado.OS,
      prioridade:         chamado.prioridade,
      motivo:             motivo.trim(),
      tecnicoAnteriorNome: chamado.tecnico ? `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}` : 'N/A',
      tecnicoNovo:        { id: tecnicoNovo.id, email: tecnicoNovo.email, nome: `${tecnicoNovo.nome} ${tecnicoNovo.sobrenome}`, nivel: tecnicoNovo.nivel },
    }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao publicar Kafka'));

    logger.info({ chamadoId: id, tecnicoNovoId, usuarioId }, '[CHAMADO] Chamado transferido');

    return {
      message: `Chamado ${chamado.OS} transferido com sucesso`,
      transferencia: {
        id:             resultado.transferencia.id,
        tecnicoAnterior: chamado.tecnicoId ?? null,
        tecnicoNovo:    { id: tecnicoNovo.id, nome: `${tecnicoNovo.nome} ${tecnicoNovo.sobrenome}`, email: tecnicoNovo.email, nivel: tecnicoNovo.nivel },
        motivo:         motivo.trim(),
        transferidoEm:  resultado.transferencia.transferidoEm,
      },
      chamado: formatarChamadoResposta(resultado.chamadoAtualizado),
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao transferir');
    throw new ChamadoError('Erro ao transferir chamado', 'TRANSFER_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}