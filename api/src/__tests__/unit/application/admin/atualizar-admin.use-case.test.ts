import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { atualizarAdminUseCase } from '@application/use-cases/admin/atualizar-admin.use-case'
import { AdminError } from '@application/use-cases/admin/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof atualizarAdminUseCase>[0] => ({
  id: 'admin-id-123',
  ...overrides,
})

const makeAdmin = (overrides = {}): Usuario => ({
  id: 'admin-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN' as Regra,
  ativo: true,
  refreshToken: null,
  deletadoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
} as unknown as Usuario)

const makeAdminAtualizado = (overrides = {}) => ({
  id: 'admin-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  setor: null,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeAdmin())
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeAdminAtualizado() as any)
})

describe('atualizarAdminUseCase', () => {
  describe('verificação de existência do admin', () => {
    it('deve buscar admin pelo id', async () => {
      await atualizarAdminUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-id-123' },
      })
    })

    it('deve lançar AdminError quando admin não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarAdminUseCase(makeInput())).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarAdminUseCase(makeInput())).rejects.toThrow('Administrador não encontrado')
    })

    it('deve lançar AdminError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar AdminError quando usuário existe mas não é ADMIN', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'TECNICO' as Regra })
      )

      await expect(atualizarAdminUseCase(makeInput())).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com code NOT_FOUND quando regra não é ADMIN', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'USUARIO' as Regra })
      )

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('atualização dos campos', () => {
    it('deve atualizar apenas os campos fornecidos', async () => {
      await atualizarAdminUseCase(makeInput({ setor: 'TI' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { setor: 'TI' },
        })
      )
    })

    it('deve chamar update com where correto', async () => {
      await atualizarAdminUseCase(makeInput())

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'admin-id-123' } })
      )
    })

    it('deve incluir setor no update quando fornecido', async () => {
      await atualizarAdminUseCase(makeInput({ setor: 'Financeiro' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ setor: 'Financeiro' }) })
      )
    })

    it('deve incluir telefone no update quando fornecido', async () => {
      await atualizarAdminUseCase(makeInput({ telefone: '11999999999' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ telefone: '11999999999' }) })
      )
    })

    it('deve incluir ramal no update quando fornecido', async () => {
      await atualizarAdminUseCase(makeInput({ ramal: '1234' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ramal: '1234' }) })
      )
    })

    it('deve incluir avatarUrl no update quando fornecido', async () => {
      await atualizarAdminUseCase(makeInput({ avatarUrl: 'https://cdn.example.com/avatar.png' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ avatarUrl: 'https://cdn.example.com/avatar.png' }) })
      )
    })

    it('deve incluir ativo no update quando fornecido', async () => {
      await atualizarAdminUseCase(makeInput({ ativo: false }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ativo: false }) })
      )
    })

    it('não deve incluir campos undefined no data', async () => {
      await atualizarAdminUseCase({ id: 'admin-id-123' })

      const [args] = vi.mocked(prisma.usuario.update).mock.calls[0] ?? []
      expect(args?.data).toEqual({})
    })

    it('deve incluir todos os campos fornecidos simultaneamente', async () => {
      await atualizarAdminUseCase(makeInput({
        setor: 'TI',
        telefone: '11999999999',
        ramal: '1234',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        ativo: false,
      }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            setor: 'TI',
            telefone: '11999999999',
            ramal: '1234',
            avatarUrl: 'https://cdn.example.com/avatar.png',
            ativo: false,
          },
        })
      )
    })

    it('deve selecionar os campos corretos no update', async () => {
      await atualizarAdminUseCase(makeInput())

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nome: true,
            sobrenome: true,
            email: true,
            regra: true,
            setor: true,
            telefone: true,
            ramal: true,
            avatarUrl: true,
            ativo: true,
            geradoEm: true,
            atualizadoEm: true,
          },
        })
      )
    })

    it('não deve selecionar password', async () => {
      await atualizarAdminUseCase(makeInput())

      const [args] = vi.mocked(prisma.usuario.update).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await atualizarAdminUseCase(makeInput())

      const [args] = vi.mocked(prisma.usuario.update).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do admin atualizado', async () => {
      const atualizado = makeAdminAtualizado({ setor: 'TI' })
      vi.mocked(prisma.usuario.update).mockResolvedValue(atualizado as any)

      const result = await atualizarAdminUseCase(makeInput())

      expect(result).toEqual(atualizado)
    })

    it('deve logar sucesso após atualização', async () => {
      await atualizarAdminUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { adminId: 'admin-id-123' },
        '[ADMIN] Admin atualizado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar AdminError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com code UPDATE_ERROR quando prisma.update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('UPDATE_ERROR')
    })

    it('deve lançar AdminError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)

      expect(error.statusCode).toBe(500)
    })

    it('deve lançar AdminError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(atualizarAdminUseCase(makeInput())).rejects.toThrow('Erro ao atualizar administrador')
    })

    it('deve incluir originalError quando update falhar com Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)

      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await atualizarAdminUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, adminId: 'admin-id-123' },
        '[ADMIN] Erro ao atualizar admin'
      )
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue('string error')

      const error = await atualizarAdminUseCase(makeInput()).catch(e => e)

      expect(error.originalError).toBeUndefined()
    })
  })

  describe('AdminError', () => {
    it('deve ter name AdminError', () => {
      const err = new AdminError('msg', 'CODE', 400)
      expect(err.name).toBe('AdminError')
    })

    it('deve ser instância de Error', () => {
      expect(new AdminError('msg', 'CODE')).toBeInstanceOf(Error)
    })

    it('deve ter statusCode padrão 400', () => {
      expect(new AdminError('msg', 'CODE').statusCode).toBe(400)
    })

    it('deve aceitar statusCode customizado', () => {
      expect(new AdminError('msg', 'CODE', 404).statusCode).toBe(404)
    })

    it('deve aceitar originalError', () => {
      const original = new Error('original')
      expect(new AdminError('msg', 'CODE', 400, original).originalError).toBe(original)
    })
  })
})