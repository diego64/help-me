import { describe, it, expect, vi, beforeEach } from 'vitest'

import { deletarServicoUseCase } from '@application/use-cases/servico/deletar-servico.use-case'
import { ServicoError } from '@application/use-cases/servico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    servico: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof deletarServicoUseCase>[0] => ({
  id: 'servico-id-123',
  permanente: false,
  ...overrides,
})

const makeServico = (overrides = {}) => ({
  id: 'servico-id-123',
  nome: 'Suporte Técnico',
  ativo: true,
  deletadoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  _count: { chamados: 0 },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.servico.findUnique).mockResolvedValue(makeServico() as any)
  vi.mocked(prisma.servico.update).mockResolvedValue(makeServico({ ativo: false, deletadoEm: new Date() }) as any)
  vi.mocked(prisma.servico.delete).mockResolvedValue(makeServico() as any)
})

describe('deletarServicoUseCase', () => {
  describe('verificação de existência do serviço', () => {
    it('deve buscar serviço pelo id', async () => {
      await deletarServicoUseCase(makeInput())

      expect(prisma.servico.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'servico-id-123' } })
      )
    })

    it('deve lançar ServicoError quando serviço não existir', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(deletarServicoUseCase(makeInput())).rejects.toThrow(ServicoError)
    })

    it('deve lançar ServicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(deletarServicoUseCase(makeInput())).rejects.toThrow('Serviço não encontrado')
    })

    it('deve lançar ServicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await deletarServicoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await deletarServicoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('soft delete (padrão)', () => {
    it('deve executar soft delete quando permanente=false', async () => {
      await deletarServicoUseCase(makeInput({ permanente: false }))

      expect(prisma.servico.update).toHaveBeenCalledWith({
        where: { id: 'servico-id-123' },
        data: {
          deletadoEm: expect.any(Date),
          ativo: false,
        },
      })
    })

    it('não deve chamar delete no soft delete', async () => {
      await deletarServicoUseCase(makeInput({ permanente: false }))

      expect(prisma.servico.delete).not.toHaveBeenCalled()
    })

    it('deve retornar mensagem e id corretos no soft delete', async () => {
      const result = await deletarServicoUseCase(makeInput({ permanente: false }))

      expect(result).toEqual({
        message: 'Serviço deletado com sucesso',
        id: 'servico-id-123',
      })
    })

    it('deve logar info após soft delete', async () => {
      await deletarServicoUseCase(makeInput({ permanente: false }))

      expect(logger.info).toHaveBeenCalledWith(
        { servicoId: 'servico-id-123', nome: 'Suporte Técnico' },
        '[SERVICO] Soft delete realizado'
      )
    })
  })

  describe('hard delete (permanente)', () => {
    it('deve lançar ServicoError com code HAS_CHAMADOS quando há chamados vinculados', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ _count: { chamados: 3 } }) as any
      )

      const error = await deletarServicoUseCase(makeInput({ permanente: true })).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('HAS_CHAMADOS')
    })

    it('deve lançar ServicoError com statusCode 400 quando há chamados vinculados', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ _count: { chamados: 1 } }) as any
      )

      const error = await deletarServicoUseCase(makeInput({ permanente: true })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve executar hard delete quando permanente=true e sem chamados', async () => {
      await deletarServicoUseCase(makeInput({ permanente: true }))

      expect(prisma.servico.delete).toHaveBeenCalledWith({
        where: { id: 'servico-id-123' },
      })
    })

    it('não deve chamar update no hard delete', async () => {
      await deletarServicoUseCase(makeInput({ permanente: true }))

      expect(prisma.servico.update).not.toHaveBeenCalled()
    })

    it('deve retornar mensagem de exclusão permanente', async () => {
      const result = await deletarServicoUseCase(makeInput({ permanente: true }))

      expect(result).toEqual({
        message: 'Serviço removido permanentemente',
        id: 'servico-id-123',
      })
    })

    it('deve logar info após hard delete', async () => {
      await deletarServicoUseCase(makeInput({ permanente: true }))

      expect(logger.info).toHaveBeenCalledWith(
        { servicoId: 'servico-id-123', nome: 'Suporte Técnico' },
        '[SERVICO] Excluído permanentemente'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ServicoError sem encapsular', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await deletarServicoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com code DELETE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarServicoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar ServicoError com code DELETE_ERROR quando delete falhar', async () => {
      vi.mocked(prisma.servico.delete).mockRejectedValue(new Error('Database error'))

      const error = await deletarServicoUseCase(makeInput({ permanente: true })).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('DELETE_ERROR')
    })

    it('deve lançar ServicoError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarServicoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ServicoError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      await expect(deletarServicoUseCase(makeInput())).rejects.toThrow('Erro ao deletar serviço')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      const error = await deletarServicoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      await deletarServicoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, servicoId: 'servico-id-123' },
        '[SERVICO] Erro ao deletar'
      )
    })
  })

  describe('fluxo completo — soft delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.servico.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeServico()
      }) as any)

      vi.mocked(prisma.servico.update).mockImplementation((async () => {
        ordem.push('update')
        return makeServico({ ativo: false })
      }) as any)

      await deletarServicoUseCase(makeInput({ permanente: false }))

      expect(ordem).toEqual(['find', 'update'])
    })
  })

  describe('fluxo completo — hard delete', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.servico.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeServico()
      }) as any)

      vi.mocked(prisma.servico.delete).mockImplementation((async () => {
        ordem.push('delete')
        return makeServico()
      }) as any)

      await deletarServicoUseCase(makeInput({ permanente: true }))

      expect(ordem).toEqual(['find', 'delete'])
    })
  })
})
