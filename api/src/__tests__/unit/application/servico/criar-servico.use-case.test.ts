import { describe, it, expect, vi, beforeEach } from 'vitest'

import { criarServicoUseCase } from '@application/use-cases/servico/criar-servico.use-case'
import { ServicoError } from '@application/use-cases/servico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    servico: {
      findUnique: vi.fn(),
      create: vi.fn(),
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

const makeInput = (overrides = {}): Parameters<typeof criarServicoUseCase>[0] => ({
  nome: 'Suporte Técnico',
  ...overrides,
})

const makeServico = (overrides = {}) => ({
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

  vi.mocked(prisma.servico.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.servico.create).mockResolvedValue(makeServico() as any)
})

describe('criarServicoUseCase', () => {
  describe('verificação de duplicidade', () => {
    it('deve buscar serviço pelo nome trimado', async () => {
      await criarServicoUseCase(makeInput({ nome: '  Suporte Técnico  ' }))

      expect(prisma.servico.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { nome: 'Suporte Técnico' } })
      )
    })

    it('deve lançar ServicoError quando já existe serviço ativo com esse nome', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      await expect(criarServicoUseCase(makeInput())).rejects.toThrow(ServicoError)
    })

    it('deve lançar ServicoError com mensagem correta para nome duplicado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      await expect(criarServicoUseCase(makeInput())).rejects.toThrow('Já existe um serviço com esse nome')
    })

    it('deve lançar ServicoError com code ALREADY_EXISTS para nome duplicado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      const error = await criarServicoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('ALREADY_EXISTS')
    })

    it('deve lançar ServicoError com statusCode 409 para nome duplicado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      const error = await criarServicoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(409)
    })

    it('deve lançar ServicoError com mensagem de reativação quando nome pertence a serviço deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(criarServicoUseCase(makeInput())).rejects.toThrow(
        'Já existe um serviço deletado com esse nome. Use a rota de reativação.'
      )
    })

    it('deve lançar ServicoError com code DELETED_EXISTS quando nome pertence a serviço deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await criarServicoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('DELETED_EXISTS')
    })

    it('deve lançar ServicoError com statusCode 409 quando nome pertence a serviço deletado', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await criarServicoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(409)
    })
  })

  describe('criação do serviço', () => {
    it('deve criar serviço com nome trimado', async () => {
      await criarServicoUseCase(makeInput({ nome: '  Suporte Técnico  ' }))

      expect(prisma.servico.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nome: 'Suporte Técnico' }),
        })
      )
    })

    it('deve criar serviço com descricao trimada quando fornecida', async () => {
      await criarServicoUseCase(makeInput({ descricao: '  Desc  ' }))

      expect(prisma.servico.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ descricao: 'Desc' }),
        })
      )
    })

    it('deve criar serviço com descricao null quando não fornecida', async () => {
      await criarServicoUseCase(makeInput())

      expect(prisma.servico.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ descricao: null }),
        })
      )
    })

    it('deve criar serviço com descricao null quando fornecida string vazia', async () => {
      await criarServicoUseCase(makeInput({ descricao: '   ' }))

      expect(prisma.servico.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ descricao: null }),
        })
      )
    })

    it('deve retornar o serviço criado', async () => {
      const servico = makeServico()
      vi.mocked(prisma.servico.create).mockResolvedValue(servico as any)

      const result = await criarServicoUseCase(makeInput())

      expect(result).toEqual(servico)
    })

    it('deve logar sucesso após criação', async () => {
      await criarServicoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ servicoId: 'servico-id-123', nome: 'Suporte Técnico' }),
        '[SERVICO] Criado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ServicoError sem encapsular', async () => {
      vi.mocked(prisma.servico.findUnique).mockResolvedValue(
        makeServico({ deletadoEm: null }) as any
      )

      const error = await criarServicoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('ALREADY_EXISTS')
    })

    it('deve lançar ServicoError com code CREATE_ERROR quando create falhar', async () => {
      vi.mocked(prisma.servico.create).mockRejectedValue(new Error('Database error'))

      const error = await criarServicoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ServicoError)
      expect(error.code).toBe('CREATE_ERROR')
    })

    it('deve lançar ServicoError com statusCode 500 quando create falhar', async () => {
      vi.mocked(prisma.servico.create).mockRejectedValue(new Error('Database error'))

      const error = await criarServicoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ServicoError com mensagem correta quando create falhar', async () => {
      vi.mocked(prisma.servico.create).mockRejectedValue(new Error('Database error'))

      await expect(criarServicoUseCase(makeInput())).rejects.toThrow('Erro ao criar serviço')
    })

    it('deve incluir originalError quando create falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.create).mockRejectedValue(dbError)

      const error = await criarServicoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.servico.create).mockRejectedValue('string error')

      const error = await criarServicoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro quando create falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.servico.create).mockRejectedValue(dbError)

      await criarServicoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: dbError }),
        '[SERVICO] Erro ao criar'
      )
    })
  })

  describe('ServicoError', () => {
    it('deve ter name ServicoError', () => {
      const err = new ServicoError('msg', 'CODE', 400)
      expect(err.name).toBe('ServicoError')
    })

    it('deve ser instância de Error', () => {
      expect(new ServicoError('msg', 'CODE')).toBeInstanceOf(Error)
    })

    it('deve ter statusCode padrão 400', () => {
      expect(new ServicoError('msg', 'CODE').statusCode).toBe(400)
    })

    it('deve aceitar statusCode customizado', () => {
      expect(new ServicoError('msg', 'CODE', 409).statusCode).toBe(409)
    })

    it('deve aceitar originalError', () => {
      const original = new Error('original')
      expect(new ServicoError('msg', 'CODE', 400, original).originalError).toBe(original)
    })
  })
})
