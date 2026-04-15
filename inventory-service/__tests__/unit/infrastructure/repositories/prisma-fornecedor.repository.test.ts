import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaFornecedorRepository } from '@infrastructure/repositories/prisma-fornecedor.repository'
import { Fornecedor } from '@/domain/inventario/fornecedor.entity'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    fornecedor: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@infrastructure/database/prisma.client'

const repo = new PrismaFornecedorRepository()

const record = {
  id: 'forn-id-1',
  nome: 'Fornecedor ABC',
  cnpj: null,
  email: null,
  telefone: null,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeFornecedor = () => Fornecedor.create({ ...record })

describe('PrismaFornecedorRepository', () => {
  beforeEach(() => {
    vi.mocked(prisma.fornecedor.create).mockResolvedValue(record as any)
    vi.mocked(prisma.fornecedor.findUnique).mockResolvedValue(record as any)
    vi.mocked(prisma.fornecedor.findMany).mockResolvedValue([record] as any)
    vi.mocked(prisma.fornecedor.update).mockResolvedValue(record as any)
  })

  describe('criar', () => {
    it('cria e retorna domínio', async () => {
      const result = await repo.criar(makeFornecedor())
      expect(result).toBeInstanceOf(Fornecedor)
      expect(result.nome).toBe('Fornecedor ABC')
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.fornecedor.create).mockRejectedValue(new Error('db error'))
      await expect(repo.criar(makeFornecedor())).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorId', () => {
    it('retorna fornecedor quando encontrado', async () => {
      const result = await repo.buscarPorId('forn-id-1')
      expect(result).toBeInstanceOf(Fornecedor)
    })

    it('retorna null quando não encontrado', async () => {
      vi.mocked(prisma.fornecedor.findUnique).mockResolvedValue(null)
      const result = await repo.buscarPorId('inexistente')
      expect(result).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.fornecedor.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorId('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorCnpj', () => {
    it('retorna fornecedor quando encontrado', async () => {
      const result = await repo.buscarPorCnpj('12345678000195')
      expect(result).toBeInstanceOf(Fornecedor)
    })

    it('retorna null quando não encontrado', async () => {
      vi.mocked(prisma.fornecedor.findUnique).mockResolvedValue(null)
      const result = await repo.buscarPorCnpj('00000000000000')
      expect(result).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.fornecedor.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorCnpj('cnpj')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listar', () => {
    it('retorna lista com paginação padrão', async () => {
      const result = await repo.listar()
      expect(prisma.fornecedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 })
      )
      expect(result).toHaveLength(1)
    })

    it('aplica paginação customizada', async () => {
      await repo.listar({ pagina: 3, limite: 5 })
      expect(prisma.fornecedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, skip: 10 })
      )
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.fornecedor.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listar()).rejects.toThrow(RepositoryError)
    })
  })

  describe('atualizar', () => {
    it('atualiza e retorna domínio', async () => {
      const result = await repo.atualizar(makeFornecedor())
      expect(result).toBeInstanceOf(Fornecedor)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.fornecedor.update).mockRejectedValue(new Error('db error'))
      await expect(repo.atualizar(makeFornecedor())).rejects.toThrow(RepositoryError)
    })
  })
})
