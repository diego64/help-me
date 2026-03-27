import { describe, it, expect, vi, beforeEach } from 'vitest'

import { atualizarServicoUseCase } from '@application/use-cases/servico/atualizar-servico.use-case'
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

const makeInput = (overrides = {}): Parameters<typeof atualizarServicoUseCase>[0] => ({
  id: 'servico-id-123',
  ...overrides,
})

const makeServico = (overrides = {}) => ({
  id: 'servico-id-123',
  nome: 'Suporte Técnico',
  descricao: null,
  ativo: true,
  deletadoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

const makeServicoAtualizado = (overrides = {}) => ({
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
  vi.mocked(prisma.servico.update).mockResolvedValue(makeServicoAtualizado() as any)
})

describe('atualizarServicoUseCase', () => {
  describe('verificação de existência do serviço', () => {
    it('deve buscar serviço pelo id', async () => {
      await atualizarServicoUseCase(makeInput())

      expect(prisma.servico.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'servico-id-123' } })
      )
    })

    it('deve lançar ServicoError quando serviço não existir', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(atualizarServicoUseCase(makeInput())).rejects.toThrow(ServicoError)
    })

    it('deve lançar ServicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      await expect(atualizarServicoUseCase(makeInput())).rejects.toThrow('Serviço não encontrado')
    })

    it('deve lançar ServicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await atualizarServicoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await atualizarServicoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ServicoError com code DELETED quando serviço está deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await atualizarServicoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('DELETED')
    })

    it('deve lançar ServicoError com mensagem correta quando serviço está deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(atualizarServicoUseCase(makeInput())).rejects.toThrow(
        'Não é possível editar um serviço deletado'
      )
    })
  })

  describe('validação de nome duplicado', () => {
    it('deve verificar duplicidade quando nome diferente do atual é fornecido', async () => {
      await atualizarServicoUseCase(makeInput({ nome: 'Outro Nome' }))

      expect(prisma.servico.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { nome: 'Outro Nome' } })
      )
    })

    it('não deve verificar duplicidade quando nome é igual ao atual', async () => {
      await atualizarServicoUseCase(makeInput({ nome: 'Suporte Técnico' }))

      // findUnique é chamado 2x: 1 para buscar o serviço, 1 para retornar sem update
      expect(prisma.servico.findUnique).toHaveBeenCalledTimes(2)

      // O que NÃO deve acontecer é a busca por nome
      expect(prisma.servico.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { nome: 'Suporte Técnico' } })
      )
    })

    it('deve lançar ServicoError com code ALREADY_EXISTS quando nome pertence a outro serviço', async () => {
      vi.mocked(prisma.servico.findUnique)
        .mockResolvedValueOnce(makeServico() as any)
        .mockResolvedValueOnce(makeServico({ id: 'outro-servico-id' }) as any)

      const error = await atualizarServicoUseCase(makeInput({ nome: 'Outro Nome' })).catch(e => e)
      expect(error.code).toBe('ALREADY_EXISTS')
    })

    it('deve lançar ServicoError com statusCode 409 quando nome duplicado', async () => {
      vi.mocked(prisma.servico.findUnique)
        .mockResolvedValueOnce(makeServico() as any)
        .mockResolvedValueOnce(makeServico({ id: 'outro-servico-id' }) as any)

      const error = await atualizarServicoUseCase(makeInput({ nome: 'Outro Nome' })).catch(e => e)
      expect(error.statusCode).toBe(409)
    })
  })

  describe('atualização dos campos', () => {
    it('deve incluir nome no data quando fornecido e diferente do atual', async () => {
      await atualizarServicoUseCase(makeInput({ nome: 'Novo Nome' }))

      expect(prisma.servico.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nome: 'Novo Nome' }),
        })
      )
    })

    it('deve trimar o nome antes de atualizar', async () => {
      await atualizarServicoUseCase(makeInput({ nome: '  Novo Nome  ' }))

      expect(prisma.servico.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nome: 'Novo Nome' }),
        })
      )
    })

    it('deve incluir descricao no data quando fornecida', async () => {
      await atualizarServicoUseCase(makeInput({ descricao: 'Nova descricao' }))

      expect(prisma.servico.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ descricao: 'Nova descricao' }),
        })
      )
    })

    it('deve incluir descricao null quando string vazia fornecida', async () => {
      await atualizarServicoUseCase(makeInput({ descricao: '   ' }))

      expect(prisma.servico.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ descricao: null }),
        })
      )
    })

    it('não deve chamar update quando nenhum campo for fornecido', async () => {
      await atualizarServicoUseCase(makeInput())

      expect(prisma.servico.update).not.toHaveBeenCalled()
    })

    it('deve chamar findUnique novamente quando nenhum campo for fornecido', async () => {
      await atualizarServicoUseCase(makeInput())

      expect(prisma.servico.findUnique).toHaveBeenCalledTimes(2)
    })

    it('deve chamar update com where correto', async () => {
      await atualizarServicoUseCase(makeInput({ descricao: 'Nova desc' }))

      expect(prisma.servico.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'servico-id-123' } })
      )
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do serviço atualizado', async () => {
      const atualizado = makeServicoAtualizado({ nome: 'Novo Nome' })
      vi.mocked(prisma.servico.update).mockResolvedValue(atualizado as any)

      const result = await atualizarServicoUseCase(makeInput({ descricao: 'nova' }))

      expect(result).toEqual(atualizado)
    })

    it('deve logar sucesso após atualização', async () => {
      await atualizarServicoUseCase(makeInput({ descricao: 'nova' }))

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ servicoId: 'servico-id-123' }),
        '[SERVICO] Atualizado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ServicoError sem encapsular', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)

      const error = await atualizarServicoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ServicoError com code UPDATE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarServicoUseCase(makeInput({ descricao: 'nova' })).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('UPDATE_ERROR')
    })

    it('deve lançar ServicoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      const error = await atualizarServicoUseCase(makeInput({ descricao: 'nova' })).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ServicoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.servico.update).mockRejectedValue(new Error('Database error'))

      await expect(atualizarServicoUseCase(makeInput({ descricao: 'nova' }))).rejects.toThrow(
        'Erro ao atualizar serviço'
      )
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      const error = await atualizarServicoUseCase(makeInput({ descricao: 'nova' })).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.update).mockRejectedValue(dbError)

      await atualizarServicoUseCase(makeInput({ descricao: 'nova' })).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, servicoId: 'servico-id-123' },
        '[SERVICO] Erro ao atualizar'
      )
    })
  })
})
