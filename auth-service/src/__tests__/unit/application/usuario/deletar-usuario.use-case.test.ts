import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { deletarUsuarioUseCase } from '../../../../application/usuario/deletar-usuario.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { cacheDel } from '../../../../infrastructure/database/redis/client'
import { logger } from '../../../../shared/config/logger'
import {
  BadRequestError,
  NotFoundError,
} from '../../../../infrastructure/http/middlewares/error.middleware'
import { publishUsuarioDeletado } from '../../../../infrastructure/messaging/kafka/events/usuario.events' 

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditoriaAuth: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@infrastructure/database/redis/client', () => ({
  cacheDel: vi.fn(),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@infrastructure/messaging/kafka/events/usuario.events', () => ({
  publishUsuarioDeletado: vi.fn(),
}))

const makeInput = (overrides = {}): Parameters<typeof deletarUsuarioUseCase>[0] => ({
  id: 'usuario-id-123',
  solicitanteId: 'admin-id-456',
  ...overrides,
})

const makeUsuario = (overrides = {}): Usuario => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN' as Regra,
  ativo: true,
  refreshToken: 'refresh-token-abc',
  deletadoEm: null,
  geradoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
  ...overrides,
} as unknown as Usuario)

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario())
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario({ ativo: false, deletadoEm: new Date(), refreshToken: null }))
  vi.mocked(prisma.usuario.delete).mockResolvedValue(makeUsuario())
  vi.mocked(prisma.auditoriaAuth.create).mockResolvedValue(undefined as any)
  vi.mocked(cacheDel).mockResolvedValue(undefined as any)
  vi.mocked(publishUsuarioDeletado).mockResolvedValue(undefined as any)
})

