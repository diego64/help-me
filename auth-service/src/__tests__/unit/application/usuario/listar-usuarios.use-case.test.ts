import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra } from '@prisma/client'

import { listarUsuariosUseCase } from '../../../../application/usuario/listar-usuarios.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

const makeUsuarioItem = (overrides = {}) => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  ativo: true,
  geradoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.count).mockResolvedValue(1)
  vi.mocked(prisma.usuario.findMany).mockResolvedValue([makeUsuarioItem()] as any)
})

describe('listarUsuariosUseCase', () => {

  describe('valores padrão', () => {
    it('deve usar page=1 quando não fornecido', async () => {
      const result = await listarUsuariosUseCase({})

      expect(result.page).toBe(1)
    })

    it('deve usar limit=10 quando não fornecido', async () => {
      const result = await listarUsuariosUseCase({})

      expect(result.limit).toBe(10)
    })

    it('deve excluir deletados por padrão', async () => {
      await listarUsuariosUseCase({})

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })

    it('deve excluir deletados no count por padrão', async () => {
      await listarUsuariosUseCase({})

      expect(prisma.usuario.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })
  })

  describe('paginação', () => {
    it('deve calcular skip corretamente para page=1', async () => {
      await listarUsuariosUseCase({ page: 1, limit: 10 })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=2', async () => {
      await listarUsuariosUseCase({ page: 2, limit: 10 })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      )
    })

    it('deve calcular skip corretamente para page=3 com limit=5', async () => {
      await listarUsuariosUseCase({ page: 3, limit: 5 })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      )
    })

    it('deve retornar page e limit corretos no output', async () => {
      const result = await listarUsuariosUseCase({ page: 2, limit: 5 })

      expect(result.page).toBe(2)
      expect(result.limit).toBe(5)
    })

    it('deve calcular totalPages corretamente', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(25)

      const result = await listarUsuariosUseCase({ limit: 10 })

      expect(result.totalPages).toBe(3)
    })

    it('deve calcular totalPages arredondando para cima', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(11)

      const result = await listarUsuariosUseCase({ limit: 10 })

      expect(result.totalPages).toBe(2)
    })

    it('deve retornar totalPages=1 quando total menor que limit', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(3)

      const result = await listarUsuariosUseCase({ limit: 10 })

      expect(result.totalPages).toBe(1)
    })

    it('deve retornar totalPages=0 quando não há usuários', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(0)
      vi.mocked(prisma.usuario.findMany).mockResolvedValue([])

      const result = await listarUsuariosUseCase({})

      expect(result.totalPages).toBe(0)
    })
  })

  describe('filtro por regra', () => {
    it('deve aplicar filtro de regra quando fornecido', async () => {
      await listarUsuariosUseCase({ regra: 'TECNICO' as Regra })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regra: 'TECNICO' }),
        })
      )
    })

    it('não deve incluir filtro de regra quando não fornecido', async () => {
      await listarUsuariosUseCase({})

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('regra')
    })

    it('deve aplicar filtro de regra no count', async () => {
      await listarUsuariosUseCase({ regra: 'ADMIN' as Regra })

      expect(prisma.usuario.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ regra: 'ADMIN' }),
        })
      )
    })
  })

  describe('filtro por ativo', () => {
    it('deve aplicar filtro ativo=true quando fornecido', async () => {
      await listarUsuariosUseCase({ ativo: true })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ativo: true }),
        })
      )
    })

    it('deve aplicar filtro ativo=false quando fornecido', async () => {
      await listarUsuariosUseCase({ ativo: false })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ativo: false }),
        })
      )
    })

    it('não deve incluir filtro ativo quando não fornecido', async () => {
      await listarUsuariosUseCase({})

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('ativo')
    })
  })

  describe('filtro incluirDeletados', () => {
    it('deve incluir deletados quando incluirDeletados=true', async () => {
      await listarUsuariosUseCase({ incluirDeletados: true })

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('deletadoEm')
    })

    it('deve excluir deletados quando incluirDeletados=false', async () => {
      await listarUsuariosUseCase({ incluirDeletados: false })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletadoEm: null }),
        })
      )
    })
  })

  describe('filtro de busca', () => {
    it('deve aplicar busca em nome, sobrenome e email', async () => {
      await listarUsuariosUseCase({ busca: 'diego' })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { nome: { contains: 'diego', mode: 'insensitive' } },
              { sobrenome: { contains: 'diego', mode: 'insensitive' } },
              { email: { contains: 'diego', mode: 'insensitive' } },
            ],
          }),
        })
      )
    })

    it('deve aplicar busca com mode insensitive', async () => {
      await listarUsuariosUseCase({ busca: 'DIEGO' })

      const chamada = vi.mocked(prisma.usuario.findMany).mock.calls[0]
      expect(chamada).toBeDefined()
      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      const or = (args?.where as any)?.OR
      expect(or[0].nome.mode).toBe('insensitive')
      expect(or[1].sobrenome.mode).toBe('insensitive')
      expect(or[2].email.mode).toBe('insensitive')
    })

    it('não deve incluir OR quando busca não fornecida', async () => {
      await listarUsuariosUseCase({})

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('OR')
    })

    it('deve aplicar busca no count também', async () => {
      await listarUsuariosUseCase({ busca: 'diego' })

      expect(prisma.usuario.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        })
      )
    })
  })

  describe('ordenação e select', () => {
    it('deve ordenar por geradoEm desc', async () => {
      await listarUsuariosUseCase({})

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { geradoEm: 'desc' },
        })
      )
    })

    it('deve selecionar apenas os campos do output', async () => {
      await listarUsuariosUseCase({})

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nome: true,
            sobrenome: true,
            email: true,
            regra: true,
            ativo: true,
            geradoEm: true,
            atualizadoEm: true,
            deletadoEm: true,
          },
        })
      )
    })

    it('não deve selecionar password', async () => {
      await listarUsuariosUseCase({})

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await listarUsuariosUseCase({})

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('execução em paralelo', () => {
    it('deve chamar count e findMany uma vez cada', async () => {
      await listarUsuariosUseCase({})

      expect(prisma.usuario.count).toHaveBeenCalledTimes(1)
      expect(prisma.usuario.findMany).toHaveBeenCalledTimes(1)
    })

    it('deve usar o mesmo where no count e no findMany', async () => {
      await listarUsuariosUseCase({ regra: 'TECNICO' as Regra, ativo: true, busca: 'dev' })

      const [countArgs] = vi.mocked(prisma.usuario.count).mock.calls[0] ?? []
      const [findManyArgs] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []

      expect(countArgs?.where).toEqual(findManyArgs?.where)
    })
  })

  describe('retorno', () => {
    it('deve retornar total correto', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(42)

      const result = await listarUsuariosUseCase({})

      expect(result.total).toBe(42)
    })

    it('deve retornar lista de usuários', async () => {
      const usuarios = [makeUsuarioItem(), makeUsuarioItem({ id: 'outro-id' })]
      vi.mocked(prisma.usuario.findMany).mockResolvedValue(usuarios as any)

      const result = await listarUsuariosUseCase({})

      expect(result.usuarios).toEqual(usuarios)
    })

    it('deve retornar lista vazia quando não há usuários', async () => {
      vi.mocked(prisma.usuario.count).mockResolvedValue(0)
      vi.mocked(prisma.usuario.findMany).mockResolvedValue([])

      const result = await listarUsuariosUseCase({})

      expect(result.usuarios).toEqual([])
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await listarUsuariosUseCase({})

      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('limit')
      expect(result).toHaveProperty('totalPages')
      expect(result).toHaveProperty('usuarios')
    })
  })

  describe('combinação de filtros', () => {
    it('deve aplicar regra, ativo e busca simultaneamente', async () => {
      await listarUsuariosUseCase({ regra: 'TECNICO' as Regra, ativo: true, busca: 'dev' })

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            regra: 'TECNICO',
            ativo: true,
            deletadoEm: null,
            OR: expect.any(Array),
          }),
        })
      )
    })

    it('deve aplicar incluirDeletados com regra e ativo', async () => {
      await listarUsuariosUseCase({ regra: 'ADMIN' as Regra, ativo: false, incluirDeletados: true })

      const [args] = vi.mocked(prisma.usuario.findMany).mock.calls[0] ?? []
      expect(args?.where).toMatchObject({ regra: 'ADMIN', ativo: false })
      expect(args?.where).not.toHaveProperty('deletadoEm')
    })
  })
})