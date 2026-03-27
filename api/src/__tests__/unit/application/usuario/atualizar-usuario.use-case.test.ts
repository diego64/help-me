import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, Setor } from '@prisma/client'

import { atualizarUsuarioUseCase } from '@application/use-cases/usuario/atualizar-usuario.use-case'
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

const makeInput = (overrides = {}): Parameters<typeof atualizarUsuarioUseCase>[0] => ({
  id: 'usuario-id-123',
  solicitanteRegra: 'ADMIN',
  ...overrides,
})

const makeUsuario = (overrides = {}) => ({
  id: 'usuario-id-123',
  regra: 'USUARIO' as Regra,
  email: 'maria@email.com',
  deletadoEm: null,
  ...overrides,
})

const makeUsuarioAtualizado = (overrides = {}) => ({
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
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuarioAtualizado() as any)
  vi.mocked(cacheDel).mockResolvedValue(1)
})

describe('atualizarUsuarioUseCase', () => {
  describe('verificação de existência do usuário', () => {
    it('deve buscar usuário pelo id', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usuario-id-123' } })
      )
    })

    it('deve lançar UsuarioError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarUsuarioUseCase(makeInput())).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarUsuarioUseCase(makeInput())).rejects.toThrow('Usuário não encontrado')
    })

    it('deve lançar UsuarioError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar UsuarioError quando usuário existe mas não é USUARIO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ regra: 'TECNICO' as Regra }) as any
      )

      await expect(atualizarUsuarioUseCase(makeInput())).rejects.toThrow(UsuarioError)
    })

    it('deve lançar UsuarioError com code DELETED quando usuário está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await atualizarUsuarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('DELETED')
    })

    it('deve lançar UsuarioError com mensagem correta quando usuário está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(atualizarUsuarioUseCase(makeInput())).rejects.toThrow(
        'Não é possível editar um usuário deletado'
      )
    })
  })

  describe('atualização dos campos', () => {
    it('deve incluir nome no data quando fornecido', async () => {
      await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nome: 'Ana' }),
        })
      )
    })

    it('deve incluir sobrenome no data quando fornecido', async () => {
      await atualizarUsuarioUseCase(makeInput({ sobrenome: 'Costa' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sobrenome: 'Costa' }),
        })
      )
    })

    it('deve incluir telefone no data quando fornecido', async () => {
      await atualizarUsuarioUseCase(makeInput({ telefone: '11999999999' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ telefone: '11999999999' }),
        })
      )
    })

    it('deve incluir ramal no data quando fornecido', async () => {
      await atualizarUsuarioUseCase(makeInput({ ramal: '1234' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ramal: '1234' }),
        })
      )
    })

    it('deve incluir setor no data quando solicitanteRegra é ADMIN', async () => {
      await atualizarUsuarioUseCase(makeInput({ setor: 'Financeiro', solicitanteRegra: 'ADMIN' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ setor: 'Financeiro' }),
        })
      )
    })

    it('não deve incluir setor no data quando solicitanteRegra não é ADMIN', async () => {
      await atualizarUsuarioUseCase(makeInput({ setor: 'Financeiro', solicitanteRegra: 'USUARIO' }))

      expect(prisma.usuario.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ setor: 'Financeiro' }),
        })
      )
    })

    it('não deve chamar update quando nenhum campo for fornecido', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(prisma.usuario.update).not.toHaveBeenCalled()
    })

    it('deve validar email duplicado quando email diferente do atual é fornecido', async () => {
      await atualizarUsuarioUseCase(makeInput({ email: 'novo@email.com' }))

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'novo@email.com' } })
      )
    })

    it('deve lançar UsuarioError com code EMAIL_IN_USE quando email pertence a outro', async () => {
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeUsuario() as any)
        .mockResolvedValueOnce(makeUsuario({ id: 'outro-id' }) as any)

      const error = await atualizarUsuarioUseCase(makeInput({ email: 'novo@email.com' })).catch(e => e)
      expect(error.code).toBe('EMAIL_IN_USE')
    })

    it('deve lançar UsuarioError com statusCode 409 quando email duplicado', async () => {
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeUsuario() as any)
        .mockResolvedValueOnce(makeUsuario({ id: 'outro-id' }) as any)

      const error = await atualizarUsuarioUseCase(makeInput({ email: 'novo@email.com' })).catch(e => e)
      expect(error.statusCode).toBe(409)
    })
  })

  describe('invalidação de cache', () => {
    it('deve invalidar cache após atualização bem-sucedida', async () => {
      await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' }))

      expect(cacheDel).toHaveBeenCalledWith('usuarios:list')
    })

    it('não deve invalidar cache quando nenhum campo for atualizado', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(cacheDel).not.toHaveBeenCalled()
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do usuário atualizado', async () => {
      const atualizado = makeUsuarioAtualizado({ nome: 'Ana' })
      vi.mocked(prisma.usuario.update).mockResolvedValue(atualizado as any)

      const result = await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' }))

      expect(result).toEqual(atualizado)
    })

    it('deve logar sucesso após atualização', async () => {
      await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' }))

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ usuarioId: 'usuario-id-123' }),
        '[USUARIO] Atualizado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar UsuarioError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarUsuarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar UsuarioError com code UPDATE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' })).catch(e => e)

      expect(error).toBeInstanceOf(UsuarioError)
      expect(error.code).toBe('UPDATE_ERROR')
    })

    it('deve lançar UsuarioError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' })).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar UsuarioError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(atualizarUsuarioUseCase(makeInput({ nome: 'Ana' }))).rejects.toThrow(
        'Erro ao atualizar usuário'
      )
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' })).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await atualizarUsuarioUseCase(makeInput({ nome: 'Ana' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, usuarioId: 'usuario-id-123' },
        '[USUARIO] Erro ao atualizar'
      )
    })
  })
})
