import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra } from '@prisma/client'

import { listarAdminsUseCase } from '@application/use-cases/admin/listar-admins.use-case'
import { AdminError } from '@application/use-cases/admin/errors'
import { ADMIN_SELECT } from '@application/use-cases/admin/selects'
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

const makeInput = (overrides = {}): Parameters<typeof listarAdminsUseCase>[0] => ({
  page: 1,
  limit: 10,
  incluirInativos: false,
  ...overrides,
})

const makeAdminItem = (overrides = {}) => ({
  id: 'admin-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  setor: 'TI',
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.count).mockResolvedValue(1)
  vi.mocked(prisma.usuario.findMany).mockResolvedValue([makeAdminItem()] as any)
})

describe('listarAdminsUseCase', () => {
  describe('filtros da query', () => {
    it('deve sempre filtrar por regra ADMIN', async () => {
      await listarAdminsUseCase(makeInput())

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regra: 'ADMIN' }),
        })
      )
    })

    it('deve filtrar por deletadoEm null e ativo=true quando incluirInativos=false', async () => {
      await listarAdminsUseCase(makeInput({ incluirInativos: false }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null, ativo: true }),
        })
      )
    })

    it('não deve incluir deletadoEm e ativo no where quando incluirInativos=true', async () => {
      await listarAdminsUseCase(makeInput({ incluirInativos: true }))

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('deletadoEm')
      expect(args?.where).not.toHaveProperty('ativo')
    })

    it('deve aplicar o mesmo where no count e no findMany', async () => {
      await listarAdminsUseCase(makeInput({ incluirInativos: false }))

      const [countArgs] = vi.mocked(prisma.usuario.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })

    it('deve aplicar o mesmo where no count e findMany quando incluirInativos=true', async () => {
      await listarAdminsUseCase(makeInput({ incluirInativos: true }))

      const [countArgs] = vi.mocked(prisma.usuario.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await listarAdminsUseCase(makeInput({ page: 1, limit: 10 }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await listarAdminsUseCase(makeInput({ page: 2, limit: 10 }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=3 com limit=5', async () => {
      await listarAdminsUseCase(makeInput({ page: 3, limit: 5 }))

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })

    it('deve retornar page e limit corretos no output', async () => {
      const result = await listarAdminsUseCase(makeInput({ page: 2, limit: 5 }))

      expect(result.page).toBe(2)
      expect(result.limit).toBe(5)
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(25)

      const result = await listarAdminsUseCase(makeInput({ limit: 10 }))

      expect(result.totalPages).toBe(3)
    })

    it('deve calcular totalPages arredondando para cima', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(11)

      const result = await listarAdminsUseCase(makeInput({ limit: 10 }))

      expect(result.totalPages).toBe(2)
    })

    it('deve retornar totalPages=0 quando não há admins', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(0)
      vi.mocked(prisma.usuario.findMany).mockResolvedValue([])

      const result = await listarAdminsUseCase(makeInput())

      expect(result.totalPages).toBe(0)
    })
  })

  describe('select e ordenação', () => {
    it('deve usar ADMIN_SELECT', async () => {
      await listarAdminsUseCase(makeInput())

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: ADMIN_SELECT })
      )
    })

    it('deve ordenar por geradoEm desc', async () => {
      await listarAdminsUseCase(makeInput())

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { geradoEm: 'desc' } })
      )
    })

    it('não deve selecionar password', async () => {
      await listarAdminsUseCase(makeInput())

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await listarAdminsUseCase(makeInput())

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('execução em paralelo', () => {
    it('deve chamar count e findMany uma vez cada', async () => {
      await listarAdminsUseCase(makeInput())

      expect(prisma.usuario.count).toHaveBeenCalledTimes(1)
      expect(prisma.usuario.findMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar total correto', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(42)

      const result = await listarAdminsUseCase(makeInput())

      expect(result.total).toBe(42)
    })

    it('deve retornar lista de admins', async () => {
      const admins = [makeAdminItem(), makeAdminItem({ id: 'outro-id' })]
      vi.mocked(prisma.usuario.findMany).mockResolvedValue(admins as any)

      const result = await listarAdminsUseCase(makeInput())

      expect(result.admins).toEqual(admins)
    })

    it('deve retornar lista vazia quando não há admins', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(0)
      vi.mocked(prisma.usuario.findMany).mockResolvedValue([])

      const result = await listarAdminsUseCase(makeInput())

      expect(result.admins).toEqual([])
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await listarAdminsUseCase(makeInput())

      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('limit')
      expect(result).toHaveProperty('totalPages')
      expect(result).toHaveProperty('admins')
    })

    it('deve logar sucesso com total, page e limit', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(5)

      await listarAdminsUseCase(makeInput({ page: 2, limit: 5 }))

      expect(logger.info).toHaveBeenCalledWith(
        { total: 5, page: 2, limit: 5 },
        '[ADMIN] Listagem realizada'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve lançar AdminError com code LIST_ERROR quando count falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      const error = await listarAdminsUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar AdminError com code LIST_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.usuario.findMany).mockRejectedValue(new Error('Database error'))

      const error = await listarAdminsUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('LIST_ERROR')
    })

    it('deve lançar AdminError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      const error = await listarAdminsUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar AdminError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue(new Error('Database error'))

      await expect(listarAdminsUseCase(makeInput())).rejects.toThrow('Erro ao listar administradores')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.count).mockRejectedValue(dbError)

      const error = await listarAdminsUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.usuario.count).mockRejectedValue('string error')

      const error = await listarAdminsUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.count).mockRejectedValue(dbError)

      await listarAdminsUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError },
        '[ADMIN] Erro ao listar admins'
      )
    })
  })
})