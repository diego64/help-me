import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReembolsoStatus } from '@prisma/client'

import { cancelarReembolsoUseCase } from '@application/use-cases/reembolso/cancelar-reembolso.use-case'
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
  usuarioId: 'solicitante-id',
  usuarioRegra: 'USUARIO',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
    id: 'reembolso-id',
    status: ReembolsoStatus.PENDENTE,
    solicitanteId: 'solicitante-id',
  } as any)
  vi.mocked(prisma.reembolso.update).mockResolvedValue({ id: 'reembolso-id', status: ReembolsoStatus.CANCELADO } as any)
})

describe('cancelarReembolsoUseCase', () => {
  it('deve lançar NOT_FOUND quando reembolso não existe', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null)

    const error = await cancelarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar FORBIDDEN quando não é dono e não é ADMIN', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
      id: 'reembolso-id',
      status: ReembolsoStatus.PENDENTE,
      solicitanteId: 'outro-usuario',
    } as any)

    const error = await cancelarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('FORBIDDEN')
  })

  it('deve lançar STATUS_INVALIDO quando status não é PENDENTE', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
      id: 'reembolso-id',
      status: ReembolsoStatus.APROVADO,
      solicitanteId: 'solicitante-id',
    } as any)

    const error = await cancelarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('STATUS_INVALIDO')
  })

  it('deve cancelar com sucesso quando é dono', async () => {
    const result = await cancelarReembolsoUseCase(makeInput())

    expect(prisma.reembolso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ReembolsoStatus.CANCELADO }),
      })
    )
    expect(result.message).toContain('cancelado')
  })

  it('deve permitir ADMIN cancelar reembolso de outro usuário', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
      id: 'reembolso-id',
      status: ReembolsoStatus.PENDENTE,
      solicitanteId: 'outro-usuario',
    } as any)

    const result = await cancelarReembolsoUseCase(makeInput({ usuarioRegra: 'ADMIN' }))

    expect(result.message).toContain('cancelado')
  })

  it('deve lançar ReembolsoError CANCEL_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.reembolso.update).mockRejectedValue(new Error('DB error'))

    const error = await cancelarReembolsoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('CANCEL_ERROR')
  })
})
