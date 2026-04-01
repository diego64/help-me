import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, Setor } from '@prisma/client'

import { listarUsuariosUseCase } from '@application/use-cases/usuario/listar-usuarios.use-case'
import { UsuarioError } from '@application/use-cases/usuario/errors'
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

vi.mock('@infrastructure/database/redis/client', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { cacheGet, cacheSet } from '@infrastructure/database/redis/client'

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof listarUsuariosUseCase>[0] => ({
  page: 1,
  limit: 10,
  incluirInativos: false,
  incluirDeletados: false,
  ...overrides,
})

const makeUsuarioItem = (overrides = {}) => ({
  id: 'usuario-id-123',
  nome: 'Maria',
  sobrenome: 'Silva',
  email: 'maria@email.com',
  regra: 'USUARIO' as Regra,
  setor: 'RH' as Setor,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  deletadoEm: null,
  _count: { chamadoOS: 0 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(cacheGet).mockResolvedValue(null)
  vi.mocked(cacheSet).mockResolvedValue(undefined)
  vi.mocked(prisma.usuario.count).mockResolvedValue(1)
  vi.mocked(prisma.usuario.findMany).mockResolvedValue([makeUsuarioItem()] as any)
})

describe('listarUsuariosUseCase', () => {
  describe('cache', () => {
    it('deve verificar cache antes de consultar o banco', async () => {
      await listarUsuariosUseCase(makeInput())

      expect(cacheGet).toHaveBeenCalledTimes(1)
    })

    it('deve retornar dados do cache quando disponível', async () => {
      const cachedData = {
        data: [makeUsuarioItem()],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      }

      vi.mocked(cacheGet).mockResolvedValue(JSON.stringify(cachedData))

      const result = await listarUsuariosUseCase(makeInput())

      // Comparar com o que realmente volta do JSON.parse (datas são strings)
      expect(result).toEqual(JSON.parse(JSON.stringify(cachedData)))
      expect(prisma.usuario.findMany).not.toHaveBeenCalled()
    })

    it('deve salvar resultado no cache após consulta ao banco', async () => {
      await listarUsuariosUseCase(makeInput())

      expect(cacheSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        60
      )
    })
  })

  describe('filtros da query', () => {
    it('deve sempre filtrar por regra USUARIO', async () => {
      await listarUsuariosUseCase(makeInput())

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regra: 'USUARIO' }),
        })
      )
    })

    it('deve filtrar por ativo=true quando incluirInativos=false', async () => {
      await listarUsuariosUseCase(makeInput({ incluirInativos: false }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ativo: true }),
        })
      )
    })

    it('deve filtrar por deletadoEm=null quando incluirDeletados=false', async () => {
      await listarUsuariosUseCase(makeInput({ incluirDeletados: false }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('não deve incluir ativo no where quando incluirInativos=true', async () => {
      await listarUsuariosUseCase(makeInput({ incluirInativos: true }))

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('ativo')
    })

    it('não deve incluir deletadoEm no where quando incluirDeletados=true', async () => {
      await listarUsuariosUseCase(makeInput({ incluirDeletados: true }))

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('deletadoEm')
    })

    it('deve aplicar filtro por setor quando fornecido', async () => {
      await listarUsuariosUseCase(makeInput({ setor: 'RH' }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ setor: 'RH' }),
        })
      )
    })

    it('deve aplicar filtro de busca por nome, sobrenome e email', async () => {
      await listarUsuariosUseCase(makeInput({ busca: 'maria' }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { nome: { contains: 'maria', mode: 'insensitive' } },
              { sobrenome: { contains: 'maria', mode: 'insensitive' } },
              { email: { contains: 'maria', mode: 'insensitive' } },
            ],
          }),
        })
      )
    })

    it('não deve incluir OR no where quando busca não fornecida', async () => {
      await listarUsuariosUseCase(makeInput())

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('OR')
    })

    it('deve aplicar o mesmo where no count e no findMany', async () => {
      await listarUsuariosUseCase(makeInput())

      const [countArgs] = vi.mocked(prisma.usuario.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await listarUsuariosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await listarUsuariosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(25)

      const result = await listarUsuariosUseCase(makeInput({ limit: 10 }))

      expect(result.pagination.totalPages).toBe(3)
    })

    it('deve retornar hasNext=true quando há próxima página', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(20)

      const result = await listarUsuariosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasNext).toBe(true)
    })

    it('deve retornar hasPrev=false na primeira página', async () => {
      const result = await listarUsuariosUseCase(makeInput({ page: 1, limit: 10 }))

      expect(result.pagination.hasPrev).toBe(false)
    })

    it('deve retornar hasPrev=true na segunda página', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(20)

      const result = await listarUsuariosUseCase(makeInput({ page: 2, limit: 10 }))

      expect(result.pagination.hasPrev).toBe(true)
    })
  })

  describe('select e ordenação', () => {
    it('deve ordenar por nome asc e sobrenome asc', async () => {
      await listarUsuariosUseCase(makeInput())

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ nome: 'asc' }, { sobrenome: 'asc' }],
        })
      )
    })

    it('deve chamar count e findMany uma vez cada', async () => {
      await listarUsuariosUseCase(makeInput())

      expect(prisma.usuario.count).toHaveBeenCalledTimes(1)
      expect(prisma.usuario.findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar total correto na pagination', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(42)

      const result = await listarUsuariosUseCase(makeInput())

      expect(result.pagination.total).toBe(42)
    })

    it('deve retornar lista de usuários em data', async () => {
      const usuarios = [makeUsuarioItem(), makeUsuarioItem({ id: 'outro-id' })]
      vi.mocked(prisma.usuario.findMany).mockResolvedValue(usuarios as any)

      const result = await listarUsuariosUseCase(makeInput())

      expect(result.data).toEqual(usuarios)
    })

    it('deve retornar campos data e pagination no output', async () => {
      const result = await listarUsuariosUseCase(makeInput())

      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('pagination')
    })

    it('deve logar sucesso com total, page e limit', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(5)

      await listarUsuariosUseCase(makeInput({ page: 2, limit: 5 }))

      expect(logger.info).toHaveBeenCalledWith(
        { total: 5, page: 2, limit: 5 },
        '[USUARIO] Listagem realizada'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve lançar UsuarioError com code LIST_ERROR quando count falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      const error = await listarUsuariosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar UsuarioError com code LIST_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.usuario.findMany).mockRejectedValue(new Error('Database error'))

      const error = await listarUsuariosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar UsuarioError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      const error = await listarUsuariosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar UsuarioError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      await expect(listarUsuariosUseCase(makeInput())).rejects.toThrow('Erro ao listar usuários')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.count).mockRejectedValue(dbError)

      const error = await listarUsuariosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.count).mockRejectedValue(dbError)

      await listarUsuariosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError },
        '[USUARIO] Erro ao listar'
      )
    })
  })
})
