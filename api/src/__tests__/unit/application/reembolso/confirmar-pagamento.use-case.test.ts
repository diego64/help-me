import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReembolsoStatus } from '@prisma/client'

import { confirmarPagamentoUseCase } from '@application/use-cases/reembolso/confirmar-pagamento.use-case'
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
  pagadorId: 'pagador-id',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({ id: 'reembolso-id', status: ReembolsoStatus.APROVADO } as any)
  vi.mocked(prisma.reembolso.update).mockResolvedValue({ id: 'reembolso-id', status: ReembolsoStatus.PAGO } as any)
})

describe('confirmarPagamentoUseCase', () => {
  it('deve lançar NOT_FOUND quando reembolso não existe', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null)

    const error = await confirmarPagamentoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar STATUS_INVALIDO quando status não é APROVADO', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(
      { id: 'reembolso-id', status: ReembolsoStatus.PENDENTE } as any
    )

    const error = await confirmarPagamentoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('STATUS_INVALIDO')
  })

  it('deve confirmar pagamento sem comprovante', async () => {
    const result = await confirmarPagamentoUseCase(makeInput())

    expect(prisma.reembolso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ReembolsoStatus.PAGO, pagadorId: 'pagador-id' }),
      })
    )
    expect(result.message).toContain('confirmado')
  })

  it('deve confirmar pagamento com comprovantePagamentoUrl', async () => {
    await confirmarPagamentoUseCase(makeInput({ comprovantePagamentoUrl: 'https://url/comprovante.pdf' }))

    expect(prisma.reembolso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ comprovantePagamentoUrl: 'https://url/comprovante.pdf' }),
      })
    )
  })

  it('deve lançar ReembolsoError PAYMENT_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.reembolso.update).mockRejectedValue(new Error('DB error'))

    const error = await confirmarPagamentoUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('PAYMENT_ERROR')
  })
})
