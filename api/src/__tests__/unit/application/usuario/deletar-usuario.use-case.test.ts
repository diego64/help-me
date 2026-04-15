import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra } from '@prisma/client'

import { deletarUsuarioUseCase } from '@application/use-cases/usuario/deletar-usuario.use-case'
import { UsuarioError } from '@application/use-cases/usuario/errors'
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

const makeInput = (overrides = {}): Parameters<typeof deletarUsuarioUseCase>[0] => ({
  id: 'usuario-id-123',
  permanente: false,
  ...overrides,
})

const makeUsuario = (overrides = {}) => ({
  id: 'usuario-id-123',
  regra: 'USUARIO' as Regra,
  email: 'maria@email.com',
  deletadoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  _count: { chamadoOS: 0 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario() as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario({ ativo: false, deletadoEm: new Date() }) as any)
  vi.mocked(prisma.usuario.delete).mockResolvedValue(makeUsuario() as any)
  vi.mocked(cacheDel).mockResolvedValue(undefined)
})

describe('deletarUsuarioUseCase', () => {
  describe('verificação de existência do usuário', () => {
    it('deve buscar usuário pelo id', async () => {
      await deletarUsuarioUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usuario-id-123' } })
      )
    })

    it('deve lançar UsuarioError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(deletarUsuarioUseCase(makeInput())).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(deletarUsuarioUseCase(makeInput())).rejects.toThrow('Usuário não encontrado')
    })

    it('deve lançar UsuarioError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await deletarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await deletarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar UsuarioError quando usuário existe mas não é USUARIO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ regra: 'TECNICO' as Regra }) as any
      )

      await expect(deletarUsuarioUseCase(makeInput())).rejects.toThrow(UsuarioError)
    })
  })

  describe('soft delete (padrão)', () => {
    it('deve executar soft delete quando permanente=false', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: false }))

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
        data: {
          deletadoEm: expect.any(Date),
          ativo: false,
        },
      })
    })

    it('não deve chamar delete no soft delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: false }))

      expect(prisma.usuario.delete).not.toHaveBeenCalled()
    })

    it('deve retornar mensagem e id corretos no soft delete', async () => {
      const result = await deletarUsuarioUseCase(makeInput({ permanente: false }))

      expect(result).toEqual({
        message: 'Usuário deletado com sucesso',
        id: 'usuario-id-123',
      })
    })

    it('deve invalidar cache após soft delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: false }))

      expect(cacheDel).toHaveBeenCalledWith('usuarios:list')
    })

    it('deve continuar mesmo se cacheDel falhar no soft delete', async () => {
      vi.mocked(cacheDel).mockRejectedValue(new Error('Redis error'))

      await expect(deletarUsuarioUseCase(makeInput({ permanente: false }))).resolves.toBeDefined()
    })

    it('deve logar info após soft delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: false }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-123', email: 'maria@email.com' },
        '[USUARIO] Soft delete realizado'
      )
    })
  })

  describe('hard delete (permanente)', () => {
    it('deve lançar UsuarioError com code HAS_CHAMADOS quando há chamados vinculados', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ _count: { chamadoOS: 3 } }) as any
      )

      const error = await deletarUsuarioUseCase(makeInput({ permanente: true })).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('HAS_CHAMADOS')
    })

    it('deve lançar UsuarioError com statusCode 400 quando há chamados vinculados', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ _count: { chamadoOS: 1 } }) as any
      )

      const error = await deletarUsuarioUseCase(makeInput({ permanente: true })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve executar hard delete quando permanente=true e sem chamados', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(prisma.usuario.delete).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
      })
    })

    it('não deve chamar update no hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(prisma.usuario.update).not.toHaveBeenCalled()
    })

    it('deve retornar mensagem de exclusão permanente', async () => {
      const result = await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(result).toEqual({
        message: 'Usuário removido permanentemente',
        id: 'usuario-id-123',
      })
    })

    it('deve invalidar cache após hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(cacheDel).toHaveBeenCalledWith('usuarios:list')
    })

    it('deve continuar mesmo se cacheDel falhar no hard delete', async () => {
      vi.mocked(cacheDel).mockRejectedValue(new Error('Redis error'))

      await expect(deletarUsuarioUseCase(makeInput({ permanente: true }))).resolves.toBeDefined()
    })

    it('deve logar info após hard delete', async () => {
      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-123', email: 'maria@email.com' },
        '[USUARIO] Excluído permanentemente'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar UsuarioError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await deletarUsuarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com code DELETE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarUsuarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar UsuarioError com code DELETE_ERROR quando delete falhar', async () => {
      vi.mocked(prisma.usuario.delete).mockRejectedValue(new Error('Database error'))

      const error = await deletarUsuarioUseCase(makeInput({ permanente: true })).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar UsuarioError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar UsuarioError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(deletarUsuarioUseCase(makeInput())).rejects.toThrow('Erro ao deletar usuário')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await deletarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await deletarUsuarioUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-id-123' },
        '[USUARIO] Erro ao deletar'
      )
    })
  })

  describe('fluxo completo — soft delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeUsuario()
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('update')
        return makeUsuario({ ativo: false })
      }) as any)

      await deletarUsuarioUseCase(makeInput({ permanente: false }))

      expect(ordem).toEqual(['find', 'update'])
    })
  })

  describe('fluxo completo — hard delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeUsuario()
      }) as any)

      vi.mocked(prisma.usuario.delete).mockImplementation((async () => {
        ordem.push('delete')
        return makeUsuario()
      }) as any)

      await deletarUsuarioUseCase(makeInput({ permanente: true }))

      expect(ordem).toEqual(['find', 'delete'])
    })
  })
})
