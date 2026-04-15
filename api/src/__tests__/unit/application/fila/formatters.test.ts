import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PrioridadeChamado } from '@prisma/client'

import { formatarChamadoFila, criarPaginatedResponse } from '@application/use-cases/fila/formatters'

function makeChamado(geradoEm: Date, overrides: any = {}) {
  return {
    id: 'chamado-id',
    OS: 'INC0000001',
    descricao: 'Teste',
    status: 'ABERTO',
    prioridade: PrioridadeChamado.P4,
    geradoEm,
    atualizadoEm: new Date(),
    usuario: {
      id: 'u1',
      nome: 'Diego',
      sobrenome: 'Dev',
      email: 'diego@email.com',
    },
    tecnico: {
      id: 't1',
      nome: 'Tec',
      sobrenome: 'Nico',
      email: 'tec@email.com',
    },
    servicos: [{ servico: { id: 's1', nome: 'Suporte TI' } }],
    ...overrides,
  }
}

describe('formatarChamadoFila', () => {
  let dateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deve retornar tempoEspera em minutos quando diffMin < 60', () => {
    const agora = new Date('2024-01-08T10:30:00.000Z')
    vi.setSystemTime(agora)
    const geradoEm = new Date('2024-01-08T10:00:00.000Z') // 30 min atrás

    const result = formatarChamadoFila(makeChamado(geradoEm))

    expect(result.tempoEspera).toBe('30 min')
  })

  it('deve retornar tempoEspera em horas e min quando diffMin entre 60 e 1440', () => {
    const agora = new Date('2024-01-08T11:30:00.000Z')
    vi.setSystemTime(agora)
    const geradoEm = new Date('2024-01-08T10:00:00.000Z') // 90 min atrás

    const result = formatarChamadoFila(makeChamado(geradoEm))

    expect(result.tempoEspera).toBe('1h 30min')
  })

  it('deve retornar tempoEspera em dias e horas quando diffMin >= 1440', () => {
    const agora = new Date('2024-01-09T12:00:00.000Z')
    vi.setSystemTime(agora)
    const geradoEm = new Date('2024-01-08T10:00:00.000Z') // 1d 2h = 1560min

    const result = formatarChamadoFila(makeChamado(geradoEm))

    expect(result.tempoEspera).toBe('1d 2h')
  })

  it('deve retornar null para usuario quando é null', () => {
    const agora = new Date('2024-01-08T10:30:00.000Z')
    vi.setSystemTime(agora)

    const result = formatarChamadoFila(makeChamado(new Date('2024-01-08T10:00:00.000Z'), { usuario: null }))

    expect(result.usuario).toBeNull()
  })

  it('deve retornar null para tecnico quando é null', () => {
    const agora = new Date('2024-01-08T10:30:00.000Z')
    vi.setSystemTime(agora)

    const result = formatarChamadoFila(makeChamado(new Date('2024-01-08T10:00:00.000Z'), { tecnico: null }))

    expect(result.tecnico).toBeNull()
  })

  it('deve retornar array vazio para servicos quando é undefined', () => {
    const agora = new Date('2024-01-08T10:30:00.000Z')
    vi.setSystemTime(agora)

    const result = formatarChamadoFila(makeChamado(new Date('2024-01-08T10:00:00.000Z'), { servicos: undefined }))

    expect(result.servicos).toEqual([])
  })

  it('deve incluir todos os campos esperados', () => {
    const agora = new Date('2024-01-08T10:30:00.000Z')
    vi.setSystemTime(agora)

    const result = formatarChamadoFila(makeChamado(new Date('2024-01-08T10:00:00.000Z')))

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('OS')
    expect(result).toHaveProperty('tempoEspera')
    expect(result).toHaveProperty('usuario')
    expect(result).toHaveProperty('tecnico')
    expect(result).toHaveProperty('servicos')
  })
})

describe('criarPaginatedResponse', () => {
  it('deve retornar dados com metadados de paginação', () => {
    const data = [{ id: '1' }, { id: '2' }]
    const result = criarPaginatedResponse(data, 20, 1, 10)

    expect(result.data).toEqual(data)
    expect(result.pagination.total).toBe(20)
    expect(result.pagination.totalPages).toBe(2)
    expect(result.pagination.page).toBe(1)
    expect(result.pagination.limit).toBe(10)
    expect(result.pagination.hasNext).toBe(true)
    expect(result.pagination.hasPrev).toBe(false)
  })

  it('deve retornar hasNext=false na última página', () => {
    const result = criarPaginatedResponse([], 10, 2, 10)
    expect(result.pagination.hasNext).toBe(false)
  })

  it('deve retornar hasPrev=true na segunda página', () => {
    const result = criarPaginatedResponse([], 20, 2, 10)
    expect(result.pagination.hasPrev).toBe(true)
  })

  it('deve calcular totalPages corretamente', () => {
    const result = criarPaginatedResponse([], 25, 1, 10)
    expect(result.pagination.totalPages).toBe(3)
  })
})
