import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra } from '@prisma/client'

import { uploadAvatarUseCase } from '@application/use-cases/tecnico/upload-avatar.use-case'
import { TecnicoError } from '@application/use-cases/tecnico/errors'
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

const makeInput = (overrides = {}): Parameters<typeof uploadAvatarUseCase>[0] => ({
  id: 'tecnico-id-123',
  filename: 'avatar.png',
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  regra: 'TECNICO' as Regra,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue({
    id: 'tecnico-id-123',
    avatarUrl: '/uploads/avatars/avatar.png',
  } as any)
})

describe('uploadAvatarUseCase', () => {
  describe('verificação de existência do técnico', () => {
    it('deve buscar técnico pelo id', async () => {
      await uploadAvatarUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tecnico-id-123' } })
      )
    })

    it('deve lançar TecnicoError quando técnico não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(uploadAvatarUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(uploadAvatarUseCase(makeInput())).rejects.toThrow('Técnico não encontrado')
    })

    it('deve lançar TecnicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await uploadAvatarUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await uploadAvatarUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar TecnicoError quando usuário existe mas não é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ regra: 'USUARIO' as Regra }) as any
      )

      await expect(uploadAvatarUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })
  })

  describe('upload do avatar', () => {
    it('deve chamar update com avatarUrl correto', async () => {
      await uploadAvatarUseCase(makeInput({ filename: 'foto.jpg' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tecnico-id-123' },
          data: { avatarUrl: '/uploads/avatars/foto.jpg' },
        })
      )
    })

    it('deve retornar mensagem e avatarUrl corretos', async () => {
      vi.mocked(prisma.usuario.update).mockResolvedValue({
        id: 'tecnico-id-123',
        avatarUrl: '/uploads/avatars/avatar.png',
      } as any)

      const result = await uploadAvatarUseCase(makeInput())

      expect(result).toEqual({
        message: 'Avatar enviado com sucesso',
        avatarUrl: '/uploads/avatars/avatar.png',
      })
    })

    it('deve logar sucesso após upload', async () => {
      await uploadAvatarUseCase(makeInput({ filename: 'avatar.png' }))

      expect(logger.info).toHaveBeenCalledWith(
        { tecnicoId: 'tecnico-id-123', filename: 'avatar.png' },
        '[TECNICO] Avatar atualizado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar TecnicoError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await uploadAvatarUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com code AVATAR_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await uploadAvatarUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('AVATAR_ERROR')
    })

    it('deve lançar TecnicoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await uploadAvatarUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar TecnicoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(uploadAvatarUseCase(makeInput())).rejects.toThrow('Erro ao fazer upload do avatar')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await uploadAvatarUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await uploadAvatarUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, tecnicoId: 'tecnico-id-123' },
        '[TECNICO] Erro ao fazer upload do avatar'
      )
    })
  })
})
