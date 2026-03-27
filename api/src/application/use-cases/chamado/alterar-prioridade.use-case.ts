import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { recalcularSLA } from '@domain/sla/sla.service';
import { publicarPrioridadeAlterada } from '@infrastructure/messaging/kafka/producers/notificacao.producer';
import { ChamadoError } from './errors';
import { CHAMADO_INCLUDE } from './selects';
import { formatarChamadoResposta, DESCRICAO_PRIORIDADE } from './formatters';

const PRIORIDADES_VALIDAS: PrioridadeChamado[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

interface AlterarPrioridadeInput {
  id: string;
  prioridade: string;
  motivo?: string;
  usuarioId: string;
  usuarioNome: string;
  usuarioEmail: string;
  usuarioRegra: string;
}

export async function alterarPrioridadeUseCase(input: AlterarPrioridadeInput) {
  const { id, prioridade, motivo, usuarioId, usuarioNome, usuarioEmail, usuarioRegra } = input;

  try {
    if (!PRIORIDADES_VALIDAS.includes(prioridade as PrioridadeChamado)) {
      throw new ChamadoError(`Prioridade inválida. Use: ${PRIORIDADES_VALIDAS.join(', ')}`, 'INVALID_PRIORITY', 400);
    }

    if (usuarioRegra === 'TECNICO') {
      const tecnico = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nivel: true } });
      if (!tecnico || tecnico.nivel !== NivelTecnico.N3) {
        throw new ChamadoError('Somente técnicos N3 podem reclassificar a prioridade de chamados', 'FORBIDDEN', 403);
      }
    }

    const chamado = await prisma.chamado.findUnique({
      where:  { id },
      select: { id: true, OS: true, prioridade: true, status: true, deletadoEm: true, tecnico: { select: { id: true, email: true, nome: true, sobrenome: true, nivel: true } } },
    });

    if (!chamado || chamado.deletadoEm) throw new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404);
    if (chamado.status === ChamadoStatus.CANCELADO) throw new ChamadoError('Não é possível alterar a prioridade de um chamado cancelado', 'INVALID_STATUS', 400);
    if (chamado.status === ChamadoStatus.ENCERRADO)  throw new ChamadoError('Não é possível alterar a prioridade de um chamado encerrado', 'INVALID_STATUS', 400);
    if (chamado.prioridade === prioridade) throw new ChamadoError(`Chamado já possui a prioridade ${prioridade}`, 'SAME_PRIORITY', 400);

    const chamadoAtualizado = await prisma.chamado.update({
      where: { id },
      data:  { prioridade: prioridade as PrioridadeChamado, prioridadeAlterada: new Date(), prioridadeAlteradaPor: usuarioId },
      include: CHAMADO_INCLUDE,
    });

    salvarHistoricoChamado({
      chamadoId:  chamadoAtualizado.id,
      tipo:       'PRIORIDADE',
      de:         chamado.prioridade,
      para:       prioridade,
      descricao:  motivo?.trim() || `Prioridade alterada de ${chamado.prioridade} para ${prioridade}`,
      autorId:    usuarioId,
      autorNome:  usuarioNome,
      autorEmail: usuarioEmail,
    }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao salvar histórico'));

    recalcularSLA(id, prioridade as PrioridadeChamado)
      .catch(err => logger.error({ err }, '[CHAMADO] Erro ao recalcular SLA'));

    if (chamado.tecnico) {
      publicarPrioridadeAlterada({
        chamadoId:         id,
        chamadoOS:         chamado.OS,
        prioridadeAnterior: chamado.prioridade,
        prioridadeNova:    prioridade,
        tecnico:           { id: chamado.tecnico.id, email: chamado.tecnico.email, nome: `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}`, nivel: chamado.tecnico.nivel },
        alteradoPorNome:   usuarioNome,
      }).catch(err => logger.error({ err }, '[CHAMADO] Erro ao publicar Kafka'));
    }

    logger.info({ chamadoId: id, prioridade, usuarioId }, '[CHAMADO] Prioridade alterada');

    return {
      message: `Prioridade do chamado ${chamado.OS} atualizada para ${prioridade} (${DESCRICAO_PRIORIDADE[prioridade as PrioridadeChamado]})`,
      chamado: formatarChamadoResposta(chamadoAtualizado),
    };
  } catch (error) {
    if (error instanceof ChamadoError) throw error;
    logger.error({ error, chamadoId: id }, '[CHAMADO] Erro ao alterar prioridade');
    throw new ChamadoError('Erro ao alterar prioridade do chamado', 'PRIORITY_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}