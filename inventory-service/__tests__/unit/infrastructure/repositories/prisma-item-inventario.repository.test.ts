import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaItemInventarioRepository } from '@infrastructure/repositories/prisma-item-inventario.repository'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { MovimentacaoEstoque, TipoMovimentacao, MotivoMovimentacao } from '@/domain/inventario/movimentacao-estoque.entity'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    itemInventario: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    movimentacaoEstoque: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '@infrastructure/database/prisma.client'

const repo = new PrismaItemInventarioRepository()

const itemRecord = {
  id: 'item-id-1',
  numero: 'INV0000001',
  nome: 'Capacete',
  sku: 'EPI-CAP-001',
  descricao: null,
  unidade: 'UN',
  estoqueAtual: 5,
  estoqueMinimo: 2,
  categoriaId: 'cat-id-1',
  ocNumero: null,
  criadoPor: 'user-id-1',
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const movimentacaoRecord = {
  id: 'mov-id-1',
  itemId: 'item-id-1',
  tipo: 'ENTRADA',
  motivo: 'COMPRA',
  quantidade: 3,
  estoqueBefore: 2,
  estoqueAfter: 5,
  referenciaId: null,
  realizadoPor: 'user-id-1',
  observacoes: null,
  setorDestinoId: null,
  setorDestinoNome: null,
  criadoEm: new Date('2024-01-01'),
}

const makeItem = () =>
  ItemInventario.create({
    id: 'item-id-1',
    numero: 'INV0000001',
    nome: 'Capacete',
    sku: 'EPI-CAP-001',
    unidade: UnidadeMedida.UN,
    estoqueAtual: 5,
    estoqueMinimo: 2,
    categoriaId: 'cat-id-1',
    criadoPor: 'user-id-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeMovimentacao = () =>
  MovimentacaoEstoque.create({
    id: 'mov-id-1',
    itemId: 'item-id-1',
    tipo: TipoMovimentacao.ENTRADA,
    motivo: MotivoMovimentacao.COMPRA,
    quantidade: 3,
    estoqueBefore: 2,
    estoqueAfter: 5,
    realizadoPor: 'user-id-1',
    criadoEm: new Date(),
  })

describe('PrismaItemInventarioRepository', () => {
  beforeEach(() => {
    vi.mocked(prisma.itemInventario.create).mockResolvedValue(itemRecord as any)
    vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(itemRecord as any)
    vi.mocked(prisma.itemInventario.findMany).mockResolvedValue([itemRecord] as any)
    vi.mocked(prisma.itemInventario.update).mockResolvedValue(itemRecord as any)
    vi.mocked(prisma.movimentacaoEstoque.create).mockResolvedValue(movimentacaoRecord as any)
    vi.mocked(prisma.movimentacaoEstoque.findMany).mockResolvedValue([movimentacaoRecord] as any)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([itemRecord] as any)
  })

  describe('criar', () => {
    it('cria e retorna domínio', async () => {
      const result = await repo.criar(makeItem())
      expect(result).toBeInstanceOf(ItemInventario)
      expect(result.numero).toBe('INV0000001')
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemInventario.create).mockRejectedValue(new Error('db error'))
      await expect(repo.criar(makeItem())).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorId', () => {
    it('retorna item quando encontrado', async () => {
      const result = await repo.buscarPorId('item-id-1')
      expect(result).toBeInstanceOf(ItemInventario)
    })

    it('retorna null quando não encontrado', async () => {
      vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorId('inexistente')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemInventario.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorId('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorSku', () => {
    it('retorna item quando encontrado', async () => {
      const result = await repo.buscarPorSku('EPI-CAP-001')
      expect(result).toBeInstanceOf(ItemInventario)
    })

    it('retorna null quando não encontrado', async () => {
      vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorSku('inexistente')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemInventario.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorSku('sku')).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorNumero', () => {
    it('retorna item quando encontrado', async () => {
      const result = await repo.buscarPorNumero('INV0000001')
      expect(result).toBeInstanceOf(ItemInventario)
    })

    it('retorna null quando não encontrado', async () => {
      vi.mocked(prisma.itemInventario.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorNumero('INV9999999')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemInventario.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorNumero('num')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listar', () => {
    it('lista itens sem filtros usando findMany', async () => {
      const result = await repo.listar()
      expect(prisma.itemInventario.findMany).toHaveBeenCalledOnce()
      expect(result).toHaveLength(1)
    })

    it('usa $queryRaw quando estoqueCritico=true', async () => {
      const result = await repo.listar({ estoqueCritico: true })
      expect(prisma.$queryRaw).toHaveBeenCalledOnce()
      expect(result).toHaveLength(1)
    })

    it('usa $queryRaw com categoriaId quando estoqueCritico=true', async () => {
      await repo.listar({ estoqueCritico: true, categoriaId: 'cat-id-1' })
      expect(prisma.$queryRaw).toHaveBeenCalledOnce()
    })

    it('usa $queryRaw com nome quando estoqueCritico=true', async () => {
      await repo.listar({ estoqueCritico: true, nome: 'Capacete' })
      expect(prisma.$queryRaw).toHaveBeenCalledOnce()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemInventario.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listar()).rejects.toThrow(RepositoryError)
    })
  })

  describe('atualizar', () => {
    it('atualiza e retorna domínio', async () => {
      const result = await repo.atualizar(makeItem())
      expect(result).toBeInstanceOf(ItemInventario)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemInventario.update).mockRejectedValue(new Error('db error'))
      await expect(repo.atualizar(makeItem())).rejects.toThrow(RepositoryError)
    })
  })

  describe('registrarMovimentacao', () => {
    it('registra e retorna movimentação', async () => {
      const result = await repo.registrarMovimentacao(makeMovimentacao())
      expect(result).toBeInstanceOf(MovimentacaoEstoque)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.movimentacaoEstoque.create).mockRejectedValue(new Error('db error'))
      await expect(repo.registrarMovimentacao(makeMovimentacao())).rejects.toThrow(RepositoryError)
    })
  })

  describe('listarMovimentacoesPorItem', () => {
    it('retorna movimentações do item', async () => {
      const result = await repo.listarMovimentacoesPorItem('item-id-1')
      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(MovimentacaoEstoque)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.movimentacaoEstoque.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listarMovimentacoesPorItem('id')).rejects.toThrow(RepositoryError)
    })
  })
})
