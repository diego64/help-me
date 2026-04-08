import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listarAnexosUseCase } from '@application/use-cases/chamado/anexos/listar-anexos.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
    },
    anexoChamado: {
      findMany: vi.fn(),
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

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  deletadoEm: null,
  ...overrides,
})

const makeAnexo = (overrides = {}) => ({
  id: 'anexo-id-123',
  nomeOriginal: 'documento.pdf',
  mimetype: 'application/pdf',
  tamanho: 1024,
  criadoEm: DATA_FIXA,
  autor: {
    id: 'usuario-id-123',
    nome: 'Diego',
    sobrenome: 'Dev',
    email: 'diego@email.com',
  },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.anexoChamado.findMany).mockResolvedValue([makeAnexo()] as any)
})

describe('listarAnexosUseCase', () => {
  describe('verificação do chamado', () => {
    it('deve buscar chamado pelo id com select correto', async () => {
      await listarAnexosUseCase('chamado-id-123')

      expect(prisma.chamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'chamado-id-123' },
        select: { id: true, OS: true, deletadoEm: true },
      })
    })

    it('deve lançar ChamadoError quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(listarAnexosUseCase('chamado-id-123')).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(listarAnexosUseCase('chamado-id-123')).rejects.toThrow('Chamado não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando chamado está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(listarAnexosUseCase('chamado-id-123')).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para chamado deletado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('busca de anexos', () => {
    it('deve buscar apenas anexos não deletados do chamado', async () => {
      await listarAnexosUseCase('chamado-id-123')

      expect(prisma.anexoChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chamadoId: 'chamado-id-123', deletadoEm: null },
        })
      )
    })

    it('deve ordenar anexos por criadoEm desc', async () => {
      await listarAnexosUseCase('chamado-id-123')

      expect(prisma.anexoChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { criadoEm: 'desc' },
        })
      )
    })

    it('deve selecionar campos corretos dos anexos', async () => {
      await listarAnexosUseCase('chamado-id-123')

      expect(prisma.anexoChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nomeOriginal: true,
            mimetype: true,
            tamanho: true,
            criadoEm: true,
            autor: { select: { id: true, nome: true, sobrenome: true, email: true } },
          },
        })
      )
    })

    it('não deve selecionar objetoMinio e bucketMinio', async () => {
      await listarAnexosUseCase('chamado-id-123')

      const [args] = vi.mocked(prisma.anexoChamado.findMany).mock.calls[0] ?? []
      expect(args?.select).not.toHaveProperty('objetoMinio')
      expect(args?.select).not.toHaveProperty('bucketMinio')
    })
  })

  describe('retorno', () => {
    it('deve retornar chamadoOS corretamente', async () => {
      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.chamadoOS).toBe('INC0000001')
    })

    it('deve retornar total de anexos', async () => {
      vi.mocked(prisma.anexoChamado.findMany).mockResolvedValue([
        makeAnexo(),
        makeAnexo({ id: 'anexo-id-456' }),
      ] as any)

      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.total).toBe(2)
    })

    it('deve retornar total 0 quando não há anexos', async () => {
      vi.mocked(prisma.anexoChamado.findMany).mockResolvedValue([])

      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.total).toBe(0)
    })

    it('deve retornar lista vazia quando não há anexos', async () => {
      vi.mocked(prisma.anexoChamado.findMany).mockResolvedValue([])

      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.anexos).toEqual([])
    })

    it('deve formatar nome do autor como nome + sobrenome', async () => {
      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.anexos[0]?.autor.nome).toBe('Diego Dev')
    })

    it('deve retornar id do autor correto', async () => {
      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.anexos[0]?.autor.id).toBe('usuario-id-123')
    })

    it('deve retornar email do autor correto', async () => {
      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.anexos[0]?.autor.email).toBe('diego@email.com')
    })

    it('deve retornar campos do anexo corretamente', async () => {
      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.anexos[0]).toMatchObject({
        id: 'anexo-id-123',
        nomeOriginal: 'documento.pdf',
        mimetype: 'application/pdf',
        tamanho: 1024,
        criadoEm: DATA_FIXA,
      })
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result).toHaveProperty('chamadoOS')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('anexos')
    })

    it('deve mapear múltiplos anexos corretamente', async () => {
      vi.mocked(prisma.anexoChamado.findMany).mockResolvedValue([
        makeAnexo({ id: 'anexo-1', nomeOriginal: 'a.pdf' }),
        makeAnexo({ id: 'anexo-2', nomeOriginal: 'b.xlsx' }),
      ] as any)

      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.anexos).toHaveLength(2)
      expect(result.anexos[0]?.id).toBe('anexo-1')
      expect(result.anexos[1]?.id).toBe('anexo-2')
    })

    it('não deve expor sobrenome separado no autor retornado', async () => {
      const result = await listarAnexosUseCase('chamado-id-123')

      expect(result.anexos[0]?.autor).not.toHaveProperty('sobrenome')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com chamadoId e total', async () => {
      await listarAnexosUseCase('chamado-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', total: 1 },
        '[CHAMADO] Anexos listados'
      )
    })

    it('deve logar total 0 quando sem anexos', async () => {
      vi.mocked(prisma.anexoChamado.findMany).mockResolvedValue([])

      await listarAnexosUseCase('chamado-id-123')

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', total: 0 },
        '[CHAMADO] Anexos listados'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code ANEXO_LIST_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('ANEXO_LIST_ERROR')
    })

    it('deve lançar ChamadoError com code ANEXO_LIST_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.anexoChamado.findMany).mockRejectedValue(new Error('Database error'))

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('ANEXO_LIST_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      await expect(listarAnexosUseCase('chamado-id-123')).rejects.toThrow('Erro ao listar anexos')
    })

    it('deve incluir originalError quando falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(dbError)

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue('string error')

      const error = await listarAnexosUseCase('chamado-id-123').catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(dbError)

      await listarAnexosUseCase('chamado-id-123').catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao listar anexos'
      )
    })
  })
})