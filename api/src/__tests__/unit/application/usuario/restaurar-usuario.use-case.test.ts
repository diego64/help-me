import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, Setor } from '@prisma/client'

import { restaurarUsuarioUseCase } from '@application/use-cases/usuario/restaurar-usuario.use-case'
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

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeUsuario = (overrides = {}) => ({
  id: 'usuario-id-123',
  regra: 'USUARIO' as Regra,
  email: 'maria@email.com',
  deletadoEm: DATA_FIXA,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

const makeUsuarioRestaurado = (overrides = {}) => ({
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

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario() as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuarioRestaurado() as any)
  vi.mocked(cacheDel).mockResolvedValue(undefined)
})

describe('restaurarUsuarioUseCase', () => {
  describe('verificação de existência do usuário', () => {
    it('deve buscar usuário pelo id', async () => {
      await restaurarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usuario-id-123' } })
      )
    })

    it('deve lançar UsuarioError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(restaurarUsuarioUseCase('usuario-id-123')).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(restaurarUsuarioUseCase('usuario-id-123')).rejects.toThrow('Usuário não encontrado')
    })

    it('deve lançar UsuarioError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar UsuarioError quando usuário existe mas não é USUARIO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ regra: 'TECNICO' as Regra }) as any
      )

      await expect(restaurarUsuarioUseCase('usuario-id-123')).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com code NOT_DELETED quando usuário não está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: null }) as any
      )

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.code).toBe('NOT_DELETED')
    })

    it('deve lançar UsuarioError com mensagem correta quando não está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: null }) as any
      )

      await expect(restaurarUsuarioUseCase('usuario-id-123')).rejects.toThrow(
        'Usuário não está deletado'
      )
    })

    it('deve lançar UsuarioError com statusCode 400 quando não está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: null }) as any
      )

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('restauração do usuário', () => {
    it('deve chamar update com deletadoEm=null e ativo=true', async () => {
      await restaurarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usuario-id-123' },
          data: { deletadoEm: null, ativo: true },
        })
      )
    })

    it('deve retornar mensagem e usuário restaurado', async () => {
      const restaurado = makeUsuarioRestaurado()
      vi.mocked(prisma.usuario.update).mockResolvedValue(restaurado as any)

      const result = await restaurarUsuarioUseCase('usuario-id-123')

      expect(result).toEqual({
        message: 'Usuário restaurado com sucesso',
        usuario: restaurado,
      })
    })

    it('deve invalidar cache após restauração', async () => {
      await restaurarUsuarioUseCase('usuario-id-123')

      expect(cacheDel).toHaveBeenCalledWith('usuarios:list')
    })

    it('deve continuar mesmo se cacheDel falhar', async () => {
      vi.mocked(cacheDel).mockRejectedValue(new Error('Redis error'))

      await expect(restaurarUsuarioUseCase('usuario-id-123')).resolves.toBeDefined()
    })

    it('deve logar sucesso após restauração', async () => {
      await restaurarUsuarioUseCase('usuario-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-123', email: 'maria@email.com' },
        '[USUARIO] Restaurado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar UsuarioError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com code RESTORE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('RESTORE_ERROR')
    })

    it('deve lançar UsuarioError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar UsuarioError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(restaurarUsuarioUseCase('usuario-id-123')).rejects.toThrow(
        'Erro ao restaurar usuário'
      )
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await restaurarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await restaurarUsuarioUseCase('usuario-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-id-123' },
        '[USUARIO] Erro ao restaurar'
      )
    })
  })
})
