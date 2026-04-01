import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listarServicosUseCase } from '@application/use-cases/servico/listar-servicos.use-case'
import { ServicoError } from '@application/use-cases/servico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    servico: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof listarServicosUseCase>[0] => ({
  page: 1,
  limit: 10,
  incluirInativos: false,
  incluirDeletados: false,
  ...overrides,
})

const makeServicoItem = (overrides = {}) => ({
  id: 'servico-id-123',
  nome: 'Suporte Técnico',
  descricao: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  deletadoEm: null,
  _count: { chamados: 0 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.servico.count).mockResolvedValue(1)
  vi.mocked(prisma.servico.findMany).mockResolvedValue([makeServicoItem()] as any)
})

describe('listarServicosUseCase', () => {
  describe('filtros da query', () => {
    it('deve filtrar por ativo=true quando incluirInativos=false', async () => {
      await listarServicosUseCase(makeInput({ incluirInativos: false }))

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ativo: true }),
        })
      )
    })

    it('deve filtrar por deletadoEm=null quando incluirDeletados=false', async () => {
      await listarServicosUseCase(makeInput({ incluirDeletados: false }))

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('não deve incluir ativo no where quando incluirInativos=true', async () => {
      await listarServicosUseCase(makeInput({ incluirInativos: true }))

      const [args] = vi.mocked(prisma.servico.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('ativo')
    })

    it('não deve incluir deletadoEm no where quando incluirDeletados=true', async () => {
      await listarServicosUseCase(makeInput({ incluirDeletados: true }))

      const [args] = vi.mocked(prisma.servico.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('deletadoEm')
    })

    it('deve aplicar filtro de busca por nome e descricao quando busca fornecida', async () => {
      await listarServicosUseCase(makeInput({ busca: 'suporte' }))

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { nome: { contains: 'suporte', mode: 'insensitive' } },
              { descricao: { contains: 'suporte', mode: 'insensitive' } },
            ],
          }),
        })
      )
    })

    it('não deve incluir OR no where quando busca não fornecida', async () => {
      await listarServicosUseCase(makeInput())

      const [args] = vi.mocked(prisma.servico.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('OR')
    })

    it('deve aplicar o mesmo where no count e no findMany', async () => {
      await listarServicosUseCase(makeInput({ incluirInativos: false, incluirDeletados: false }))

      const [countArgs] = vi.mocked(prisma.servico.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.servico.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await listarServicosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await listarServicosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=3 com limit=5', async () => {
      await listarServicosUseCase(makeInput({ page: 3, limit: 5 }))

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(25)

      const result = await listarServicosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(3)
    })

    it('deve calcular totalPages arredondando para cima', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(11)

      const result = await listarServicosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(2)
    })

    it('deve retornar hasNext=true quando há próxima página', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(20)

      const result = await listarServicosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(true)
    })

    it('deve retornar hasNext=false na última página', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(10)

      const result = await listarServicosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(false)
    })

    it('deve retornar hasPrev=false na primeira página', async () => {
      const result = await listarServicosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasPrev).toBe(false)
    })

    it('deve retornar hasPrev=true na segunda página', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(20)

      const result = await listarServicosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(result.pagination.hasPrev).toBe(true)
    })

    it('deve retornar page e limit corretos no output', async () => {
      const result = await listarServicosUseCase(makeInput({ page: 2, limit: 5 }))

      expect(result.pagination.page).toBe(2)
      expect(result.pagination.limit).toBe(5)
    })
  })

  describe('select e ordenação', () => {
    it('deve ordenar por nome asc', async () => {
      await listarServicosUseCase(makeInput())

      expect(prisma.servico.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { nome: 'asc' } })
      )
    })

    it('deve chamar count e findMany uma vez cada', async () => {
      await listarServicosUseCase(makeInput())

      expect(prisma.servico.count).toHaveBeenCalledTimes(1)
      expect(prisma.servico.findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar total correto na pagination', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(42)

      const result = await listarServicosUseCase(makeInput())

      expect(result.pagination.total).toBe(42)
    })

    it('deve retornar lista de serviços em data', async () => {
      const servicos = [makeServicoItem(), makeServicoItem({ id: 'outro-id' })]
      vi.mocked(prisma.servico.findMany).mockResolvedValue(servicos as any)

      const result = await listarServicosUseCase(makeInput())

      expect(result.data).toEqual(servicos)
    })

    it('deve retornar lista vazia quando não há serviços', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(0)
      vi.mocked(prisma.servico.findMany).mockResolvedValue([])

      const result = await listarServicosUseCase(makeInput())

      expect(result.data).toEqual([])
    })

    it('deve retornar campos data e pagination no output', async () => {
      const result = await listarServicosUseCase(makeInput())

      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('pagination')
    })

    it('deve logar sucesso com total, page e limit', async () => {
      vi.mocked(prisma.servico.count).mockResolvedValue(5)

      await listarServicosUseCase(makeInput({ page: 2, limit: 5 }))

      expect(logger.info).toHaveBeenCalledWith(
        { total: 5, page: 2, limit: 5 },
        '[SERVICO] Listagem realizada'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve lançar ServicoError com code LIST_ERROR quando count falhar', async () => {
      vi.mocked(prisma.servico.count).mockRejectedValue(new Error('Database error'))

      const error = await listarServicosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar ServicoError com code LIST_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.servico.findMany).mockRejectedValue(new Error('Database error'))

      const error = await listarServicosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar ServicoError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.servico.count).mockRejectedValue(new Error('Database error'))

      const error = await listarServicosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ServicoError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.servico.count).mockRejectedValue(new Error('Database error'))

      await expect(listarServicosUseCase(makeInput())).rejects.toThrow('Erro ao listar serviços')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.count).mockRejectedValue(dbError)

      const error = await listarServicosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.servico.count).mockRejectedValue('string error')

      const error = await listarServicosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.count).mockRejectedValue(dbError)

      await listarServicosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError },
        '[SERVICO] Erro ao listar'
      )
    })
  })
})
