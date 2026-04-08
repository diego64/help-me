import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovarBaixaTecnicoUseCase } from '@application/use-cases/baixa/aprovar-baixa-tecnico.use-case'
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/baixa.producer', () => ({
  publicarBaixaAprovadaTecnico: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  listarItensDaBaixa: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new AprovarBaixaTecnicoUseCase(mockRepo as any)

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

const makeAprovadaTecnico = () =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status: StatusBaixa.APROVADO_TECNICO,
    justificativa: 'Item quebrado',
    aprovadoTecnicoPor: 'tecnico-id',
    aprovadoTecnicoEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('AprovarBaixaTecnicoUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.PENDENTE))
    mockRepo.atualizar.mockResolvedValue(makeAprovadaTecnico())
  })

  it('aprova baixa PENDENTE tecnicamente', async () => {
    const result = await useCase.execute({ id: 'baixa-id-1', aprovadoPor: 'tecnico-id' })

    expect(result.status).toBe(StatusBaixa.APROVADO_TECNICO)
    expect(result.aprovadoTecnicoPor).toBe('tecnico-id')
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando baixa não encontrada', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', aprovadoPor: 'tecnico-id' })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando status já é APROVADO_TECNICO', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_TECNICO))

    await expect(
      useCase.execute({ id: 'baixa-id-1', aprovadoPor: 'tecnico-id' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando status é APROVADO_GESTOR', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_GESTOR))

    await expect(
      useCase.execute({ id: 'baixa-id-1', aprovadoPor: 'tecnico-id' })
    ).rejects.toThrow(DomainError)
  })
})
