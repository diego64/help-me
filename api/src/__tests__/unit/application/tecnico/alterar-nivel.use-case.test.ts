import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, NivelTecnico } from '@prisma/client'

import { alterarNivelUseCase } from '@application/use-cases/tecnico/alterar-nivel.use-case'
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

const makeInput = (overrides = {}): Parameters<typeof alterarNivelUseCase>[0] => ({
  id: 'tecnico-id-123',
  nivel: 'N2',
  solicitanteId: 'admin-id-456',
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  regra: 'TECNICO' as Regra,
  email: 'joao@email.com',
  nivel: 'N1' as NivelTecnico,
  deletadoEm: null,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

const makeTecnicoAtualizado = (overrides = {}) => ({
  id: 'tecnico-id-123',
  nome: 'João',
  sobrenome: 'Silva',
  email: 'joao@email.com',
  nivel: 'N2' as NivelTecnico,
  regra: 'TECNICO' as Regra,
  ativo: true,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeTecnicoAtualizado() as any)
})

describe('alterarNivelUseCase', () => {
  describe('validação do nível', () => {
    it('deve aceitar nível N1', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: 'N2' }) as any)

      await expect(alterarNivelUseCase(makeInput({ nivel: 'N1' }))).resolves.toBeDefined()
    })

    it('deve aceitar nível N2', async () => {
      await expect(alterarNivelUseCase(makeInput({ nivel: 'N2' }))).resolves.toBeDefined()
    })

    it('deve aceitar nível N3', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico({ nivel: 'N1' }) as any)

      await expect(alterarNivelUseCase(makeInput({ nivel: 'N3' }))).resolves.toBeDefined()
    })

    it('deve lançar TecnicoError com code INVALID_NIVEL quando nível é inválido', async () => {
      const error = await alterarNivelUseCase(makeInput({ nivel: 'N9' })).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('INVALID_NIVEL')
    })

    it('deve lançar TecnicoError com statusCode 400 quando nível é inválido', async () => {
      const error = await alterarNivelUseCase(makeInput({ nivel: 'N9' })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('não deve consultar banco quando nível é inválido', async () => {
      await alterarNivelUseCase(makeInput({ nivel: 'INVALIDO' })).catch(() => {})

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('verificação de existência do técnico', () => {
    it('deve buscar técnico pelo id', async () => {
      await alterarNivelUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tecnico-id-123' } })
      )
    })

    it('deve lançar TecnicoError quando técnico não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(alterarNivelUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await alterarNivelUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError quando usuário existe mas não é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ regra: 'USUARIO' as Regra }) as any
      )

      await expect(alterarNivelUseCase(makeInput())).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com code DELETED quando técnico está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await alterarNivelUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('DELETED')
    })

    it('deve lançar TecnicoError com code SAME_NIVEL quando já possui o nível', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ nivel: 'N2' }) as any
      )

      const error = await alterarNivelUseCase(makeInput({ nivel: 'N2' })).catch(e => e)
      expect(error.code).toBe('SAME_NIVEL')
    })

    it('deve lançar TecnicoError com mensagem correta quando já possui o nível', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ nivel: 'N2' }) as any
      )

      await expect(alterarNivelUseCase(makeInput({ nivel: 'N2' }))).rejects.toThrow(
        'Técnico já possui o nível N2'
      )
    })

    it('deve lançar TecnicoError com statusCode 400 quando já possui o nível', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ nivel: 'N2' }) as any
      )

      const error = await alterarNivelUseCase(makeInput({ nivel: 'N2' })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('alteração do nível', () => {
    it('deve chamar update com o novo nível', async () => {
      await alterarNivelUseCase(makeInput({ nivel: 'N2' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tecnico-id-123' },
          data: { nivel: 'N2' },
        })
      )
    })

    it('deve retornar mensagem e técnico atualizado', async () => {
      const atualizado = makeTecnicoAtualizado({ nivel: 'N2' })
      vi.mocked(prisma.usuario.update).mockResolvedValue(atualizado as any)

      const result = await alterarNivelUseCase(makeInput({ nivel: 'N2' }))

      expect(result).toEqual({
        message: 'Nível do técnico atualizado para N2 com sucesso',
        tecnico: atualizado,
      })
    })

    it('deve logar sucesso com nível anterior e novo', async () => {
      await alterarNivelUseCase(makeInput({ nivel: 'N2' }))

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tecnicoId: 'tecnico-id-123',
          nivelAnterior: 'N1',
          nivelNovo: 'N2',
          solicitanteId: 'admin-id-456',
        }),
        '[TECNICO] Nível alterado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar TecnicoError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await alterarNivelUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com code NIVEL_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await alterarNivelUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('NIVEL_ERROR')
    })

    it('deve lançar TecnicoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await alterarNivelUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar TecnicoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(alterarNivelUseCase(makeInput())).rejects.toThrow(
        'Erro ao alterar nível do técnico'
      )
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await alterarNivelUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await alterarNivelUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, tecnicoId: 'tecnico-id-123' },
        '[TECNICO] Erro ao alterar nível'
      )
    })
  })
})
