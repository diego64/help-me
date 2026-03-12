import {
  EXPEDIENTE_GLOBAL,
  MINUTOS_UTEIS_POR_DIA,
  SLA_CONFIG,
  type ExpedienteConfig,
  type CategoriaSLA,
} from './sla.config';
import { PrioridadeChamado } from '@prisma/client';

export interface ResultadoSLA {
  deadline: Date;
  categoria: CategoriaSLA;
  horasUteis: number;
  inicioContagem: Date; // pode diferir da abertura se fora do expediente
}

/**
 * Verifica se o dia da semana do Date é útil
 * conforme o expediente configurado.
 */
export function isDiaUtil(
  data: Date,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): boolean {
  return exp.diasUteis.includes(data.getDay());
}

/**
 * Retorna o início do expediente (ex: 08:00) para o dia do Date recebido.
 */
export function inicioExpedienteDoDia(
  data: Date,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): Date {
  const d = new Date(data);
  d.setHours(exp.horaEntrada, exp.minutoEntrada, 0, 0);
  return d;
}

/**
 * Retorna o fim do expediente (ex: 18:00) para o dia do Date recebido.
 */
export function fimExpedienteDoDia(
  data: Date,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): Date {
  const d = new Date(data);
  d.setHours(exp.horaSaida, exp.minutoSaida, 0, 0);
  return d;
}

/**
 * Verifica se um instante está dentro do expediente do dia.
 */
export function isDentroDoExpediente(
  data: Date,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): boolean {
  if (!isDiaUtil(data, exp)) return false;
  const inicio = inicioExpedienteDoDia(data, exp);
  const fim    = fimExpedienteDoDia(data, exp);
  return data >= inicio && data < fim;
}

/**
 * Avança o cursor para o início do expediente do próximo dia útil.
 * Nunca retorna o mesmo dia — sempre o PRÓXIMO.
 */
export function proximoDiaUtil(
  data: Date,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): Date {
  const d = new Date(data);
  d.setDate(d.getDate() + 1);
  d.setHours(exp.horaEntrada, exp.minutoEntrada, 0, 0);

  while (!isDiaUtil(d, exp)) {
    d.setDate(d.getDate() + 1);
  }

  return d;
}

/**
 * Se o cursor estiver fora do expediente, avança para a
 * próxima abertura válida. Se já estiver dentro, retorna
 * o mesmo instante sem alteração.
 *
 * Casos tratados:
 *  - Antes da abertura do dia (ex: 06:00 numa segunda) → ajusta para 08:00
 *  - Após o fim do expediente (ex: 20:00)              → próximo dia útil 08:00
 *  - Final de semana ou feriado                        → próximo dia útil 08:00
 */
export function ajustarParaExpediente(
  data: Date,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): Date {
  let cursor = new Date(data);

  // Avança até cair em um dia útil
  while (!isDiaUtil(cursor, exp)) {
    cursor = proximoDiaUtil(cursor, exp);
  }

  const inicio = inicioExpedienteDoDia(cursor, exp);
  const fim    = fimExpedienteDoDia(cursor, exp);

  if (cursor < inicio) {
    // Chegou antes da abertura → seta para 08:00 do mesmo dia
    return inicio;
  }

  if (cursor >= fim) {
    // Chegou após o fechamento → próximo dia útil 08:00
    return proximoDiaUtil(cursor, exp);
  }

  // Já está dentro do expediente
  return cursor;
}

/**
 * Retorna quantos minutos úteis restam no expediente do dia
 * a partir do cursor. Retorna 0 se já estiver fora do expediente.
 */
export function minutosRestantesNoDia(
  cursor: Date,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): number {
  if (!isDentroDoExpediente(cursor, exp)) return 0;
  const fim = fimExpedienteDoDia(cursor, exp);
  return Math.floor((fim.getTime() - cursor.getTime()) / 60_000);
}

/**
 * Calcula o deadline do SLA a partir de uma data de abertura
 * e uma quantidade de horas úteis, respeitando o expediente.
 *
 * Exemplo:
 *   abertura: sexta 17:00, horasUteis: 4 (240 min)
 *   → 1h restante sexta (17:00–18:00) = 60 min consumidos
 *   → faltam 180 min → segunda 08:00
 *   → 180 min a partir de 08:00 = segunda 11:00
 *   → deadline: segunda 11:00
 */
export function calcularDeadline(
  dataAbertura: Date,
  horasUteis: number,
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): Date {
  let minutosRestantes = horasUteis * 60;
  let cursor = ajustarParaExpediente(new Date(dataAbertura), exp);

  while (minutosRestantes > 0) {
    const disponivelHoje = minutosRestantesNoDia(cursor, exp);

    if (minutosRestantes <= disponivelHoje) {
      // O deadline cai ainda hoje
      return new Date(cursor.getTime() + minutosRestantes * 60_000);
    }

    // Consome todo o expediente de hoje e avança para o próximo dia útil
    minutosRestantes -= disponivelHoje;
    cursor = proximoDiaUtil(cursor, exp);
  }

  // Caso minutosRestantes seja 0 de entrada (não deve ocorrer com config válida)
  return cursor;
}

/**
 * Recebe a prioridade do chamado e a data de abertura,
 * retorna o resultado completo do SLA calculado.
 */
export function calcularSLA(
  prioridade: PrioridadeChamado,
  dataAbertura: Date = new Date(),
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): ResultadoSLA {
  const config        = SLA_CONFIG[prioridade];
  const inicioContagem = ajustarParaExpediente(new Date(dataAbertura), exp);
  const deadline      = calcularDeadline(dataAbertura, config.horasUteis, exp);

  return {
    deadline,
    categoria:    config.categoria,
    horasUteis:   config.horasUteis,
    inicioContagem,
  };
}