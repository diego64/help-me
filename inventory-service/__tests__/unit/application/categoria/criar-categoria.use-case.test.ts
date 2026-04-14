import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CriarCategoriaUseCase } from '@application/use-cases/categoria/criar-categoria.use-case'
import { Categoria } from '@/domain/inventario/categoria.entity'
import { DomainError } from '@/domain/shared/domain.error'

const mockCategoriaRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorNome: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
  deletar: vi.fn(),
}

const useCase = new CriarCategoriaUseCase(mockCategoriaRepo as any)

const makeCategoria = (overrides = {}) =>
  Categoria.create({
    id: 'cat-id-1',
    nome: 'EPIs',
    descricao: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...overrides,
  })

describe('CriarCategoriaUseCase', () => {
  beforeEach(() => {
    mockCategoriaRepo.buscarPorNome.mockResolvedValue(null)
    mockCategoriaRepo.criar.mockResolvedValue(makeCategoria())
  })

  it('cria categoria quando nome não existe', async () => {
    const result = await useCase.execute({ nome: 'EPIs' })

    expect(mockCategoriaRepo.buscarPorNome).toHaveBeenCalledWith('EPIs')
    expect(mockCategoriaRepo.criar).toHaveBeenCalledOnce()
    expect(result.nome).toBe('EPIs')
  })

  it('cria categoria com descrição opcional', async () => {
    mockCategoriaRepo.criar.mockResolvedValue(makeCategoria({ descricao: 'Equipamentos' }))

    const result = await useCase.execute({ nome: 'EPIs', descricao: 'Equipamentos' })

    expect(mockCategoriaRepo.criar).toHaveBeenCalledOnce()
    expect(result.descricao).toBe('Equipamentos')
  })

  it('lança DomainError quando categoria já existe com mesmo nome', async () => {
    mockCategoriaRepo.buscarPorNome.mockResolvedValue(makeCategoria())

    await expect(useCase.execute({ nome: 'EPIs' })).rejects.toThrow(DomainError)
    expect(mockCategoriaRepo.criar).not.toHaveBeenCalled()
  })
})
