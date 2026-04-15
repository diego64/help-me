import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listarComprovantesUseCase } from '@application/use-cases/reembolso/comprovantes/listar-comprovantes.use-case'
import { ReembolsoError } from '@application/use-cases/reembolso/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    reembolso: {
      findUnique: vi.fn(),
    },
    anexoReembolso: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { prisma } from '@infrastructure/database/prisma/client'

const makeInput = (overrides: any = {}) => ({
  reembolsoId: 'reembolso-id',
  usuarioId: 'solicitante-id',
  usuarioRegra: 'USUARIO',
  ...overrides,
})

const makeComprovante = (overrides: any = {}) => ({
  id: 'comp-id',
  nomeOriginal: 'nota.pdf',
  mimetype: 'application/pdf',
  tamanho: 1024,
  objetoMinio: 'bucket/path',
  criadoEm: new Date(),
  autor: { id: 'solicitante-id', nome: 'Diego', sobrenome: 'Dev' },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
    id: 'reembolso-id',
    solicitanteId: 'solicitante-id',
  } as any)
  vi.mocked(prisma.anexoReembolso.findMany).mockResolvedValue([makeComprovante()] as any)
})

describe('listarComprovantesUseCase', () => {
  it('deve lançar NOT_FOUND quando reembolso não existe', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue(null)

    const error = await listarComprovantesUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('deve lançar FORBIDDEN quando não é dono e sem permissão', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
      id: 'reembolso-id',
      solicitanteId: 'outro-usuario',
    } as any)

    const error = await listarComprovantesUseCase(makeInput({
      usuarioId: 'u1',
      usuarioRegra: 'TECNICO',
    })).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('FORBIDDEN')
  })

  it('deve retornar comprovantes mapeados quando é o dono', async () => {
    const result = await listarComprovantesUseCase(makeInput())

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'comp-id',
      nomeOriginal: 'nota.pdf',
      autor: { id: 'solicitante-id', nome: 'Diego Dev' },
    })
  })

  it('deve retornar comprovantes quando regra é ADMIN', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
      id: 'reembolso-id',
      solicitanteId: 'outro-usuario',
    } as any)

    const result = await listarComprovantesUseCase(makeInput({
      usuarioId: 'admin-id',
      usuarioRegra: 'ADMIN',
    }))

    expect(result).toBeDefined()
  })

  it('deve retornar comprovantes quando regra é GESTOR', async () => {
    vi.mocked(prisma.reembolso.findUnique).mockResolvedValue({
      id: 'reembolso-id',
      solicitanteId: 'outro-usuario',
    } as any)

    const result = await listarComprovantesUseCase(makeInput({
      usuarioId: 'gestor-id',
      usuarioRegra: 'GESTOR',
    }))

    expect(result).toBeDefined()
  })

  it('deve lançar ReembolsoError LIST_ERROR em erro inesperado', async () => {
    vi.mocked(prisma.anexoReembolso.findMany).mockRejectedValue(new Error('DB error'))

    const error = await listarComprovantesUseCase(makeInput()).catch(e => e)

    expect(error).toBeInstanceOf(ReembolsoError)
    expect(error.code).toBe('LIST_ERROR')
  })
})
