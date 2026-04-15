import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RejeitarReembolsoUseCase } from '@application/use-cases/reembolso/rejeitar-reembolso.use-case'
import { Reembolso, StatusReembolso } from '@/domain/reembolso/reembolso.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/reembolso.producer', () => ({
  publicarReembolsoRejeitado: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorSolicitacaoCompra: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new RejeitarReembolsoUseCase(mockRepo as any)

const makePendente = () =>
  Reembolso.create({
    id: 'reembolso-id-1',
    solicitadoPor: 'user-id-1',
    valor: 250,
    descricao: 'Reembolso de material',
    status: StatusReembolso.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeRejeitado = () =>
  Reembolso.create({
    id: 'reembolso-id-1',
    solicitadoPor: 'user-id-1',
    valor: 250,
    descricao: 'Reembolso de material',
    status: StatusReembolso.REJEITADO,
    rejeitadoPor: 'gestor-id',
    rejeitadoEm: new Date(),
    motivoRejeicao: 'Comprovante inválido',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('RejeitarReembolsoUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makePendente())
    mockRepo.atualizar.mockResolvedValue(makeRejeitado())
  })

  it('rejeita um reembolso PENDENTE com motivo', async () => {
    const result = await useCase.execute({
      id: 'reembolso-id-1',
      rejeitadoPor: 'gestor-id',
      motivoRejeicao: 'Comprovante inválido',
    })

    expect(result.status).toBe(StatusReembolso.REJEITADO)
    expect(result.rejeitadoPor).toBe('gestor-id')
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando reembolso não encontrado', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', rejeitadoPor: 'gestor-id', motivoRejeicao: 'Motivo' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando motivo está vazio (validação do domínio)', async () => {
    await expect(
      useCase.execute({ id: 'reembolso-id-1', rejeitadoPor: 'gestor-id', motivoRejeicao: '' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando reembolso já está REJEITADO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeRejeitado())

    await expect(
      useCase.execute({ id: 'reembolso-id-1', rejeitadoPor: 'gestor-id', motivoRejeicao: 'Novo motivo' })
    ).rejects.toThrow(DomainError)
  })
})
