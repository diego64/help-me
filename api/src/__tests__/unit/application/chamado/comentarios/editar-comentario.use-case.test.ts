import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus } from '@prisma/client'

import { editarComentarioUseCase } from '@application/use-cases/chamado/comentarios/editar-comentario.use-case'
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

const makeInput = (overrides = {}): Parameters<typeof editarComentarioUseCase>[0] => ({
  chamadoId: 'chamado-id-123',
  comentarioId: 'comentario-id-123',
  comentario: 'Comentário atualizado',
  autorId: 'usuario-id-123',
  autorRegra: 'USUARIO',
  ...overrides,
})

const makeComentarioExistente = (overrides = {}) => ({
  id: 'comentario-id-123',
  autorId: 'usuario-id-123',
  chamadoId: 'chamado-id-123',
  deletadoEm: null,
  chamado: { status: ChamadoStatus.ABERTO },
  ...overrides,
})

const makeComentarioAtualizado = (overrides = {}) => ({
  id: 'comentario-id-123',
  comentario: 'Comentário atualizado',
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

  vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(makeComentarioExistente() as any)
  vi.mocked(prisma.comentarioChamado.update).mockResolvedValue(makeComentarioAtualizado() as any)
})
describe('editarComentarioUseCase', () => {
  describe('busca do comentário', () => {
    it('deve buscar comentário pelo id com select correto incluindo chamado', async () => {
      await editarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'comentario-id-123' },
        select: {
          id: true,
          autorId: true,
          chamadoId: true,
          deletadoEm: true,
          chamado: { select: { status: true } },
        },
      })
    })
  })

  describe('verificação de existência do comentário', () => {
    it('deve lançar ChamadoError quando comentário não existir', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      await expect(editarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      await expect(editarComentarioUseCase(makeInput())).rejects.toThrow('Comentário não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando não encontrado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando não encontrado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando comentário já foi deletado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(editarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para comentário deletado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError quando chamadoId do comentário não bate', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamadoId: 'outro-chamado-id' }) as any
      )

      await expect(editarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamadoId não bate', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamadoId: 'outro-chamado-id' }) as any
      )

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('verificação de permissão', () => {
    it('deve lançar ChamadoError quando USUARIO tenta editar comentário de outro', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        editarComentarioUseCase(makeInput({ autorRegra: 'USUARIO', autorId: 'usuario-id-123' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para acesso não autorizado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        editarComentarioUseCase(makeInput({ autorRegra: 'USUARIO' }))
      ).rejects.toThrow('Você só pode editar seus próprios comentários')
    })

    it('deve lançar ChamadoError com code FORBIDDEN para acesso não autorizado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ autorId: 'outro-usuario-id' }) as any
      )

      const error = await editarComentarioUseCase(
        makeInput({ autorRegra: 'USUARIO' })
      ).catch(e => e)
      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 para acesso não autorizado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ autorId: 'outro-usuario-id' }) as any
      )

      const error = await editarComentarioUseCase(
        makeInput({ autorRegra: 'USUARIO' })
      ).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('deve lançar ChamadoError quando TECNICO tenta editar comentário de outro', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ autorId: 'outro-tecnico-id' }) as any
      )

      await expect(
        editarComentarioUseCase(makeInput({ autorRegra: 'TECNICO', autorId: 'tecnico-id-123' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve permitir ADMIN editar comentário de qualquer usuário', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ autorId: 'outro-usuario-id' }) as any
      )

      await expect(
        editarComentarioUseCase(makeInput({ autorRegra: 'ADMIN', autorId: 'admin-id-456' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir USUARIO editar seus próprios comentários', async () => {
      await expect(
        editarComentarioUseCase(makeInput({ autorRegra: 'USUARIO', autorId: 'usuario-id-123' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir TECNICO editar seus próprios comentários', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ autorId: 'tecnico-id-123' }) as any
      )

      await expect(
        editarComentarioUseCase(makeInput({ autorRegra: 'TECNICO', autorId: 'tecnico-id-123' }))
      ).resolves.toBeDefined()
    })
  })

  describe('validação de status do chamado', () => {
    it('deve lançar ChamadoError quando chamado está CANCELADO', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamado: { status: ChamadoStatus.CANCELADO } }) as any
      )

      await expect(editarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para chamado cancelado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamado: { status: ChamadoStatus.CANCELADO } }) as any
      )

      await expect(editarComentarioUseCase(makeInput())).rejects.toThrow(
        'Não é possível editar comentários de chamados cancelados'
      )
    })

    it('deve lançar ChamadoError com code INVALID_STATUS para chamado cancelado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamado: { status: ChamadoStatus.CANCELADO } }) as any
      )

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar ChamadoError com statusCode 400 para chamado cancelado', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamado: { status: ChamadoStatus.CANCELADO } }) as any
      )

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve permitir editar comentário em chamado ABERTO', async () => {
      await expect(editarComentarioUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve permitir editar comentário em chamado EM_ATENDIMENTO', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamado: { status: ChamadoStatus.EM_ATENDIMENTO } }) as any
      )

      await expect(editarComentarioUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve permitir editar comentário em chamado REABERTO', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(
        makeComentarioExistente({ chamado: { status: ChamadoStatus.REABERTO } }) as any
      )

      await expect(editarComentarioUseCase(makeInput())).resolves.toBeDefined()
    })
  })

  describe('atualização do comentário', () => {
    it('deve chamar update com where e data corretos', async () => {
      await editarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comentario-id-123' },
          data: { comentario: 'Comentário atualizado' },
        })
      )
    })

    it('deve trimar o comentário antes de salvar', async () => {
      await editarComentarioUseCase(makeInput({ comentario: '  Texto com espaços  ' }))

      expect(prisma.comentarioChamado.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { comentario: 'Texto com espaços' },
        })
      )
    })

    it('deve selecionar campos corretos ao atualizar', async () => {
      await editarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.update).toHaveBeenCalledWith(
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
    it('deve retornar message de sucesso', async () => {
      const result = await editarComentarioUseCase(makeInput())

      expect(result.message).toBe('Comentário atualizado com sucesso')
    })

    it('deve formatar nome do autor como nome + sobrenome', async () => {
      const result = await editarComentarioUseCase(makeInput())

      expect(result.comentario.autor.nome).toBe('Diego Dev')
    })

    it('deve retornar id, email e regra do autor', async () => {
      const result = await editarComentarioUseCase(makeInput())

      expect(result.comentario.autor.id).toBe('usuario-id-123')
      expect(result.comentario.autor.email).toBe('diego@email.com')
      expect(result.comentario.autor.regra).toBe('USUARIO')
    })

    it('deve retornar campos do comentário atualizado', async () => {
      const result = await editarComentarioUseCase(makeInput())

      expect(result.comentario).toMatchObject({
        id: 'comentario-id-123',
        comentario: 'Comentário atualizado',
        visibilidadeInterna: false,
        criadoEm: DATA_FIXA,
        atualizadoEm: DATA_FIXA,
      })
    })

    it('não deve expor sobrenome separado no autor retornado', async () => {
      const result = await editarComentarioUseCase(makeInput())

      expect(result.comentario.autor).not.toHaveProperty('sobrenome')
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await editarComentarioUseCase(makeInput())

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('comentario')
      expect(result.comentario).toHaveProperty('id')
      expect(result.comentario).toHaveProperty('autor')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com chamadoId, comentarioId e autorId', async () => {
      await editarComentarioUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', comentarioId: 'comentario-id-123', autorId: 'usuario-id-123' },
        '[CHAMADO] Comentário editado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.comentarioChamado.findUnique).mockResolvedValue(null)

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code COMENTARIO_UPDATE_ERROR quando update falhar', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(new Error('Database error'))

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('COMENTARIO_UPDATE_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(new Error('Database error'))

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(new Error('Database error'))

      await expect(editarComentarioUseCase(makeInput())).rejects.toThrow('Erro ao editar comentário')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(dbError)

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue('string error')

      const error = await editarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId e comentarioId quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.comentarioChamado.update).mockRejectedValue(dbError)

      await editarComentarioUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123', comentarioId: 'comentario-id-123' },
        '[CHAMADO] Erro ao editar comentário'
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.comentarioChamado.findUnique).mockImplementation((async () => {
        ordem.push('find')
        return makeComentarioExistente()
      }) as any)

      vi.mocked(prisma.comentarioChamado.update).mockImplementation((async () => {
        ordem.push('update')
        return makeComentarioAtualizado()
      }) as any)

      await editarComentarioUseCase(makeInput())

      expect(ordem).toEqual(['find', 'update'])
    })
  })
})