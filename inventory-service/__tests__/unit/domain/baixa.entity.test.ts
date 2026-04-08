import { describe, it, expect } from 'vitest'
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE: Parameters<typeof Baixa.create>[0] = {
  id: 'baixa-id-1',
  solicitadoPor: 'user-id-1',
  perfilSolicitante: 'USUARIO',
  status: StatusBaixa.PENDENTE,
  justificativa: 'Item quebrado durante uso normal',
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeBaixa = (overrides: Partial<typeof BASE> = {}) =>
  Baixa.create({ ...BASE, ...overrides })

describe('Baixa', () => {
  describe('create', () => {
    it('cria uma baixa válida no status PENDENTE', () => {
      const b = makeBaixa()
      expect(b.status).toBe(StatusBaixa.PENDENTE)
      expect(b.solicitadoPor).toBe('user-id-1')
      expect(b.perfilSolicitante).toBe('USUARIO')
      expect(b.aprovadoTecnicoPor).toBeNull()
      expect(b.aprovadoGestorPor).toBeNull()
      expect(b.executadoPor).toBeNull()
    })

    it('lança DomainError quando solicitadoPor está vazio', () => {
      expect(() => makeBaixa({ solicitadoPor: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando justificativa está vazia', () => {
      expect(() => makeBaixa({ justificativa: '' })).toThrow(DomainError)
      expect(() => makeBaixa({ justificativa: '   ' })).toThrow(DomainError)
    })

    it('lança DomainError quando justificativa excede 512 caracteres', () => {
      expect(() => makeBaixa({ justificativa: 'a'.repeat(513) })).toThrow(DomainError)
    })

    it('aceita justificativa com exatamente 512 caracteres', () => {
      const b = makeBaixa({ justificativa: 'a'.repeat(512) })
      expect(b.justificativa).toHaveLength(512)
    })
  })

  describe('aprovarTecnico', () => {
    it('transiciona PENDENTE → APROVADO_TECNICO', () => {
      const b = makeBaixa()
      const aprovada = b.aprovarTecnico('tecnico-id')
      expect(aprovada.status).toBe(StatusBaixa.APROVADO_TECNICO)
      expect(aprovada.aprovadoTecnicoPor).toBe('tecnico-id')
      expect(aprovada.aprovadoTecnicoEm).toBeDefined()
    })

    it('não muta o objeto original', () => {
      const b = makeBaixa()
      b.aprovarTecnico('tecnico-id')
      expect(b.status).toBe(StatusBaixa.PENDENTE)
    })

    it('lança DomainError quando status não é PENDENTE', () => {
      const aprovada = makeBaixa({ status: StatusBaixa.APROVADO_TECNICO })
      expect(() => aprovada.aprovarTecnico('tecnico-id')).toThrow(DomainError)
    })

    it('lança DomainError ao tentar aprovar baixa APROVADO_GESTOR', () => {
      const aprovadaGestor = makeBaixa({ status: StatusBaixa.APROVADO_GESTOR })
      expect(() => aprovadaGestor.aprovarTecnico('tecnico-id')).toThrow(DomainError)
    })
  })

  describe('aprovarGestor', () => {
    it('transiciona APROVADO_TECNICO → APROVADO_GESTOR', () => {
      const b = makeBaixa({ status: StatusBaixa.APROVADO_TECNICO })
      const aprovada = b.aprovarGestor('gestor-id')
      expect(aprovada.status).toBe(StatusBaixa.APROVADO_GESTOR)
      expect(aprovada.aprovadoGestorPor).toBe('gestor-id')
      expect(aprovada.aprovadoGestorEm).toBeDefined()
    })

    it('lança DomainError quando status é PENDENTE', () => {
      const pendente = makeBaixa()
      expect(() => pendente.aprovarGestor('gestor-id')).toThrow(DomainError)
    })

    it('lança DomainError quando status já é APROVADO_GESTOR', () => {
      const aprovadaGestor = makeBaixa({ status: StatusBaixa.APROVADO_GESTOR })
      expect(() => aprovadaGestor.aprovarGestor('gestor-id')).toThrow(DomainError)
    })
  })

  describe('rejeitar', () => {
    it('rejeita a partir de PENDENTE', () => {
      const b = makeBaixa()
      const rejeitada = b.rejeitar('gestor-id', 'Item ainda utilizável')
      expect(rejeitada.status).toBe(StatusBaixa.REJEITADO)
      expect(rejeitada.rejeitadoPor).toBe('gestor-id')
      expect(rejeitada.motivoRejeicao).toBe('Item ainda utilizável')
      expect(rejeitada.rejeitadoEm).toBeDefined()
    })

    it('rejeita a partir de APROVADO_TECNICO', () => {
      const b = makeBaixa({ status: StatusBaixa.APROVADO_TECNICO })
      const rejeitada = b.rejeitar('gestor-id', 'Reconsiderado')
      expect(rejeitada.status).toBe(StatusBaixa.REJEITADO)
    })

    it('lança DomainError quando motivo está vazio', () => {
      const b = makeBaixa()
      expect(() => b.rejeitar('gestor-id', '')).toThrow(DomainError)
      expect(() => b.rejeitar('gestor-id', '   ')).toThrow(DomainError)
    })

    it('lança DomainError quando status é APROVADO_GESTOR', () => {
      const b = makeBaixa({ status: StatusBaixa.APROVADO_GESTOR })
      expect(() => b.rejeitar('gestor-id', 'Motivo')).toThrow(DomainError)
    })

    it('lança DomainError quando status é CONCLUIDO', () => {
      const b = makeBaixa({ status: StatusBaixa.CONCLUIDO })
      expect(() => b.rejeitar('gestor-id', 'Motivo')).toThrow(DomainError)
    })
  })

  describe('concluir', () => {
    it('transiciona APROVADO_GESTOR → CONCLUIDO', () => {
      const b = makeBaixa({ status: StatusBaixa.APROVADO_GESTOR })
      const concluida = b.concluir('inventariante-id')
      expect(concluida.status).toBe(StatusBaixa.CONCLUIDO)
      expect(concluida.executadoPor).toBe('inventariante-id')
      expect(concluida.executadoEm).toBeDefined()
    })

    it('lança DomainError quando status não é APROVADO_GESTOR', () => {
      const pendente = makeBaixa()
      expect(() => pendente.concluir('inventariante-id')).toThrow(DomainError)
    })

    it('lança DomainError quando status é APROVADO_TECNICO', () => {
      const aprovadaTecnico = makeBaixa({ status: StatusBaixa.APROVADO_TECNICO })
      expect(() => aprovadaTecnico.concluir('inventariante-id')).toThrow(DomainError)
    })
  })
})
