import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus, PrioridadeChamado } from '@prisma/client'

import { listarChamadosUseCase } from '@application/use-cases/chamado/listar-chamados.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      count:    vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn().mockImplementation((c: any) => ({ ...c })),
}))

import { prisma } from '@infrastructure/database/prisma/client'

const makeInput = (overrides: any = {}) => ({
  pagina: 1,
  limite: 10,
  usuarioAutenticado: { id: 'user-id', regra: 'ADMIN' },
  ...overrides,
})

const makeChamado = (overrides: any = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  status: ChamadoStatus.ABERTO,
  prioridade: PrioridadeChamado.P4,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.chamado.count).mockResolvedValue(0)
  vi.mocked(prisma.chamado.findMany).mockResolvedValue([])
})

describe('listarChamadosUseCase', () => {
  describe('filtros por regra', () => {
    it('deve filtrar por usuarioId quando regra USUARIO', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(1)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([makeChamado()] as any)

      await listarChamadosUseCase(makeInput({ usuarioAutenticado: { id: 'u1', regra: 'USUARIO' } }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ usuarioId: 'u1' }) })
      )
    })

    it('deve filtrar por tecnicoId quando regra TECNICO', async () => {
      await listarChamadosUseCase(makeInput({ usuarioAutenticado: { id: 't1', regra: 'TECNICO' } }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tecnicoId: 't1' }) })
      )
    })

    it('deve permitir filtrar por tecnicoId quando ADMIN', async () => {
      await listarChamadosUseCase(makeInput({ tecnicoId: 'tec-1', usuarioAutenticado: { id: 'admin', regra: 'ADMIN' } }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tecnicoId: 'tec-1' }) })
      )
    })

    it('deve permitir filtrar por usuarioId quando ADMIN', async () => {
      await listarChamadosUseCase(makeInput({ usuarioId: 'u1', usuarioAutenticado: { id: 'admin', regra: 'ADMIN' } }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ usuarioId: 'u1' }) })
      )
    })
  })

  describe('filtro de status', () => {
    it('deve aplicar filtro de status único', async () => {
      await listarChamadosUseCase(makeInput({ status: 'ABERTO' }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: ChamadoStatus.ABERTO }) })
      )
    })

    it('deve aplicar filtro de múltiplos status', async () => {
      await listarChamadosUseCase(makeInput({ status: 'ABERTO,EM_ATENDIMENTO' }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: [ChamadoStatus.ABERTO, ChamadoStatus.EM_ATENDIMENTO] } }),
        })
      )
    })
  })

  describe('filtro de prioridade', () => {
    it('deve aplicar filtro de prioridade única', async () => {
      await listarChamadosUseCase(makeInput({ prioridade: 'P1' }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ prioridade: PrioridadeChamado.P1 }) })
      )
    })

    it('deve aplicar filtro de múltiplas prioridades', async () => {
      await listarChamadosUseCase(makeInput({ prioridade: 'P1,P2' }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ prioridade: { in: [PrioridadeChamado.P1, PrioridadeChamado.P2] } }),
        })
      )
    })
  })

  describe('outros filtros', () => {
    it('deve aplicar filtro semTecnico quando regra não é USUARIO', async () => {
      await listarChamadosUseCase(makeInput({ semTecnico: true }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tecnicoId: null }) })
      )
    })

    it('não deve aplicar semTecnico quando regra é USUARIO', async () => {
      await listarChamadosUseCase(makeInput({
        semTecnico: true,
        usuarioAutenticado: { id: 'u1', regra: 'USUARIO' },
      }))

      const [args] = vi.mocked(prisma.chamado.count).mock.calls[0] as any[]
      expect(args.where.tecnicoId).not.toBe(null)
    })

    it('deve aplicar filtro de setor quando regra não é USUARIO', async () => {
      await listarChamadosUseCase(makeInput({ setor: 'TI' }))

      expect(prisma.chamado.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ usuario: { setor: 'TI' } }) })
      )
    })

    it('não deve aplicar filtro de setor quando regra é USUARIO', async () => {
      await listarChamadosUseCase(makeInput({
        setor: 'TI',
        usuarioAutenticado: { id: 'u1', regra: 'USUARIO' },
      }))

      const [args] = vi.mocked(prisma.chamado.count).mock.calls[0] as any[]
      expect(args.where).not.toHaveProperty('usuario')
    })

    it('deve aplicar filtro de servico', async () => {
      await listarChamadosUseCase(makeInput({ servico: 'Suporte' }))

      const [args] = vi.mocked(prisma.chamado.count).mock.calls[0] as any[]
      expect(args.where.servicos).toBeDefined()
    })

    it('deve aplicar filtro dataInicio', async () => {
      await listarChamadosUseCase(makeInput({ dataInicio: '2024-01-01' }))

      const [args] = vi.mocked(prisma.chamado.count).mock.calls[0] as any[]
      expect(args.where.geradoEm?.gte).toBeDefined()
    })

    it('deve aplicar filtro dataFim', async () => {
      await listarChamadosUseCase(makeInput({ dataFim: '2024-01-31' }))

      const [args] = vi.mocked(prisma.chamado.count).mock.calls[0] as any[]
      expect(args.where.geradoEm?.lte).toBeDefined()
    })
  })

  describe('filtro de busca', () => {
    it('deve adicionar OR com OS e descricao quando busca fornecida como USUARIO', async () => {
      await listarChamadosUseCase(makeInput({
        busca: 'teste',
        usuarioAutenticado: { id: 'u1', regra: 'USUARIO' },
      }))

      const [args] = vi.mocked(prisma.chamado.count).mock.calls[0] as any[]
      expect(args.where.AND).toBeDefined()
    })

    it('deve adicionar OR com email e nome de usuario quando busca fornecida como ADMIN', async () => {
      await listarChamadosUseCase(makeInput({ busca: 'teste' }))

      const [args] = vi.mocked(prisma.chamado.count).mock.calls[0] as any[]
      const orClause = args.where.AND?.[0]?.OR
      expect(orClause?.length).toBeGreaterThan(2)
    })
  })

  describe('ordenação', () => {
    it('deve usar geradoEm como padrão quando ordenarPor inválido', async () => {
      await listarChamadosUseCase(makeInput({ ordenarPor: 'campo_invalido' }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] as any[]
      expect(args.orderBy[0]).toHaveProperty('geradoEm')
    })

    it('deve usar campo válido quando ordenarPor válido', async () => {
      await listarChamadosUseCase(makeInput({ ordenarPor: 'atualizadoEm' }))

      const [args] = vi.mocked(prisma.chamado.findMany).mock.calls[0] as any[]
      expect(args.orderBy[0]).toHaveProperty('atualizadoEm')
    })
  })

  describe('paginação', () => {
    it('deve retornar metadados de paginação corretos', async () => {
      vi.mocked(prisma.chamado.count).mockResolvedValue(25)
      vi.mocked(prisma.chamado.findMany).mockResolvedValue([makeChamado()] as any)

      const result = await listarChamadosUseCase(makeInput({ pagina: 1, limite: 10 }))

      expect(result.paginacao.total).toBe(25)
      expect(result.paginacao.totalPaginas).toBe(3)
      expect(result.paginacao.paginaAtual).toBe(1)
      expect(result.paginacao.temProxima).toBe(true)
      expect(result.paginacao.temAnterior).toBe(false)
    })
  })

  describe('tratamento de erros', () => {
    it('deve lançar ChamadoError LIST_ERROR em erro inesperado', async () => {
      vi.mocked(prisma.chamado.count).mockRejectedValue(new Error('DB error'))

      const error = await listarChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('LIST_ERROR')
      expect(error.statusCode).toBe(500)
    })

    it('deve relançar ChamadoError sem encapsular', async () => {
      const chamadoError = new ChamadoError('Chamado não encontrado', 'NOT_FOUND', 404)
      vi.mocked(prisma.chamado.count).mockRejectedValue(chamadoError)

      const error = await listarChamadosUseCase(makeInput()).catch(e => e)

      expect(error).toBe(chamadoError)
    })
  })
})
