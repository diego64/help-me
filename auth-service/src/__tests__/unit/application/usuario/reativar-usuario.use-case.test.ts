import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { reativarUsuarioUseCase } from '../../../../application/usuario/reativar-usuario.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { logger } from '../../../../shared/config/logger'
import {
  BadRequestError,
  NotFoundError,
} from '../../../../infrastructure/http/middlewares/error.middleware'
import { publishUsuarioReativado } from '../../../../infrastructure/messaging/kafka/events/usuario.events'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    auditoriaAuth: {
      create: vi.fn(),
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

vi.mock('@infrastructure/messaging/kafka/events/usuario.events', () => ({
  publishUsuarioReativado: vi.fn(),
}))

const makeUsuarioDesativado = (overrides = {}): Usuario => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN' as Regra,
  ativo: false,
  refreshToken: null,
  deletadoEm: new Date('2024-01-01'),
  geradoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
  ...overrides,
} as unknown as Usuario)

const makeUsuarioReativado = (overrides = {}) => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  ativo: true,
  atualizadoEm: new Date('2024-06-01'),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuarioDesativado())
  vi.mocked(prisma.usuario.findUniqueOrThrow).mockResolvedValue(makeUsuarioDesativado({ ativo: true, deletadoEm: null }))
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuarioReativado() as any)
  vi.mocked(prisma.auditoriaAuth.create).mockResolvedValue(undefined as any)
  vi.mocked(publishUsuarioReativado).mockResolvedValue(undefined as any)
})

