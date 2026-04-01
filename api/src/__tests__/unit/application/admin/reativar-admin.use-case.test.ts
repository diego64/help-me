import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { reativarAdminUseCase } from '@application/use-cases/admin/reativar-admin.use-case'
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

const makeAdmin = (overrides = {}): Usuario => ({
  id: 'admin-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN' as Regra,
  ativo: false,
  refreshToken: null,
  deletadoEm: DATA_FIXA,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
} as unknown as Usuario)

const makeAdminReativado = (overrides = {}) => ({
  id: 'admin-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  ativo: true,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeAdmin())
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeAdminReativado() as any)
})

describe('reativarAdminUseCase', () => {
  describe('verificação de existência do admin', () => {
    it('deve buscar admin pelo id', async () => {
      await reativarAdminUseCase('admin-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-id-123' },
      })
    })

    it('deve lançar AdminError quando admin não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(reativarAdminUseCase('admin-id-123')).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(reativarAdminUseCase('admin-id-123')).rejects.toThrow('Administrador não encontrado')
    })

    it('deve lançar AdminError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar AdminError quando usuário existe mas regra não é ADMIN', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'TECNICO' as Regra })
      )

      await expect(reativarAdminUseCase('admin-id-123')).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com code NOT_FOUND quando regra incorreta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ regra: 'USUARIO' as Regra })
      )

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('verificação de estado do admin', () => {
    it('deve lançar AdminError quando admin já está ativo', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ ativo: true, deletadoEm: null })
      )

      await expect(reativarAdminUseCase('admin-id-123')).rejects.toThrow(AdminError)
    })

    it('deve lançar AdminError com mensagem correta quando já ativo', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ ativo: true, deletadoEm: null })
      )

      await expect(reativarAdminUseCase('admin-id-123')).rejects.toThrow('Administrador já está ativo')
    })

    it('deve lançar AdminError com code ALREADY_ACTIVE', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ ativo: true, deletadoEm: null })
      )

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.code).toBe('ALREADY_ACTIVE')
    })

    it('deve lançar AdminError com statusCode 400 quando já ativo', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ ativo: true, deletadoEm: null })
      )

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve reativar admin com deletadoEm preenchido e ativo=false', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ ativo: false, deletadoEm: DATA_FIXA })
      )

      await expect(reativarAdminUseCase('admin-id-123')).resolves.toBeDefined()
    })

    it('deve reativar admin com deletadoEm preenchido e ativo=true', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ ativo: true, deletadoEm: DATA_FIXA })
      )

      await expect(reativarAdminUseCase('admin-id-123')).resolves.toBeDefined()
    })

    it('deve reativar admin com deletadoEm null e ativo=false', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeAdmin({ ativo: false, deletadoEm: null })
      )

      await expect(reativarAdminUseCase('admin-id-123')).resolves.toBeDefined()
    })
  })

  describe('atualização do admin', () => {
    it('deve chamar update com where correto', async () => {
      await reativarAdminUseCase('admin-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-id-123' },
        })
      )
    })

    it('deve setar deletadoEm null e ativo=true no update', async () => {
      await reativarAdminUseCase('admin-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletadoEm: null, ativo: true },
        })
      )
    })

    it('deve selecionar apenas os campos do output', async () => {
      await reativarAdminUseCase('admin-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nome: true,
            sobrenome: true,
            email: true,
            regra: true,
            ativo: true,
          },
        })
      )
    })

    it('não deve selecionar password', async () => {
      await reativarAdminUseCase('admin-id-123')

      const [args] = vi.mocked(prisma.usuario.update).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await reativarAdminUseCase('admin-id-123')

      const [args] = vi.mocked(prisma.usuario.update).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar message e admin reativado', async () => {
      const adminReativado = makeAdminReativado()
      vi.mocked(prisma.usuario.update).mockResolvedValue(adminReativado as any)

      const result = await reativarAdminUseCase('admin-id-123')

      expect(result).toEqual({
        message: 'Administrador reativado com sucesso',
        admin: adminReativado,
      })
    })

    it('deve retornar admin com ativo=true', async () => {
      const result = await reativarAdminUseCase('admin-id-123')

      expect(result.admin.ativo).toBe(true)
    })

    it('deve logar sucesso com adminId', async () => {
      await reativarAdminUseCase('admin-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { adminId: 'admin-id-123' },
        '[ADMIN] Admin reativado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar AdminError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar AdminError com code REACTIVATE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)

      expect(error).toBeInstanceOf(AdminError)
      expect(error.code).toBe('REACTIVATE_ERROR')
    })

    it('deve lançar AdminError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar AdminError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(reativarAdminUseCase('admin-id-123')).rejects.toThrow('Erro ao reativar administrador')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue('string error')

      const error = await reativarAdminUseCase('admin-id-123').catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await reativarAdminUseCase('admin-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, adminId: 'admin-id-123' },
        '[ADMIN] Erro ao reativar admin'
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeAdmin()
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('update')
        return makeAdminReativado()
      }) as any)

      await reativarAdminUseCase('admin-id-123')

      expect(ordem).toEqual(['find', 'update'])
    })
  })
})