import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CriarBaixaUseCase } from '@application/use-cases/baixa/criar-baixa.use-case'
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/baixa.producer', () => ({
  publicarBaixaCriada: vi.fn(),
}))

const mockBaixaRepo = {
  criar: vi.fn(),
  buscarPorId: vi.fn(),
  listarItensDaBaixa: vi.fn(),
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

const useCase = new CriarBaixaUseCase(mockBaixaRepo as any, mockItemRepo as any)

const makeItemInventario = (estoqueAtual = 1) =>
  ItemInventario.create({
    id: 'item-id-1',
    numero: 'INV0000001',
    nome: 'Capacete de Segurança',
    sku: 'EPI-CAP-001',
    unidade: UnidadeMedida.UN,
    estoqueAtual,
    estoqueMinimo: 2,
    categoriaId: 'cat-id-1',
    criadoPor: 'user-id-1',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeBaixa = () =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status: StatusBaixa.PENDENTE,
    justificativa: 'Item quebrado',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('CriarBaixaUseCase', () => {
  beforeEach(() => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(makeItemInventario())
    mockBaixaRepo.criar.mockResolvedValue(makeBaixa())
  })

  it('cria baixa com um item válido', async () => {
    const result = await useCase.execute({
      solicitadoPor: 'user-id-1',
      perfilSolicitante: 'USUARIO',
      justificativa: 'Capacete com trinca estrutural',
      itens: [{ numeroInventario: 'INV0000001', quantidade: 1, motivo: 'QUEBRA' }],
    })

    expect(result.status).toBe(StatusBaixa.PENDENTE)
    expect(mockBaixaRepo.criar).toHaveBeenCalledOnce()
  })

  it('cria baixa com múltiplos itens', async () => {
    mockItemRepo.buscarPorNumero
      .mockResolvedValueOnce(makeItemInventario())
      .mockResolvedValueOnce(
        ItemInventario.create({
          id: 'item-id-2',
          numero: 'INV0000002',
          nome: 'Luva Nitrílica',
          sku: 'EPI-LUV-001',
          unidade: UnidadeMedida.CX,
          estoqueAtual: 3,
          estoqueMinimo: 2,
          categoriaId: 'cat-id-1',
          criadoPor: 'user-id-1',
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        })
      )

    await useCase.execute({
      solicitadoPor: 'user-id-1',
      perfilSolicitante: 'TECNICO',
      justificativa: 'Itens deteriorados',
      itens: [
        { numeroInventario: 'INV0000001', quantidade: 1, motivo: 'QUEBRA' },
        { numeroInventario: 'INV0000002', quantidade: 1, motivo: 'VENCIMENTO' },
      ],
    })

    expect(mockBaixaRepo.criar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando itens está vazio', async () => {
    await expect(
      useCase.execute({
        solicitadoPor: 'user-id-1',
        perfilSolicitante: 'USUARIO',
        justificativa: 'Justificativa',
        itens: [],
      })
    ).rejects.toThrow(DomainError)

    expect(mockBaixaRepo.criar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando item não encontrado no inventário', async () => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(null)

    await expect(
      useCase.execute({
        solicitadoPor: 'user-id-1',
        perfilSolicitante: 'USUARIO',
        justificativa: 'Justificativa',
        itens: [{ numeroInventario: 'INVALIDO', quantidade: 1 }],
      })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando item sem estoque disponível', async () => {
    mockItemRepo.buscarPorNumero.mockResolvedValue(makeItemInventario(0))

    await expect(
      useCase.execute({
        solicitadoPor: 'user-id-1',
        perfilSolicitante: 'USUARIO',
        justificativa: 'Justificativa',
        itens: [{ numeroInventario: 'INV0000001', quantidade: 1 }],
      })
    ).rejects.toThrow(DomainError)

    expect(mockBaixaRepo.criar).not.toHaveBeenCalled()
  })
})
