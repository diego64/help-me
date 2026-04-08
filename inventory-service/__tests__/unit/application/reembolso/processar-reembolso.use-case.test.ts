import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessarReembolsoUseCase } from '@application/use-cases/reembolso/processar-reembolso.use-case'
import { Reembolso, StatusReembolso } from '@/domain/reembolso/reembolso.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/reembolso.producer', () => ({
  publicarReembolsoPago: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorSolicitacaoCompra: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new ProcessarReembolsoUseCase(mockRepo as any)

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

const makePago = () =>
  Reembolso.create({
    id: 'reembolso-id-1',
    solicitadoPor: 'user-id-1',
    valor: 250,
    descricao: 'Reembolso de material',
    status: StatusReembolso.PAGO,
    aprovadoPor: 'gestor-id',
    aprovadoEm: new Date(),
    processadoPor: 'admin-id',
    processadoEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('ProcessarReembolsoUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makeAprovado())
    mockRepo.atualizar.mockResolvedValue(makePago())
  })

  it('processa pagamento de reembolso APROVADO', async () => {
    const result = await useCase.execute({ id: 'reembolso-id-1', processadoPor: 'admin-id' })

    expect(result.status).toBe(StatusReembolso.PAGO)
    expect(result.processadoPor).toBe('admin-id')
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando reembolso não encontrado', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', processadoPor: 'admin-id' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando reembolso está PENDENTE (não aprovado)', async () => {
    mockRepo.buscarPorId.mockResolvedValue(
      Reembolso.create({
        id: 'reembolso-id-1',
        solicitadoPor: 'user-id-1',
        valor: 250,
        descricao: 'Reembolso',
        status: StatusReembolso.PENDENTE,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })
    )

    await expect(
      useCase.execute({ id: 'reembolso-id-1', processadoPor: 'admin-id' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando reembolso já está PAGO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makePago())

    await expect(
      useCase.execute({ id: 'reembolso-id-1', processadoPor: 'admin-id' })
    ).rejects.toThrow(DomainError)
  })
})
