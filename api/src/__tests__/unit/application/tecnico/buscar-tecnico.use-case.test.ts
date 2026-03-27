import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Regra, NivelTecnico, Setor } from '@prisma/client'

import { buscarTecnicoUseCase } from '@application/use-cases/tecnico/buscar-tecnico.use-case'
import { TecnicoError } from '@application/use-cases/tecnico/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
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

const makeTecnico = (overrides = {}) => ({
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
})

describe('buscarTecnicoUseCase', () => {
  describe('busca do técnico', () => {
    it('deve buscar técnico pelo id', async () => {
      await buscarTecnicoUseCase('tecnico-id-123')

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tecnico-id-123' } })
      )
    })

    it('deve lançar TecnicoError quando técnico não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarTecnicoUseCase('tecnico-id-123')).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(buscarTecnicoUseCase('tecnico-id-123')).rejects.toThrow('Técnico não encontrado')
    })

    it('deve lançar TecnicoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar TecnicoError quando usuário existe mas não é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ regra: 'USUARIO' as Regra }) as any
      )

      await expect(buscarTecnicoUseCase('tecnico-id-123')).rejects.toThrow(TecnicoError)
    })

    it('deve lançar TecnicoError com code NOT_FOUND quando regra não é TECNICO', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeTecnico({ regra: 'ADMIN' as Regra }) as any
      )

      const error = await buscarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do técnico', async () => {
      const tecnico = makeTecnico()
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(tecnico as any)

      const result = await buscarTecnicoUseCase('tecnico-id-123')

      expect(result).toEqual(tecnico)
    })

    it('deve logar sucesso após encontrar técnico', async () => {
      await buscarTecnicoUseCase('tecnico-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { tecnicoId: 'tecnico-id-123' },
        '[TECNICO] Encontrado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar TecnicoError sem encapsular', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await buscarTecnicoUseCase('tecnico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar TecnicoError com code GET_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarTecnicoUseCase('tecnico-id-123').catch(e => e)

      expect(error).toBeInstanceOf(TecnicoError)
      expect(error.code).toBe('GET_ERROR')
    })

    it('deve lançar TecnicoError com statusCode 500 quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await buscarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar TecnicoError com mensagem correta quando findUnique falhar', async () => {
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(new Error('Database error'))

      await expect(buscarTecnicoUseCase('tecnico-id-123')).rejects.toThrow('Erro ao buscar técnico')
    })

    it('deve incluir originalError quando falha com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(dbError)

      const error = await buscarTecnicoUseCase('tecnico-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro quando findUnique falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.usuario.findUnique).mockRejectedValue(dbError)

      await buscarTecnicoUseCase('tecnico-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, tecnicoId: 'tecnico-id-123' },
        '[TECNICO] Erro ao buscar'
      )
    })
  })
})
