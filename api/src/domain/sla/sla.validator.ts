import { EXPEDIENTE_GLOBAL, type ExpedienteConfig } from './sla.config';
import {
  calcularDeadline,
  minutosRestantesNoDia,
  isDentroDoExpediente,
  ajustarParaExpediente,
} from './sla.calculator';

export type StatusSLA = 'DENTRO' | 'ALERTA' | 'VIOLADO';

export interface ResultadoValidacaoSLA {
  status: StatusSLA;
  minutosRestantes: number;  // negativo se violado
  horasRestantes: number;    // negativo se violado
  deadline: Date;
  violadoHa?: number;        // minutos desde a violação (só presente se VIOLADO)
}

// Limiar para considerar ALERTA: menos de 1h útil restante
const LIMIAR_ALERTA_MINUTOS = 60;

/**
 * Calcula quantos minutos úteis existem entre agora e o deadline,
 * respeitando o expediente. Retorna valor negativo se já violou.
 */
export function calcularMinutosUteisRestantes(
  deadline: Date,
  agora: Date = new Date(),
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): number {
  // Já violou — retorna diferença em minutos (negativo)
  if (agora >= deadline) {
    return -Math.floor((agora.getTime() - deadline.getTime()) / 60_000);
  }

  let minutosUteis = 0;
  let cursor       = new Date(agora);

  // Se agora está fora do expediente, avança para a próxima abertura
  if (!isDentroDoExpediente(cursor, exp)) {
    cursor = ajustarParaExpediente(cursor, exp);
  }

  // Soma minutos úteis dia a dia até alcançar o deadline
  while (cursor < deadline) {
    if (!isDentroDoExpediente(cursor, exp)) {
      cursor = ajustarParaExpediente(cursor, exp);
      continue;
    }

    const disponivelHoje = minutosRestantesNoDia(cursor, exp);
    const fimHoje        = new Date(cursor.getTime() + disponivelHoje * 60_000);

    if (fimHoje >= deadline) {
      // O deadline cai ainda hoje
      minutosUteis += Math.floor((deadline.getTime() - cursor.getTime()) / 60_000);
      break;
    }

    minutosUteis += disponivelHoje;

    // Avança para o início do próximo dia útil
    cursor = new Date(fimHoje);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(exp.horaEntrada, exp.minutoEntrada, 0, 0);
    while (!exp.diasUteis.includes(cursor.getDay())) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return minutosUteis;
}

/**
 * Verifica o status atual do SLA de um chamado.
 *
 * Status possíveis:
 *  - DENTRO  → mais de 1h útil restante
 *  - ALERTA  → menos de 1h útil restante (mas ainda não violou)
 *  - VIOLADO → deadline já passou
 *
 * @param deadline   - slaDeadline salvo no chamado
 * @param agora      - instante de referência (padrão: now())
 */
export function verificarStatusSLA(
  deadline: Date,
  agora: Date = new Date(),
  exp: ExpedienteConfig = EXPEDIENTE_GLOBAL,
): ResultadoValidacaoSLA {
  const minutosRestantes = calcularMinutosUteisRestantes(deadline, agora, exp);
  const horasRestantes   = parseFloat((minutosRestantes / 60).toFixed(2));

  if (minutosRestantes < 0) {
    return {
      status:           'VIOLADO',
      minutosRestantes,
      horasRestantes,
      deadline,
      violadoHa: Math.abs(minutosRestantes),
    };
  }

  if (minutosRestantes <= LIMIAR_ALERTA_MINUTOS) {
    return {
      status: 'ALERTA',
      minutosRestantes,
      horasRestantes,
      deadline,
    };
  }

  return {
    status: 'DENTRO',
    minutosRestantes,
    horasRestantes,
    deadline,
  };
}

/**
 * Atalho: retorna apenas o StatusSLA sem o objeto completo.
 * Útil para checks rápidos no cron job e no controller.
 */
export function getStatusSLA(
  deadline: Date,
  agora: Date = new Date(),
): StatusSLA {
  return verificarStatusSLA(deadline, agora).status;
}