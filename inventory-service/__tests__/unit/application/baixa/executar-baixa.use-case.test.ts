import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExecutarBaixaUseCase } from '@application/use-cases/baixa/executar-baixa.use-case'
import { Baixa, StatusBaixa } from '@/domain/baixa/baixa.entity'
import { ItemBaixa } from '@/domain/baixa/item-baixa.entity'
import { ItemInventario, UnidadeMedida } from '@/domain/inventario/item-inventario.entity'
import { DomainError } from '@/domain/shared/domain.error'

vi.mock('@messaging/producers/baixa.producer', () => ({
  publicarBaixaConcluida: vi.fn(),
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

const useCase = new ExecutarBaixaUseCase(mockBaixaRepo as any, mockItemRepo as any)

const makeBaixa = (status: StatusBaixa) =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status,
    justificativa: 'Item quebrado',
    aprovadoTecnicoPor: 'tecnico-id',
    aprovadoTecnicoEm: new Date(),
    aprovadoGestorPor: 'gestor-id',
    aprovadoGestorEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

const makeItemBaixa = () =>
  ItemBaixa.create({
    id: 'item-baixa-id-1',
    baixaId: 'baixa-id-1',
    itemInventarioId: 'item-inv-id-1',
    quantidade: 1,
    motivo: 'QUEBRA',
  })

const makeItemInventario = (estoqueAtual = 1) =>
  ItemInventario.create({
    id: 'item-inv-id-1',
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

const makeConcluida = () =>
  Baixa.create({
    id: 'baixa-id-1',
    solicitadoPor: 'user-id-1',
    perfilSolicitante: 'USUARIO',
    status: StatusBaixa.CONCLUIDO,
    justificativa: 'Item quebrado',
    aprovadoTecnicoPor: 'tecnico-id',
    aprovadoTecnicoEm: new Date(),
    aprovadoGestorPor: 'gestor-id',
    aprovadoGestorEm: new Date(),
    executadoPor: 'inventariante-id',
    executadoEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  })

describe('ExecutarBaixaUseCase', () => {
  beforeEach(() => {
    mockBaixaRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_GESTOR))
    mockBaixaRepo.listarItensDaBaixa.mockResolvedValue([makeItemBaixa()])
    mockItemRepo.buscarPorId.mockResolvedValue(makeItemInventario())
    mockItemRepo.atualizar.mockResolvedValue(makeItemInventario(0))
    mockItemRepo.registrarMovimentacao.mockResolvedValue({})
    mockBaixaRepo.atualizar.mockResolvedValue(makeConcluida())
  })

  it('executa baixa APROVADO_GESTOR e atualiza estoque', async () => {
    const result = await useCase.execute({
      id: 'baixa-id-1',
      executadoPor: 'inventariante-id',
    })

    expect(result.status).toBe(StatusBaixa.CONCLUIDO)
    expect(result.executadoPor).toBe('inventariante-id')
    expect(mockItemRepo.atualizar).toHaveBeenCalledOnce()
    expect(mockItemRepo.registrarMovimentacao).toHaveBeenCalledOnce()
    expect(mockBaixaRepo.atualizar).toHaveBeenCalledOnce()
  })

  it('lança DomainError quando baixa não encontrada', async () => {
    mockBaixaRepo.buscarPorId.mockResolvedValue(null)

    await expect(
      useCase.execute({ id: 'nao-existe', executadoPor: 'inventariante-id' })
    ).rejects.toThrow(DomainError)
  })

  it('lança DomainError quando baixa não possui itens', async () => {
    mockBaixaRepo.listarItensDaBaixa.mockResolvedValue([])

    await expect(
      useCase.execute({ id: 'baixa-id-1', executadoPor: 'inventariante-id' })
    ).rejects.toThrow(DomainError)

    expect(mockBaixaRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando status não é APROVADO_GESTOR', async () => {
    mockBaixaRepo.buscarPorId.mockResolvedValue(makeBaixa(StatusBaixa.APROVADO_TECNICO))

    await expect(
      useCase.execute({ id: 'baixa-id-1', executadoPor: 'inventariante-id' })
    ).rejects.toThrow(DomainError)

    expect(mockBaixaRepo.atualizar).not.toHaveBeenCalled()
  })

  it('lança DomainError quando estoque insuficiente para a quantidade da baixa', async () => {
    mockBaixaRepo.listarItensDaBaixa.mockResolvedValue([
      ItemBaixa.create({
        id: 'item-baixa-id-1',
        baixaId: 'baixa-id-1',
        itemInventarioId: 'item-inv-id-1',
        quantidade: 5, // quantidade maior que o estoque disponível (1)
        motivo: 'QUEBRA',
      }),
    ])

    await expect(
      useCase.execute({ id: 'baixa-id-1', executadoPor: 'inventariante-id' })
    ).rejects.toThrow(DomainError)

    expect(mockBaixaRepo.atualizar).not.toHaveBeenCalled()
  })
})
