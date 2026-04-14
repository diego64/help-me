import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsultarItemPorNumeroUseCase } from '@application/use-cases/inventario/consultar-item-por-numero.use-case'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
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

const useCase = new ConsultarItemPorNumeroUseCase(mockItemRepo as any)

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

describe('ConsultarItemPorNumeroUseCase', () => {
  beforeEach(() => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(makeItem())
    mockItemRepo.listarMovimentacoesPorItem.mockResolvedValue([])
  })

  it('retorna item e movimentações pelo número', async () => {
    const result = await useCase.execute('INV0000001')

    expect(mockItemRepo.buscarPorNumero).toHaveBeenCalledWith('INV0000001')
    expect(mockItemRepo.listarMovimentacoesPorItem).toHaveBeenCalledWith('item-id-1')
    expect(result.item.numero).toBe('INV0000001')
  })

  it('lança DomainError quando item não encontrado', async () => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(null)

    await expect(useCase.execute('INV9999999')).rejects.toThrow(DomainError)
    expect(mockItemRepo.listarMovimentacoesPorItem).not.toHaveBeenCalled()
  })
})
