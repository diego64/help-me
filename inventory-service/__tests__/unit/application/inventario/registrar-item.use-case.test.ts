import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegistrarItemUseCase } from '@application/use-cases/inventario/registrar-item.use-case'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { Categoria } from '@/domain/inventario/categoria.entity'
import { SolicitacaoCompra, StatusSolicitacaoCompra } from '@/domain/compra/solicitacao-compra.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@infrastructure/database/numero-sequencial', () => ({
  proximoNumero: vi.fn().mockResolvedValue('INV0000001'),
}))

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

const mockCategoriaRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorNome: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
  deletar: vi.fn(),
}

const mockSolicitacaoRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  buscarPorOcNumero: vi.fn(),
  listar: vi.fn(),
  atualizar: vi.fn(),
}

const useCase = new RegistrarItemUseCase(
  mockItemRepo as any,
  mockCategoriaRepo as any,
  mockSolicitacaoRepo as any,
)

const makeCategoria = () =>
  Categoria.create({ id: 'cat-id-1', nome: 'EPIs', descricao: null, criadoEm: new Date(), atualizadoEm: new Date() })

const makeSolicitacao = (status = StatusSolicitacaoCompra.COMPRADO) =>
  SolicitacaoCompra.create({
    id: 'sc-id-1',
    acNumero: 'AC0000001',
    ocNumero: 'OC0000001',
    solicitadoPor: 'user-id-1',
    status,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeItem = (sku = 'EPI-CAP-001') =>
  ItemInventario.create({
    id: 'item-id-1',
    numero: 'INV0000001',
    nome: 'Capacete',
    sku,
    unidade: UnidadeMedida.UN,
    estoqueAtual: 1,
    estoqueMinimo: 0,
    categoriaId: 'cat-id-1',
    criadoPor: 'user-id-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const INPUT = {
  nome: 'Capacete',
  sku: 'EPI-CAP-001',
  unidade: UnidadeMedida.UN,
  quantidade: 1,
  categoriaId: 'cat-id-1',
  ocNumero: 'OC0000001',
  criadoPor: 'user-id-1',
}

describe('RegistrarItemUseCase', () => {
  beforeEach(() => {
    mockCategoriaRepo.buscarPorId.mockResolvedValue(makeCategoria())
    mockSolicitacaoRepo.buscarPorOcNumero.mockResolvedValue(makeSolicitacao())
    mockItemRepo.buscarPorSku.mockResolvedValue(null)
    mockItemRepo.criar.mockImplementation(async (item: ItemInventario) => item)
  })

  it('registra um item com sucesso', async () => {
    const result = await useCase.execute(INPUT)

    expect(result).toHaveLength(1)
    expect(mockItemRepo.criar).toHaveBeenCalledOnce()
  })

  it('registra múltiplos itens com SKUs numerados', async () => {
    const { proximoNumero } = await import('@infrastructure/database/numero-sequencial')
    vi.mocked(proximoNumero)
      .mockResolvedValueOnce('INV0000001')
      .mockResolvedValueOnce('INV0000002')

    mockItemRepo.criar
      .mockResolvedValueOnce(makeItem('EPI-CAP-001-01'))
      .mockResolvedValueOnce(makeItem('EPI-CAP-001-02'))

    const result = await useCase.execute({ ...INPUT, quantidade: 2 })

    expect(result).toHaveLength(2)
    expect(mockItemRepo.criar).toHaveBeenCalledTimes(2)
  })

  it('lança DomainError quando quantidade é zero', async () => {
    await expect(useCase.execute({ ...INPUT, quantidade: 0 })).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando quantidade é negativa', async () => {
    await expect(useCase.execute({ ...INPUT, quantidade: -1 })).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando quantidade não é inteiro', async () => {
    await expect(useCase.execute({ ...INPUT, quantidade: 1.5 })).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando categoria não existe', async () => {
    mockCategoriaRepo.buscarPorId.mockResolvedValue(null)

    await expect(useCase.execute(INPUT)).rejects.toThrow(DomainError)
    expect(mockItemRepo.criar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando ordem de compra não existe', async () => {
    mockSolicitacaoRepo.buscarPorOcNumero.mockResolvedValue(null)

    await expect(useCase.execute(INPUT)).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando ordem de compra não está com status COMPRADO', async () => {
    mockSolicitacaoRepo.buscarPorOcNumero.mockResolvedValue(makeSolicitacao(StatusSolicitacaoCompra.APROVADO))

    await expect(useCase.execute(INPUT)).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando SKU já existe', async () => {
    mockItemRepo.buscarPorSku.mockResolvedValue(makeItem())

    await expect(useCase.execute(INPUT)).rejects.toThrow(DomainError)
    expect(mockItemRepo.criar).not.toHaveBeenCalled()
  })
})
