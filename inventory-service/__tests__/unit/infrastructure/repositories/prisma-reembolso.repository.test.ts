import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaReembolsoRepository } from '@infrastructure/repositories/prisma-reembolso.repository'
import { Reembolso, StatusReembolso } from '@/domain/reembolso/reembolso.entity'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    reembolso: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@infrastructure/database/prisma.client'

const repo = new PrismaReembolsoRepository()

const record = {
  id: 'reimb-id-1',
  solicitadoPor: 'user-id-1',
  solicitacaoCompraId: 'sc-id-1',
  valor: { toNumber: () => 1500.00 },
  descricao: 'Reembolso de notebook',
  urlComprovante: null,
  status: 'PENDENTE',
  nfe: null,
  dataEmissao: null,
  cnpjFornecedor: null,
  aprovadoPor: null,
  aprovadoEm: null,
  rejeitadoPor: null,
  rejeitadoEm: null,
  motivoRejeicao: null,
  processadoPor: null,
  processadoEm: null,
  observacoes: null,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const makeReembolso = () =>
  Reembolso.create({
    id: 'reimb-id-1',
    solicitadoPor: 'user-id-1',
    valor: 1500.00,
    descricao: 'Reembolso de notebook',
    status: StatusReembolso.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('PrismaReembolsoRepository', () => {
  beforeEach(() => {
    vi.mocked(prisma.reembolso.create).mockResolvedValue(record as any)
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(record as any)
    vi.mocked(prisma.reembolso.findMany).mockResolvedValue([record] as any)
    vi.mocked(prisma.reembolso.update).mockResolvedValue(record as any)
  })

  describe('criar', () => {
    it('cria e retorna domínio', async () => {
      const result = await repo.criar(makeReembolso())
      expect(result).toBeInstanceOf(Reembolso)
      expect(result.valor).toBe(1500.00)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.reembolso.create).mockRejectedValue(new Error('db error'))
      await expect(repo.criar(makeReembolso())).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorId', () => {
    it('retorna reembolso quando encontrado', async () => {
      const result = await repo.buscarPorId('reimb-id-1')
      expect(result).toBeInstanceOf(Reembolso)
    })

    it('retorna null quando não encontrado', async () => {
      vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorId('inexistente')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.reembolso.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorId('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorSolicitacaoCompra', () => {
    it('retorna reembolso quando encontrado', async () => {
      const result = await repo.buscarPorSolicitacaoCompra('sc-id-1')
      expect(result).toBeInstanceOf(Reembolso)
    })

    it('retorna null quando não encontrado', async () => {
      vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorSolicitacaoCompra('sc-inexistente')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.reembolso.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorSolicitacaoCompra('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listar', () => {
    it('lista sem filtros', async () => {
      const result = await repo.listar()
      expect(result).toHaveLength(1)
    })

    it('lista com filtros de status e solicitadoPor', async () => {
      await repo.listar({ status: StatusReembolso.PENDENTE, solicitadoPor: 'user-id-1', pagina: 2, limite: 5 })
      expect(prisma.reembolso.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, skip: 5 })
      )
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.reembolso.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listar()).rejects.toThrow(RepositoryError)
    })
  })

  describe('atualizar', () => {
    it('atualiza e retorna domínio', async () => {
      const result = await repo.atualizar(makeReembolso())
      expect(result).toBeInstanceOf(Reembolso)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.reembolso.update).mockRejectedValue(new Error('db error'))
      await expect(repo.atualizar(makeReembolso())).rejects.toThrow(RepositoryError)
    })
  })
})
