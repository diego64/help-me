import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AtualizarItemUseCase } from '@application/use-cases/inventario/atualizar-item.use-case'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { Categoria } from '@/domain/inventario/categoria.entity'
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

const mockCategoriaRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorNome: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
  deletar: vi.fn(),
}

const useCase = new AtualizarItemUseCase(mockItemRepo as any, mockCategoriaRepo as any)

const makeItem = (categoriaId = 'cat-id-1') =>
  ItemInventario.create({
    id: 'item-id-1',
    numero: 'INV0000001',
    nome: 'Capacete',
    sku: 'EPI-CAP-001',
    unidade: UnidadeMedida.UN,
    estoqueAtual: 5,
    estoqueMinimo: 2,
    categoriaId,
    criadoPor: 'user-id-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeCategoria = (id = 'cat-id-2') =>
  Categoria.create({ id, nome: 'Outra Cat', descricao: null, criadoEm: new Date(), atualizadoEm: new Date() })

describe('AtualizarItemUseCase', () => {
  beforeEach(() => {
    mockItemRepo.buscarPorId.mockResolvedValue(makeItem())
    mockItemRepo.atualizar.mockImplementation(async (item: ItemInventario) => item)
    mockCategoriaRepo.buscarPorId.mockResolvedValue(makeCategoria())
  })

  it('atualiza item sem trocar categoria', async () => {
    const result = await useCase.execute({ id: 'item-id-1', nome: 'Capacete Novo' })

    expect(mockCategoriaRepo.buscarPorId).not.toHaveBeenCalled()
    expect(mockItemRepo.atualizar).toHaveBeenCalledOnce()
    expect(result.nome).toBe('Capacete Novo')
  })

  it('valida categoria quando categoriaId muda', async () => {
    await useCase.execute({ id: 'item-id-1', categoriaId: 'cat-id-2' })

    expect(mockCategoriaRepo.buscarPorId).toHaveBeenCalledWith('cat-id-2')
  })

  it('não valida categoria quando categoriaId é o mesmo', async () => {
    await useCase.execute({ id: 'item-id-1', categoriaId: 'cat-id-1' })

    expect(mockCategoriaRepo.buscarPorId).not.toHaveBeenCalled()
  })

  it('lança DomainError quando item não encontrado', async () => {
    mockItemRepo.buscarPorId.mockResolvedValue(null)

    await expect(useCase.execute({ id: 'inexistente' })).rejects.toThrow(DomainError)
    expect(mockItemRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando nova categoria não existe', async () => {
    mockCategoriaRepo.buscarPorId.mockResolvedValue(null)

    await expect(useCase.execute({ id: 'item-id-1', categoriaId: 'cat-invalida' })).rejects.toThrow(DomainError)
    expect(mockItemRepo.atualizar).not.toHaveBeenCalled()
  })
})
