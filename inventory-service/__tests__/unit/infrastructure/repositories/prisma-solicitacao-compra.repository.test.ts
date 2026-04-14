import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaSolicitacaoCompraRepository } from '@infrastructure/repositories/prisma-solicitacao-compra.repository'
import { SolicitacaoCompra, StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity'
import { ItemSolicitacaoCompra } from '@/domain/compra/item-solicitacao-compra.entity'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    solicitacaoCompra: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    itemSolicitacaoCompra: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@infrastructure/database/prisma.client'

const repo = new PrismaSolicitacaoCompraRepository()

const scRecord = {
  id: 'sc-id-1',
  acNumero: 'AC0000001',
  ocNumero: 'OC0000001',
  solicitadoPor: 'user-id-1',
  setorSolicitante: null,
  fornecedorId: null,
  status: 'PENDENTE',
  justificativa: null,
  formaPagamento: null,
  parcelas: null,
  aprovadoPor: null,
  aprovadoEm: null,
  rejeitadoPor: null,
  rejeitadoEm: null,
  motivoRejeicao: null,
  executadoPor: null,
  executadoEm: null,
  valorTotal: null,
  observacoes: null,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const itemScRecord = {
  id: 'isc-id-1',
  solicitacaoCompraId: 'sc-id-1',
  itemInventarioId: null,
  nomeProduto: 'Capacete',
  quantidade: 2,
  precoEstimado: null,
  precoReal: null,
}

const makeSolicitacao = () =>
  SolicitacaoCompra.create({
    id: 'sc-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status: StatusSolicitacaoCompra.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeItemSolicitacao = () =>
  ItemSolicitacaoCompra.create({
    id: 'isc-id-1',
    solicitacaoCompraId: 'sc-id-1',
    nomeProduto: 'Capacete',
    quantidade: 2,
  })

describe('PrismaSolicitacaoCompraRepository', () => {
  beforeEach(() => {
    vi.mocked(prisma.solicitacaoCompra.create).mockResolvedValue(scRecord as any)
    vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(scRecord as any)
    vi.mocked(prisma.solicitacaoCompra.findMany).mockResolvedValue([scRecord] as any)
    vi.mocked(prisma.solicitacaoCompra.update).mockResolvedValue(scRecord as any)
    vi.mocked(prisma.itemSolicitacaoCompra.findMany).mockResolvedValue([itemScRecord] as any)
  })

  describe('criar', () => {
    it('cria e retorna domínio', async () => {
      const result = await repo.criar(makeSolicitacao(), [makeItemSolicitacao()])
      expect(result).toBeInstanceOf(SolicitacaoCompra)
      expect(result.acNumero).toBe('AC0000001')
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.solicitacaoCompra.create).mockRejectedValue(new Error('db error'))
      await expect(repo.criar(makeSolicitacao(), [])).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorId', () => {
    it('retorna solicitação quando encontrada', async () => {
      const result = await repo.buscarPorId('sc-id-1')
      expect(result).toBeInstanceOf(SolicitacaoCompra)
    })

    it('retorna null quando não encontrada', async () => {
      vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorId('inexistente')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.solicitacaoCompra.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorId('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorOcNumero', () => {
    it('retorna solicitação quando encontrada', async () => {
      const result = await repo.buscarPorOcNumero('OC0000001')
      expect(result).toBeInstanceOf(SolicitacaoCompra)
    })

    it('retorna null quando não encontrada', async () => {
      vi.mocked(prisma.solicitacaoCompra.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorOcNumero('OC9999999')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.solicitacaoCompra.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorOcNumero('oc')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listarItensDaSolicitacao', () => {
    it('retorna itens da solicitação', async () => {
      const result = await repo.listarItensDaSolicitacao('sc-id-1')
      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(ItemSolicitacaoCompra)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemSolicitacaoCompra.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listarItensDaSolicitacao('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listar', () => {
    it('lista sem filtros', async () => {
      const result = await repo.listar()
      expect(result).toHaveLength(1)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.solicitacaoCompra.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listar()).rejects.toThrow(RepositoryError)
    })
  })

  describe('atualizar', () => {
    it('atualiza e retorna domínio', async () => {
      const result = await repo.atualizar(makeSolicitacao())
      expect(result).toBeInstanceOf(SolicitacaoCompra)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.solicitacaoCompra.update).mockRejectedValue(new Error('db error'))
      await expect(repo.atualizar(makeSolicitacao())).rejects.toThrow(RepositoryError)
    })
  })
})
