import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovarBaixaGestorUseCase } from '@application/use-cases/baixa/aprovar-baixa-gestor.use-case'
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/baixa.producer', () => ({
  publicarBaixaAprovadaGestor: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  listarItensDaBaixa: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new AprovarBaixaGestorUseCase(mockRepo as any)

const makeBaixa = (status: StatusBaixa) =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status,
    justificativa: 'Item quebrado',
    aprovadoTecnicoPor: status !== StatusBaixa.PENDENTE ? 'tecnico-id' : null,
    aprovadoTecnicoEm: status !== StatusBaixa.PENDENTE ? new Date() : null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeAprovadaGestor = () =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status: StatusBaixa.APROVADO_GESTOR,
    justificativa: 'Item quebrado',
    aprovadoTecnicoPor: 'tecnico-id',
    aprovadoTecnicoEm: new Date(),
    aprovadoGestorPor: 'gestor-id',
    aprovadoGestorEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('AprovarBaixaGestorUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_TECNICO))
    mockRepo.atualizar.mockResolvedValue(makeAprovadaGestor())
  })

  it('aprova baixa APROVADO_TECNICO pelo gestor', async () => {
    const result = await useCase.execute({ id: 'baixa-id-1', aprovadoPor: 'gestor-id' })

    expect(result.status).toBe(StatusBaixa.APROVADO_GESTOR)
    expect(result.aprovadoGestorPor).toBe('gestor-id')
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando baixa não encontrada', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', aprovadoPor: 'gestor-id' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando status é PENDENTE (precisa de aprovação técnica primeiro)', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.PENDENTE))

    await expect(
      useCase.execute({ id: 'baixa-id-1', aprovadoPor: 'gestor-id' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando status já é APROVADO_GESTOR', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_GESTOR))

    await expect(
      useCase.execute({ id: 'baixa-id-1', aprovadoPor: 'gestor-id' })
    ).rejects.toThrow(DomainError)
  })
})
