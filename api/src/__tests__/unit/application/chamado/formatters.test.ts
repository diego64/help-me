import { describe, it, expect } from 'vitest'
import { PrioridadeChamado } from '@prisma/client'

import { formatarChamadoResposta, DESCRICAO_PRIORIDADE } from '@application/use-cases/chamado/formatters'

const makeChamado = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  descricao: 'Problema no sistema',
  descricaoEncerramento: null,
  status: 'ABERTO',
  prioridade: PrioridadeChamado.P4,
  prioridadeAlterada: null,
  alteradorPrioridade: null,
  geradoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
  encerradoEm: null,
  usuario: {
    id: 'u1',
    nome: 'Diego',
    sobrenome: 'Dev',
    email: 'diego@email.com',
    setor: 'TI',
  },
  tecnico: {
    id: 't1',
    nome: 'Tec',
    sobrenome: 'Nico',
    email: 'tec@email.com',
    nivel: 'N1',
  },
  servicos: [{ servico: { id: 's1', nome: 'Suporte TI' } }],
  ...overrides,
})

describe('DESCRICAO_PRIORIDADE', () => {
  it('deve mapear P1 para Alta Prioridade', () => {
    expect(DESCRICAO_PRIORIDADE.P1).toBe('Alta Prioridade')
  })

  it('deve mapear P4 para Baixa Prioridade', () => {
    expect(DESCRICAO_PRIORIDADE.P4).toBe('Baixa Prioridade')
  })
})

describe('formatarChamadoResposta', () => {
  it('deve retornar prioridadeDescricao quando prioridade definida', () => {
    const result = formatarChamadoResposta(makeChamado({ prioridade: PrioridadeChamado.P1 }))
    expect(result.prioridadeDescricao).toBe('Alta Prioridade')
  })

  it('deve retornar null para prioridadeDescricao quando prioridade é null', () => {
    const result = formatarChamadoResposta(makeChamado({ prioridade: null }))
    expect(result.prioridadeDescricao).toBeNull()
  })

  it('deve retornar null para prioridadeDescricao quando prioridade é undefined', () => {
    const result = formatarChamadoResposta(makeChamado({ prioridade: undefined }))
    expect(result.prioridadeDescricao).toBeNull()
  })

  it('deve retornar prioridadeAlteradaPor quando alteradorPrioridade definido', () => {
    const result = formatarChamadoResposta(makeChamado({
      alteradorPrioridade: { id: 'a1', nome: 'Admin', sobrenome: 'User', email: 'admin@email.com' },
    }))
    expect(result.prioridadeAlteradaPor).toEqual({
      id: 'a1',
      nome: 'Admin User',
      email: 'admin@email.com',
    })
  })

  it('deve retornar null para prioridadeAlteradaPor quando alteradorPrioridade é null', () => {
    const result = formatarChamadoResposta(makeChamado({ alteradorPrioridade: null }))
    expect(result.prioridadeAlteradaPor).toBeNull()
  })

  it('deve retornar usuario formatado quando usuario definido', () => {
    const result = formatarChamadoResposta(makeChamado())
    expect(result.usuario).toEqual({
      id: 'u1',
      nome: 'Diego',
      sobrenome: 'Dev',
      email: 'diego@email.com',
    })
  })

  it('deve retornar null para usuario quando é null', () => {
    const result = formatarChamadoResposta(makeChamado({ usuario: null }))
    expect(result.usuario).toBeNull()
  })

  it('deve retornar tecnico formatado quando tecnico definido', () => {
    const result = formatarChamadoResposta(makeChamado({ tecnicoId: 't1' }))
    expect(result.tecnico).toBeDefined()
    expect(result.tecnico?.nome).toBe('Tec')
  })

  it('deve retornar null para tecnico quando é null', () => {
    const result = formatarChamadoResposta(makeChamado({ tecnico: null }))
    expect(result.tecnico).toBeNull()
  })

  it('deve retornar servicos mapeados quando definidos', () => {
    const result = formatarChamadoResposta(makeChamado())
    expect(result.servicos).toEqual([{ id: 's1', nome: 'Suporte TI' }])
  })

  it('deve retornar array vazio quando servicos é undefined', () => {
    const result = formatarChamadoResposta(makeChamado({ servicos: undefined }))
    expect(result.servicos).toEqual([])
  })

  it('deve retornar prioridadeAlteradaEm como null quando prioridadeAlterada é null', () => {
    const result = formatarChamadoResposta(makeChamado({ prioridadeAlterada: null }))
    expect(result.prioridadeAlteradaEm).toBeNull()
  })
})
