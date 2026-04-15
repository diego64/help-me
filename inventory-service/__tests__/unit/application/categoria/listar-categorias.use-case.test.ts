import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListarCategoriasUseCase } from '@application/use-cases/categoria/listar-categorias.use-case'
import { Categoria } from '@/domain/inventario/categoria.entity'

const mockCategoriaRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorNome: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
  deletar: vi.fn(),
}

const useCase = new ListarCategoriasUseCase(mockCategoriaRepo as any)

const makeCategoria = (nome = 'EPIs') =>
  Categoria.create({ id: 'cat-id-1', nome, descricao: null, criadoEm: new Date(), atualizadoEm: new Date() })

describe('ListarCategoriasUseCase', () => {
  beforeEach(() => {
    mockCategoriaRepo.listar.mockResolvedValue([makeCategoria()])
  })

  it('retorna lista de categorias', async () => {
    const result = await useCase.execute()

    expect(mockCategoriaRepo.listar).toHaveBeenCalledWith({ pagina: undefined, limite: undefined })
    expect(result).toHaveLength(1)
  })

  it('passa paginação para o repositório', async () => {
    await useCase.execute({ pagina: 2, limite: 10 })

    expect(mockCategoriaRepo.listar).toHaveBeenCalledWith({ pagina: 2, limite: 10 })
  })

  it('retorna lista vazia quando não há categorias', async () => {
    mockCategoriaRepo.listar.mockResolvedValue([])

    const result = await useCase.execute()

    expect(result).toHaveLength(0)
  })
})
