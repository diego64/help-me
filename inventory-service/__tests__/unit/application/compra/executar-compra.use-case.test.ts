import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExecutarCompraUseCase } from '@application/use-cases/compra/executar-compra.use-case'
import {
  SolicitacaoCompra,
  StatusSolicitacaoCompra,
  FormaPagamento,
} from '@/domain/compra/solicitacao-compra.entity'
import { ItemSolicitacaoCompra } from '@/domain/compra/item-solicitacao-compra.entity'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/compra.producer', () => ({
  publicarCompraExecutada: vi.fn(),
}))

const mockSolicitacaoRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorOcNumero: vi.fn(),
  listarItensDaSolicitacao: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const mockItemRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorSku: vi.fn(),
  buscarPorNumero: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
  registrarMovimentacao: vi.fn(),
  listarMovimentacoesPorItem: vi.fn(),
}

const useCase = new ExecutarCompraUseCase(mockSolicitacaoRepo as any, mockItemRepo as any)

const makeAprovada = () =>
  SolicitacaoCompra.create({
    id: 'compra-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status: StatusSolicitacaoCompra.APROVADO,
    formaPagamento: FormaPagamento.PIX,
    parcelas: 0,
    aprovadoPor: 'gestor-id',
    aprovadoEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeComprada = () =>
  SolicitacaoCompra.create({
    ...makeAprovada(),
    status: StatusSolicitacaoCompra.COMPRADO,
    executadoPor: 'comprador-id',
    executadoEm: new Date(),
  })

const makeItemSolicitacao = (itemInventarioId: string | null = null) =>
  ItemSolicitacaoCompra.create({
    id: 'item-sol-id-1',
    solicitacaoCompraId: 'compra-id-1',
    itemInventarioId: itemInventarioId ?? undefined,
    nomeProduto: 'Notebook',
    quantidade: 2,
    precoEstimado: 4500,
  })

const makeItemInventario = () =>
  ItemInventario.create({
    id: 'item-inv-id-1',
    numero: 'INV0000001',
    nome: 'Notebook Dell',
    sku: 'ELE-NOTE-001',
    unidade: UnidadeMedida.UN,
    estoqueAtual: 3,
    estoqueMinimo: 1,
    categoriaId: 'cat-id-1',
    criadoPor: 'user-id-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('ExecutarCompraUseCase', () => {
  beforeEach(() => {
    mockSolicitacaoRepo.buscarPorId.mockResolvedValue(makeAprovada())
    mockSolicitacaoRepo.listarItensDaSolicitacao.mockResolvedValue([makeItemSolicitacao()])
    mockSolicitacaoRepo.atualizar.mockResolvedValue(makeComprada())
  })

  it('executa compra sem itens vinculados ao inventário', async () => {
    const result = await useCase.execute({
      id: 'compra-id-1',
      executadoPor: 'comprador-id',
    })

    expect(result.status).toBe(StatusSolicitacaoCompra.COMPRADO)
    expect(mockItemRepo.buscarPorId).not.toHaveBeenCalled()
    expect(mockSolicitacaoRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('registra entrada de estoque para itens vinculados', async () => {
    mockSolicitacaoRepo.listarItensDaSolicitacao.mockResolvedValue([
      makeItemSolicitacao('item-inv-id-1'),
    ])
    mockItemRepo.buscarPorId.mockResolvedValue(makeItemInventario())
    mockItemRepo.atualizar.mockResolvedValue(makeItemInventario())
    mockItemRepo.registrarMovimentacao.mockResolvedValue({})

    const result = await useCase.execute({
      id: 'compra-id-1',
      executadoPor: 'comprador-id',
      valorTotal: 9000,
    })

    expect(result.status).toBe(StatusSolicitacaoCompra.COMPRADO)
    expect(mockItemRepo.atualizar).toHaveBeenCalledOnce()
    expect(mockItemRepo.registrarMovimentacao).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando solicitação não encontrada', async () => {
    mockSolicitacaoRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', executadoPor: 'comprador-id' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando status não é APROVADO (domínio)', async () => {
    mockSolicitacaoRepo.buscarPorId.mockResolvedValue(
      SolicitacaoCompra.create({
        id: 'compra-id-1',
        acNumero: 'AC0000001',
        ocNumero: 'OC0000001',
        solicitadoPor: 'user-id-1',
        status: StatusSolicitacaoCompra.PENDENTE,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })
    )

    await expect(
      useCase.execute({ id: 'compra-id-1', executadoPor: 'comprador-id' })
    ).rejects.toThrow(DomainError)

    expect(mockSolicitacaoRepo.atualizar).not.toHaveBeenCalled()
  })
})
