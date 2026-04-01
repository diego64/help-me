import { describe, it, expect, vi, beforeEach } from 'vitest'

import { reativarServicoUseCase } from '@application/use-cases/servico/reativar-servico.use-case'
import { ServicoError } from '@application/use-cases/servico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    servico: {
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

const makeServico = (overrides = {}) => ({
  id: 'servico-id-123',
  nome: 'Suporte Técnico',
  ativo: false,
  deletadoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

const makeServicoReativado = (overrides = {}) => ({
  id: 'servico-id-123',
  nome: 'Suporte Técnico',
  descricao: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.servico.findUnique).mockResolvedValue(makeServico() as any)
  vi.mocked(prisma.servico.update).mockResolvedValue(makeServicoReativado() as any)
})

describe('reativarServicoUseCase', () => {
  describe('verificação de existência do serviço', () => {
    it('deve buscar serviço pelo id', async () => {
      await reativarServicoUseCase('servico-id-123')

      expect(prisma.servico.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'servico-id-123' } })
      )
    })

    it('deve lançar ServicoError quando serviço não existir', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(reativarServicoUseCase('servico-id-123')).rejects.toThrow(ServicoError)
    })

    it('deve lançar ServicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ServicoError com code DELETED quando serviço está deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.code).toBe('DELETED')
    })

    it('deve lançar ServicoError com mensagem correta quando serviço está deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(reativarServicoUseCase('servico-id-123')).rejects.toThrow(
        'Não é possível reativar um serviço deletado. Use a rota de restauração.'
      )
    })

    it('deve lançar ServicoError com code ALREADY_ACTIVE quando serviço já está ativo', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ ativo: true }) as any
      )

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.code).toBe('ALREADY_ACTIVE')
    })

    it('deve lançar ServicoError com mensagem correta quando serviço já está ativo', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ ativo: true }) as any
      )

      await expect(reativarServicoUseCase('servico-id-123')).rejects.toThrow('Serviço já está ativo')
    })

    it('deve lançar ServicoError com statusCode 400 quando já ativo', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ ativo: true }) as any
      )

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('reativação do serviço', () => {
    it('deve chamar update com ativo=true', async () => {
      await reativarServicoUseCase('servico-id-123')

      expect(prisma.servico.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'servico-id-123' },
          data: { ativo: true },
        })
      )
    })

    it('deve retornar mensagem e serviço reativado', async () => {
      const reativado = makeServicoReativado()
      vi.mocked(prisma.servico.update).mockResolvedValue(reativado as any)

      const result = await reativarServicoUseCase('servico-id-123')

      expect(result).toEqual({
        message: 'Serviço reativado com sucesso',
        servico: reativado,
      })
    })

    it('deve logar sucesso após reativação', async () => {
      await reativarServicoUseCase('servico-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { servicoId: 'servico-id-123', nome: 'Suporte Técnico' },
        '[SERVICO] Reativado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ServicoError sem encapsular', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com code REACTIVATE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('REACTIVATE_ERROR')
    })

    it('deve lançar ServicoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ServicoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      await expect(reativarServicoUseCase('servico-id-123')).rejects.toThrow('Erro ao reativar serviço')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      const error = await reativarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      await reativarServicoUseCase('servico-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, servicoId: 'servico-id-123' },
        '[SERVICO] Erro ao reativar'
      )
    })
  })
})
