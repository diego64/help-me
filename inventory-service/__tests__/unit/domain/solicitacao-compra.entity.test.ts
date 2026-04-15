import { describe, it, expect } from 'vitest'
import {
  SolicitacaoCompra,
  StatusSolicitacaoCompra,
  FormaPagamento,
} from '@/domain/compra/solicitacao-compra.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE: Parameters<typeof SolicitacaoCompra.create>[0] = {
  id: 'compra-id-1',
  acNumero: 'AC0000001',
  ocNumero: 'OC0000001',
  solicitadoPor: 'user-id-1',
  setorSolicitante: 'TECNOLOGIA_INFORMACAO',
  status: StatusSolicitacaoCompra.PENDENTE,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeCompra = (overrides: Partial<typeof BASE> = {}) =>
  SolicitacaoCompra.create({ ...BASE, ...overrides })

describe('SolicitacaoCompra', () => {
  describe('create', () => {
    it('cria uma solicitação válida no status PENDENTE', () => {
      const compra = makeCompra()
      expect(compra.acNumero).toBe('AC0000001')
      expect(compra.status).toBe(StatusSolicitacaoCompra.PENDENTE)
      expect(compra.aprovadoPor).toBeNull()
      expect(compra.valorTotal).toBeNull()
    })

    it('lança DomainError quando acNumero está vazio', () => {
      expect(() => makeCompra({ acNumero: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando ocNumero está vazio', () => {
      expect(() => makeCompra({ ocNumero: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando solicitadoPor está vazio', () => {
      expect(() => makeCompra({ solicitadoPor: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando valorTotal é negativo', () => {
      expect(() => makeCompra({ valorTotal: -1 })).toThrow(DomainError)
    })

    it('aceita valorTotal igual a zero', () => {
      const compra = makeCompra({ valorTotal: 0 })
      expect(compra.valorTotal).toBe(0)
    })
  })

  describe('aprovar', () => {
    it('transiciona para APROVADO com os dados de aprovação', () => {
      const compra = makeCompra()
      const aprovada = compra.aprovar('gestor-id', FormaPagamento.PIX, 0)
      expect(aprovada.status).toBe(StatusSolicitacaoCompra.APROVADO)
      expect(aprovada.aprovadoPor).toBe('gestor-id')
      expect(aprovada.formaPagamento).toBe(FormaPagamento.PIX)
      expect(aprovada.parcelas).toBe(0)
      expect(aprovada.aprovadoEm).toBeDefined()
    })

    it('aceita CARTAO_CREDITO com parcelas >= 1', () => {
      const compra = makeCompra()
      const aprovada = compra.aprovar('gestor-id', FormaPagamento.CARTAO_CREDITO, 3)
      expect(aprovada.parcelas).toBe(3)
    })

    it('lança DomainError quando CARTAO_CREDITO com parcelas < 1', () => {
      const compra = makeCompra()
      expect(() => compra.aprovar('gestor-id', FormaPagamento.CARTAO_CREDITO, 0)).toThrow(DomainError)
    })

    it('lança DomainError quando status não é PENDENTE', () => {
      const aprovada = makeCompra({ status: StatusSolicitacaoCompra.APROVADO })
      expect(() => aprovada.aprovar('gestor-id', FormaPagamento.PIX, 0)).toThrow(DomainError)
    })

    it('lança DomainError ao tentar aprovar status REJEITADO', () => {
      const rejeitada = makeCompra({ status: StatusSolicitacaoCompra.REJEITADO })
      expect(() => rejeitada.aprovar('gestor-id', FormaPagamento.PIX, 0)).toThrow(DomainError)
    })
  })

  describe('rejeitar', () => {
    it('transiciona para REJEITADO com motivo', () => {
      const compra = makeCompra()
      const rejeitada = compra.rejeitar('gestor-id', 'Orçamento insuficiente')
      expect(rejeitada.status).toBe(StatusSolicitacaoCompra.REJEITADO)
      expect(rejeitada.rejeitadoPor).toBe('gestor-id')
      expect(rejeitada.motivoRejeicao).toBe('Orçamento insuficiente')
      expect(rejeitada.rejeitadoEm).toBeDefined()
    })

    it('lança DomainError quando motivo está vazio', () => {
      const compra = makeCompra()
      expect(() => compra.rejeitar('gestor-id', '')).toThrow(DomainError)
      expect(() => compra.rejeitar('gestor-id', '   ')).toThrow(DomainError)
    })

    it('lança DomainError quando status não é PENDENTE', () => {
      const aprovada = makeCompra({ status: StatusSolicitacaoCompra.APROVADO })
      expect(() => aprovada.rejeitar('gestor-id', 'Motivo')).toThrow(DomainError)
    })
  })

  describe('marcarComoComprado', () => {
    it('transiciona para COMPRADO com executadoPor', () => {
      const aprovada = makeCompra({ status: StatusSolicitacaoCompra.APROVADO })
      const comprada = aprovada.marcarComoComprado('comprador-id', 1500)
      expect(comprada.status).toBe(StatusSolicitacaoCompra.COMPRADO)
      expect(comprada.executadoPor).toBe('comprador-id')
      expect(comprada.valorTotal).toBe(1500)
      expect(comprada.executadoEm).toBeDefined()
    })

    it('preserva valorTotal existente quando não informado', () => {
      const aprovada = makeCompra({ status: StatusSolicitacaoCompra.APROVADO, valorTotal: 999 })
      const comprada = aprovada.marcarComoComprado('comprador-id')
      expect(comprada.valorTotal).toBe(999)
    })

    it('lança DomainError quando status não é APROVADO', () => {
      const pendente = makeCompra()
      expect(() => pendente.marcarComoComprado('comprador-id')).toThrow(DomainError)
    })
  })

  describe('cancelar', () => {
    it('cancela uma solicitação PENDENTE', () => {
      const compra = makeCompra()
      const cancelada = compra.cancelar()
      expect(cancelada.status).toBe(StatusSolicitacaoCompra.CANCELADO)
    })

    it('cancela uma solicitação APROVADA', () => {
      const aprovada = makeCompra({ status: StatusSolicitacaoCompra.APROVADO })
      const cancelada = aprovada.cancelar()
      expect(cancelada.status).toBe(StatusSolicitacaoCompra.CANCELADO)
    })

    it('lança DomainError quando status é COMPRADO', () => {
      const comprada = makeCompra({ status: StatusSolicitacaoCompra.COMPRADO })
      expect(() => comprada.cancelar()).toThrow(DomainError)
    })

    it('lança DomainError quando status é REJEITADO', () => {
      const rejeitada = makeCompra({ status: StatusSolicitacaoCompra.REJEITADO })
      expect(() => rejeitada.cancelar()).toThrow(DomainError)
    })

    it('lança DomainError quando status é CANCELADO', () => {
      const cancelada = makeCompra({ status: StatusSolicitacaoCompra.CANCELADO })
      expect(() => cancelada.cancelar()).toThrow(DomainError)
    })
  })
})
