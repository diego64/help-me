import { describe, it, expect } from 'vitest'
import {
  MovimentacaoEstoque,
  TipoMovimentacao,
  MotivoMovimentacao,
} from '@/domain/inventario/movimentacao-estoque.entity'
import { DomainError } from '@/domain/shared/domain.error'

const BASE_ENTRADA: Parameters<typeof MovimentacaoEstoque.create>[0] = {
  id: 'mov-id-1',
  itemId: 'item-id-1',
  tipo: TipoMovimentacao.ENTRADA,
  motivo: MotivoMovimentacao.COMPRA,
  quantidade: 3,
  estoqueBefore: 5,
  estoqueAfter: 8,
  realizadoPor: 'user-id-1',
  criadoEm: new Date('2024-01-01'),
}

const BASE_SAIDA: Parameters<typeof MovimentacaoEstoque.create>[0] = {
  id: 'mov-id-2',
  itemId: 'item-id-1',
  tipo: TipoMovimentacao.SAIDA,
  motivo: MotivoMovimentacao.BAIXA,
  quantidade: 2,
  estoqueBefore: 5,
  estoqueAfter: 3,
  realizadoPor: 'user-id-1',
  criadoEm: new Date('2024-01-01'),
}

describe('MovimentacaoEstoque', () => {
  describe('create — ENTRADA', () => {
    it('cria movimentação de entrada válida', () => {
      const mov = MovimentacaoEstoque.create(BASE_ENTRADA)
      expect(mov.tipo).toBe(TipoMovimentacao.ENTRADA)
      expect(mov.motivo).toBe(MotivoMovimentacao.COMPRA)
      expect(mov.quantidade).toBe(3)
      expect(mov.estoqueBefore).toBe(5)
      expect(mov.estoqueAfter).toBe(8)
      expect(mov.referenciaId).toBeNull()
    })

    it('aceita campos opcionais', () => {
      const mov = MovimentacaoEstoque.create({
        ...BASE_ENTRADA,
        referenciaId: 'compra-id-1',
        observacoes: 'Compra de reposição',
        setorDestinoId: 'TECNOLOGIA',
        setorDestinoNome: 'TECNOLOGIA_INFORMACAO',
      })
      expect(mov.referenciaId).toBe('compra-id-1')
      expect(mov.observacoes).toBe('Compra de reposição')
      expect(mov.setorDestinoId).toBe('TECNOLOGIA')
    })

    it('lança DomainError quando itemId está vazio', () => {
      expect(() => MovimentacaoEstoque.create({ ...BASE_ENTRADA, itemId: '' })).toThrow(DomainError)
    })

    it('lança DomainError quando quantidade é zero', () => {
      expect(() =>
        MovimentacaoEstoque.create({ ...BASE_ENTRADA, quantidade: 0, estoqueAfter: 5 })
      ).toThrow(DomainError)
    })

    it('lança DomainError quando quantidade é negativa', () => {
      expect(() =>
        MovimentacaoEstoque.create({ ...BASE_ENTRADA, quantidade: -1, estoqueAfter: 4 })
      ).toThrow(DomainError)
    })

    it('lança DomainError quando estoqueBefore é negativo', () => {
      expect(() =>
        MovimentacaoEstoque.create({ ...BASE_ENTRADA, estoqueBefore: -1, estoqueAfter: 2 })
      ).toThrow(DomainError)
    })

    it('lança DomainError quando estoqueAfter é negativo', () => {
      expect(() =>
        MovimentacaoEstoque.create({ ...BASE_ENTRADA, estoqueBefore: 0, estoqueAfter: -1 })
      ).toThrow(DomainError)
    })

    it('lança DomainError quando realizadoPor está vazio', () => {
      expect(() =>
        MovimentacaoEstoque.create({ ...BASE_ENTRADA, realizadoPor: '' })
      ).toThrow(DomainError)
    })

    it('lança DomainError quando saldos são inconsistentes para ENTRADA', () => {
      // before=5, qtd=3, after deveria ser 8 — passando 7 é inconsistente
      expect(() =>
        MovimentacaoEstoque.create({ ...BASE_ENTRADA, estoqueBefore: 5, quantidade: 3, estoqueAfter: 7 })
      ).toThrow(DomainError)
    })
  })

  describe('create — SAIDA', () => {
    it('cria movimentação de saída válida', () => {
      const mov = MovimentacaoEstoque.create(BASE_SAIDA)
      expect(mov.tipo).toBe(TipoMovimentacao.SAIDA)
      expect(mov.estoqueAfter).toBe(3)
    })

    it('lança DomainError quando saldos são inconsistentes para SAIDA', () => {
      // before=5, qtd=2, after deveria ser 3 — passando 4 é inconsistente
      expect(() =>
        MovimentacaoEstoque.create({ ...BASE_SAIDA, estoqueBefore: 5, quantidade: 2, estoqueAfter: 4 })
      ).toThrow(DomainError)
    })

    it('aceita saída que leva estoque a zero', () => {
      const mov = MovimentacaoEstoque.create({
        ...BASE_SAIDA,
        estoqueBefore: 2,
        quantidade: 2,
        estoqueAfter: 0,
      })
      expect(mov.estoqueAfter).toBe(0)
    })
  })
})
