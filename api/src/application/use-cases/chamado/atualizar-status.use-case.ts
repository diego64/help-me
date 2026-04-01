import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { publicarChamadoAtribuido } from '@infrastructure/messaging/kafka/producers/notificacao.producer';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta } from './formatters';
import { verificarExpedienteTecnico } from './helpers/expediente.helper';
import { encerrarFilhosRecursivo } from './helpers/filhos.helper';

const PRIORIDADES_POR_NIVEL: Record<NivelTecnico, PrioridadeChamado[]> = {
  N1: ['P4', 'P5'], N2: ['P2', 'P3'], N3: ['P1', 'P2', 'P3', 'P4', 'P5'],
};

interface AtualizarStatusInput {
  id: string;
  status: ChamadoStatus;
  descricaoEncerramento?: string;
  atualizacaoDescricao?: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioRegra: string;
}

export async function atualizarStatusUseCase(input: AtualizarStatusInput) {
  const { id, status, descricaoEncerramento, atualizacaoDescricao, usuarioId, usuarioNome, usuarioEmail, usuarioRegra } = input;

  try {
    const statusValidos: ChamadoStatus[] = [ChamadoStatus.EM_ATENDIMENTO, ChamadoStatus.ENCERRADO, ChamadoStatus.CANCELADO];
    if (!statusValidos.includes(status)) {
      throw new ChamadoError(`Status inválido. Use: ${statusValidos.join(', ')}`, 'INVALID_STATUS', 400);
    }

    const chamado = await prisma.chamado.findUnique({ where: { id }, include: CHAMADO_INCLUDE });
    if (!chamado) throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);

    if (chamado.status === ChamadoStatus.CANCELADO) {
      throw new ChamadoError('Chamados cancelados não podem ser alterados', 'INVALID_STATUS', 400);
    }
    if (chamado.status === ChamadoStatus.ENCERRADO && usuarioRegra === 'TECNICO') {
      throw new ChamadoError('Chamados encerrados não podem ser alterados por técnicos', 'FORBIDDEN', 403);
    }
    if (usuarioRegra === 'TECNICO' && status === ChamadoStatus.CANCELADO) {
      throw new ChamadoError('Técnicos não podem cancelar chamados', 'FORBIDDEN', 403);
    }

    const dataToUpdate: any = { status, atualizadoEm: new Date() };

    if (status === ChamadoStatus.ENCERRADO) {
      if (!descricaoEncerramento || descricaoEncerramento.trim().length < 10) {
        throw new ChamadoError('Descrição de encerramento inválida: mínimo 10 caracteres', 'VALIDATION_ERROR', 400);
      }
      dataToUpdate.encerradoEm            = new Date();
      dataToUpdate.descricaoEncerramento  = descricaoEncerramento.trim();
    }

    if (status === ChamadoStatus.EM_ATENDIMENTO && usuarioRegra === 'TECNICO') {
      const dentroExpediente = await verificarExpedienteTecnico(usuarioId);
      if (!dentroExpediente) {
        throw new ChamadoError('Chamado só pode ser assumido dentro do horário de trabalho', 'FORBIDDEN', 403);
      }

      const tecnico = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nivel: true } });
      if (tecnico?.nivel) {
        const prioridadesPermitidas = PRIORIDADES_POR_NIVEL[tecnico.nivel];
        if (!prioridadesPermitidas.includes(chamado.prioridade)) {
          throw new ChamadoError(`Técnico ${tecnico.nivel} não pode assumir chamados com prioridade ${chamado.prioridade}`, 'FORBIDDEN', 403);
        }
      }

      dataToUpdate.tecnicoId = usuarioId;
    }

    const chamadoAtualizado = await prisma.$transaction(async (tx) =>
      tx.chamado.update({ where: { id }, data: dataToUpdate, include: CHAMADO_INCLUDE })
    );

    const descricaoHistorico = atualizacaoDescricao?.trim()
      || (status === ChamadoStatus.EM_ATENDIMENTO ? 'Chamado assumido pelo técnico'
        : status === ChamadoStatus.ENCERRADO ? 'Chamado encerrado'
        : status === ChamadoStatus.CANCELADO ? 'Chamado cancelado'
        : 'Alteração de status');

    salvarHistoricoChamado({
      chamadoId:  chamadoAtualizado.id,
      tipo:       'STATUS',
      de:         chamado.status,
      para:       status,
      descricao:  descricaoHistorico,
      autorId:    usuarioId,
      autorNome:  usuarioNome,
      autorEmail: usuarioEmail,
    }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao salvar histórico'));

    if (status === ChamadoStatus.ENCERRADO || status === ChamadoStatus.CANCELADO) {
      prisma.$transaction(async (tx) => encerrarFilhosRecursivo(id, chamado.OS, tx))
        .catch(err => logger.error({ err }, '[CHAMADO] Erro ao encerrar filhos'));
    }

    if (status === ChamadoStatus.EM_ATENDIMENTO) {
      prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, email: true, nome: true, sobrenome: true, nivel: true } })
        .then(tecnico => {
          if (!tecnico) return;
          return publicarChamadoAtribuido({
            chamadoId:   chamadoAtualizado.id,
            chamadoOS:   chamadoAtualizado.OS,
            prioridade:  chamadoAtualizado.prioridade,
            descricao:   chamadoAtualizado.descricao,
            tecnico:     { id: tecnico.id, email: tecnico.email, nome: `${tecnico.nome} ${tecnico.sobrenome}`, nivel: tecnico.nivel },
            usuarioNome: chamadoAtualizado.usuario ? `${chamadoAtualizado.usuario.nome} ${chamadoAtualizado.usuario.sobrenome}` : '',
          });
        })
        .catch(err => logger.error({ err }, '[CHAMADO] Erro ao publicar Kafka'));
    }

    logger.info({ chamadoId: id, status, usuarioId }, '[CHAMADO] Status atualizado');

    return formatarChamadoResposta(chamadoAtualizado);
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao atualizar status');
    throw new ChamadoError('Erro ao atualizar status do chamado', 'STATUS_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}