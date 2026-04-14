import { describe, it, expect } from 'vitest'
import { Categoria } from '@/domain/inventario/categoria.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE: Parameters<typeof Categoria.create>[0] = {
  id: 'cat-id-1',
  nome: 'Equipamentos de Proteção',
  descricao: 'EPIs em geral',
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeCategoria = (overrides: Partial<typeof BASE> = {}) =>
  Categoria.create({ ...BASE, ...overrides })

describe('Categoria', () => {
  describe('create', () => {
    it('cria categoria válida com todos os campos', () => {
      const cat = makeCategoria()
      expect(cat.id).toBe('cat-id-1')
      expect(cat.nome).toBe('Equipamentos de Proteção')
      expect(cat.descricao).toBe('EPIs em geral')
    })

    it('descricao é null quando não informada', () => {
      const cat = makeCategoria({ descricao: undefined })
      expect(cat.descricao).toBeNull()
    })

    it('descricao é null quando null explícito', () => {
      const cat = makeCategoria({ descricao: null })
      expect(cat.descricao).toBeNull()
    })

    it('lança DomainError quando nome está vazio', () => {
      expect(() => makeCategoria({ nome: '' })).toThrow(DomainError)
      expect(() => makeCategoria({ nome: '   ' })).toThrow(DomainError)
    })

    it('lança DomainError quando nome excede 100 caracteres', () => {
      expect(() => makeCategoria({ nome: 'A'.repeat(101) })).toThrow(DomainError)
    })

    it('aceita nome com exatamente 100 caracteres', () => {
      const cat = makeCategoria({ nome: 'A'.repeat(100) })
      expect(cat.nome).toHaveLength(100)
    })

    it('lança DomainError quando descricao excede 512 caracteres', () => {
      expect(() => makeCategoria({ descricao: 'X'.repeat(513) })).toThrow(DomainError)
    })

    it('aceita descricao com exatamente 512 caracteres', () => {
      const cat = makeCategoria({ descricao: 'X'.repeat(512) })
      expect(cat.descricao).toHaveLength(512)
    })
  })

  describe('atualizar', () => {
    it('atualiza nome', () => {
      const cat = makeCategoria()
      const atualizada = cat.atualizar({ nome: 'Novo Nome' })
      expect(atualizada.nome).toBe('Novo Nome')
      expect(atualizada.id).toBe(cat.id)
    })

    it('atualiza descricao', () => {
      const cat = makeCategoria()
      const atualizada = cat.atualizar({ descricao: 'Nova descrição' })
      expect(atualizada.descricao).toBe('Nova descrição')
    })

    it('preserva campos não alterados', () => {
      const cat = makeCategoria()
      const atualizada = cat.atualizar({ nome: 'Novo' })
      expect(atualizada.id).toBe(cat.id)
      expect(atualizada.criadoEm).toEqual(cat.criadoEm)
    })

    it('atualiza atualizadoEm', () => {
      const cat = makeCategoria()
      const atualizada = cat.atualizar({ nome: 'Novo' })
      expect(atualizada.atualizadoEm.getTime()).toBeGreaterThanOrEqual(cat.atualizadoEm.getTime())
    })
  })
})
