import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RejeitarSolicitacaoCompraUseCase } from '@application/use-cases/compra/rejeitar-solicitacao-compra.use-case'
import { SolicitacaoCompra, StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/compra.producer', () => ({
  publicarCompraRejeitada: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorOcNumero: vi.fn(),
  listarItensDaSolicitacao: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new RejeitarSolicitacaoCompraUseCase(mockRepo as any)

const makePendente = () =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status: StatusSolicitacaoCompra.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeRejeitada = () =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status: StatusSolicitacaoCompra.REJEITADO,
    rejeitadoPor: 'gestor-id',
    rejeitadoEm: new Date(),
    motivoRejeicao: 'Orçamento insuficiente',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('RejeitarSolicitacaoCompraUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makePendente())
    mockRepo.atualizar.mockResolvedValue(makeRejeitada())
  })

  it('rejeita uma solicitação PENDENTE', async () => {
    const result = await useCase.execute({
      id: 'compra-id-1',
      rejeitadoPor: 'gestor-id',
      motivoRejeicao: 'Orçamento insuficiente',
    })

    expect(result.status).toBe(StatusSolicitacaoCompra.REJEITADO)
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando solicitação não encontrada', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', rejeitadoPor: 'gestor-id', motivoRejeicao: 'Motivo' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando motivo está vazio (validação do domínio)', async () => {
    await expect(
      useCase.execute({ id: 'compra-id-1', rejeitadoPor: 'gestor-id', motivoRejeicao: '' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError ao tentar rejeitar status REJEITADO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeRejeitada())

    await expect(
      useCase.execute({ id: 'compra-id-1', rejeitadoPor: 'gestor-id', motivoRejeicao: 'Motivo' })
    ).rejects.toThrow(DomainError)
  })
})
