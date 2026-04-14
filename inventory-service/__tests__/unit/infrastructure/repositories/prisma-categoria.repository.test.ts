import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaCategoriaRepository } from '@infrastructure/repositories/prisma-categoria.repository'
import { Categoria } from '@/domain/inventario/categoria.entity'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    categoria: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from '@infrastructure/database/prisma.client'

const repo = new PrismaCategoriaRepository()

const record = {
  id: 'cat-id-1',
  nome: 'EPIs',
  descricao: null,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeCategoria = () =>
  Categoria.create({ ...record })

describe('PrismaCategoriaRepository', () => {
  beforeEach(() => {
    vi.mocked(prisma.categoria.create).mockResolvedValue(record as any)
    vi.mocked(prisma.categoria.findUnique).mockResolvedValue(record as any)
    vi.mocked(prisma.categoria.findMany).mockResolvedValue([record] as any)
    vi.mocked(prisma.categoria.update).mockResolvedValue(record as any)
    vi.mocked(prisma.categoria.delete).mockResolvedValue(record as any)
  })

  describe('criar', () => {
    it('cria e retorna domínio', async () => {
      const result = await repo.criar(makeCategoria())

      expect(prisma.categoria.create).toHaveBeenCalledOnce()
      expect(result).toBeInstanceOf(Categoria)
      expect(result.nome).toBe('EPIs')
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.categoria.create).mockRejectedValue(new Error('db error'))

      await expect(repo.criar(makeCategoria())).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorId', () => {
    it('retorna categoria quando encontrada', async () => {
      const result = await repo.buscarPorId('cat-id-1')
      expect(result).toBeInstanceOf(Categoria)
    })

    it('retorna null quando não encontrada', async () => {
      vi.mocked(prisma.categoria.findUnique).mockResolvedValue(null)
      const result = await repo.buscarPorId('inexistente')
      expect(result).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.categoria.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorId('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorNome', () => {
    it('retorna categoria quando encontrada', async () => {
      const result = await repo.buscarPorNome('EPIs')
      expect(result).toBeInstanceOf(Categoria)
    })

    it('retorna null quando não encontrada', async () => {
      vi.mocked(prisma.categoria.findUnique).mockResolvedValue(null)
      const result = await repo.buscarPorNome('inexistente')
      expect(result).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.categoria.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorNome('nome')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listar', () => {
    it('retorna lista de categorias com paginação padrão', async () => {
      const result = await repo.listar()

      expect(prisma.categoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 })
      )
      expect(result).toHaveLength(1)
    })

    it('aplica paginação customizada', async () => {
      await repo.listar({ pagina: 2, limite: 10 })

      expect(prisma.categoria.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 10 })
      )
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.categoria.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listar()).rejects.toThrow(RepositoryError)
    })
  })

  describe('atualizar', () => {
    it('atualiza e retorna domínio', async () => {
      const result = await repo.atualizar(makeCategoria())
      expect(result).toBeInstanceOf(Categoria)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.categoria.update).mockRejectedValue(new Error('db error'))
      await expect(repo.atualizar(makeCategoria())).rejects.toThrow(RepositoryError)
    })
  })

  describe('deletar', () => {
    it('deleta sem retorno', async () => {
      await expect(repo.deletar('cat-id-1')).resolves.toBeUndefined()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.categoria.delete).mockRejectedValue(new Error('db error'))
      await expect(repo.deletar('id')).rejects.toThrow(RepositoryError)
    })
  })
})
