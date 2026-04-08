import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CriarSolicitacaoCompraUseCase } from '@application/use-cases/compra/criar-solicitacao-compra.use-case'
import { SolicitacaoCompra, StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity'
import { DomainError } from '@/domain/shared/domain.error'
import { proximoNumero } from '@infrastructure/database/numero-sequencial'

vi.mock('@messaging/producers/compra.producer', () => ({
  publicarCompraCriada: vi.fn(),
}))

vi.mock('@infrastructure/database/numero-sequencial', () => ({
  proximoNumero: vi.fn(),
}))

const mockRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorOcNumero: vi.fn(),
  listarItensDaSolicitacao: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new CriarSolicitacaoCompraUseCase(mockRepo as any)

const makeRetorno = () =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status: StatusSolicitacaoCompra.PENDENTE,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('CriarSolicitacaoCompraUseCase', () => {
  beforeEach(() => {
    vi.mocked(proximoNumero)
      .mockResolvedValueOnce('AC0000001')
      .mockResolvedValueOnce('OC0000001')
    mockRepo.criar.mockResolvedValue(makeRetorno())
  })

  it('cria solicitação com um item', async () => {
    const result = await useCase.execute({
      solicitadoPor: 'user-id-1',
      itens: [{ nomeProduto: 'Notebook', quantidade: 2, precoEstimado: 4500 }],
    })

    expect(result.status).toBe(StatusSolicitacaoCompra.PENDENTE)
    expect(result.acNumero).toBe('AC0000001')
    expect(mockRepo.criar).toHaveBeenCalledOnce()
  })

  it('cria solicitação com múltiplos itens', async () => {
    await useCase.execute({
      solicitadoPor: 'user-id-1',
      itens: [
        { nomeProduto: 'Notebook', quantidade: 2 },
        { nomeProduto: 'Mouse', quantidade: 5, precoEstimado: 80 },
      ],
    })

    expect(mockRepo.criar).toHaveBeenCalledOnce()
  })

  it('passa fornecedorId e setorSolicitante quando informados', async () => {
    await useCase.execute({
      solicitadoPor: 'user-id-1',
      setorSolicitante: 'ADMINISTRACAO',
      fornecedorId: 'forn-id-1',
      itens: [{ nomeProduto: 'Cadeira', quantidade: 1 }],
    })

    expect(mockRepo.criar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando itens está vazio', async () => {
    await expect(
      useCase.execute({ solicitadoPor: 'user-id-1', itens: [] })
    ).rejects.toThrow(DomainError)

    expect(mockRepo.criar).not.toHaveBeenCalled()
  })
})
