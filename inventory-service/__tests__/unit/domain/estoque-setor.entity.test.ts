import { describe, it, expect } from 'vitest'
import { EstoqueSetor } from '@/domain/inventario/estoque-setor.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE: Parameters<typeof EstoqueSetor.create>[0] = {
  id: 'estoque-setor-id-1',
  itemInventarioId: 'item-id-1',
  setor: 'TECNOLOGIA_INFORMACAO',
  quantidade: 3,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeEstoque = (overrides: Partial<typeof BASE> = {}) =>
  EstoqueSetor.create({ ...BASE, ...overrides })

describe('EstoqueSetor', () => {
  describe('create', () => {
    it('cria um registro válido', () => {
      const e = makeEstoque()
      expect(e.setor).toBe('TECNOLOGIA_INFORMACAO')
      expect(e.quantidade).toBe(3)
      expect(e.itemInventarioId).toBe('item-id-1')
    })

    it('aceita quantidade igual a zero', () => {
      const e = makeEstoque({ quantidade: 0 })
      expect(e.quantidade).toBe(0)
    })

    it('lança DomainError quando itemInventarioId está vazio', () => {
      expect(() => makeEstoque({ itemInventarioId: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando setor está vazio', () => {
      expect(() => makeEstoque({ setor: '' })).toThrow(DomainError)
      expect(() => makeEstoque({ setor: '   ' })).toThrow(DomainError)
    })

    it('lança DomainError quando quantidade é negativa', () => {
      expect(() => makeEstoque({ quantidade: -1 })).toThrow(DomainError)
    })
  })

  describe('adicionar', () => {
    it('soma quantidade ao estoque do setor', () => {
      const e = makeEstoque({ quantidade: 3 })
      const atualizado = e.adicionar(2)
      expect(atualizado.quantidade).toBe(5)
    })

    it('não muta o objeto original', () => {
      const e = makeEstoque({ quantidade: 3 })
      e.adicionar(2)
      expect(e.quantidade).toBe(3)
    })

    it('lança DomainError quando quantidade é zero', () => {
      expect(() => makeEstoque().adicionar(0)).toThrow(DomainError)
    })

    it('lança DomainError quando quantidade é negativa', () => {
      expect(() => makeEstoque().adicionar(-1)).toThrow(DomainError)
    })
  })
})
