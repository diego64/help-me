import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReembolsoStatus } from '@prisma/client'

import { aprovarReembolsoUseCase } from '@application/use-cases/reembolso/aprovar-reembolso.use-case'
import { ReembolsoError } from '@application/use-cases/reembolso/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    reembolso: {
      findUnique: vi.fn(),
      update:     vi.fn(),
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
  aprovadorId: 'aprovador-id',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({ id: 'reembolso-id', status: ReembolsoStatus.PENDENTE } as any)
  vi.mocked(prisma.reembolso.update).mockResolvedValue({ id: 'reembolso-id', status: ReembolsoStatus.APROVADO } as any)
})

describe('aprovarReembolsoUseCase', () => {
  it('deve lançar NOT_FOUND quando reembolso não existe', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null)

    const error = await aprovarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
  })

  it('deve lançar STATUS_INVALIDO quando status não é PENDENTE', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(
      { id: 'reembolso-id', status: ReembolsoStatus.APROVADO } as any
    )

    const error = await aprovarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('STATUS_INVALIDO')
  })

  it('deve atualizar status para APROVADO em caso de sucesso', async () => {
    const result = await aprovarReembolsoUseCase(makeInput())

    expect(prisma.reembolso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ReembolsoStatus.APROVADO, aprovadorId: 'aprovador-id' }),
      })
    )
    expect(result.message).toContain('aprovado')
  })

  it('deve lançar ReembolsoError APPROVE_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.reembolso.update).mockRejectedValue(new Error('DB error'))

    const error = await aprovarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('APPROVE_ERROR')
  })
})
