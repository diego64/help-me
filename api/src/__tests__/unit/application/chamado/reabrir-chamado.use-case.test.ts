import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado } from '@prisma/client'

import { reabrirChamadoUseCase } from '@application/use-cases/chamado/reabrir-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    usuario: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@infrastructure/database/mongodb/atualizacao.chamado.model', () => ({
  default: {
    findOne: vi.fn(),
    create:  vi.fn().mockReturnValue(Promise.resolve()),
  },
}))

vi.mock('@infrastructure/messaging/kafka/producers/notificacao.producer', () => ({
  publicarChamadoReaberto: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn().mockImplementation((c: any) => ({ ...c })),
}))

import { prisma } from '@infrastructure/database/prisma/client'
import ChamadoAtualizacaoModel from '@infrastructure/database/mongodb/atualizacao.chamado.model'

const makeInput = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  usuarioId: 'usuario-id-123',
  usuarioNome: 'Diego Dev',
  usuarioEmail: 'diego@email.com',
  ...overrides,
})

const DATA_RECENTE = new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hora atrás

const makeChamado = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  descricao: 'Problema',
  status: ChamadoStatus.ENCERRADO,
  prioridade: PrioridadeChamado.P4,
  usuarioId: 'usuario-id-123',
  tecnicoId: 'tecnico-id-123',
  encerradoEm: DATA_RECENTE,
  usuario: { nome: 'Diego', sobrenome: 'Dev' },
  tecnico: { id: 'tecnico-id-123', email: 'tec@email.com', nome: 'Tec', sobrenome: 'Nico', nivel: 'N1' },
  ...overrides,
})

const makeChamadoAtualizado = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  status: ChamadoStatus.REABERTO,
  usuario: null,
  tecnico: null,
  alteradorPrioridade: null,
  servicos: [],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({ chamado: { update: vi.fn().mockResolvedValue(makeChamadoAtualizado()) } })
  )
  vi.mocked(ChamadoAtualizacaoModel.create as any).mockReturnValue(Promise.resolve())
})

describe('reabrirChamadoUseCase', () => {
  it('deve lançar NOT_FOUND quando chamado não existe', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

    const error = await reabrirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
  })

  it('deve lançar FORBIDDEN quando usuarioId é diferente', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ usuarioId: 'outro-usuario' }) as any
    )

    const error = await reabrirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('FORBIDDEN')
    expect(error.statusCode).toBe(403)
  })

  it('deve lançar INVALID_STATUS quando chamado não está ENCERRADO', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ status: ChamadoStatus.ABERTO }) as any
    )

    const error = await reabrirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('INVALID_STATUS')
  })

  it('deve lançar INVALID_STATUS quando encerradoEm é null', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ encerradoEm: null }) as any
    )

    const error = await reabrirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('INVALID_STATUS')
  })

  it('deve lançar DEADLINE_EXCEEDED quando passou mais de 48h', async () => {
    const maisDeUmDiaAtras = new Date(Date.now() - 49 * 60 * 60 * 1000)
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ encerradoEm: maisDeUmDiaAtras }) as any
    )

    const error = await reabrirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('DEADLINE_EXCEEDED')
  })

  it('deve atualizar status para REABERTO em caso de sucesso', async () => {
    const result = await reabrirChamadoUseCase(makeInput())

    expect(result).toBeDefined()
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('deve buscar último técnico via ChamadoAtualizacaoModel quando tecnicoId é null', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ tecnicoId: null, tecnico: null }) as any
    )
    vi.mocked(ChamadoAtualizacaoModel.findOne as any).mockResolvedValue({ autorId: 'tec-old' })

    await reabrirChamadoUseCase(makeInput())

    expect(ChamadoAtualizacaoModel.findOne).toHaveBeenCalledWith(
      { chamadoId: 'chamado-id-123', tipo: 'STATUS', para: 'EM_ATENDIMENTO' },
      { autorId: 1 },
      { sort: { dataHora: -1 } }
    )
  })

  it('deve lançar ChamadoError REOPEN_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('DB error'))

    const error = await reabrirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('REOPEN_ERROR')
  })

  it('deve continuar mesmo se ChamadoAtualizacaoModel.create falhar', async () => {
    vi.mocked(ChamadoAtualizacaoModel.create as any).mockReturnValue(Promise.reject(new Error('Mongo error')))

    await expect(reabrirChamadoUseCase(makeInput())).resolves.toBeDefined()
  })

  it('deve continuar mesmo se publicarChamadoReaberto falhar', async () => {
    const { publicarChamadoReaberto } = await import('@infrastructure/messaging/kafka/producers/notificacao.producer')
    vi.mocked(publicarChamadoReaberto).mockRejectedValue(new Error('Kafka error'))

    await expect(reabrirChamadoUseCase(makeInput())).resolves.toBeDefined()
  })

  it('deve retornar null quando buscarUltimoTecnico lança erro', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ tecnicoId: null, tecnico: null }) as any
    )
    vi.mocked(ChamadoAtualizacaoModel.findOne as any).mockRejectedValue(new Error('Mongo error'))

    // Should not throw - buscarUltimoTecnico swallows errors
    await expect(reabrirChamadoUseCase(makeInput())).resolves.toBeDefined()
  })

  it('deve chamar usuario.findUnique quando tecnicoId existe mas tecnico é null', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ tecnicoId: 'tec-id-from-db', tecnico: null }) as any
    )
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: 'tec-id-from-db',
      email: 'tec@email.com',
      nome: 'Tec',
      sobrenome: 'Nico',
      nivel: 'N1',
    } as any)

    await expect(reabrirChamadoUseCase(makeInput())).resolves.toBeDefined()
  })

  it('deve retornar null para tecnicoParaNotificar quando usuario.findUnique falha', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ tecnicoId: 'tec-id', tecnico: null }) as any
    )
    vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('DB error'))

    // Should not throw - .catch(() => null) handles this
    await expect(reabrirChamadoUseCase(makeInput())).resolves.toBeDefined()
  })
})
