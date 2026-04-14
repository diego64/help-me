import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CriarFornecedorUseCase } from '@application/use-cases/fornecedor/criar-fornecedor.use-case'
import { Fornecedor } from '@/domain/inventario/fornecedor.entity'
import { DomainError } from '@/domain/shared/domain.error'

const mockFornecedorRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorCnpj: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new CriarFornecedorUseCase(mockFornecedorRepo as any)

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

describe('CriarFornecedorUseCase', () => {
  beforeEach(() => {
    mockFornecedorRepo.buscarPorCnpj.mockResolvedValue(null)
    mockFornecedorRepo.criar.mockResolvedValue(makeFornecedor())
  })

  it('cria fornecedor sem CNPJ', async () => {
    const result = await useCase.execute({ nome: 'Fornecedor ABC' })

    expect(mockFornecedorRepo.buscarPorCnpj).not.toHaveBeenCalled()
    expect(mockFornecedorRepo.criar).toHaveBeenCalledOnce()
    expect(result.nome).toBe('Fornecedor ABC')
  })

  it('cria fornecedor com CNPJ quando não existe duplicata', async () => {
    await useCase.execute({ nome: 'Fornecedor ABC', cnpj: '12345678000195' })

    expect(mockFornecedorRepo.buscarPorCnpj).toHaveBeenCalledWith('12345678000195')
    expect(mockFornecedorRepo.criar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando CNPJ já cadastrado', async () => {
    mockFornecedorRepo.buscarPorCnpj.mockResolvedValue(makeFornecedor())

    await expect(
      useCase.execute({ nome: 'Outro', cnpj: '12345678000195' })
    ).rejects.toThrow(DomainError)

    expect(mockFornecedorRepo.criar).not.toHaveBeenCalled()
  })

  it('cria fornecedor com campos opcionais', async () => {
    await useCase.execute({
      nome: 'ABC',
      email: 'abc@email.com',
      telefone: '11999990000',
    })

    expect(mockFornecedorRepo.criar).toHaveBeenCalledOnce()
  })
})
