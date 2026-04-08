import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovarReembolsoUseCase } from '@application/use-cases/reembolso/aprovar-reembolso.use-case'
import { Reembolso, StatusReembolso } from '@/domain/reembolso/reembolso.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/reembolso.producer', () => ({
  publicarReembolsoAprovado: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorSolicitacaoCompra: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new AprovarReembolsoUseCase(mockRepo as any)

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

const makeAprovado = () =>
  Reembolso.create({
    id: 'reembolso-id-1',
    solicitadoPor: 'user-id-1',
    valor: 250,
    descricao: 'Reembolso de material',
    status: StatusReembolso.APROVADO,
    aprovadoPor: 'gestor-id',
    aprovadoEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('AprovarReembolsoUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makePendente())
    mockRepo.atualizar.mockResolvedValue(makeAprovado())
  })

  it('aprova um reembolso PENDENTE', async () => {
    const result = await useCase.execute({ id: 'reembolso-id-1', aprovadoPor: 'gestor-id' })

    expect(result.status).toBe(StatusReembolso.APROVADO)
    expect(result.aprovadoPor).toBe('gestor-id')
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando reembolso não encontrado', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', aprovadoPor: 'gestor-id' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando reembolso já está APROVADO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeAprovado())

    await expect(
      useCase.execute({ id: 'reembolso-id-1', aprovadoPor: 'gestor-id' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })
})
