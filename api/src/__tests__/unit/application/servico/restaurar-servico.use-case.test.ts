import { describe, it, expect, vi, beforeEach } from 'vitest'

import { restaurarServicoUseCase } from '@application/use-cases/servico/restaurar-servico.use-case'
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
  deletadoEm: DATA_FIXA,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

const makeServicoRestaurado = (overrides = {}) => ({
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
  vi.mocked(prisma.servico.update).mockResolvedValue(makeServicoRestaurado() as any)
})

describe('restaurarServicoUseCase', () => {
  describe('verificação de existência do serviço', () => {
    it('deve buscar serviço pelo id', async () => {
      await restaurarServicoUseCase('servico-id-123')

      expect(prisma.servico.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'servico-id-123' } })
      )
    })

    it('deve lançar ServicoError quando serviço não existir', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(restaurarServicoUseCase('servico-id-123')).rejects.toThrow(ServicoError)
    })

    it('deve lançar ServicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(restaurarServicoUseCase('servico-id-123')).rejects.toThrow('Serviço não encontrado')
    })

    it('deve lançar ServicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ServicoError com code NOT_DELETED quando serviço não está deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_DELETED')
    })

    it('deve lançar ServicoError com mensagem correta quando serviço não está deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      await expect(restaurarServicoUseCase('servico-id-123')).rejects.toThrow(
        'Serviço não está deletado'
      )
    })

    it('deve lançar ServicoError com statusCode 400 quando não está deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('restauração do serviço', () => {
    it('deve chamar update com deletadoEm=null e ativo=true', async () => {
      await restaurarServicoUseCase('servico-id-123')

      expect(prisma.servico.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'servico-id-123' },
          data: { deletadoEm: null, ativo: true },
        })
      )
    })

    it('deve retornar mensagem e serviço restaurado', async () => {
      const restaurado = makeServicoRestaurado()
      vi.mocked(prisma.servico.update).mockResolvedValue(restaurado as any)

      const result = await restaurarServicoUseCase('servico-id-123')

      expect(result).toEqual({
        message: 'Serviço restaurado com sucesso',
        servico: restaurado,
      })
    })

    it('deve logar sucesso após restauração', async () => {
      await restaurarServicoUseCase('servico-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { servicoId: 'servico-id-123', nome: 'Suporte Técnico' },
        '[SERVICO] Restaurado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ServicoError sem encapsular', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com code RESTORE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('RESTORE_ERROR')
    })

    it('deve lançar ServicoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ServicoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      await expect(restaurarServicoUseCase('servico-id-123')).rejects.toThrow('Erro ao restaurar serviço')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      const error = await restaurarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      await restaurarServicoUseCase('servico-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, servicoId: 'servico-id-123' },
        '[SERVICO] Erro ao restaurar'
      )
    })
  })
})
