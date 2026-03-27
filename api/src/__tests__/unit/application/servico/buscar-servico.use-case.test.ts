import { describe, it, expect, vi, beforeEach } from 'vitest'

import { buscarServicoUseCase } from '@application/use-cases/servico/buscar-servico.use-case'
import { ServicoError } from '@application/use-cases/servico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    servico: {
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

const makeServico = (overrides = {}) => ({
  id: 'servico-id-123',
  nome: 'Suporte Técnico',
  descricao: null,
  ativo: true,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  deletadoEm: null,
  _count: { chamados: 0 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.servico.findUnique).mockResolvedValue(makeServico() as any)
})

describe('buscarServicoUseCase', () => {
  describe('busca do serviço', () => {
    it('deve buscar serviço pelo id', async () => {
      await buscarServicoUseCase('servico-id-123')

      expect(prisma.servico.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'servico-id-123' } })
      )
    })

    it('deve lançar ServicoError quando serviço não existir', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(buscarServicoUseCase('servico-id-123')).rejects.toThrow(ServicoError)
    })

    it('deve lançar ServicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(buscarServicoUseCase('servico-id-123')).rejects.toThrow('Serviço não encontrado')
    })

    it('deve lançar ServicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await buscarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await buscarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do serviço', async () => {
      const servico = makeServico()
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(servico as any)

      const result = await buscarServicoUseCase('servico-id-123')

      expect(result).toEqual(servico)
    })

    it('deve logar sucesso após encontrar serviço', async () => {
      await buscarServicoUseCase('servico-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { servicoId: 'servico-id-123' },
        '[SERVICO] Encontrado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ServicoError sem encapsular', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await buscarServicoUseCase('servico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com code GET_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.servico.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarServicoUseCase('servico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('GET_ERROR')
    })

    it('deve lançar ServicoError com statusCode 500 quando findUnique falhar', async () => {
      vi.mocked(prisma.servico.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ServicoError com mensagem correta quando findUnique falhar', async () => {
      vi.mocked(prisma.servico.findUnique).mockRejectedValue(new Error('Database error'))

      await expect(buscarServicoUseCase('servico-id-123')).rejects.toThrow('Erro ao buscar serviço')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.findUnique).mockRejectedValue(dbError)

      const error = await buscarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.servico.findUnique).mockRejectedValue('string error')

      const error = await buscarServicoUseCase('servico-id-123').catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando findUnique falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.findUnique).mockRejectedValue(dbError)

      await buscarServicoUseCase('servico-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, servicoId: 'servico-id-123' },
        '[SERVICO] Erro ao buscar'
      )
    })
  })
})
