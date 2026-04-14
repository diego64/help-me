import { describe, it, expect } from 'vitest'
import { PrioridadeChamado } from '@prisma/client'

import {
  isDiaUtil,
  inicioExpedienteDoDia,
  fimExpedienteDoDia,
  isDentroDoExpediente,
  proximoDiaUtil,
  ajustarParaExpediente,
  minutosRestantesNoDia,
  calcularDeadline,
  calcularSLA,
} from '@domain/sla/sla.calculator'
import type { ExpedienteConfig } from '@domain/sla/sla.config'

const EXP: ExpedienteConfig = {
  diasUteis: [1, 2, 3, 4, 5],
  horaEntrada: 8,
  minutoEntrada: 0,
  horaSaida: 18,
  minutoSaida: 0,
}

function makeDate(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

describe('isDiaUtil', () => {
  it('deve retornar true para segunda-feira (dia 1)', () => {
    // 2024-01-08 = segunda-feira
    const seg = makeDate(2024, 1, 8, 10, 0)
    expect(isDiaUtil(seg, EXP)).toBe(true)
  })

  it('deve retornar true para sexta-feira (dia 5)', () => {
    // 2024-01-12 = sexta-feira
    const sex = makeDate(2024, 1, 12, 10, 0)
    expect(isDiaUtil(sex, EXP)).toBe(true)
  })

  it('deve retornar false para sábado (dia 6)', () => {
    // 2024-01-13 = sábado
    const sab = makeDate(2024, 1, 13, 10, 0)
    expect(isDiaUtil(sab, EXP)).toBe(false)
  })

  it('deve retornar false para domingo (dia 0)', () => {
    // 2024-01-14 = domingo
    const dom = makeDate(2024, 1, 14, 10, 0)
    expect(isDiaUtil(dom, EXP)).toBe(false)
  })
})

describe('inicioExpedienteDoDia', () => {
  it('deve retornar 08:00 do mesmo dia', () => {
    const data = makeDate(2024, 1, 8, 12, 30)
    const inicio = inicioExpedienteDoDia(data, EXP)
    expect(inicio.getHours()).toBe(8)
    expect(inicio.getMinutes()).toBe(0)
    expect(inicio.getDate()).toBe(8)
  })
})

describe('fimExpedienteDoDia', () => {
  it('deve retornar 18:00 do mesmo dia', () => {
    const data = makeDate(2024, 1, 8, 12, 30)
    const fim = fimExpedienteDoDia(data, EXP)
    expect(fim.getHours()).toBe(18)
    expect(fim.getMinutes()).toBe(0)
    expect(fim.getDate()).toBe(8)
  })
})

describe('isDentroDoExpediente', () => {
  it('deve retornar true quando dentro do expediente (10:00 segunda)', () => {
    const d = makeDate(2024, 1, 8, 10, 0) // segunda 10:00
    expect(isDentroDoExpediente(d, EXP)).toBe(true)
  })

  it('deve retornar false quando antes do expediente (07:00 segunda)', () => {
    const d = makeDate(2024, 1, 8, 7, 0)
    expect(isDentroDoExpediente(d, EXP)).toBe(false)
  })

  it('deve retornar false quando após o expediente (19:00 segunda)', () => {
    const d = makeDate(2024, 1, 8, 19, 0)
    expect(isDentroDoExpediente(d, EXP)).toBe(false)
  })

  it('deve retornar false quando exatamente no fechamento (18:00)', () => {
    const d = makeDate(2024, 1, 8, 18, 0)
    expect(isDentroDoExpediente(d, EXP)).toBe(false)
  })

  it('deve retornar false em sábado mesmo dentro do horário', () => {
    const d = makeDate(2024, 1, 13, 10, 0) // sábado
    expect(isDentroDoExpediente(d, EXP)).toBe(false)
  })
})

describe('proximoDiaUtil', () => {
  it('deve avançar de sexta para segunda', () => {
    const sex = makeDate(2024, 1, 12, 10, 0) // sexta
    const prox = proximoDiaUtil(sex, EXP)
    expect(prox.getDay()).toBe(1) // segunda
    expect(prox.getHours()).toBe(8)
    expect(prox.getMinutes()).toBe(0)
  })

  it('deve avançar de quinta para sexta', () => {
    const qui = makeDate(2024, 1, 11, 10, 0) // quinta
    const prox = proximoDiaUtil(qui, EXP)
    expect(prox.getDay()).toBe(5) // sexta
  })

  it('deve avançar de sábado para segunda', () => {
    const sab = makeDate(2024, 1, 13, 10, 0) // sábado
    const prox = proximoDiaUtil(sab, EXP)
    expect(prox.getDay()).toBe(1) // segunda
  })
})

describe('ajustarParaExpediente', () => {
  it('deve retornar 08:00 quando cursor está antes da abertura', () => {
    const d = makeDate(2024, 1, 8, 6, 0) // segunda 06:00
    const ajustado = ajustarParaExpediente(d, EXP)
    expect(ajustado.getHours()).toBe(8)
    expect(ajustado.getMinutes()).toBe(0)
    expect(ajustado.getDay()).toBe(1) // ainda segunda
  })

  it('deve avançar para próxima segunda quando cursor está após o fechamento', () => {
    const d = makeDate(2024, 1, 8, 20, 0) // segunda 20:00
    const ajustado = ajustarParaExpediente(d, EXP)
    expect(ajustado.getDay()).toBe(2) // terça
    expect(ajustado.getHours()).toBe(8)
  })

  it('deve avançar para segunda quando cursor está no sábado', () => {
    const d = makeDate(2024, 1, 13, 10, 0) // sábado
    const ajustado = ajustarParaExpediente(d, EXP)
    expect(ajustado.getDay()).toBe(1) // segunda
    expect(ajustado.getHours()).toBe(8)
  })

  it('deve retornar o mesmo instante quando já dentro do expediente', () => {
    const d = makeDate(2024, 1, 8, 10, 30) // segunda 10:30
    const ajustado = ajustarParaExpediente(d, EXP)
    expect(ajustado.getTime()).toBe(d.getTime())
  })
})

describe('minutosRestantesNoDia', () => {
  it('deve retornar minutos corretos quando dentro do expediente', () => {
    const d = makeDate(2024, 1, 8, 16, 0) // segunda 16:00 → 2h = 120min até 18:00
    expect(minutosRestantesNoDia(d, EXP)).toBe(120)
  })

  it('deve retornar 0 quando fora do expediente', () => {
    const d = makeDate(2024, 1, 8, 19, 0) // segunda 19:00
    expect(minutosRestantesNoDia(d, EXP)).toBe(0)
  })

  it('deve retornar 0 quando no sábado', () => {
    const d = makeDate(2024, 1, 13, 10, 0) // sábado
    expect(minutosRestantesNoDia(d, EXP)).toBe(0)
  })

  it('deve retornar 600 quando cursor está exatamente na abertura', () => {
    const d = makeDate(2024, 1, 8, 8, 0) // segunda 08:00
    expect(minutosRestantesNoDia(d, EXP)).toBe(600)
  })
})

describe('calcularDeadline', () => {
  it('deve retornar cursor imediatamente quando horasUteis = 0', () => {
    const abertura = makeDate(2024, 1, 8, 10, 0)
    const deadline = calcularDeadline(abertura, 0, EXP)
    // Com 0 horas, o loop não executa e retorna o cursor ajustado
    expect(deadline).toBeInstanceOf(Date)
  })

  it('deve calcular deadline dentro do mesmo dia quando cabe no expediente', () => {
    // segunda 10:00 + 2h = segunda 12:00
    const abertura = makeDate(2024, 1, 8, 10, 0)
    const deadline = calcularDeadline(abertura, 2, EXP)
    expect(deadline.getDay()).toBe(1) // segunda
    expect(deadline.getHours()).toBe(12)
    expect(deadline.getMinutes()).toBe(0)
  })

  it('deve calcular deadline para o próximo dia quando não cabe hoje', () => {
    // sexta 17:00 + 4h → 1h restante hoje, 3h na segunda = segunda 11:00
    const abertura = makeDate(2024, 1, 12, 17, 0) // sexta 17:00
    const deadline = calcularDeadline(abertura, 4, EXP)
    expect(deadline.getDay()).toBe(1) // segunda
    expect(deadline.getHours()).toBe(11)
  })

  it('deve calcular deadline atravessando fim de semana', () => {
    // sexta 16:00 + 4h → 2h restante sexta, 2h na segunda = segunda 10:00
    const abertura = makeDate(2024, 1, 12, 16, 0) // sexta 16:00
    const deadline = calcularDeadline(abertura, 4, EXP)
    expect(deadline.getDay()).toBe(1) // segunda
    expect(deadline.getHours()).toBe(10)
  })
})

describe('calcularSLA', () => {
  it('deve retornar P1 com 4h e categoria CRITICO', () => {
    const abertura = makeDate(2024, 1, 8, 10, 0)
    const resultado = calcularSLA(PrioridadeChamado.P1, abertura, EXP)
    expect(resultado.horasUteis).toBe(4)
    expect(resultado.categoria).toBe('CRITICO')
    expect(resultado.deadline).toBeInstanceOf(Date)
    expect(resultado.inicioContagem).toBeInstanceOf(Date)
  })

  it('deve retornar P4 com 48h e categoria COMUM', () => {
    const abertura = makeDate(2024, 1, 8, 10, 0)
    const resultado = calcularSLA(PrioridadeChamado.P4, abertura, EXP)
    expect(resultado.horasUteis).toBe(48)
    expect(resultado.categoria).toBe('COMUM')
  })

  it('deve usar data atual quando dataAbertura não informada', () => {
    const resultado = calcularSLA(PrioridadeChamado.P1)
    expect(resultado.deadline).toBeInstanceOf(Date)
  })
})
