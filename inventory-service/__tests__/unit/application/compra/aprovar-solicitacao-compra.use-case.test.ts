import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovarSolicitacaoCompraUseCase } from '@application/use-cases/compra/aprovar-solicitacao-compra.use-case'
import {
  SolicitacaoCompra,
  StatusSolicitacaoCompra,
  FormaPagamento,
} from '@/domain/compra/solicitacao-compra.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/compra.producer', () => ({
  publicarCompraAprovada: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorOcNumero: vi.fn(),
  listarItensDaSolicitacao: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new AprovarSolicitacaoCompraUseCase(mockRepo as any)

const makePendente = (setor: string | null = 'TECNOLOGIA_INFORMACAO') =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    setorSolicitante: setor,
    status: StatusSolicitacaoCompra.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeAprovada = (setor: string | null = 'TECNOLOGIA_INFORMACAO') =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    setorSolicitante: setor,
    status: StatusSolicitacaoCompra.APROVADO,
    formaPagamento: FormaPagamento.PIX,
    parcelas: 0,
    aprovadoPor: 'gestor-id',
    aprovadoEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('AprovarSolicitacaoCompraUseCase', () => {
  beforeEach(() => {
    mockRepo.buscarPorId.mockResolvedValue(makePendente())
    mockRepo.atualizar.mockResolvedValue(makeAprovada())
  })

  it('aprova uma solicitação PENDENTE com ADMIN', async () => {
    const result = await useCase.execute({
      id: 'compra-id-1',
      aprovadoPor: 'admin-id',
      regraAprovador: 'ADMIN',
      setorAprovador: null,
      formaPagamento: FormaPagamento.PIX,
      parcelas: 0,
    })

    expect(result.status).toBe(StatusSolicitacaoCompra.APROVADO)
    expect(mockRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('aprova com GESTOR do mesmo setor', async () => {
    const result = await useCase.execute({
      id: 'compra-id-1',
      aprovadoPor: 'gestor-id',
      regraAprovador: 'GESTOR',
      setorAprovador: 'TECNOLOGIA_INFORMACAO',
      formaPagamento: FormaPagamento.BOLETO,
      parcelas: 0,
    })

    expect(result.status).toBe(StatusSolicitacaoCompra.APROVADO)
  })

  it('lança DomainError quando solicitação não encontrada', async () => {
    mockRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({
        id: 'nao-existe',
        aprovadoPor: 'admin-id',
        regraAprovador: 'ADMIN',
        setorAprovador: null,
        formaPagamento: FormaPagamento.PIX,
        parcelas: 0,
      })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando GESTOR sem setor tenta aprovar', async () => {
    await expect(
      useCase.execute({
        id: 'compra-id-1',
        aprovadoPor: 'gestor-id',
        regraAprovador: 'GESTOR',
        setorAprovador: null,
        formaPagamento: FormaPagamento.PIX,
        parcelas: 0,
      })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando GESTOR de setor diferente tenta aprovar', async () => {
    await expect(
      useCase.execute({
        id: 'compra-id-1',
        aprovadoPor: 'gestor-id',
        regraAprovador: 'GESTOR',
        setorAprovador: 'RECURSOS_HUMANOS',
        formaPagamento: FormaPagamento.PIX,
        parcelas: 0,
      })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando domínio rejeita a transição (APROVADO→APROVADO)', async () => {
    mockRepo.buscarPorId.mockResolvedValue(makeAprovada())

    await expect(
      useCase.execute({
        id: 'compra-id-1',
        aprovadoPor: 'admin-id',
        regraAprovador: 'ADMIN',
        setorAprovador: null,
        formaPagamento: FormaPagamento.PIX,
        parcelas: 0,
      })
    ).rejects.toThrow(DomainError)
  })
})
