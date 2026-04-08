import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CriarReembolsoUseCase } from '@application/use-cases/reembolso/criar-reembolso.use-case'
import { Reembolso, StatusReembolso } from '@/domain/reembolso/reembolso.entity'
import { SolicitacaoCompra, StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/reembolso.producer', () => ({
  publicarReembolsoCriado: vi.fn(),
}))

const mockReembolsoRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorSolicitacaoCompra: vi.fn(),
  atualizar: vi.fn(),
}

const mockSolicitacaoRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorOcNumero: vi.fn(),
  listarItensDaSolicitacao: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new CriarReembolsoUseCase(mockReembolsoRepo as any, mockSolicitacaoRepo as any)

const makeReembolso = () =>
  Reembolso.create({
    id: 'reembolso-id-1',
    solicitadoPor: 'user-id-1',
    valor: 250,
    descricao: 'Reembolso de material',
    status: StatusReembolso.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeCompra = () =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status: StatusSolicitacaoCompra.COMPRADO,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('CriarReembolsoUseCase', () => {
  beforeEach(() => {
    mockReembolsoRepo.criar.mockResolvedValue(makeReembolso())
    mockReembolsoRepo.buscarPorSolicitacaoCompra.mockResolvedValue(null)
    mockSolicitacaoRepo.buscarPorId.mockResolvedValue(makeCompra())
  })

  it('cria reembolso avulso sem solicitação vinculada', async () => {
    const result = await useCase.execute({
      solicitadoPor: 'user-id-1',
      valor: 250,
      descricao: 'Reembolso de material de escritório',
    })

    expect(result.status).toBe(StatusReembolso.PENDENTE)
    expect(mockReembolsoRepo.criar).toHaveBeenCalledOnce()
    expect(mockSolicitacaoRepo.buscarPorId).not.toHaveBeenCalled()
  })

  it('cria reembolso vinculado a uma solicitação de compra', async () => {
    const result = await useCase.execute({
      solicitadoPor: 'user-id-1',
      solicitacaoCompraId: 'compra-id-1',
      valor: 250,
      descricao: 'Reembolso da compra aprovada',
    })

    expect(result.status).toBe(StatusReembolso.PENDENTE)
    expect(mockSolicitacaoRepo.buscarPorId).toHaveBeenCalledWith('compra-id-1')
    expect(mockReembolsoRepo.criar).toHaveBeenCalledOnce()
  })

  it('cria reembolso com campos opcionais', async () => {
    await useCase.execute({
      solicitadoPor: 'user-id-1',
      valor: 150,
      descricao: 'Reembolso com NF-e',
      nfe: '12345678901234567890123456789012345678901234',
      dataEmissao: new Date('2024-03-01'),
      cnpjFornecedor: '12.345.678/0001-90',
      observacoes: 'Nota física entregue',
    })

    expect(mockReembolsoRepo.criar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando solicitação de compra não encontrada', async () => {
    mockSolicitacaoRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({
        solicitadoPor: 'user-id-1',
        solicitacaoCompraId: 'nao-existe',
        valor: 250,
        descricao: 'Reembolso',
      })
    ).rejects.toThrow(DomainError)

    expect(mockReembolsoRepo.criar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando já existe reembolso para a solicitação', async () => {
    mockReembolsoRepo.buscarPorSolicitacaoCompra.mockResolvedValue(makeReembolso())

    await expect(
      useCase.execute({
        solicitadoPor: 'user-id-1',
        solicitacaoCompraId: 'compra-id-1',
        valor: 250,
        descricao: 'Duplicado',
      })
    ).rejects.toThrow(DomainError)
  })
})
