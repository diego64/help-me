import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReembolsoStatus } from '@prisma/client'

import { listarReembolsosUseCase } from '@application/use-cases/reembolso/listar-reembolsos.use-case'
import { ReembolsoError } from '@application/use-cases/reembolso/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    reembolso: {
      count:    vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@application/use-cases/reembolso/formatters', () => ({
  formatarReembolsoResposta: vi.fn().mockImplementation((r: any) => ({ ...r })),
}))

import { prisma } from '@infrastructure/database/prisma/client'

const makeInput = (overrides: any = {}) => ({
  pagina: 1,
  limite: 10,
  usuarioAutenticado: { id: 'u1', regra: 'ADMIN' },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.reembolso.count).mockResolvedValue(0)
  vi.mocked(prisma.reembolso.findMany).mockResolvedValue([])
})

describe('listarReembolsosUseCase', () => {
  describe('filtros por regra', () => {
    it('USUARIO deve ver apenas os próprios', async () => {
      await listarReembolsosUseCase(makeInput({ usuarioAutenticado: { id: 'u1', regra: 'USUARIO' } }))

      expect(prisma.reembolso.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ solicitanteId: 'u1' }) })
      )
    })

    it('TECNICO deve ver apenas os próprios', async () => {
      await listarReembolsosUseCase(makeInput({ usuarioAutenticado: { id: 't1', regra: 'TECNICO' } }))

      expect(prisma.reembolso.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ solicitanteId: 't1' }) })
      )
    })

    it('INVENTARIANTE deve ver apenas os próprios', async () => {
      await listarReembolsosUseCase(makeInput({ usuarioAutenticado: { id: 'i1', regra: 'INVENTARIANTE' } }))

      expect(prisma.reembolso.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ solicitanteId: 'i1' }) })
      )
    })

    it('COMPRADOR deve ver apenas os APROVADOS', async () => {
      await listarReembolsosUseCase(makeInput({ usuarioAutenticado: { id: 'c1', regra: 'COMPRADOR' } }))

      expect(prisma.reembolso.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: ReembolsoStatus.APROVADO }) })
      )
    })

    it('ADMIN deve ver todos (sem filtro de solicitanteId)', async () => {
      await listarReembolsosUseCase(makeInput())

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where).not.toHaveProperty('solicitanteId')
    })
  })

  describe('filtros opcionais', () => {
    it('deve aplicar filtro de status único (não COMPRADOR)', async () => {
      await listarReembolsosUseCase(makeInput({ status: 'PENDENTE' }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where.status).toBe(ReembolsoStatus.PENDENTE)
    })

    it('deve aplicar filtro de múltiplos status', async () => {
      await listarReembolsosUseCase(makeInput({ status: 'PENDENTE,APROVADO' }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where.status).toEqual({ in: [ReembolsoStatus.PENDENTE, ReembolsoStatus.APROVADO] })
    })

    it('não deve aplicar filtro de status para COMPRADOR', async () => {
      await listarReembolsosUseCase(makeInput({
        status: 'PENDENTE',
        usuarioAutenticado: { id: 'c1', regra: 'COMPRADOR' },
      }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where.status).toBe(ReembolsoStatus.APROVADO) // só o APROVADO do COMPRADOR
    })

    it('deve aplicar filtro de categoria', async () => {
      await listarReembolsosUseCase(makeInput({ categoria: 'ALIMENTACAO' }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where.categoria).toBe('ALIMENTACAO')
    })

    it('deve aplicar filtro de setor (não USUARIO)', async () => {
      await listarReembolsosUseCase(makeInput({ setor: 'TI' }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where.setor).toBe('TI')
    })

    it('não deve aplicar filtro de setor para USUARIO', async () => {
      await listarReembolsosUseCase(makeInput({
        setor: 'TI',
        usuarioAutenticado: { id: 'u1', regra: 'USUARIO' },
      }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where).not.toHaveProperty('setor')
    })

    it('deve aplicar filtro dataInicio', async () => {
      await listarReembolsosUseCase(makeInput({ dataInicio: '2024-01-01' }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where.geradoEm?.gte).toBeDefined()
    })

    it('deve aplicar filtro dataFim', async () => {
      await listarReembolsosUseCase(makeInput({ dataFim: '2024-01-31' }))

      const [args] = vi.mocked(prisma.reembolso.count).mock.calls[0] as any[]
      expect(args.where.geradoEm?.lte).toBeDefined()
    })
  })

  describe('paginação', () => {
    it('deve retornar metadados de paginação corretos', async () => {
      vi.mocked(prisma.reembolso.count).mockResolvedValue(25)

      const result = await listarReembolsosUseCase(makeInput({ pagina: 1, limite: 10 }))

      expect(result.paginacao.total).toBe(25)
      expect(result.paginacao.totalPaginas).toBe(3)
      expect(result.paginacao.temProxima).toBe(true)
      expect(result.paginacao.temAnterior).toBe(false)
    })
  })

  describe('tratamento de erros', () => {
    it('deve lançar ReembolsoError LIST_ERROR em erro inesperado', async () => {
      vi.mocked(prisma.reembolso.count).mockRejectedValue(new Error('DB error'))

      const error = await listarReembolsosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ReembolsoError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve relançar ReembolsoError sem encapsular', async () => {
      const reembolsoError = new ReembolsoError('Erro', 'NOT_FOUND', 404)
      vi.mocked(prisma.reembolso.count).mockRejectedValue(reembolsoError)

      const error = await listarReembolsosUseCase(makeInput()).catch(e => e)

      expect(error).toBe(reembolsoError)
    })
  })
})
