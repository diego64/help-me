import { PrioridadeChamado } from '@prisma/client';

export type CategoriaSLA = 'CRITICO' | 'COMUM';

export interface ConfigSLA {
  categoria: CategoriaSLA;
  horasUteis: number;
}

export interface ExpedienteConfig {
  /** Dias úteis: 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb */
  diasUteis: number[];
  horaEntrada: number;
  minutoEntrada: number;
  horaSaida: number;
  minutoSaida: number;
}

// ============================================================
// MAPEAMENTO DE PRIORIDADES → SLA
//
// P1           → Crítico → 4h úteis
// P2, P3       → Crítico → 4h úteis
// P4, P5       → Comum   → 48h úteis
// ============================================================

export const SLA_CONFIG: Record<PrioridadeChamado, ConfigSLA> = {
  P1: { categoria: 'CRITICO', horasUteis: 4  },
  P2: { categoria: 'CRITICO', horasUteis: 4  },
  P3: { categoria: 'CRITICO', horasUteis: 4  },
  P4: { categoria: 'COMUM',   horasUteis: 48 },
  P5: { categoria: 'COMUM',   horasUteis: 48 },
};

// ============================================================
// EXPEDIENTE GLOBAL DA EMPRESA (hardcoded por ora)
// Futuramente: buscar do banco via model ExpedienteGlobal
// ============================================================

export const EXPEDIENTE_GLOBAL: ExpedienteConfig = {
  diasUteis:     [1, 2, 3, 4, 5], // Seg–Sex
  horaEntrada:   8,
  minutoEntrada: 0,
  horaSaida:     18,
  minutoSaida:   0,
};

// Minutos úteis disponíveis por dia → (18:00 - 08:00) = 600min
export const MINUTOS_UTEIS_POR_DIA =
  (EXPEDIENTE_GLOBAL.horaSaida * 60 + EXPEDIENTE_GLOBAL.minutoSaida) -
  (EXPEDIENTE_GLOBAL.horaEntrada * 60 + EXPEDIENTE_GLOBAL.minutoEntrada);