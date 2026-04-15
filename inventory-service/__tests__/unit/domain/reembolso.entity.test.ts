import { describe, it, expect } from 'vitest'
import { Reembolso, StatusReembolso } from '@/domain/reembolso/reembolso.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE: Parameters<typeof Reembolso.create>[0] = {
  id: 'reembolso-id-1',
  solicitadoPor: 'user-id-1',
  valor: 250.00,
  descricao: 'Reembolso de material de escritório',
  status: StatusReembolso.PENDENTE,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeReembolso = (overrides: Partial<typeof BASE> = {}) =>
  Reembolso.create({ ...BASE, ...overrides })

describe('Reembolso', () => {
  describe('create', () => {
    it('cria um reembolso válido com campos obrigatórios', () => {
      const r = makeReembolso()
      expect(r.valor).toBe(250)
      expect(r.status).toBe(StatusReembolso.PENDENTE)
      expect(r.solicitacaoCompraId).toBeNull()
      expect(r.aprovadoPor).toBeNull()
      expect(r.urlComprovante).toBeNull()
    })

    it('aceita campos opcionais', () => {
      const r = makeReembolso({
        solicitacaoCompraId: 'compra-id-1',
        nfe: '12345678901234567890123456789012345678901234',
        cnpjFornecedor: '12.345.678/0001-90',
      })
      expect(r.solicitacaoCompraId).toBe('compra-id-1')
      expect(r.nfe).toBe('12345678901234567890123456789012345678901234')
    })

    it('lança DomainError quando solicitadoPor está vazio', () => {
      expect(() => makeReembolso({ solicitadoPor: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando valor é zero', () => {
      expect(() => makeReembolso({ valor: 0 })).toThrow(DomainError)
    })

    it('lança DomainError quando valor é negativo', () => {
      expect(() => makeReembolso({ valor: -1 })).toThrow(DomainError)
    })

    it('lança DomainError quando descrição está vazia', () => {
      expect(() => makeReembolso({ descricao: '' })).toThrow(DomainError)
      expect(() => makeReembolso({ descricao: '   ' })).toThrow(DomainError)
    })

    it('lança DomainError quando descrição excede 512 caracteres', () => {
      expect(() => makeReembolso({ descricao: 'a'.repeat(513) })).toThrow(DomainError)
    })

    it('aceita descrição com exatamente 512 caracteres', () => {
      const r = makeReembolso({ descricao: 'a'.repeat(512) })
      expect(r.descricao).toHaveLength(512)
    })
  })

  describe('aprovar', () => {
    it('transiciona para APROVADO', () => {
      const r = makeReembolso()
      const aprovado = r.aprovar('gestor-id')
      expect(aprovado.status).toBe(StatusReembolso.APROVADO)
      expect(aprovado.aprovadoPor).toBe('gestor-id')
      expect(aprovado.aprovadoEm).toBeDefined()
    })

    it('não muta o objeto original (imutabilidade)', () => {
      const r = makeReembolso()
      r.aprovar('gestor-id')
      expect(r.status).toBe(StatusReembolso.PENDENTE)
    })

    it('lança DomainError quando status não é PENDENTE', () => {
      const aprovado = makeReembolso({ status: StatusReembolso.APROVADO })
      expect(() => aprovado.aprovar('gestor-id')).toThrow(DomainError)
    })

    it('lança DomainError quando status é REJEITADO', () => {
      const rejeitado = makeReembolso({ status: StatusReembolso.REJEITADO })
      expect(() => rejeitado.aprovar('gestor-id')).toThrow(DomainError)
    })
  })

  describe('rejeitar', () => {
    it('transiciona para REJEITADO com motivo', () => {
      const r = makeReembolso()
      const rejeitado = r.rejeitar('gestor-id', 'Comprovante inválido')
      expect(rejeitado.status).toBe(StatusReembolso.REJEITADO)
      expect(rejeitado.rejeitadoPor).toBe('gestor-id')
      expect(rejeitado.motivoRejeicao).toBe('Comprovante inválido')
      expect(rejeitado.rejeitadoEm).toBeDefined()
    })

    it('lança DomainError quando motivo está vazio', () => {
      const r = makeReembolso()
      expect(() => r.rejeitar('gestor-id', '')).toThrow(DomainError)
      expect(() => r.rejeitar('gestor-id', '   ')).toThrow(DomainError)
    })

    it('lança DomainError quando status não é PENDENTE', () => {
      const aprovado = makeReembolso({ status: StatusReembolso.APROVADO })
      expect(() => aprovado.rejeitar('gestor-id', 'Motivo')).toThrow(DomainError)
    })
  })

  describe('pagar', () => {
    it('transiciona para PAGO', () => {
      const aprovado = makeReembolso({ status: StatusReembolso.APROVADO })
      const pago = aprovado.pagar('admin-id')
      expect(pago.status).toBe(StatusReembolso.PAGO)
      expect(pago.processadoPor).toBe('admin-id')
      expect(pago.processadoEm).toBeDefined()
    })

    it('lança DomainError quando status não é APROVADO', () => {
      const pendente = makeReembolso()
      expect(() => pendente.pagar('admin-id')).toThrow(DomainError)
    })

    it('lança DomainError quando status é REJEITADO', () => {
      const rejeitado = makeReembolso({ status: StatusReembolso.REJEITADO })
      expect(() => rejeitado.pagar('admin-id')).toThrow(DomainError)
    })
  })

  describe('anexarComprovante', () => {
    it('define a URL do comprovante', () => {
      const r = makeReembolso()
      const comComprovante = r.anexarComprovante('https://storage.example.com/comprovante.pdf')
      expect(comComprovante.urlComprovante).toBe('https://storage.example.com/comprovante.pdf')
    })

    it('não afeta outros campos', () => {
      const r = makeReembolso()
      const atualizado = r.anexarComprovante('https://storage.example.com/file.pdf')
      expect(atualizado.status).toBe(r.status)
      expect(atualizado.valor).toBe(r.valor)
    })
  })
})
