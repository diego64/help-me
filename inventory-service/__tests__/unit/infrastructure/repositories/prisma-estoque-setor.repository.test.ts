import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaEstoqueSetorRepository } from '@infrastructure/repositories/prisma-estoque-setor.repository'
import { EstoqueSetor } from '@/domain/inventario/estoque-setor.entity'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    estoqueSetor: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@infrastructure/database/prisma.client'

const repo = new PrismaEstoqueSetorRepository()

const record = {
  id: 'es-id-1',
  itemInventarioId: 'item-id-1',
  setor: 'TI',
  quantidade: 2,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

describe('PrismaEstoqueSetorRepository', () => {
  beforeEach(() => {
    vi.mocked(prisma.estoqueSetor.upsert).mockResolvedValue(record as any)
    vi.mocked(prisma.estoqueSetor.findMany).mockResolvedValue([record] as any)
  })

  describe('upsert', () => {
    it('faz upsert e retorna domínio', async () => {
      const result = await repo.upsert('item-id-1', 'TI', 2)
      expect(result).toBeInstanceOf(EstoqueSetor)
      expect(result.setor).toBe('TI')
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.estoqueSetor.upsert).mockRejectedValue(new Error('db error'))
      await expect(repo.upsert('item-id-1', 'TI', 2)).rejects.toThrow(RepositoryError)
    })
  })

  describe('listarPorSetor', () => {
    it('retorna lista com dados do item', async () => {
      const result = await repo.listarPorSetor('TI')
      expect(prisma.estoqueSetor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ setor: expect.objectContaining({ equals: 'TI' }) }) })
      )
      expect(result).toHaveLength(1)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.estoqueSetor.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listarPorSetor('TI')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listarPorItem', () => {
    it('retorna estoque por item', async () => {
      const result = await repo.listarPorItem('item-id-1')
      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(EstoqueSetor)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.estoqueSetor.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listarPorItem('item-id-1')).rejects.toThrow(RepositoryError)
    })
  })
})
