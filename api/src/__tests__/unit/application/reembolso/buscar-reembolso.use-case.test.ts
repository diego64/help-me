import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReembolsoStatus } from '@prisma/client'

import { buscarReembolsoUseCase } from '@application/use-cases/reembolso/buscar-reembolso.use-case'
import { ReembolsoError } from '@application/use-cases/reembolso/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    reembolso: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@application/use-cases/reembolso/formatters', () => ({
  formatarReembolsoResposta: vi.fn().mockReturnValue({ id: 'r1' }),
}))

import { prisma } from '@infrastructure/database/prisma/client'

const makeInput = (overrides: any = {}) => ({
  id: 'reembolso-id',
  usuarioAutenticado: { id: 'solicitante-id', regra: 'USUARIO' },
  ...overrides,
})

const makeReembolso = (overrides: any = {}) => ({
  id: 'reembolso-id',
  status: ReembolsoStatus.PENDENTE,
  solicitanteId: 'solicitante-id',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(makeReembolso() as any)
})

describe('buscarReembolsoUseCase', () => {
  it('deve lançar NOT_FOUND quando reembolso não existe', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null)

    const error = await buscarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar FORBIDDEN quando não é dono e não tem permissão', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(
      makeReembolso({ solicitanteId: 'outro-id' }) as any
    )

    const error = await buscarReembolsoUseCase(makeInput({
      usuarioAutenticado: { id: 'u1', regra: 'USUARIO' },
    })).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('FORBIDDEN')
  })

  it('deve retornar reembolso quando é o dono', async () => {
    const result = await buscarReembolsoUseCase(makeInput())

    expect(result).toBeDefined()
  })

  it('deve retornar reembolso quando regra é ADMIN', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(
      makeReembolso({ solicitanteId: 'outro-id' }) as any
    )

    const result = await buscarReembolsoUseCase(makeInput({
      usuarioAutenticado: { id: 'admin-id', regra: 'ADMIN' },
    }))

    expect(result).toBeDefined()
  })

  it('deve retornar reembolso quando regra é GESTOR', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(
      makeReembolso({ solicitanteId: 'outro-id' }) as any
    )

    const result = await buscarReembolsoUseCase(makeInput({
      usuarioAutenticado: { id: 'gestor-id', regra: 'GESTOR' },
    }))

    expect(result).toBeDefined()
  })

  it('deve retornar reembolso quando regra é COMPRADOR', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(
      makeReembolso({ solicitanteId: 'outro-id' }) as any
    )

    const result = await buscarReembolsoUseCase(makeInput({
      usuarioAutenticado: { id: 'comprador-id', regra: 'COMPRADOR' },
    }))

    expect(result).toBeDefined()
  })

  it('deve lançar ReembolsoError FETCH_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockRejectedValue(new Error('DB error'))

    const error = await buscarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('FETCH_ERROR')
  })
})
