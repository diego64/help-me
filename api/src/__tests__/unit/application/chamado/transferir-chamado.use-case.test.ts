import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado, Regra } from '@prisma/client'

import { transferirChamadoUseCase } from '@application/use-cases/chamado/transferir-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  salvarHistoricoChamado: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@infrastructure/messaging/kafka/producers/notificacao.producer', () => ({
  publicarChamadoTransferido: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn().mockImplementation((c: any) => ({ ...c })),
}))

import { prisma } from '@infrastructure/database/prisma/client'

const makeInput = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  tecnicoNovoId: 'tec-novo-id',
  motivo: 'Especialidade',
  usuarioId: 'admin-id',
  usuarioNome: 'Admin',
  usuarioEmail: 'admin@email.com',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeChamado = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  status: ChamadoStatus.ABERTO,
  prioridade: PrioridadeChamado.P4,
  tecnicoId: 'tec-atual-id',
  deletadoEm: null,
  tecnico: { nome: 'Tec', sobrenome: 'Atual' },
  ...overrides,
})

const makeTecnicoNovo = (overrides: any = {}) => ({
  id: 'tec-novo-id',
  nome: 'Tec',
  sobrenome: 'Novo',
  email: 'tec.novo@email.com',
  regra: Regra.TECNICO,
  nivel: 'N2',
  ativo: true,
  deletadoEm: null,
  ...overrides,
})

const makeTransferencia = () => ({
  id: 'transf-id',
  transferidoEm: new Date(),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnicoNovo() as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({
      transferenciaChamado: { create: vi.fn().mockResolvedValue(makeTransferencia()) },
      chamado: { update: vi.fn().mockResolvedValue({ ...makeChamado(), status: ChamadoStatus.ABERTO, usuario: null, alteradorPrioridade: null, servicos: [] }) },
    })
  )
})

describe('transferirChamadoUseCase', () => {
  it('deve lançar NOT_FOUND quando chamado não existe', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar NOT_FOUND quando chamado está deletado', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ deletadoEm: new Date() }) as any
    )

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar INVALID_STATUS quando chamado está CANCELADO', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ status: ChamadoStatus.CANCELADO }) as any
    )

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('INVALID_STATUS')
  })

  it('deve lançar FORBIDDEN quando TECNICO tenta transferir chamado de outro', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ tecnicoId: 'outro-tec-id' }) as any
    )

    const error = await transferirChamadoUseCase(makeInput({
      usuarioId: 'meu-id',
      usuarioRegra: 'TECNICO',
    })).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('FORBIDDEN')
  })

  it('deve lançar SAME_TECNICO quando tecnicoNovoId é o mesmo tecnicoId atual', async () => {
    vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
      makeChamado({ tecnicoId: 'tec-novo-id' }) as any
    )

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('SAME_TECNICO')
  })

  it('deve lançar NOT_FOUND quando técnico novo não existe ou não é TECNICO', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar NOT_FOUND quando técnico novo tem regra diferente de TECNICO', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      makeTecnicoNovo({ regra: Regra.USUARIO }) as any
    )

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar TECNICO_INACTIVE quando técnico novo está inativo', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
      makeTecnicoNovo({ ativo: false }) as any
    )

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('TECNICO_INACTIVE')
  })

  it('deve transferir com sucesso e retornar resultado', async () => {
    const result = await transferirChamadoUseCase(makeInput())

    expect(result.message).toContain('transferido')
    expect(result.transferencia).toBeDefined()
    expect(result.chamado).toBeDefined()
  })

  it('deve continuar mesmo se salvarHistoricoChamado falhar', async () => {
    const { salvarHistoricoChamado } = await import('@infrastructure/repositories/atualizacao.chamado.repository')
    vi.mocked(salvarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

    await expect(transferirChamadoUseCase(makeInput())).resolves.toBeDefined()
  })

  it('deve continuar mesmo se publicarChamadoTransferido falhar', async () => {
    const { publicarChamadoTransferido } = await import('@infrastructure/messaging/kafka/producers/notificacao.producer')
    vi.mocked(publicarChamadoTransferido).mockRejectedValue(new Error('Kafka error'))

    await expect(transferirChamadoUseCase(makeInput())).resolves.toBeDefined()
  })

  it('deve lançar ChamadoError TRANSFER_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('DB error'))

    const error = await transferirChamadoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ChamadoError)
    expect(error.code).toBe('TRANSFER_ERROR')
  })
})
