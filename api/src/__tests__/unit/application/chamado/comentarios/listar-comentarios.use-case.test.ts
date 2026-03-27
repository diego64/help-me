import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listarComentariosUseCase } from '@application/use-cases/chamado/comentarios/listar-comentarios.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
    },
    comentarioChamado: {
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

const makeInput = (overrides = {}): Parameters<typeof listarComentariosUseCase>[0] => ({
  chamadoId: 'chamado-id-123',
  regra: 'ADMIN',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
  deletadoEm: null,
  ...overrides,
})

const makeComentario = (overrides = {}) => ({
  id: 'comentario-id-123',
  comentario: 'Este é um comentário',
  visibilidadeInterna: false,
  criadoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  autor: {
    id: 'usuario-id-123',
    nome: 'Diego',
    sobrenome: 'Dev',
    email: 'diego@email.com',
    regra: 'USUARIO',
  },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.comentarioChamado.findMany).mockResolvedValue([makeComentario()] as any)
})

describe('listarComentariosUseCase', () => {
  describe('verificação do chamado', () => {
    it('deve buscar chamado pelo id com select correto', async () => {
      await listarComentariosUseCase(makeInput())

      expect(prisma.chamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'chamado-id-123' },
        select: { id: true, OS: true, deletadoEm: true },
      })
    })

    it('deve lançar ChamadoError quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(listarComentariosUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(listarComentariosUseCase(makeInput())).rejects.toThrow('Chamado não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando chamado está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(listarComentariosUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para chamado deletado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('filtros da query de comentários', () => {
    it('deve buscar apenas comentários não deletados do chamado', async () => {
      await listarComentariosUseCase(makeInput())

      expect(prisma.comentarioChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ chamadoId: 'chamado-id-123', deletadoEm: null }),
        })
      )
    })

    it('deve filtrar visibilidadeInterna=false para regra USUARIO', async () => {
      await listarComentariosUseCase(makeInput({ regra: 'USUARIO' }))

      expect(prisma.comentarioChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ visibilidadeInterna: false }),
        })
      )
    })

    it('não deve filtrar visibilidadeInterna para regra ADMIN', async () => {
      await listarComentariosUseCase(makeInput({ regra: 'ADMIN' }))

      const [args] = vi.mocked(prisma.comentarioChamado.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('visibilidadeInterna')
    })

    it('não deve filtrar visibilidadeInterna para regra TECNICO', async () => {
      await listarComentariosUseCase(makeInput({ regra: 'TECNICO' }))

      const [args] = vi.mocked(prisma.comentarioChamado.findMany).mock.calls[0] ?? []
      expect(args?.where).not.toHaveProperty('visibilidadeInterna')
    })

    it('deve ordenar comentários por criadoEm asc', async () => {
      await listarComentariosUseCase(makeInput())

      expect(prisma.comentarioChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { criadoEm: 'asc' } })
      )
    })

    it('deve selecionar campos corretos dos comentários com autor', async () => {
      await listarComentariosUseCase(makeInput())

      expect(prisma.comentarioChamado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            comentario: true,
            visibilidadeInterna: true,
            criadoEm: true,
            atualizadoEm: true,
            autor: { select: { id: true, nome: true, sobrenome: true, email: true, regra: true } },
          },
        })
      )
    })
  })

  describe('retorno', () => {
    it('deve retornar chamadoOS corretamente', async () => {
      const result = await listarComentariosUseCase(makeInput())

      expect(result.chamadoOS).toBe('INC0001')
    })

    it('deve retornar total de comentários', async () => {
      vi.mocked(prisma.comentarioChamado.findMany).mockResolvedValue([
        makeComentario(),
        makeComentario({ id: 'comentario-id-456' }),
      ] as any)

      const result = await listarComentariosUseCase(makeInput())

      expect(result.total).toBe(2)
    })

    it('deve retornar total 0 quando não há comentários', async () => {
      vi.mocked(prisma.comentarioChamado.findMany).mockResolvedValue([])

      const result = await listarComentariosUseCase(makeInput())

      expect(result.total).toBe(0)
    })

    it('deve retornar lista vazia quando não há comentários', async () => {
      vi.mocked(prisma.comentarioChamado.findMany).mockResolvedValue([])

      const result = await listarComentariosUseCase(makeInput())

      expect(result.comentarios).toEqual([])
    })

    it('deve formatar nome do autor como nome + sobrenome', async () => {
      const result = await listarComentariosUseCase(makeInput())

      expect(result.comentarios[0]?.autor.nome).toBe('Diego Dev')
    })

    it('deve retornar id, email e regra do autor', async () => {
      const result = await listarComentariosUseCase(makeInput())

      expect(result.comentarios[0]?.autor.id).toBe('usuario-id-123')
      expect(result.comentarios[0]?.autor.email).toBe('diego@email.com')
      expect(result.comentarios[0]?.autor.regra).toBe('USUARIO')
    })

    it('deve retornar campos do comentário corretamente', async () => {
      const result = await listarComentariosUseCase(makeInput())

      expect(result.comentarios[0]).toMatchObject({
        id: 'comentario-id-123',
        comentario: 'Este é um comentário',
        visibilidadeInterna: false,
        criadoEm: DATA_FIXA,
        atualizadoEm: DATA_FIXA,
      })
    })

    it('não deve expor sobrenome separado no autor retornado', async () => {
      const result = await listarComentariosUseCase(makeInput())

      expect(result.comentarios[0]?.autor).not.toHaveProperty('sobrenome')
    })

    it('deve mapear múltiplos comentários corretamente', async () => {
      vi.mocked(prisma.comentarioChamado.findMany).mockResolvedValue([
        makeComentario({ id: 'c-1', comentario: 'Primeiro' }),
        makeComentario({ id: 'c-2', comentario: 'Segundo' }),
      ] as any)

      const result = await listarComentariosUseCase(makeInput())

      expect(result.comentarios).toHaveLength(2)
      expect(result.comentarios[0]?.id).toBe('c-1')
      expect(result.comentarios[1]?.id).toBe('c-2')
    })

    it('deve retornar comentários internos para ADMIN', async () => {
      vi.mocked(prisma.comentarioChamado.findMany).mockResolvedValue([
        makeComentario({ visibilidadeInterna: true }),
      ] as any)

      const result = await listarComentariosUseCase(makeInput({ regra: 'ADMIN' }))

      expect(result.comentarios[0]?.visibilidadeInterna).toBe(true)
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await listarComentariosUseCase(makeInput())

      expect(result).toHaveProperty('chamadoOS')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('comentarios')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com chamadoId e total', async () => {
      await listarComentariosUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', total: 1 },
        '[CHAMADO] Comentários listados'
      )
    })

    it('deve logar total 0 quando sem comentários', async () => {
      vi.mocked(prisma.comentarioChamado.findMany).mockResolvedValue([])

      await listarComentariosUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', total: 0 },
        '[CHAMADO] Comentários listados'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code COMENTARIO_LIST_ERROR quando findUnique falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('COMENTARIO_LIST_ERROR')
    })

    it('deve lançar ChamadoError com code COMENTARIO_LIST_ERROR quando findMany falhar', async () => {
      vi.mocked(prisma.comentarioChamado.findMany).mockRejectedValue(new Error('Database error'))

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('COMENTARIO_LIST_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando operação falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando operação falhar', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(new Error('Database error'))

      await expect(listarComentariosUseCase(makeInput())).rejects.toThrow('Erro ao listar comentários')
    })

    it('deve incluir originalError quando falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(dbError)

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue('string error')

      const error = await listarComentariosUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId quando operação falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.chamado.findUnique).mockRejectedValue(dbError)

      await listarComentariosUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao listar comentários'
      )
    })
  })
})