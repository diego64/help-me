import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra } from '@prisma/client'

import { uploadAvatarUsuarioUseCase } from '@application/use-cases/usuario/upload-avatar.use-case'
import { UsuarioError } from '@application/use-cases/usuario/errors'
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

vi.mock('@infrastructure/database/redis/client', () => ({
  cacheDel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { cacheDel } from '@infrastructure/database/redis/client'

const makeInput = (overrides = {}): Parameters<typeof uploadAvatarUsuarioUseCase>[0] => ({
  id: 'usuario-id-123',
  filename: 'avatar.png',
  ...overrides,
})

const makeUsuario = (overrides = {}) => ({
  id: 'usuario-id-123',
  regra: 'USUARIO' as Regra,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario() as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue({
    id: 'usuario-id-123',
    avatarUrl: '/uploads/avatars/avatar.png',
  } as any)
  vi.mocked(cacheDel).mockResolvedValue(undefined)
})

describe('uploadAvatarUsuarioUseCase', () => {
  describe('verificação de existência do usuário', () => {
    it('deve buscar usuário pelo id', async () => {
      await uploadAvatarUsuarioUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usuario-id-123' } })
      )
    })

    it('deve lançar UsuarioError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(uploadAvatarUsuarioUseCase(makeInput())).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(uploadAvatarUsuarioUseCase(makeInput())).rejects.toThrow('Usuário não encontrado')
    })

    it('deve lançar UsuarioError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await uploadAvatarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await uploadAvatarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar UsuarioError quando usuário existe mas não é USUARIO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ regra: 'TECNICO' as Regra }) as any
      )

      await expect(uploadAvatarUsuarioUseCase(makeInput())).rejects.toThrow(UsuarioError)
    })
  })

  describe('upload do avatar', () => {
    it('deve chamar update com avatarUrl correto', async () => {
      await uploadAvatarUsuarioUseCase(makeInput({ filename: 'foto.jpg' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usuario-id-123' },
          data: { avatarUrl: '/uploads/avatars/foto.jpg' },
        })
      )
    })

    it('deve retornar mensagem e avatarUrl corretos', async () => {
      vi.mocked(prisma.usuario.update).mockResolvedValue({
        id: 'usuario-id-123',
        avatarUrl: '/uploads/avatars/avatar.png',
      } as any)

      const result = await uploadAvatarUsuarioUseCase(makeInput())

      expect(result).toEqual({
        message: 'Avatar enviado com sucesso',
        avatarUrl: '/uploads/avatars/avatar.png',
      })
    })

    it('deve invalidar cache após upload', async () => {
      await uploadAvatarUsuarioUseCase(makeInput())

      expect(cacheDel).toHaveBeenCalledWith('usuarios:list')
    })

    it('deve continuar mesmo se cacheDel falhar', async () => {
      vi.mocked(cacheDel).mockRejectedValue(new Error('Redis error'))

      await expect(uploadAvatarUsuarioUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve logar sucesso após upload', async () => {
      await uploadAvatarUsuarioUseCase(makeInput({ filename: 'avatar.png' }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-123', filename: 'avatar.png' },
        '[USUARIO] Avatar atualizado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar UsuarioError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await uploadAvatarUsuarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com code AVATAR_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await uploadAvatarUsuarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('AVATAR_ERROR')
    })

    it('deve lançar UsuarioError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await uploadAvatarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar UsuarioError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(uploadAvatarUsuarioUseCase(makeInput())).rejects.toThrow(
        'Erro ao fazer upload do avatar'
      )
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await uploadAvatarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await uploadAvatarUsuarioUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-id-123' },
        '[USUARIO] Erro ao fazer upload do avatar'
      )
    })
  })
})
