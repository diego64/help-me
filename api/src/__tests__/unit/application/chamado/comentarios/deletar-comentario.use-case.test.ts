import { describe, it, expect, vi, beforeEach } from 'vitest'

import { deletarComentarioUseCase } from '@application/use-cases/chamado/comentarios/deletar-comentario.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    comentarioChamado: {
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

const makeInput = (overrides = {}): Parameters<typeof deletarComentarioUseCase>[0] => ({
  chamadoId: 'chamado-id-123',
  comentarioId: 'comentario-id-123',
  autorId: 'usuario-id-123',
  autorRegra: 'USUARIO',
  ...overrides,
})

const makeComentario = (overrides = {}) => ({
  id: 'comentario-id-123',
  autorId: 'usuario-id-123',
  chamadoId: 'chamado-id-123',
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(makeComentario() as any)
  vi.mocked(prisma.comentarioChamado.update).mockResolvedValue(
    makeComentario({ deletadoEm: new Date() }) as any
  )
})

describe('deletarComentarioUseCase', () => {
  describe('busca do comentário', () => {
    it('deve buscar comentário pelo id com select correto', async () => {
      await deletarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'comentario-id-123' },
        select: { id: true, autorId: true, chamadoId: true, deletadoEm: true },
      })
    })
  })

  describe('verificação de existência do comentário', () => {
    it('deve lançar ChamadoError quando comentário não existir', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      await expect(deletarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      await expect(deletarComentarioUseCase(makeInput())).rejects.toThrow('Comentário não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando comentário já foi deletado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(deletarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para comentário já deletado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError quando chamadoId do comentário não bate', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ chamadoId: 'outro-chamado-id' }) as any
      )

      await expect(deletarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamadoId não bate', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ chamadoId: 'outro-chamado-id' }) as any
      )

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('verificação de permissão', () => {
    it('deve lançar ChamadoError quando USUARIO tenta deletar comentário de outro', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        deletarComentarioUseCase(makeInput({ autorRegra: 'USUARIO', autorId: 'usuario-id-123' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para acesso não autorizado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        deletarComentarioUseCase(makeInput({ autorRegra: 'USUARIO' }))
      ).rejects.toThrow('Você só pode remover seus próprios comentários')
    })

    it('deve lançar ChamadoError com code FORBIDDEN para acesso não autorizado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ autorId: 'outro-usuario-id' }) as any
      )

      const error = await deletarComentarioUseCase(
        makeInput({ autorRegra: 'USUARIO' })
      ).catch(e => e)
      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 para acesso não autorizado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ autorId: 'outro-usuario-id' }) as any
      )

      const error = await deletarComentarioUseCase(
        makeInput({ autorRegra: 'USUARIO' })
      ).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('deve lançar ChamadoError quando TECNICO tenta deletar comentário de outro', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ autorId: 'outro-tecnico-id' }) as any
      )

      await expect(
        deletarComentarioUseCase(makeInput({ autorRegra: 'TECNICO', autorId: 'tecnico-id-123' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve permitir ADMIN deletar comentário de qualquer usuário', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        deletarComentarioUseCase(makeInput({ autorRegra: 'ADMIN', autorId: 'admin-id-456' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir USUARIO deletar seus próprios comentários', async () => {
      await expect(
        deletarComentarioUseCase(makeInput({ autorRegra: 'USUARIO', autorId: 'usuario-id-123' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir TECNICO deletar seus próprios comentários', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentario({ autorId: 'tecnico-id-123' }) as any
      )

      await expect(
        deletarComentarioUseCase(makeInput({ autorRegra: 'TECNICO', autorId: 'tecnico-id-123' }))
      ).resolves.toBeDefined()
    })
  })

  describe('soft delete do comentário', () => {
    it('deve executar soft delete com data atual', async () => {
      await deletarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.update).toHaveBeenCalledWith({
        where: { id: 'comentario-id-123' },
        data: { deletadoEm: expect.any(Date) },
      })
    })

    it('deve chamar update com where correto', async () => {
      await deletarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'comentario-id-123' } })
      )
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar message e id do comentário', async () => {
      const result = await deletarComentarioUseCase(makeInput())

      expect(result).toEqual({
        message: 'Comentário removido com sucesso',
        id: 'comentario-id-123',
      })
    })

    it('deve logar sucesso com chamadoId, comentarioId e autorId', async () => {
      await deletarComentarioUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', comentarioId: 'comentario-id-123', autorId: 'usuario-id-123' },
        '[CHAMADO] Comentário deletado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code COMENTARIO_DELETE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('COMENTARIO_DELETE_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(new Error('Database error'))

      await expect(deletarComentarioUseCase(makeInput())).rejects.toThrow('Erro ao remover comentário')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(dbError)

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue('string error')

      const error = await deletarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId e comentarioId quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(dbError)

      await deletarComentarioUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123', comentarioId: 'comentario-id-123' },
        '[CHAMADO] Erro ao deletar comentário'
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.comentarioChamado.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeComentario()
      }) as any)

      vi.mocked(prisma.comentarioChamado.update).mockImplementation((async () => {
        ordem.push('update')
        return makeComentario({ deletadoEm: new Date() })
      }) as any)

      await deletarComentarioUseCase(makeInput())

      expect(ordem).toEqual(['find', 'update'])
    })
  })
})