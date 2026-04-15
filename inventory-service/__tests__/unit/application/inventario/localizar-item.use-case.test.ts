import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocalizarItemUseCase } from '@application/use-cases/inventario/localizar-item.use-case'
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

const mockEstoqueSetorRepo = {
  upsert: vi.fn(),
  listarPorSetor: vi.fn(),
  listarPorItem: vi.fn(),
}

const useCase = new LocalizarItemUseCase(mockItemRepo as any, mockEstoqueSetorRepo as any)

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

describe('LocalizarItemUseCase', () => {
  beforeEach(() => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(makeItem())
    mockEstoqueSetorRepo.listarPorItem.mockResolvedValue([])
  })

  it('retorna item com estoque por setor', async () => {
    const result = await useCase.execute('INV0000001')

    expect(mockItemRepo.buscarPorNumero).toHaveBeenCalledWith('INV0000001')
    expect(mockEstoqueSetorRepo.listarPorItem).toHaveBeenCalledWith('item-id-1')
    expect(result.item.numero).toBe('INV0000001')
    expect(result.estoqueGeral).toBe(5)
    expect(result.distribuicaoPorSetor).toEqual([])
  })

  it('normaliza número para maiúsculas e remove espaços', async () => {
    await useCase.execute('  inv0000001  ')

    expect(mockItemRepo.buscarPorNumero).toHaveBeenCalledWith('INV0000001')
  })

  it('lança DomainError quando número está vazio', async () => {
    await expect(useCase.execute('')).rejects.toThrow(DomainError)
    await expect(useCase.execute('   ')).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando item não encontrado', async () => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(null)

    await expect(useCase.execute('INV9999999')).rejects.toThrow(DomainError)
  })
})
