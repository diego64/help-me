import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CancelarSolicitacaoCompraUseCase } from '@application/use-cases/compra/cancelar-solicitacao-compra.use-case'
import { SolicitacaoCompra, StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/compra.producer', () => ({
  publicarCompraCancelada: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorOcNumero: vi.fn(),
  listarItensDaSolicitacao: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new CancelarSolicitacaoCompraUseCase(mockRepo as any)

const makeCompra = (status: StatusSolicitacaoCompra) =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('CancelarSolicitacaoCompraUseCase', () => {
  beforeEach(() => {
    mockRepo.atualizar.mockResolvedValue(makeCompra(StatusSolicitacaoCompra.CANCELADO))
  })

  it('cancela uma solicitação PENDENTE', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeCompra(StatusSolicitacaoCompra.PENDENTE))

    const result = await useCase.execute({ id: 'compra-id-1' })

    expect(result.status).toBe(StatusSolicitacaoCompra.CANCELADO)
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('cancela uma solicitação APROVADA', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeCompra(StatusSolicitacaoCompra.APROVADO))

    const result = await useCase.execute({ id: 'compra-id-1' })

    expect(result.status).toBe(StatusSolicitacaoCompra.CANCELADO)
  })

  it('lança DomainError quando solicitação não encontrada', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(useCase.execute({ id: 'nao-existe' })).rejects.toThrow(DomainError)
    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError ao tentar cancelar status COMPRADO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeCompra(StatusSolicitacaoCompra.COMPRADO))

    await expect(useCase.execute({ id: 'compra-id-1' })).rejects.toThrow(DomainError)
    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError ao tentar cancelar status CANCELADO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeCompra(StatusSolicitacaoCompra.CANCELADO))

    await expect(useCase.execute({ id: 'compra-id-1' })).rejects.toThrow(DomainError)
  })
})
