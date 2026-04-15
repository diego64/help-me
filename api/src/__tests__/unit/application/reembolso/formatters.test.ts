import { describe, it, expect } from 'vitest'
import { ReembolsoStatus, CategoriaReembolso } from '@prisma/client'

import { formatarReembolsoResposta } from '@application/use-cases/reembolso/formatters'

const makeReembolso = (overrides: any = {}) => ({
  id: 'reembolso-id',
  numero: 'RMB0000001',
  descricao: 'Jantar de negócios',
  categoria: CategoriaReembolso.ALIMENTACAO,
  valor: 100.50,
  status: ReembolsoStatus.PENDENTE,
  setor: 'TI',
  solicitante: {
    id: 'u1',
    nome: 'Diego',
    sobrenome: 'Dev',
    email: 'diego@email.com',
    setor: 'TI',
  },
  aprovador: null,
  aprovadoEm: null,
  motivoRejeicao: null,
  pagador: null,
  pagoEm: null,
  comprovantePagamentoUrl: null,
  geradoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
  ...overrides,
})

describe('formatarReembolsoResposta', () => {
  it('deve retornar todos os campos obrigatórios', () => {
    const result = formatarReembolsoResposta(makeReembolso())

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('numero')
    expect(result).toHaveProperty('descricao')
    expect(result).toHaveProperty('categoria')
    expect(result).toHaveProperty('valor')
    expect(result).toHaveProperty('status')
  })

  it('deve converter valor para Number', () => {
    const result = formatarReembolsoResposta(makeReembolso({ valor: '100.50' }))
    expect(typeof result.valor).toBe('number')
    expect(result.valor).toBe(100.50)
  })

  it('deve formatar solicitante quando definido', () => {
    const result = formatarReembolsoResposta(makeReembolso())

    expect(result.solicitante).toEqual({
      id: 'u1',
      nome: 'Diego Dev',
      email: 'diego@email.com',
      setor: 'TI',
    })
  })

  it('deve retornar null para solicitante quando é null', () => {
    const result = formatarReembolsoResposta(makeReembolso({ solicitante: null }))
    expect(result.solicitante).toBeNull()
  })

  it('deve formatar aprovador quando definido', () => {
    const result = formatarReembolsoResposta(makeReembolso({
      aprovador: { id: 'a1', nome: 'Admin', sobrenome: 'User', email: 'admin@email.com' },
      aprovadoEm: new Date('2024-01-02'),
    }))

    expect(result.aprovador).toEqual({
      id: 'a1',
      nome: 'Admin User',
      email: 'admin@email.com',
    })
    expect(result.aprovadoEm).toBeDefined()
  })

  it('deve retornar null para aprovador quando é null', () => {
    const result = formatarReembolsoResposta(makeReembolso({ aprovador: null }))
    expect(result.aprovador).toBeNull()
    expect(result.aprovadoEm).toBeNull()
  })

  it('deve formatar pagador quando definido', () => {
    const result = formatarReembolsoResposta(makeReembolso({
      pagador: { id: 'p1', nome: 'Pag', sobrenome: 'Ador', email: 'pag@email.com' },
      pagoEm: new Date('2024-01-03'),
      comprovantePagamentoUrl: 'https://url/comp.pdf',
    }))

    expect(result.pagador).toEqual({
      id: 'p1',
      nome: 'Pag Ador',
      email: 'pag@email.com',
    })
    expect(result.pagoEm).toBeDefined()
    expect(result.comprovantePagamentoUrl).toBe('https://url/comp.pdf')
  })

  it('deve retornar null para pagador quando é null', () => {
    const result = formatarReembolsoResposta(makeReembolso({ pagador: null }))
    expect(result.pagador).toBeNull()
  })

  it('deve retornar null para setor quando é null/undefined', () => {
    const result = formatarReembolsoResposta(makeReembolso({ setor: null }))
    expect(result.setor).toBeNull()
  })

  it('deve retornar motivoRejeicao quando definido', () => {
    const result = formatarReembolsoResposta(makeReembolso({ motivoRejeicao: 'Documento inválido' }))
    expect(result.motivoRejeicao).toBe('Documento inválido')
  })

  it('deve retornar null para motivoRejeicao quando é null', () => {
    const result = formatarReembolsoResposta(makeReembolso({ motivoRejeicao: null }))
    expect(result.motivoRejeicao).toBeNull()
  })
})
