import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RejeitarBaixaUseCase } from '@application/use-cases/baixa/rejeitar-baixa.use-case'
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/baixa.producer', () => ({
  publicarBaixaRejeitada: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  listarItensDaBaixa: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new RejeitarBaixaUseCase(mockRepo as any)

const makeBaixa = (status: StatusBaixa) =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status,
    justificativa: 'Item quebrado',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeRejeitada = () =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status: StatusBaixa.REJEITADO,
    justificativa: 'Item quebrado',
    rejeitadoPor: 'gestor-id',
    rejeitadoEm: new Date(),
    motivoRejeicao: 'Item ainda utilizável',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('RejeitarBaixaUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.PENDENTE))
    mockRepo.atualizar.mockResolvedValue(makeRejeitada())
  })

  it('rejeita baixa PENDENTE com motivo', async () => {
    const result = await useCase.execute({
      id: 'baixa-id-1',
      rejeitadoPor: 'gestor-id',
      motivoRejeicao: 'Item ainda utilizável',
    })

    expect(result.status).toBe(StatusBaixa.REJEITADO)
    expect(result.rejeitadoPor).toBe('gestor-id')
    expect(result.motivoRejeicao).toBe('Item ainda utilizável')
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('rejeita baixa APROVADO_TECNICO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_TECNICO))

    const result = await useCase.execute({
      id: 'baixa-id-1',
      rejeitadoPor: 'gestor-id',
      motivoRejeicao: 'Reconsiderado após nova análise',
    })

    expect(result.status).toBe(StatusBaixa.REJEITADO)
  })

  it('lança DomainError quando baixa não encontrada', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', rejeitadoPor: 'gestor-id', motivoRejeicao: 'Motivo' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando motivo está vazio', async () => {
    await expect(
      useCase.execute({ id: 'baixa-id-1', rejeitadoPor: 'gestor-id', motivoRejeicao: '' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando status é APROVADO_GESTOR', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_GESTOR))

    await expect(
      useCase.execute({ id: 'baixa-id-1', rejeitadoPor: 'gestor-id', motivoRejeicao: 'Motivo' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando status é CONCLUIDO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.CONCLUIDO))

    await expect(
      useCase.execute({ id: 'baixa-id-1', rejeitadoPor: 'gestor-id', motivoRejeicao: 'Motivo' })
    ).rejects.toThrow(DomainError)
  })
})
