import { PrioridadeChamado } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma/client';
import { producer } from '../../infrastructure/messaging/kafka/client';
import { calcularSLA } from './sla.calculator';
import { verificarStatusSLA } from './sla.validator';

interface SLACalculadoPayload {
  chamadoId:      string;
  OS:             string;
  prioridade:     PrioridadeChamado;
  categoria:      string;
  horasUteis:     number;
  inicioContagem: Date;
  deadline:       Date;
}

interface SLAVioladoPayload {
  chamadoId:   string;
  OS:          string;
  prioridade:  PrioridadeChamado;
  categoria:   string;
  tecnicoId:   string | null;
  deadline:    Date;
  violadoEm:   Date;
  violadoHaMinutos: number;
}

/**
 * Calcula o deadline do SLA para o chamado recém-criado,
 * persiste os campos slaDeadline no banco e publica o
 * evento "sla.calculado" no Kafka.
 */
export async function calcularEPersistirSLA(
  chamadoId: string,
  prioridade: PrioridadeChamado,
  dataAbertura: Date = new Date(),
): Promise<void> {
  const resultado = calcularSLA(prioridade, dataAbertura);

  await prisma.chamado.update({
    where: { id: chamadoId },
    data:  { slaDeadline: resultado.deadline },
  });

  const chamado = await prisma.chamado.findUniqueOrThrow({
    where:  { id: chamadoId },
    select: { OS: true },
  });

  const payload: SLACalculadoPayload = {
    chamadoId,
    OS:             chamado.OS,
    prioridade,
    categoria:      resultado.categoria,
    horasUteis:     resultado.horasUteis,
    inicioContagem: resultado.inicioContagem,
    deadline:       resultado.deadline,
  };

  await producer.send({
    topic:    'chamado-status',
    messages: [{ value: JSON.stringify({ evento: 'sla.calculado', ...payload }) }],
  });
}

/**
 * Recalcula o deadline a partir de agora com a nova prioridade.
 * Usado quando um técnico ou admin altera a prioridade do chamado.
 */
export async function recalcularSLA(
  chamadoId: string,
  novasPrioridade: PrioridadeChamado,
): Promise<void> {
  await calcularEPersistirSLA(chamadoId, novasPrioridade, new Date());
}

/**
 * Marca o chamado como violado, persiste slaViolado e slaVioladoEm,
 * e publica o evento "sla.violado" no Kafka para downstream
 * (escalonamento, notificações, etc).
 */
export async function registrarViolacaoSLA(chamadoId: string): Promise<void> {
  const chamado = await prisma.chamado.findUniqueOrThrow({
    where:  { id: chamadoId },
    select: {
      OS:          true,
      prioridade:  true,
      tecnicoId:   true,
      slaDeadline: true,
      slaViolado:  true,
    },
  });

  // Proteção: não processa chamados já marcados
  if (chamado.slaViolado || !chamado.slaDeadline) return;

  const violadoEm = new Date();
  const validacao = verificarStatusSLA(chamado.slaDeadline, violadoEm);

  await prisma.chamado.update({
    where: { id: chamadoId },
    data:  {
      slaViolado:   true,
      slaVioladoEm: violadoEm,
    },
  });

  const payload: SLAVioladoPayload = {
    chamadoId,
    OS:               chamado.OS,
    prioridade:       chamado.prioridade,
    categoria:        chamado.prioridade <= 'P3' ? 'CRITICO' : 'COMUM',
    tecnicoId:        chamado.tecnicoId,
    deadline:         chamado.slaDeadline,
    violadoEm,
    violadoHaMinutos: Math.abs(validacao.minutosRestantes),
  };

  await producer.send({
    topic:    'chamado-status',
    messages: [{ value: JSON.stringify({ evento: 'sla.violado', ...payload }) }],
  });
}

/**
 * Retorna o status atual do SLA de um chamado sem alterar o banco.
 * Útil para enriquecer a resposta da API.
 */
export async function consultarStatusSLA(chamadoId: string) {
  const chamado = await prisma.chamado.findUniqueOrThrow({
    where:  { id: chamadoId },
    select: {
      slaDeadline:  true,
      slaViolado:   true,
      slaVioladoEm: true,
    },
  });

  if (!chamado.slaDeadline) return null;

  const validacao = verificarStatusSLA(chamado.slaDeadline);

  return {
    deadline:         chamado.slaDeadline,
    status:           chamado.slaViolado ? 'VIOLADO' : validacao.status,
    minutosRestantes: validacao.minutosRestantes,
    horasRestantes:   validacao.horasRestantes,
    violadoEm:        chamado.slaVioladoEm ?? undefined,
  };
}