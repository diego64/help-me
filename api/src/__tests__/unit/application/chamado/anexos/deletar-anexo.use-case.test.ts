import { describe, it, expect, vi, beforeEach } from 'vitest'

import { deletarAnexoUseCase } from '@application/use-cases/chamado/anexos/deletar-anexo.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    anexoChamado: {
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

const makeInput = (overrides = {}): Parameters<typeof deletarAnexoUseCase>[0] => ({
  chamadoId: 'chamado-id-123',
  anexoId: 'anexo-id-123',
  autorId: 'usuario-id-123',
  autorRegra: 'USUARIO',
  ...overrides,
})

const makeAnexo = (overrides = {}) => ({
  id: 'anexo-id-123',
  chamadoId: 'chamado-id-123',
  autorId: 'usuario-id-123',
  deletadoEm: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(makeAnexo() as any)
  vi.mocked(prisma.anexoChamado.update).mockResolvedValue(
    makeAnexo({ deletadoEm: new Date() }) as any
  )
})

describe('deletarAnexoUseCase', () => {
  describe('busca do anexo', () => {
    it('deve buscar anexo pelo id com select correto', async () => {
      await deletarAnexoUseCase(makeInput())

      expect(prisma.anexoChamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'anexo-id-123' },
        select: { id: true, chamadoId: true, autorId: true, deletadoEm: true },
      })
    })
  })

  describe('verificação de existência do anexo', () => {
    it('deve lançar ChamadoError quando anexo não existir', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      await expect(deletarAnexoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      await expect(deletarAnexoUseCase(makeInput())).rejects.toThrow('Anexo não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando anexo já foi deletado (soft delete)', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(deletarAnexoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para anexo já deletado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError quando chamadoId do anexo não bate com o input', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ chamadoId: 'outro-chamado-id' }) as any
      )

      await expect(deletarAnexoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamadoId não bate', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ chamadoId: 'outro-chamado-id' }) as any
      )

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('verificação de permissão', () => {
    it('deve lançar ChamadoError quando USUARIO tenta deletar anexo de outro usuário', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        deletarAnexoUseCase(makeInput({ autorRegra: 'USUARIO', autorId: 'usuario-id-123' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para acesso não autorizado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        deletarAnexoUseCase(makeInput({ autorRegra: 'USUARIO' }))
      ).rejects.toThrow('Você só pode remover seus próprios anexos')
    })

    it('deve lançar ChamadoError com code FORBIDDEN para acesso não autorizado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ autorId: 'outro-usuario-id' }) as any
      )

      const error = await deletarAnexoUseCase(makeInput({ autorRegra: 'USUARIO' })).catch(e => e)
      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 para acesso não autorizado', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ autorId: 'outro-usuario-id' }) as any
      )

      const error = await deletarAnexoUseCase(makeInput({ autorRegra: 'USUARIO' })).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('deve permitir ADMIN deletar anexo de outro usuário', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        deletarAnexoUseCase(makeInput({ autorRegra: 'ADMIN', autorId: 'admin-id-456' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir TECNICO deletar seus próprios anexos', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(
        makeAnexo({ autorId: 'tecnico-id-123' }) as any
      )

      await expect(
        deletarAnexoUseCase(makeInput({ autorRegra: 'TECNICO', autorId: 'tecnico-id-123' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir USUARIO deletar seus próprios anexos', async () => {
      await expect(
        deletarAnexoUseCase(makeInput({ autorRegra: 'USUARIO', autorId: 'usuario-id-123' }))
      ).resolves.toBeDefined()
    })
  })

  describe('soft delete do anexo', () => {
    it('deve executar soft delete com data atual', async () => {
      await deletarAnexoUseCase(makeInput())

      expect(prisma.anexoChamado.update).toHaveBeenCalledWith({
        where: { id: 'anexo-id-123' },
        data: { deletadoEm: expect.any(Date) },
      })
    })

    it('deve chamar update com where correto', async () => {
      await deletarAnexoUseCase(makeInput())

      expect(prisma.anexoChamado.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'anexo-id-123' } })
      )
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar message e id do anexo', async () => {
      const result = await deletarAnexoUseCase(makeInput())

      expect(result).toEqual({
        message: 'Anexo removido com sucesso',
        id: 'anexo-id-123',
      })
    })

    it('deve logar sucesso com chamadoId, anexoId e autorId', async () => {
      await deletarAnexoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', anexoId: 'anexo-id-123', autorId: 'usuario-id-123' },
        '[CHAMADO] Anexo deletado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.anexoChamado.findUnique).mockResolvedValue(null)

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code ANEXO_DELETE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.anexoChamado.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('ANEXO_DELETE_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.anexoChamado.update).mockRejectedValue(new Error('Database error'))

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.anexoChamado.update).mockRejectedValue(new Error('Database error'))

      await expect(deletarAnexoUseCase(makeInput())).rejects.toThrow('Erro ao remover anexo')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.anexoChamado.update).mockRejectedValue(dbError)

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.anexoChamado.update).mockRejectedValue('string error')

      const error = await deletarAnexoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId e anexoId quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.anexoChamado.update).mockRejectedValue(dbError)

      await deletarAnexoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123', anexoId: 'anexo-id-123' },
        '[CHAMADO] Erro ao deletar anexo'
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.anexoChamado.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeAnexo()
      }) as any)

      vi.mocked(prisma.anexoChamado.update).mockImplementation((async () => {
        ordem.push('update')
        return makeAnexo({ deletadoEm: new Date() })
      }) as any)

      await deletarAnexoUseCase(makeInput())

      expect(ordem).toEqual(['find', 'update'])
    })
  })
})