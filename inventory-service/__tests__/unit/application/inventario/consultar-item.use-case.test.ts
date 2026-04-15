import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsultarItemUseCase } from '@application/use-cases/inventario/consultar-item.use-case'
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

const useCase = new ConsultarItemUseCase(mockItemRepo as any)

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

describe('ConsultarItemUseCase', () => {
  beforeEach(() => {
    mockItemRepo.buscarPorId.mockResolvedValue(makeItem())
    mockItemRepo.listarMovimentacoesPorItem.mockResolvedValue([])
  })

  it('retorna item com movimentações', async () => {
    const result = await useCase.execute('item-id-1')

    expect(mockItemRepo.buscarPorId).toHaveBeenCalledWith('item-id-1')
    expect(mockItemRepo.listarMovimentacoesPorItem).toHaveBeenCalledWith('item-id-1')
    expect(result.item.id).toBe('item-id-1')
    expect(result.movimentacoes).toEqual([])
  })

  it('lança DomainError quando item não encontrado', async () => {
    mockItemRepo.buscarPorId.mockResolvedValue(null)

    await expect(useCase.execute('inexistente')).rejects.toThrow(DomainError)
  })

  it('busca item e movimentações em paralelo', async () => {
    await useCase.execute('item-id-1')

    expect(mockItemRepo.buscarPorId).toHaveBeenCalledOnce()
    expect(mockItemRepo.listarMovimentacoesPorItem).toHaveBeenCalledOnce()
  })
})
