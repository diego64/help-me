import { describe, it, expect } from 'vitest'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE: Parameters<typeof ItemInventario.create>[0] = {
  id: 'item-id-1',
  numero: 'INV0000001',
  nome: 'Notebook Dell',
  sku: 'ELE-NOTE-001',
  unidade: UnidadeMedida.UN,
  estoqueAtual: 5,
  estoqueMinimo: 2,
  categoriaId: 'cat-id-1',
  criadoPor: 'user-id-1',
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeItem = (overrides: Partial<typeof BASE> = {}) =>
  ItemInventario.create({ ...BASE, ...overrides })

describe('ItemInventario', () => {
  describe('create', () => {
    it('cria um item válido com todos os campos', () => {
      const item = makeItem()
      expect(item.numero).toBe('INV0000001')
      expect(item.nome).toBe('Notebook Dell')
      expect(item.estoqueAtual).toBe(5)
      expect(item.estoqueMinimo).toBe(2)
      expect(item.descricao).toBeNull()
      expect(item.ocNumero).toBeNull()
    })

    it('aceita campos opcionais', () => {
      const item = makeItem({ descricao: 'Notebook para uso corporativo', ocNumero: 'OC0000001' })
      expect(item.descricao).toBe('Notebook para uso corporativo')
      expect(item.ocNumero).toBe('OC0000001')
    })

    it('lança DomainError quando número está vazio', () => {
      expect(() => makeItem({ numero: '' })).toThrow(DomainError)
      expect(() => makeItem({ numero: '   ' })).toThrow(DomainError)
    })

    it('lança DomainError quando nome está vazio', () => {
      expect(() => makeItem({ nome: '' })).toThrow(DomainError)
      expect(() => makeItem({ nome: '   ' })).toThrow(DomainError)
    })

    it('lança DomainError quando sku está vazio', () => {
      expect(() => makeItem({ sku: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando unidade está vazia', () => {
      expect(() => makeItem({ unidade: '' as UnidadeMedida })).toThrow(DomainError)
    })

    it('lança DomainError quando estoqueAtual é negativo', () => {
      expect(() => makeItem({ estoqueAtual: -1 })).toThrow(DomainError)
    })

    it('aceita estoqueAtual igual a zero', () => {
      const item = makeItem({ estoqueAtual: 0 })
      expect(item.estoqueAtual).toBe(0)
    })

    it('lança DomainError quando estoqueMinimo é negativo', () => {
      expect(() => makeItem({ estoqueMinimo: -1 })).toThrow(DomainError)
    })

    it('lança DomainError quando categoriaId está vazio', () => {
      expect(() => makeItem({ categoriaId: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando criadoPor está vazio', () => {
      expect(() => makeItem({ criadoPor: '' })).toThrow(DomainError)
    })
  })

  describe('estoqueCritico', () => {
    it('retorna true quando estoqueAtual é menor que estoqueMinimo', () => {
      const item = makeItem({ estoqueAtual: 1, estoqueMinimo: 2 })
      expect(item.estoqueCritico).toBe(true)
    })

    it('retorna true quando estoqueAtual é igual ao estoqueMinimo', () => {
      const item = makeItem({ estoqueAtual: 2, estoqueMinimo: 2 })
      expect(item.estoqueCritico).toBe(true)
    })

    it('retorna false quando estoqueAtual é maior que estoqueMinimo', () => {
      const item = makeItem({ estoqueAtual: 3, estoqueMinimo: 2 })
      expect(item.estoqueCritico).toBe(false)
    })
  })

  describe('semEstoque', () => {
    it('retorna true quando estoqueAtual é zero', () => {
      const item = makeItem({ estoqueAtual: 0 })
      expect(item.semEstoque).toBe(true)
    })

    it('retorna false quando estoqueAtual é maior que zero', () => {
      const item = makeItem({ estoqueAtual: 1 })
      expect(item.semEstoque).toBe(false)
    })
  })

  describe('registrarEntrada', () => {
    it('incrementa o estoque corretamente', () => {
      const item = makeItem({ estoqueAtual: 5 })
      const atualizado = item.registrarEntrada(3)
      expect(atualizado.estoqueAtual).toBe(8)
    })

    it('não muta o item original (imutabilidade)', () => {
      const item = makeItem({ estoqueAtual: 5 })
      item.registrarEntrada(3)
      expect(item.estoqueAtual).toBe(5)
    })

    it('lança DomainError quando quantidade é zero', () => {
      expect(() => makeItem().registrarEntrada(0)).toThrow(DomainError)
    })

    it('lança DomainError quando quantidade é negativa', () => {
      expect(() => makeItem().registrarEntrada(-1)).toThrow(DomainError)
    })
  })

  describe('registrarSaida', () => {
    it('decrementa o estoque corretamente', () => {
      const item = makeItem({ estoqueAtual: 5 })
      const atualizado = item.registrarSaida(2)
      expect(atualizado.estoqueAtual).toBe(3)
    })

    it('permite saída que leva o estoque a zero', () => {
      const item = makeItem({ estoqueAtual: 3 })
      const atualizado = item.registrarSaida(3)
      expect(atualizado.estoqueAtual).toBe(0)
    })

    it('não muta o item original (imutabilidade)', () => {
      const item = makeItem({ estoqueAtual: 5 })
      item.registrarSaida(2)
      expect(item.estoqueAtual).toBe(5)
    })

    it('lança DomainError quando quantidade excede estoque disponível', () => {
      const item = makeItem({ estoqueAtual: 2 })
      expect(() => item.registrarSaida(3)).toThrow(DomainError)
    })

    it('lança DomainError quando quantidade é zero', () => {
      expect(() => makeItem().registrarSaida(0)).toThrow(DomainError)
    })

    it('lança DomainError quando quantidade é negativa', () => {
      expect(() => makeItem().registrarSaida(-1)).toThrow(DomainError)
    })
  })

  describe('atualizar', () => {
    it('atualiza apenas os campos informados', () => {
      const item = makeItem()
      const atualizado = item.atualizar({ nome: 'Novo Nome', estoqueMinimo: 10 })
      expect(atualizado.nome).toBe('Novo Nome')
      expect(atualizado.estoqueMinimo).toBe(10)
      expect(atualizado.sku).toBe(item.sku)
      expect(atualizado.estoqueAtual).toBe(item.estoqueAtual)
    })

    it('preserva os campos não alterados', () => {
      const item = makeItem()
      const atualizado = item.atualizar({ descricao: 'Atualizado' })
      expect(atualizado.nome).toBe(item.nome)
      expect(atualizado.categoriaId).toBe(item.categoriaId)
    })
  })
})
