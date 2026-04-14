import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsultarEstoqueSetorUseCase } from '@application/use-cases/inventario/consultar-estoque-setor.use-case'
import { DomainError } from '@/domain/shared/domain.error'

const mockEstoqueSetorRepo = {
  upsert: vi.fn(),
  listarPorSetor: vi.fn(),
  listarPorItem: vi.fn(),
}

const useCase = new ConsultarEstoqueSetorUseCase(mockEstoqueSetorRepo as any)

describe('ConsultarEstoqueSetorUseCase', () => {
  beforeEach(() => {
    mockEstoqueSetorRepo.listarPorSetor.mockResolvedValue([])
  })

  it('retorna estoque do setor', async () => {
    const result = await useCase.execute('TI')

    expect(mockEstoqueSetorRepo.listarPorSetor).toHaveBeenCalledWith('TI')
    expect(result).toEqual([])
  })

  it('remove espaços do setor antes de consultar', async () => {
    await useCase.execute('  TI  ')

    expect(mockEstoqueSetorRepo.listarPorSetor).toHaveBeenCalledWith('TI')
  })

  it('lança DomainError quando setor está vazio', async () => {
    await expect(useCase.execute('')).rejects.toThrow(DomainError)
    await expect(useCase.execute('   ')).rejects.toThrow(DomainError)
  })
})
