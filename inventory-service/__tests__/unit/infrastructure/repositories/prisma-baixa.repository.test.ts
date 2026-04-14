import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaBaixaRepository } from '@infrastructure/repositories/prisma-baixa.repository'
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity'
import { ItemBaixa } from '@/domain/baixa/item-baixa.entity'
import { RepositoryError } from '@infrastructure/repositories/repository.error'

vi.mock('@infrastructure/database/prisma.client', () => ({
  prisma: {
    baixa: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    itemBaixa: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@infrastructure/database/prisma.client'

const repo = new PrismaBaixaRepository()

const baixaRecord = {
  id: 'baixa-id-1',
  solicitadoPor: 'user-id-1',
  perfilSolicitante: 'USUARIO',
  status: 'PENDENTE',
  justificativa: 'Item quebrado',
  aprovadoTecnicoPor: null,
  aprovadoTecnicoEm: null,
  aprovadoGestorPor: null,
  aprovadoGestorEm: null,
  rejeitadoPor: null,
  rejeitadoEm: null,
  motivoRejeicao: null,
  executadoPor: null,
  executadoEm: null,
  observacoes: null,
  criadoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
}

const itemBaixaRecord = {
  id: 'ib-id-1',
  baixaId: 'baixa-id-1',
  itemInventarioId: 'item-id-1',
  quantidade: 1,
  motivo: 'QUEBRA',
}

const makeBaixa = () =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status: StatusBaixa.PENDENTE,
    justificativa: 'Item quebrado',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeItemBaixa = () =>
  ItemBaixa.create({
    id: 'ib-id-1',
    baixaId: 'baixa-id-1',
    itemInventarioId: 'item-id-1',
    quantidade: 1,
    motivo: 'QUEBRA',
  })

describe('PrismaBaixaRepository', () => {
  beforeEach(() => {
    vi.mocked(prisma.baixa.create).mockResolvedValue(baixaRecord as any)
    vi.mocked(prisma.baixa.findUnique).mockResolvedValue(baixaRecord as any)
    vi.mocked(prisma.baixa.findMany).mockResolvedValue([baixaRecord] as any)
    vi.mocked(prisma.baixa.update).mockResolvedValue(baixaRecord as any)
    vi.mocked(prisma.itemBaixa.findMany).mockResolvedValue([itemBaixaRecord] as any)
  })

  describe('criar', () => {
    it('cria baixa com itens e retorna domínio', async () => {
      const result = await repo.criar(makeBaixa(), [makeItemBaixa()])
      expect(result).toBeInstanceOf(Baixa)
      expect(result.status).toBe(StatusBaixa.PENDENTE)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.baixa.create).mockRejectedValue(new Error('db error'))
      await expect(repo.criar(makeBaixa(), [])).rejects.toThrow(RepositoryError)
    })
  })

  describe('buscarPorId', () => {
    it('retorna baixa quando encontrada', async () => {
      const result = await repo.buscarPorId('baixa-id-1')
      expect(result).toBeInstanceOf(Baixa)
    })

    it('retorna null quando não encontrada', async () => {
      vi.mocked(prisma.baixa.findUnique).mockResolvedValue(null)
      expect(await repo.buscarPorId('inexistente')).toBeNull()
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.baixa.findUnique).mockRejectedValue(new Error('db error'))
      await expect(repo.buscarPorId('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listarItensDaBaixa', () => {
    it('retorna itens da baixa', async () => {
      const result = await repo.listarItensDaBaixa('baixa-id-1')
      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(ItemBaixa)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.itemBaixa.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listarItensDaBaixa('id')).rejects.toThrow(RepositoryError)
    })
  })

  describe('listar', () => {
    it('lista sem filtros', async () => {
      const result = await repo.listar()
      expect(result).toHaveLength(1)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.baixa.findMany).mockRejectedValue(new Error('db error'))
      await expect(repo.listar()).rejects.toThrow(RepositoryError)
    })
  })

  describe('atualizar', () => {
    it('atualiza e retorna domínio', async () => {
      const result = await repo.atualizar(makeBaixa())
      expect(result).toBeInstanceOf(Baixa)
    })

    it('lança RepositoryError em caso de falha', async () => {
      vi.mocked(prisma.baixa.update).mockRejectedValue(new Error('db error'))
      await expect(repo.atualizar(makeBaixa())).rejects.toThrow(RepositoryError)
    })
  })
})
