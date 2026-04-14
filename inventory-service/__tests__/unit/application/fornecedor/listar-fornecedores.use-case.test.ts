import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListarFornecedoresUseCase } from '@application/use-cases/fornecedor/listar-fornecedores.use-case'
import { Fornecedor } from '@/domain/inventario/fornecedor.entity'

const mockFornecedorRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorCnpj: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new ListarFornecedoresUseCase(mockFornecedorRepo as any)

const makeFornecedor = () =>
  Fornecedor.create({
    id: 'forn-id-1',
    nome: 'Fornecedor ABC',
    cnpj: null,
    email: null,
    telefone: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('ListarFornecedoresUseCase', () => {
  beforeEach(() => {
    mockFornecedorRepo.listar.mockResolvedValue([makeFornecedor()])
  })

  it('retorna lista de fornecedores', async () => {
    const result = await useCase.execute()

    expect(mockFornecedorRepo.listar).toHaveBeenCalledWith({ pagina: undefined, limite: undefined })
    expect(result).toHaveLength(1)
  })

  it('passa paginação para o repositório', async () => {
    await useCase.execute({ pagina: 3, limite: 20 })

    expect(mockFornecedorRepo.listar).toHaveBeenCalledWith({ pagina: 3, limite: 20 })
  })

  it('retorna lista vazia', async () => {
    mockFornecedorRepo.listar.mockResolvedValue([])

    const result = await useCase.execute()

    expect(result).toHaveLength(0)
  })
})
