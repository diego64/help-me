import { describe, it, expect } from 'vitest'
import { Fornecedor } from '@/domain/inventario/fornecedor.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE: Parameters<typeof Fornecedor.create>[0] = {
  id: 'forn-id-1',
  nome: 'Fornecedor ABC',
  cnpj: '12345678000195',
  email: 'contato@abc.com.br',
  telefone: '11999990000',
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeFornecedor = (overrides: Partial<typeof BASE> = {}) =>
  Fornecedor.create({ ...BASE, ...overrides })

describe('Fornecedor', () => {
  describe('create', () => {
    it('cria fornecedor válido com todos os campos', () => {
      const f = makeFornecedor()
      expect(f.id).toBe('forn-id-1')
      expect(f.nome).toBe('Fornecedor ABC')
      expect(f.cnpj).toBe('12345678000195')
      expect(f.email).toBe('contato@abc.com.br')
    })

    it('campos opcionais são null quando não informados', () => {
      const f = makeFornecedor({ cnpj: null, email: null, telefone: null })
      expect(f.cnpj).toBeNull()
      expect(f.email).toBeNull()
      expect(f.telefone).toBeNull()
    })

    it('lança DomainError quando nome está vazio', () => {
      expect(() => makeFornecedor({ nome: '' })).toThrow(DomainError)
      expect(() => makeFornecedor({ nome: '   ' })).toThrow(DomainError)
    })

    it('lança DomainError quando nome excede 100 caracteres', () => {
      expect(() => makeFornecedor({ nome: 'A'.repeat(101) })).toThrow(DomainError)
    })

    it('aceita nome com exatamente 100 caracteres', () => {
      const f = makeFornecedor({ nome: 'A'.repeat(100) })
      expect(f.nome).toHaveLength(100)
    })

    it('lança DomainError quando CNPJ tem menos de 14 dígitos', () => {
      expect(() => makeFornecedor({ cnpj: '123456' })).toThrow(DomainError)
    })

    it('lança DomainError quando CNPJ tem mais de 14 dígitos numéricos', () => {
      expect(() => makeFornecedor({ cnpj: '123456780001950000' })).toThrow(DomainError)
    })

    it('aceita CNPJ formatado (14 dígitos após remover não-numéricos)', () => {
      const f = makeFornecedor({ cnpj: '12.345.678/0001-95' })
      expect(f.cnpj).toBe('12.345.678/0001-95')
    })

    it('lança DomainError quando email é inválido', () => {
      expect(() => makeFornecedor({ email: 'nao-e-email' })).toThrow(DomainError)
      expect(() => makeFornecedor({ email: '@sem-usuario.com' })).toThrow(DomainError)
    })

    it('aceita email válido', () => {
      const f = makeFornecedor({ email: 'valido@dominio.com.br' })
      expect(f.email).toBe('valido@dominio.com.br')
    })
  })

  describe('atualizar', () => {
    it('atualiza nome', () => {
      const f = makeFornecedor()
      const atualizado = f.atualizar({ nome: 'Novo Nome' })
      expect(atualizado.nome).toBe('Novo Nome')
    })

    it('atualiza email', () => {
      const f = makeFornecedor()
      const atualizado = f.atualizar({ email: 'novo@email.com' })
      expect(atualizado.email).toBe('novo@email.com')
    })

    it('preserva campos não alterados', () => {
      const f = makeFornecedor()
      const atualizado = f.atualizar({ nome: 'Novo' })
      expect(atualizado.id).toBe(f.id)
      expect(atualizado.cnpj).toBe(f.cnpj)
    })

    it('atualiza atualizadoEm', () => {
      const f = makeFornecedor()
      const atualizado = f.atualizar({ nome: 'Novo' })
      expect(atualizado.atualizadoEm.getTime()).toBeGreaterThanOrEqual(f.atualizadoEm.getTime())
    })
  })
})
