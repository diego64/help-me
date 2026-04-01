import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, NivelTecnico, Setor } from '@prisma/client'

import { restaurarTecnicoUseCase } from '@application/use-cases/tecnico/restaurar-tecnico.use-case'
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

const makeTecnico = (overrides = {}) => ({
  id: 'tecnico-id-123',
  regra: 'TECNICO' as Regra,
  email: 'joao@email.com',
  deletadoEm: DATA_FIXA,
  geradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

const makeTecnicoRestaurado = (overrides = {}) => ({
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
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeTecnicoRestaurado() as any)
})

describe('restaurarTecnicoUseCase', () => {
  describe('verificação de existência do técnico', () => {
    it('deve buscar técnico pelo id', async () => {
      await restaurarTecnicoUseCase('tecnico-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tecnico-id-123' } })
      )
    })

    it('deve lançar TecnicoError quando técnico não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(restaurarTecnicoUseCase('tecnico-id-123')).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(restaurarTecnicoUseCase('tecnico-id-123')).rejects.toThrow('Técnico não encontrado')
    })

    it('deve lançar TecnicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar TecnicoError quando usuário existe mas não é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ regra: 'USUARIO' as Regra }) as any
      )

      await expect(restaurarTecnicoUseCase('tecnico-id-123')).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com code NOT_DELETED quando técnico não está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ deletadoEm: null }) as any
      )

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_DELETED')
    })

    it('deve lançar TecnicoError com mensagem correta quando não está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ deletadoEm: null }) as any
      )

      await expect(restaurarTecnicoUseCase('tecnico-id-123')).rejects.toThrow(
        'Técnico não está deletado'
      )
    })

    it('deve lançar TecnicoError com statusCode 400 quando não está deletado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ deletadoEm: null }) as any
      )

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.statusCode).toBe(400)
    })
  })

  describe('restauração do técnico', () => {
    it('deve chamar update com deletadoEm=null e ativo=true', async () => {
      await restaurarTecnicoUseCase('tecnico-id-123')

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tecnico-id-123' },
          data: { deletadoEm: null, ativo: true },
        })
      )
    })

    it('deve retornar mensagem e técnico restaurado', async () => {
      const restaurado = makeTecnicoRestaurado()
      vi.mocked(prisma.usuario.update).mockResolvedValue(restaurado as any)

      const result = await restaurarTecnicoUseCase('tecnico-id-123')

      expect(result).toEqual({
        message: 'Técnico restaurado com sucesso',
        tecnico: restaurado,
      })
    })

    it('deve logar sucesso após restauração', async () => {
      await restaurarTecnicoUseCase('tecnico-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { tecnicoId: 'tecnico-id-123', email: 'joao@email.com' },
        '[TECNICO] Restaurado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar TecnicoError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com code RESTORE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('RESTORE_ERROR')
    })

    it('deve lançar TecnicoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar TecnicoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.usuario.update).mockRejectedValue(new Error('Database error'))

      await expect(restaurarTecnicoUseCase('tecnico-id-123')).rejects.toThrow('Erro ao restaurar técnico')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      const error = await restaurarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.update).mockRejectedValue(dbError)

      await restaurarTecnicoUseCase('tecnico-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, tecnicoId: 'tecnico-id-123' },
        '[TECNICO] Erro ao restaurar'
      )
    })
  })
})
