import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, Setor } from '@prisma/client'

import { buscarUsuarioUseCase } from '@application/use-cases/usuario/buscar-usuario.use-case'
import { UsuarioError } from '@application/use-cases/usuario/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
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

const makeUsuario = (overrides = {}) => ({
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
})

describe('buscarUsuarioUseCase', () => {
  describe('busca do usuário', () => {
    it('deve buscar usuário pelo id', async () => {
      await buscarUsuarioUseCase('usuario-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usuario-id-123' } })
      )
    })

    it('deve lançar UsuarioError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarUsuarioUseCase('usuario-id-123')).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarUsuarioUseCase('usuario-id-123')).rejects.toThrow('Usuário não encontrado')
    })

    it('deve lançar UsuarioError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar UsuarioError quando usuário existe mas não é USUARIO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ regra: 'TECNICO' as Regra }) as any
      )

      await expect(buscarUsuarioUseCase('usuario-id-123')).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com code NOT_FOUND quando regra não é USUARIO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ regra: 'ADMIN' as Regra }) as any
      )

      const error = await buscarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do usuário', async () => {
      const usuario = makeUsuario()
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(usuario as any)

      const result = await buscarUsuarioUseCase('usuario-id-123')

      expect(result).toEqual(usuario)
    })

    it('deve logar sucesso após encontrar usuário', async () => {
      await buscarUsuarioUseCase('usuario-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { usuarioId: 'usuario-id-123' },
        '[USUARIO] Encontrado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar UsuarioError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarUsuarioUseCase('usuario-id-123').catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com code GET_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarUsuarioUseCase('usuario-id-123').catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('GET_ERROR')
    })

    it('deve lançar UsuarioError com statusCode 500 quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar UsuarioError com mensagem correta quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      await expect(buscarUsuarioUseCase('usuario-id-123')).rejects.toThrow('Erro ao buscar usuário')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(dbError)

      const error = await buscarUsuarioUseCase('usuario-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando findUnique falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(dbError)

      await buscarUsuarioUseCase('usuario-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-id-123' },
        '[USUARIO] Erro ao buscar'
      )
    })
  })
})
