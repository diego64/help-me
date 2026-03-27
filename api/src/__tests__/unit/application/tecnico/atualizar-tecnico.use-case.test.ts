import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, NivelTecnico, Setor } from '@prisma/client'

import { atualizarTecnicoUseCase } from '@application/use-cases/tecnico/atualizar-tecnico.use-case'
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

const DATA_FIXA = new Date('2024-01-01T00:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof atualizarTecnicoUseCase>[0] => ({
  id: 'tecnico-id-123',
  solicitanteRegra: 'ADMIN',
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  regra: 'TECNICO' as Regra,
  email: 'joao@email.com',
  deletadoEm: null,
  ...overrides,
})

const makeTecnicoAtualizado = (overrides = {}) => ({
  id: 'tecnico-id-123',
  nome: 'João',
  sobrenome: 'Silva',
  email: 'joao@email.com',
  regra: 'TECNICO' as Regra,
  nivel: 'N1' as NivelTecnico,
  setor: 'TI' as Setor,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  deletadoEm: null,
  tecnicoDisponibilidade: [],
  _count: { tecnicoChamados: 0 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeTecnicoAtualizado() as any)
})

describe('atualizarTecnicoUseCase', () => {
  describe('verificação de existência do técnico', () => {
    it('deve buscar técnico pelo id', async () => {
      await atualizarTecnicoUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tecnico-id-123' } })
      )
    })

    it('deve lançar TecnicoError quando técnico não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarTecnicoUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarTecnicoUseCase(makeInput())).rejects.toThrow('Técnico não encontrado')
    })

    it('deve lançar TecnicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarTecnicoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarTecnicoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar TecnicoError quando usuário existe mas não é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ regra: 'USUARIO' as Regra }) as any
      )

      await expect(atualizarTecnicoUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com code DELETED quando técnico está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await atualizarTecnicoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('DELETED')
    })

    it('deve lançar TecnicoError com mensagem correta quando técnico está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(atualizarTecnicoUseCase(makeInput())).rejects.toThrow(
        'Não é possível editar um técnico deletado'
      )
    })
  })

  describe('atualização dos campos', () => {
    it('deve incluir nome no data quando fornecido', async () => {
      await atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nome: 'Pedro' }),
        })
      )
    })

    it('deve incluir sobrenome no data quando fornecido', async () => {
      await atualizarTecnicoUseCase(makeInput({ sobrenome: 'Santos' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sobrenome: 'Santos' }),
        })
      )
    })

    it('deve incluir telefone no data quando fornecido', async () => {
      await atualizarTecnicoUseCase(makeInput({ telefone: '11999999999' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ telefone: '11999999999' }),
        })
      )
    })

    it('deve incluir ramal no data quando fornecido', async () => {
      await atualizarTecnicoUseCase(makeInput({ ramal: '1234' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ramal: '1234' }),
        })
      )
    })

    it('deve incluir setor no data quando solicitanteRegra é ADMIN', async () => {
      await atualizarTecnicoUseCase(makeInput({ setor: 'Financeiro', solicitanteRegra: 'ADMIN' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ setor: 'Financeiro' }),
        })
      )
    })

    it('não deve incluir setor no data quando solicitanteRegra não é ADMIN', async () => {
      await atualizarTecnicoUseCase(makeInput({ setor: 'Financeiro', solicitanteRegra: 'TECNICO' }))

      expect(prisma.usuario.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ setor: 'Financeiro' }),
        })
      )
    })

    it('não deve chamar update quando nenhum campo for fornecido', async () => {
      await atualizarTecnicoUseCase(makeInput())

      expect(prisma.usuario.update).not.toHaveBeenCalled()
    })

    it('deve validar email duplicado quando email diferente do atual é fornecido', async () => {
      await atualizarTecnicoUseCase(makeInput({ email: 'novo@email.com' }))

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'novo@email.com' } })
      )
    })

    it('deve lançar TecnicoError com code EMAIL_IN_USE quando email pertence a outro', async () => {
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeTecnico() as any)
        .mockResolvedValueOnce(makeTecnico({ id: 'outro-id' }) as any)

      const error = await atualizarTecnicoUseCase(makeInput({ email: 'novo@email.com' })).catch(e => e)
      expect(error.code).toBe('EMAIL_IN_USE')
    })

    it('deve lançar TecnicoError com statusCode 409 quando email duplicado', async () => {
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeTecnico() as any)
        .mockResolvedValueOnce(makeTecnico({ id: 'outro-id' }) as any)

      const error = await atualizarTecnicoUseCase(makeInput({ email: 'novo@email.com' })).catch(e => e)
      expect(error.statusCode).toBe(409)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do técnico atualizado', async () => {
      const atualizado = makeTecnicoAtualizado({ nome: 'Pedro' })
      vi.mocked(prisma.usuario.update).mockResolvedValue(atualizado as any)

      const result = await atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' }))

      expect(result).toEqual(atualizado)
    })

    it('deve logar sucesso após atualização', async () => {
      await atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' }))

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ tecnicoId: 'tecnico-id-123' }),
        '[TECNICO] Atualizado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar TecnicoError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await atualizarTecnicoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com code UPDATE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' })).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('UPDATE_ERROR')
    })

    it('deve lançar TecnicoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' })).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar TecnicoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' }))).rejects.toThrow(
        'Erro ao atualizar técnico'
      )
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' })).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await atualizarTecnicoUseCase(makeInput({ nome: 'Pedro' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, tecnicoId: 'tecnico-id-123' },
        '[TECNICO] Erro ao atualizar'
      )
    })
  })
})
