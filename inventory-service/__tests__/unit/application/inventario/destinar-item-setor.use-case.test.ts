import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DestinarItemSetorUseCase } from '@application/use-cases/inventario/destinar-item-setor.use-case'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { EstoqueSetor } from '@/domain/inventario/estoque-setor.entity'
import { DomainError } from '@/domain/shared/domain.error'

const mockItemRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorSku: vi.fn(),
  buscarPorNumero: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
  registrarMovimentacao: vi.fn(),
  listarMovimentacoesPorItem: vi.fn(),
}

const mockEstoqueSetorRepo = {
  upsert: vi.fn(),
  listarPorSetor: vi.fn(),
  listarPorItem: vi.fn(),
}

const useCase = new DestinarItemSetorUseCase(mockItemRepo as any, mockEstoqueSetorRepo as any)

const makeItem = (estoqueAtual = 5) =>
  ItemInventario.create({
    id: 'item-id-1',
    numero: 'INV0000001',
    nome: 'Capacete',
    sku: 'EPI-CAP-001',
    unidade: UnidadeMedida.UN,
    estoqueAtual,
    estoqueMinimo: 2,
    categoriaId: 'cat-id-1',
    criadoPor: 'user-id-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeEstoqueSetor = () =>
  EstoqueSetor.create({
    id: 'es-id-1',
    itemInventarioId: 'item-id-1',
    setor: 'TI',
    quantidade: 2,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('DestinarItemSetorUseCase', () => {
  beforeEach(() => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(makeItem())
    mockItemRepo.atualizar.mockImplementation(async (item: ItemInventario) => item)
    mockItemRepo.registrarMovimentacao.mockResolvedValue({})
    mockEstoqueSetorRepo.upsert.mockResolvedValue(makeEstoqueSetor())
  })

  it('destina item para setor com sucesso', async () => {
    const result = await useCase.execute({
      numeroInventario: 'INV0000001',
      setor: 'TI',
      quantidade: 2,
      realizadoPor: 'user-id-1',
    })

    expect(mockItemRepo.buscarPorNumero).toHaveBeenCalledWith('INV0000001')
    expect(mockItemRepo.atualizar).toHaveBeenCalledOnce()
    expect(mockEstoqueSetorRepo.upsert).toHaveBeenCalledWith('item-id-1', 'TI', 2)
    expect(mockItemRepo.registrarMovimentacao).toHaveBeenCalledOnce()
    expect(result.item.estoqueAtual).toBe(3)
  })

  it('lança DomainError quando setor está vazio', async () => {
    await expect(
      useCase.execute({ numeroInventario: 'INV0000001', setor: '', quantidade: 1, realizadoPor: 'u' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando quantidade é zero', async () => {
    await expect(
      useCase.execute({ numeroInventario: 'INV0000001', setor: 'TI', quantidade: 0, realizadoPor: 'u' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando quantidade é negativa', async () => {
    await expect(
      useCase.execute({ numeroInventario: 'INV0000001', setor: 'TI', quantidade: -1, realizadoPor: 'u' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando quantidade não é inteiro', async () => {
    await expect(
      useCase.execute({ numeroInventario: 'INV0000001', setor: 'TI', quantidade: 1.5, realizadoPor: 'u' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando item não encontrado', async () => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(null)

    await expect(
      useCase.execute({ numeroInventario: 'INV9999999', setor: 'TI', quantidade: 1, realizadoPor: 'u' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando item sem estoque', async () => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(makeItem(0))

    await expect(
      useCase.execute({ numeroInventario: 'INV0000001', setor: 'TI', quantidade: 1, realizadoPor: 'u' })
    ).rejects.toThrow(DomainError)
  })
})
