import { describe, it, expect } from 'vitest'

import {
  calcularMinutosUteisRestantes,
  verificarStatusSLA,
  getStatusSLA,
} from '@domain/sla/sla.validator'
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

describe('calcularMinutosUteisRestantes', () => {
  it('deve retornar valor negativo quando já violou', () => {
    const deadline = makeDate(2024, 1, 8, 10, 0) // segunda 10:00
    const agora    = makeDate(2024, 1, 8, 11, 0) // segunda 11:00 (1h depois)
    const resultado = calcularMinutosUteisRestantes(deadline, agora, EXP)
    expect(resultado).toBeLessThan(0)
    expect(resultado).toBe(-60)
  })

  it('deve retornar minutos positivos quando dentro do mesmo dia', () => {
    const agora    = makeDate(2024, 1, 8, 10, 0) // segunda 10:00
    const deadline = makeDate(2024, 1, 8, 12, 0) // segunda 12:00
    const resultado = calcularMinutosUteisRestantes(deadline, agora, EXP)
    expect(resultado).toBe(120)
  })

  it('deve contar minutos úteis atravessando dias', () => {
    // agora = segunda 17:00, deadline = terça 09:00
    // 1h restante segunda (60min) + 1h terça (60min) = 120min
    const agora    = makeDate(2024, 1, 8, 17, 0) // segunda 17:00
    const deadline = makeDate(2024, 1, 9, 9, 0)  // terça 09:00
    const resultado = calcularMinutosUteisRestantes(deadline, agora, EXP)
    expect(resultado).toBe(120)
  })

  it('deve retornar 0 (ou -0) quando agora === deadline', () => {
    const d = makeDate(2024, 1, 8, 10, 0)
    const resultado = calcularMinutosUteisRestantes(d, d, EXP)
    // agora >= deadline resulta em -Math.floor(0) = -0 (negativo zero em JS)
    expect(Math.abs(resultado)).toBe(0)
  })

  it('deve tratar agora fora do expediente avançando para próxima abertura', () => {
    // agora = segunda 20:00 (fora do expediente), deadline = terça 10:00
    const agora    = makeDate(2024, 1, 8, 20, 0)
    const deadline = makeDate(2024, 1, 9, 10, 0)
    const resultado = calcularMinutosUteisRestantes(deadline, agora, EXP)
    expect(resultado).toBe(120) // terça 08:00 a 10:00 = 120min
  })

  it('deve contar minutos úteis atravessando fim de semana', () => {
    // agora = sexta 17:00, deadline = segunda 09:00
    // sexta: 1h (60min), segunda: 1h (60min) = 120min
    const agora    = makeDate(2024, 1, 12, 17, 0) // sexta 17:00
    const deadline = makeDate(2024, 1, 15, 9, 0)  // segunda 09:00
    const resultado = calcularMinutosUteisRestantes(deadline, agora, EXP)
    expect(resultado).toBe(120)
  })
})

describe('verificarStatusSLA', () => {
  it('deve retornar VIOLADO quando deadline passou', () => {
    const deadline = makeDate(2024, 1, 8, 10, 0)
    const agora    = makeDate(2024, 1, 8, 11, 0)
    const resultado = verificarStatusSLA(deadline, agora, EXP)
    expect(resultado.status).toBe('VIOLADO')
    expect(resultado.violadoHa).toBe(60)
    expect(resultado.minutosRestantes).toBe(-60)
  })

  it('deve retornar ALERTA quando < 60min restantes', () => {
    const agora    = makeDate(2024, 1, 8, 9, 30)
    const deadline = makeDate(2024, 1, 8, 10, 0) // 30min restantes
    const resultado = verificarStatusSLA(deadline, agora, EXP)
    expect(resultado.status).toBe('ALERTA')
    expect(resultado.minutosRestantes).toBe(30)
  })

  it('deve retornar DENTRO quando > 60min restantes', () => {
    const agora    = makeDate(2024, 1, 8, 10, 0)
    const deadline = makeDate(2024, 1, 8, 14, 0) // 4h restantes
    const resultado = verificarStatusSLA(deadline, agora, EXP)
    expect(resultado.status).toBe('DENTRO')
    expect(resultado.horasRestantes).toBeGreaterThan(1)
  })

  it('deve incluir deadline no resultado', () => {
    const deadline = makeDate(2024, 1, 8, 14, 0)
    const agora    = makeDate(2024, 1, 8, 10, 0)
    const resultado = verificarStatusSLA(deadline, agora, EXP)
    expect(resultado.deadline).toBe(deadline)
  })

  it('não deve incluir violadoHa quando status DENTRO', () => {
    const agora    = makeDate(2024, 1, 8, 10, 0)
    const deadline = makeDate(2024, 1, 8, 14, 0)
    const resultado = verificarStatusSLA(deadline, agora, EXP)
    expect(resultado.violadoHa).toBeUndefined()
  })
})

describe('getStatusSLA', () => {
  it('deve retornar VIOLADO quando deadline passou', () => {
    const deadline = makeDate(2024, 1, 8, 10, 0)
    const agora    = makeDate(2024, 1, 8, 12, 0)
    expect(getStatusSLA(deadline, agora)).toBe('VIOLADO')
  })

  it('deve retornar DENTRO quando há tempo suficiente', () => {
    const agora    = makeDate(2024, 1, 8, 9, 0)
    const deadline = makeDate(2024, 1, 8, 14, 0)
    expect(getStatusSLA(deadline, agora)).toBe('DENTRO')
  })

  it('deve usar data atual como padrão quando agora não fornecida', () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000) // amanhã
    const status = getStatusSLA(deadline)
    expect(['DENTRO', 'ALERTA', 'VIOLADO']).toContain(status)
  })
})