describe('deletarUsuarioUseCase', () => {

  describe('verificação de existência do usuário', () => {
    it('deve buscar usuário pelo id', async () => {
      await deletarUsuarioUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
      })
    })

    it('deve lançar NotFoundError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(deletarUsuarioUseCase(makeInput())).rejects.toThrow(NotFoundError)
    })

    it('deve lançar NotFoundError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(deletarUsuarioUseCase(makeInput())).rejects.toThrow('Usuário não encontrado.')
    })
  })

  describe('prevenção de auto-delete', () => {
    it('deve lançar BadRequestError quando solicitante tenta deletar a si mesmo', async () => {
      await expect(
        deletarUsuarioUseCase(makeInput({ id: 'mesmo-id', solicitanteId: 'mesmo-id' }))
      ).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError com mensagem correta', async () => {
      await expect(
        deletarUsuarioUseCase(makeInput({ id: 'mesmo-id', solicitanteId: 'mesmo-id' }))
      ).rejects.toThrow('Não é possível deletar sua própria conta.')
    })

    it('deve permitir deletar outro usuário', async () => {
      await expect(
        deletarUsuarioUseCase(makeInput({ id: 'usuario-id-123', solicitanteId: 'admin-id-456' }))
      ).resolves.toBeUndefined()
    })
  })

  describe('soft delete (padrão)', () => {
    it('deve executar soft delete por padrão', async () => {
      await deletarUsuarioUseCase(makeInput())

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
        data: {
          deletadoEm: expect.any(Date),
          ativo: false,
          refreshToken: null,
        },
      })
    })

    it('não deve chamar delete no soft delete', async () => {
      await deletarUsuarioUseCase(makeInput())

      expect(prisma.usuario.delete).not.toHaveBeenCalled()
    })

    it('deve remover refresh token do Redis', async () => {
      await deletarUsuarioUseCase(makeInput())

      expect(cacheDel).toHaveBeenCalledWith('refresh:usuario-id-123')
    })

    it('deve continuar mesmo se cacheDel falhar', async () => {
      vi.mocked(cacheDel).mockRejectedValue(new Error('Redis error'))

      await expect(deletarUsuarioUseCase(makeInput())).resolves.toBeUndefined()
    })

    it('deve publicar evento usuarioDeletado após soft delete', async () => {
      const usuarioDeletado = makeUsuario({ ativo: false, deletadoEm: new Date(), refreshToken: null })
      vi.mocked(prisma.usuario.update).mockResolvedValue(usuarioDeletado)

      await deletarUsuarioUseCase(makeInput())

      expect(publishUsuarioDeletado).toHaveBeenCalledWith(usuarioDeletado, undefined)
    })

    it('deve publicar evento com correlationId quando fornecido', async () => {
      const usuarioDeletado = makeUsuario({ ativo: false, deletadoEm: new Date(), refreshToken: null })
      vi.mocked(prisma.usuario.update).mockResolvedValue(usuarioDeletado)

      await deletarUsuarioUseCase(makeInput(), 'correlation-xyz')

      expect(publishUsuarioDeletado).toHaveBeenCalledWith(usuarioDeletado, 'correlation-xyz')
    })

    it('deve logar info após soft delete', async () => {
      await deletarUsuarioUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'usuario-id-123', solicitanteId: 'admin-id-456' },
        '[USUARIO] Usuário desativado com sucesso'
      )
    })

    it('deve retornar void após soft delete', async () => {
      const result = await deletarUsuarioUseCase(makeInput())

      expect(result).toBeUndefined()
    })
  })

  describe('hard delete (permanente)', () => {
    it('deve executar hard delete quando permanente=true', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(prisma.usuario.delete).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
      })
    })

    it('não deve chamar update no hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(prisma.usuario.update).not.toHaveBeenCalled()
    })

    it('não deve publicar evento no hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(publishUsuarioDeletado).not.toHaveBeenCalled()
    })

    it('não deve chamar cacheDel no hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(cacheDel).not.toHaveBeenCalled()
    })

    it('deve logar warn após hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(logger.warn).toHaveBeenCalledWith(
        { userId: 'usuario-id-123', solicitanteId: 'admin-id-456' },
        '[USUARIO] Usuário deletado permanentemente'
      )
    })

    it('deve retornar void após hard delete', async () => {
      const result = await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(result).toBeUndefined()
    })
  })

  describe('registro de auditoria', () => {
    it('deve registrar auditoria após soft delete', async () => {
      await deletarUsuarioUseCase(makeInput())

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith({
        data: {
          usuarioId: 'usuario-id-123',
          evento: 'USUARIO_DESATIVADO',
          metadata: {
            correlationId: undefined,
            solicitanteId: 'admin-id-456',
            permanente: false,
          },
        },
      })
    })

    it('deve registrar auditoria após hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith({
        data: {
          usuarioId: 'usuario-id-123',
          evento: 'USUARIO_DESATIVADO',
          metadata: {
            correlationId: undefined,
            solicitanteId: 'admin-id-456',
            permanente: true,
          },
        },
      })
    })

    it('deve incluir correlationId na auditoria quando fornecido', async () => {
      await deletarUsuarioUseCase(makeInput(), 'correlation-abc')

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ correlationId: 'correlation-abc' }),
        }),
      })
    })

    it('deve continuar mesmo se auditoria falhar', async () => {
      vi.mocked(prisma.auditoriaAuth.create).mockRejectedValue(new Error('Audit error'))

      await expect(deletarUsuarioUseCase(makeInput())).resolves.toBeUndefined()
    })

    it('deve logar erro quando auditoria falhar', async () => {
      const auditError = new Error('Audit error')
      vi.mocked(prisma.auditoriaAuth.create).mockRejectedValue(auditError)

      await deletarUsuarioUseCase(makeInput())

      expect(logger.error).toHaveBeenCalledWith(
        { err: auditError },
        'Erro ao registrar auditoria de deleção'
      )
    })
  })

  describe('fluxo completo — soft delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find_usuario')
        return makeUsuario()
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('soft_delete')
        return makeUsuario({ ativo: false, deletadoEm: new Date(), refreshToken: null })
      }) as any)

      vi.mocked(cacheDel).mockImplementation(async () => {
        ordem.push('cache_del')
        return undefined as any
      })

      vi.mocked(publishUsuarioDeletado).mockImplementation(async () => {
        ordem.push('publish')
      })

      vi.mocked(prisma.auditoriaAuth.create).mockImplementation((async () => {
        ordem.push('auditoria')
        return undefined
      }) as any)

      await deletarUsuarioUseCase(makeInput())

      expect(ordem).toEqual(['find_usuario', 'soft_delete', 'cache_del', 'publish', 'auditoria'])
    })
  })

  describe('fluxo completo — hard delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find_usuario')
        return makeUsuario()
      }) as any)

      vi.mocked(prisma.usuario.delete).mockImplementation((async () => {
        ordem.push('hard_delete')
        return makeUsuario()
      }) as any)

      vi.mocked(prisma.auditoriaAuth.create).mockImplementation((async () => {
        ordem.push('auditoria')
        return undefined
      }) as any)

      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(ordem).toEqual(['find_usuario', 'hard_delete', 'auditoria'])
    })
  })
})