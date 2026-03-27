import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { deletarAdminUseCase } from '@application/use-cases/admin/deletar-admin.use-case'
import { AdminError } from '@application/use-cases/admin/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof deletarAdminUseCase>[0] => ({
  id: 'admin-id-123',
  solicitanteId: 'outro-admin-id-456',
  permanente: false,
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

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeAdmin())
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeAdmin({ ativo: false, deletadoEm: new Date() }) as any)
  vi.mocked(prisma.usuario.delete).mockResolvedValue(makeAdmin() as any)
})

describe('deletarAdminUseCase', () => {
  describe('verificação de existência do admin', () => {
    it('deve buscar admin pelo id', async () => {
      await deletarAdminUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-id-123' },
      })
    })

    it('deve lançar AdminError quando admin não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(deletarAdminUseCase(makeInput())).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(deletarAdminUseCase(makeInput())).rejects.toThrow('Administrador não encontrado')
    })

    it('deve lançar AdminError com code NOT_FOUND', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com statusCode 404', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar AdminError quando usuário existe mas regra não é ADMIN', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'TECNICO' as Regra })
      )

      await expect(deletarAdminUseCase(makeInput())).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com code NOT_FOUND quando regra incorreta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'USUARIO' as Regra })
      )

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('prevenção de auto-delete', () => {
    it('deve lançar AdminError quando solicitante tenta deletar a si mesmo', async () => {
      await expect(
        deletarAdminUseCase(makeInput({ id: 'mesmo-id', solicitanteId: 'mesmo-id' }))
      ).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com mensagem correta no auto-delete', async () => {
      await expect(
        deletarAdminUseCase(makeInput({ id: 'mesmo-id', solicitanteId: 'mesmo-id' }))
      ).rejects.toThrow('Não é possível deletar sua própria conta')
    })

    it('deve lançar AdminError com code SELF_DELETE', async () => {
      const error = await deletarAdminUseCase(
        makeInput({ id: 'mesmo-id', solicitanteId: 'mesmo-id' })
      ).catch(e => e)

      expect(error.code).toBe('SELF_DELETE')
    })

    it('deve lançar AdminError com statusCode 400 no auto-delete', async () => {
      const error = await deletarAdminUseCase(
        makeInput({ id: 'mesmo-id', solicitanteId: 'mesmo-id' })
      ).catch(e => e)

      expect(error.statusCode).toBe(400)
    })

    it('deve permitir deletar outro admin', async () => {
      await expect(
        deletarAdminUseCase(makeInput({ id: 'admin-id-123', solicitanteId: 'outro-admin-id-456' }))
      ).resolves.toBeDefined()
    })
  })

  describe('soft delete (padrão)', () => {
    it('deve executar soft delete quando permanente=false', async () => {
      await deletarAdminUseCase(makeInput({ permanente: false }))

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'admin-id-123' },
        data: {
          deletadoEm: expect.any(Date),
          ativo: false,
        },
      })
    })

    it('não deve chamar delete no soft delete', async () => {
      await deletarAdminUseCase(makeInput({ permanente: false }))

      expect(prisma.usuario.delete).not.toHaveBeenCalled()
    })

    it('deve retornar mensagem de desativação', async () => {
      const result = await deletarAdminUseCase(makeInput({ permanente: false }))

      expect(result).toEqual({
        message: 'Administrador desativado com sucesso',
        id: 'admin-id-123',
      })
    })

    it('deve logar info após soft delete', async () => {
      await deletarAdminUseCase(makeInput({ permanente: false }))

      expect(logger.info).toHaveBeenCalledWith(
        { adminId: 'admin-id-123' },
        '[ADMIN] Admin desativado'
      )
    })
  })

  describe('hard delete (permanente)', () => {
    it('deve executar hard delete quando permanente=true', async () => {
      await deletarAdminUseCase(makeInput({ permanente: true }))

      expect(prisma.usuario.delete).toHaveBeenCalledWith({
        where: { id: 'admin-id-123' },
      })
    })

    it('não deve chamar update no hard delete', async () => {
      await deletarAdminUseCase(makeInput({ permanente: true }))

      expect(prisma.usuario.update).not.toHaveBeenCalled()
    })

    it('deve retornar mensagem de exclusão permanente', async () => {
      const result = await deletarAdminUseCase(makeInput({ permanente: true }))

      expect(result).toEqual({
        message: 'Administrador excluído permanentemente',
        id: 'admin-id-123',
      })
    })

    it('deve logar info após hard delete', async () => {
      await deletarAdminUseCase(makeInput({ permanente: true }))

      expect(logger.info).toHaveBeenCalledWith(
        { adminId: 'admin-id-123' },
        '[ADMIN] Admin excluído permanentemente'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar AdminError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com code DELETE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar AdminError com code DELETE_ERROR quando delete falhar', async () => {
      vi.mocked(prisma.usuario.delete).mockRejectedValue(new Error('Database error'))

      const error = await deletarAdminUseCase(makeInput({ permanente: true })).catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar AdminError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar AdminError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(deletarAdminUseCase(makeInput())).rejects.toThrow('Erro ao deletar administrador')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue('string error')

      const error = await deletarAdminUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await deletarAdminUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, adminId: 'admin-id-123' },
        '[ADMIN] Erro ao deletar admin'
      )
    })
  })

  describe('fluxo completo — soft delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeAdmin()
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('update')
        return makeAdmin({ ativo: false })
      }) as any)

      await deletarAdminUseCase(makeInput({ permanente: false }))

      expect(ordem).toEqual(['find', 'update'])
    })
  })

  describe('fluxo completo — hard delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeAdmin()
      }) as any)

      vi.mocked(prisma.usuario.delete).mockImplementation((async () => {
        ordem.push('delete')
        return makeAdmin()
      }) as any)

      await deletarAdminUseCase(makeInput({ permanente: true }))

      expect(ordem).toEqual(['find', 'delete'])
    })
  })
})