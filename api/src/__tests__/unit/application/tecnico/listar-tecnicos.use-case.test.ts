import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, NivelTecnico, Setor } from '@prisma/client'

import { listarTecnicosUseCase } from '@application/use-cases/tecnico/listar-tecnicos.use-case'
import { TecnicoError } from '@application/use-cases/tecnico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
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

const makeInput = (overrides = {}): Parameters<typeof listarTecnicosUseCase>[0] => ({
  page: 1,
  limit: 10,
  incluirInativos: false,
  incluirDeletados: false,
  ...overrides,
})

const makeTecnicoItem = (overrides = {}) => ({
  id: 'tecnico-id-123',
  nome: 'João',
  sobrenome: 'Silva',
  email: 'joao@email.com',
  regra: 'TECNICO' as Regra,
  nivel: 'N1' as NivelTecnico,
  setor: 'TI' as Setor,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  deletadoEm: null,
  tecnicoDisponibilidade: [],
  _count: { tecnicoChamados: 0 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.count).mockResolvedValue(1)
  vi.mocked(prisma.usuario.findMany).mockResolvedValue([makeTecnicoItem()] as any)
})

describe('listarTecnicosUseCase', () => {
  describe('filtros da query', () => {
    it('deve sempre filtrar por regra TECNICO', async () => {
      await listarTecnicosUseCase(makeInput())

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regra: 'TECNICO' }),
        })
      )
    })

    it('deve filtrar por ativo=true quando incluirInativos=false', async () => {
      await listarTecnicosUseCase(makeInput({ incluirInativos: false }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ativo: true }),
        })
      )
    })

    it('deve filtrar por deletadoEm=null quando incluirDeletados=false', async () => {
      await listarTecnicosUseCase(makeInput({ incluirDeletados: false }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('não deve incluir ativo no where quando incluirInativos=true', async () => {
      await listarTecnicosUseCase(makeInput({ incluirInativos: true }))

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('ativo')
    })

    it('não deve incluir deletadoEm no where quando incluirDeletados=true', async () => {
      await listarTecnicosUseCase(makeInput({ incluirDeletados: true }))

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('deletadoEm')
    })

    it('deve aplicar filtro por setor quando fornecido', async () => {
      await listarTecnicosUseCase(makeInput({ setor: 'TI' }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ setor: 'TI' }),
        })
      )
    })

    it('deve aplicar filtro por nivel quando válido', async () => {
      await listarTecnicosUseCase(makeInput({ nivel: 'N2' }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ nivel: 'N2' }),
        })
      )
    })

    it('não deve aplicar filtro por nivel quando inválido', async () => {
      await listarTecnicosUseCase(makeInput({ nivel: 'N9' }))

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('nivel')
    })

    it('deve aplicar filtro de busca por nome, sobrenome e email', async () => {
      await listarTecnicosUseCase(makeInput({ busca: 'joao' }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { nome: { contains: 'joao', mode: 'insensitive' } },
              { sobrenome: { contains: 'joao', mode: 'insensitive' } },
              { email: { contains: 'joao', mode: 'insensitive' } },
            ],
          }),
        })
      )
    })

    it('não deve incluir OR no where quando busca não fornecida', async () => {
      await listarTecnicosUseCase(makeInput())

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('OR')
    })

    it('deve aplicar o mesmo where no count e no findMany', async () => {
      await listarTecnicosUseCase(makeInput())

      const [countArgs] = vi.mocked(prisma.usuario.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await listarTecnicosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await listarTecnicosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(25)

      const result = await listarTecnicosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(3)
    })

    it('deve retornar hasNext=true quando há próxima página', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(20)

      const result = await listarTecnicosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(true)
    })

    it('deve retornar hasPrev=false na primeira página', async () => {
      const result = await listarTecnicosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasPrev).toBe(false)
    })

    it('deve retornar hasPrev=true na segunda página', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(20)

      const result = await listarTecnicosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(result.pagination.hasPrev).toBe(true)
    })
  })

  describe('select e ordenação', () => {
    it('deve ordenar por nome asc e sobrenome asc', async () => {
      await listarTecnicosUseCase(makeInput())

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        })
      )
    })

    it('deve chamar count e findMany uma vez cada', async () => {
      await listarTecnicosUseCase(makeInput())

      expect(prisma.usuario.count).toHaveBeenCalledTimes(1)
      expect(prisma.usuario.findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar total correto na pagination', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(42)

      const result = await listarTecnicosUseCase(makeInput())

      expect(result.pagination.total).toBe(42)
    })

    it('deve retornar lista de técnicos em data', async () => {
      const tecnicos = [makeTecnicoItem(), makeTecnicoItem({ id: 'outro-id' })]
      vi.mocked(prisma.usuario.findMany).mockResolvedValue(tecnicos as any)

      const result = await listarTecnicosUseCase(makeInput())

      expect(result.data).toEqual(tecnicos)
    })

    it('deve retornar campos data e pagination no output', async () => {
      const result = await listarTecnicosUseCase(makeInput())

      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('pagination')
    })

    it('deve logar sucesso com total, page e limit', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(5)

      await listarTecnicosUseCase(makeInput({ page: 2, limit: 5 }))

      expect(logger.info).toHaveBeenCalledWith(
        { total: 5, page: 2, limit: 5 },
        '[TECNICO] Listagem realizada'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve lançar TecnicoError com code LIST_ERROR quando count falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      const error = await listarTecnicosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar TecnicoError com code LIST_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.usuario.findMany).mockRejectedValue(new Error('Database error'))

      const error = await listarTecnicosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar TecnicoError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      const error = await listarTecnicosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar TecnicoError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      await expect(listarTecnicosUseCase(makeInput())).rejects.toThrow('Erro ao listar técnicos')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.count).mockRejectedValue(dbError)

      const error = await listarTecnicosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.count).mockRejectedValue(dbError)

      await listarTecnicosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError },
        '[TECNICO] Erro ao listar'
      )
    })
  })
})
