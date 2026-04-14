import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListarItensUseCase } from '@application/use-cases/inventario/listar-itens.use-case'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'

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

const useCase = new ListarItensUseCase(mockItemRepo as any)

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

describe('ListarItensUseCase', () => {
  beforeEach(() => {
    mockItemRepo.listar.mockResolvedValue([makeItem()])
  })

  it('lista itens sem filtros', async () => {
    const result = await useCase.execute()

    expect(mockItemRepo.listar).toHaveBeenCalledWith({
      nome: undefined,
      categoriaId: undefined,
      estoqueCritico: undefined,
      pagina: undefined,
      limite: undefined,
    })
    expect(result).toHaveLength(1)
  })

  it('passa filtros para o repositório', async () => {
    await useCase.execute({ nome: 'Capacete', categoriaId: 'cat-id-1', estoqueCritico: true, pagina: 2, limite: 10 })

    expect(mockItemRepo.listar).toHaveBeenCalledWith({
      nome: 'Capacete',
      categoriaId: 'cat-id-1',
      estoqueCritico: true,
      pagina: 2,
      limite: 10,
    })
  })

  it('retorna lista vazia', async () => {
    mockItemRepo.listar.mockResolvedValue([])
    const result = await useCase.execute()
    expect(result).toHaveLength(0)
  })
})