describe('reativarUsuarioUseCase', () => {

  describe('verificação de existência do usuário', () => {
    it('deve buscar usuário pelo id', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
      })
    })

    it('deve lançar NotFoundError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(reativarUsuarioUseCase('id-inexistente')).rejects.toThrow(NotFoundError)
    })

    it('deve lançar NotFoundError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(reativarUsuarioUseCase('id-inexistente')).rejects.toThrow('Usuário não encontrado.')
    })
  })

  describe('verificação de estado do usuário', () => {
    it('deve lançar BadRequestError quando usuário já estiver ativo', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuarioDesativado({ ativo: true, deletadoEm: null })
      )

      await expect(reativarUsuarioUseCase('usuario-id-123')).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuarioDesativado({ ativo: true, deletadoEm: null })
      )

      await expect(reativarUsuarioUseCase('usuario-id-123')).rejects.toThrow('Usuário já está ativo.')
    })

    it('deve reativar usuário com deletadoEm preenchido e ativo=false', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuarioDesativado({ ativo: false, deletadoEm: new Date() })
      )

      await expect(reativarUsuarioUseCase('usuario-id-123')).resolves.toBeDefined()
    })

    it('deve reativar usuário com deletadoEm preenchido e ativo=true', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuarioDesativado({ ativo: true, deletadoEm: new Date() })
      )

      await expect(reativarUsuarioUseCase('usuario-id-123')).resolves.toBeDefined()
    })

    it('deve reativar usuário com deletadoEm null e ativo=false', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuarioDesativado({ ativo: false, deletadoEm: null })
      )

      await expect(reativarUsuarioUseCase('usuario-id-123')).resolves.toBeDefined()
    })
  })

  describe('atualização do usuário', () => {
    it('deve chamar update com where correto', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usuario-id-123' },
        })
      )
    })

    it('deve remover deletadoEm e setar ativo=true', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletadoEm: null, ativo: true },
        })
      )
    })

    it('deve selecionar apenas os campos do output', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nome: true,
            sobrenome: true,
            email: true,
            regra: true,
            ativo: true,
            atualizadoEm: true,
          },
        })
      )
    })

    it('não deve selecionar password', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      const [args] = vi.mocked(prisma.usuario.update).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('password')
    })

    it('não deve selecionar refreshToken', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      const [args] = vi.mocked(prisma.usuario.update).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('refreshToken')
    })
  })

  describe('publicação de evento Kafka', () => {
    it('deve buscar usuário completo antes de publicar evento', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
      })
    })

    it('deve publicar evento usuarioReativado', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(publishUsuarioReativado).toHaveBeenCalled()
    })

    it('deve publicar evento com usuário completo e correlationId', async () => {
      const usuarioCompleto = makeUsuarioDesativado({ ativo: true, deletadoEm: null })
      vi.mocked(prisma.usuario.findUniqueOrThrow).mockResolvedValue(usuarioCompleto)

      await reativarUsuarioUseCase('usuario-id-123', 'correlation-xyz')

      expect(publishUsuarioReativado).toHaveBeenCalledWith(usuarioCompleto, 'correlation-xyz')
    })

    it('deve publicar evento com correlationId undefined quando não fornecido', async () => {
      const usuarioCompleto = makeUsuarioDesativado({ ativo: true, deletadoEm: null })
      vi.mocked(prisma.usuario.findUniqueOrThrow).mockResolvedValue(usuarioCompleto)

      await reativarUsuarioUseCase('usuario-id-123')

      expect(publishUsuarioReativado).toHaveBeenCalledWith(usuarioCompleto, undefined)
    })
  })

  describe('registro de auditoria', () => {
    it('deve registrar auditoria após reativação', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith({
        data: {
          usuarioId: 'usuario-id-123',
          evento: 'USUARIO_CRIADO',
          metadata: {
            correlationId: undefined,
            acao: 'reativacao',
          },
        },
      })
    })

    it('deve incluir correlationId na auditoria quando fornecido', async () => {
      await reativarUsuarioUseCase('usuario-id-123', 'correlation-abc')

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ correlationId: 'correlation-abc' }),
        }),
      })
    })

    it('deve continuar mesmo se auditoria falhar', async () => {
      vi.mocked(prisma.auditoriaAuth.create).mockRejectedValue(new Error('Audit error'))

      await expect(reativarUsuarioUseCase('usuario-id-123')).resolves.toBeDefined()
    })

    it('deve logar erro quando auditoria falhar', async () => {
      const auditError = new Error('Audit error')
      vi.mocked(prisma.auditoriaAuth.create).mockRejectedValue(auditError)

      await reativarUsuarioUseCase('usuario-id-123')

      expect(logger.error).toHaveBeenCalledWith(
        { err: auditError },
        'Erro ao registrar auditoria de reativação'
      )
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do usuário reativado', async () => {
      const reativado = makeUsuarioReativado()
      vi.mocked(prisma.usuario.update).mockResolvedValue(reativado as any)

      const result = await reativarUsuarioUseCase('usuario-id-123')

      expect(result).toEqual(reativado)
    })

    it('deve retornar ativo=true', async () => {
      const result = await reativarUsuarioUseCase('usuario-id-123')

      expect(result.ativo).toBe(true)
    })

    it('deve logar sucesso após reativação', async () => {
      await reativarUsuarioUseCase('usuario-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'usuario-id-123' },
        '[USUARIO] Usuário reativado com sucesso'
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find_usuario')
        return makeUsuarioDesativado()
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('update')
        return makeUsuarioReativado()
      }) as any)

      vi.mocked(prisma.usuario.findUniqueOrThrow).mockImplementation((async () => {
        ordem.push('find_completo')
        return makeUsuarioDesativado({ ativo: true, deletadoEm: null })
      }) as any)

      vi.mocked(publishUsuarioReativado).mockImplementation(async () => {
        ordem.push('publish')
      })

      vi.mocked(prisma.auditoriaAuth.create).mockImplementation((async () => {
        ordem.push('auditoria')
        return undefined
      }) as any)

      await reativarUsuarioUseCase('usuario-id-123')

      expect(ordem).toEqual(['find_usuario', 'update', 'find_completo', 'publish', 'auditoria'])
    })
  })
})