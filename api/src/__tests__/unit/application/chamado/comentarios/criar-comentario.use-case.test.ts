import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChamadoStatus } from '@prisma/client'

import { criarComentarioUseCase } from '@application/use-cases/chamado/comentarios/criar-comentario.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger' 

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado: {
      findUnique: vi.fn(),
    },
    comentarioChamado: {
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

const makeInput = (overrides = {}): Parameters<typeof criarComentarioUseCase>[0] => ({
  chamadoId: 'chamado-id-123',
  comentario: 'Este é um comentário de teste',
  visibilidadeInterna: false,
  autorId: 'usuario-id-123',
  autorRegra: 'USUARIO',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0001',
  status: ChamadoStatus.ABERTO,
  deletadoEm: null,
  ...overrides,
})

const makeComentario = (overrides = {}) => ({
  id: 'comentario-id-123',
  comentario: 'Este é um comentário de teste',
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
  vi.mocked(prisma.comentarioChamado.create).mockResolvedValue(makeComentario() as any)
})

describe('criarComentarioUseCase', () => {
  describe('validação de visibilidade interna', () => {
    it('deve lançar ChamadoError quando USUARIO tenta criar comentário interno', async () => {
      await expect(
        criarComentarioUseCase(makeInput({ visibilidadeInterna: true, autorRegra: 'USUARIO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para USUARIO com comentário interno', async () => {
      await expect(
        criarComentarioUseCase(makeInput({ visibilidadeInterna: true, autorRegra: 'USUARIO' }))
      ).rejects.toThrow('Usuários não podem criar comentários internos')
    })

    it('deve lançar ChamadoError com code FORBIDDEN', async () => {
      const error = await criarComentarioUseCase(
        makeInput({ visibilidadeInterna: true, autorRegra: 'USUARIO' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403', async () => {
      const error = await criarComentarioUseCase(
        makeInput({ visibilidadeInterna: true, autorRegra: 'USUARIO' })
      ).catch(e => e)

      expect(error.statusCode).toBe(403)
    })

    it('deve permitir ADMIN criar comentário interno', async () => {
      vi.mocked(prisma.comentarioChamado.create).mockResolvedValue(
        makeComentario({ visibilidadeInterna: true }) as any
      )

      await expect(
        criarComentarioUseCase(makeInput({ visibilidadeInterna: true, autorRegra: 'ADMIN' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir TECNICO criar comentário interno', async () => {
      vi.mocked(prisma.comentarioChamado.create).mockResolvedValue(
        makeComentario({ visibilidadeInterna: true }) as any
      )

      await expect(
        criarComentarioUseCase(makeInput({ visibilidadeInterna: true, autorRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir USUARIO criar comentário público', async () => {
      await expect(
        criarComentarioUseCase(makeInput({ visibilidadeInterna: false, autorRegra: 'USUARIO' }))
      ).resolves.toBeDefined()
    })
  })

  describe('verificação do chamado', () => {
    it('deve buscar chamado pelo id com select correto', async () => {
      await criarComentarioUseCase(makeInput())

      expect(prisma.chamado.findUnique).toHaveBeenCalledWith({
        where: { id: 'chamado-id-123' },
        select: { id: true, OS: true, status: true, deletadoEm: true },
      })
    })

    it('deve lançar ChamadoError quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(criarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta quando não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(criarComentarioUseCase(makeInput())).rejects.toThrow('Chamado não encontrado')
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })

    it('deve lançar ChamadoError quando chamado está soft deleted', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      await expect(criarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND para chamado deletado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ deletadoEm: DATA_FIXA }) as any
      )

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })
  })

  describe('validação de status do chamado', () => {
    it('deve lançar ChamadoError quando chamado está CANCELADO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      await expect(criarComentarioUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com mensagem correta para chamado cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      await expect(criarComentarioUseCase(makeInput())).rejects.toThrow(
        'Não é possível comentar em chamados cancelados'
      )
    })

    it('deve lançar ChamadoError com code INVALID_STATUS para chamado cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar ChamadoError com statusCode 400 para chamado cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve permitir comentar em chamado ABERTO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ABERTO }) as any
      )

      await expect(criarComentarioUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve permitir comentar em chamado EM_ATENDIMENTO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.EM_ATENDIMENTO }) as any
      )

      await expect(criarComentarioUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve permitir comentar em chamado REABERTO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.REABERTO }) as any
      )

      await expect(criarComentarioUseCase(makeInput())).resolves.toBeDefined()
    })
  })

  describe('criação do comentário', () => {
    it('deve criar comentário com os dados corretos', async () => {
      await criarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            chamadoId: 'chamado-id-123',
            autorId: 'usuario-id-123',
            comentario: 'Este é um comentário de teste',
            visibilidadeInterna: false,
          },
        })
      )
    })

    it('deve trimar o comentário antes de salvar', async () => {
      await criarComentarioUseCase(makeInput({ comentario: '  Comentário com espaços  ' }))

      expect(prisma.comentarioChamado.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ comentario: 'Comentário com espaços' }),
        })
      )
    })

    it('deve converter visibilidadeInterna para Boolean', async () => {
      await criarComentarioUseCase(makeInput({ visibilidadeInterna: true, autorRegra: 'ADMIN' }))

      expect(prisma.comentarioChamado.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ visibilidadeInterna: true }),
        })
      )
    })

    it('deve selecionar campos corretos ao criar', async () => {
      await criarComentarioUseCase(makeInput())

      expect(prisma.comentarioChamado.create).toHaveBeenCalledWith(
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
      const result = await criarComentarioUseCase(makeInput())

      expect(result.message).toBe('Comentário adicionado com sucesso')
    })

    it('deve formatar nome do autor como nome + sobrenome', async () => {
      const result = await criarComentarioUseCase(makeInput())

      expect(result.comentario.autor.nome).toBe('Diego Dev')
    })

    it('deve retornar id do autor correto', async () => {
      const result = await criarComentarioUseCase(makeInput())

      expect(result.comentario.autor.id).toBe('usuario-id-123')
    })

    it('deve retornar email do autor', async () => {
      const result = await criarComentarioUseCase(makeInput())

      expect(result.comentario.autor.email).toBe('diego@email.com')
    })

    it('deve retornar regra do autor', async () => {
      const result = await criarComentarioUseCase(makeInput())

      expect(result.comentario.autor.regra).toBe('USUARIO')
    })

    it('deve retornar campos do comentário corretamente', async () => {
      const result = await criarComentarioUseCase(makeInput())

      expect(result.comentario).toMatchObject({
        id: 'comentario-id-123',
        comentario: 'Este é um comentário de teste',
        visibilidadeInterna: false,
        criadoEm: DATA_FIXA,
        atualizadoEm: DATA_FIXA,
      })
    })

    it('não deve expor sobrenome separado no autor retornado', async () => {
      const result = await criarComentarioUseCase(makeInput())

      expect(result.comentario.autor).not.toHaveProperty('sobrenome')
    })

    it('deve retornar todos os campos do output', async () => {
      const result = await criarComentarioUseCase(makeInput())

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('comentario')
      expect(result.comentario).toHaveProperty('id')
      expect(result.comentario).toHaveProperty('autor')
    })
  })

  describe('logging', () => {
    it('deve logar sucesso com chamadoId, autorId e visibilidadeInterna', async () => {
      await criarComentarioUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', autorId: 'usuario-id-123', visibilidadeInterna: false },
        '[CHAMADO] Comentário criado'
      )
    })

    it('deve logar visibilidadeInterna=true para comentário interno', async () => {
      vi.mocked(prisma.comentarioChamado.create).mockResolvedValue(
        makeComentario({ visibilidadeInterna: true }) as any
      )

      await criarComentarioUseCase(makeInput({ visibilidadeInterna: true, autorRegra: 'ADMIN' }))

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ visibilidadeInterna: true }),
        '[CHAMADO] Comentário criado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code COMENTARIO_CREATE_ERROR quando create falhar', async () => {
      vi.mocked(prisma.comentarioChamado.create).mockRejectedValue(new Error('Database error'))

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('COMENTARIO_CREATE_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando create falhar', async () => {
      vi.mocked(prisma.comentarioChamado.create).mockRejectedValue(new Error('Database error'))

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando create falhar', async () => {
      vi.mocked(prisma.comentarioChamado.create).mockRejectedValue(new Error('Database error'))

      await expect(criarComentarioUseCase(makeInput())).rejects.toThrow('Erro ao criar comentário')
    })

    it('deve incluir originalError quando create falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.comentarioChamado.create).mockRejectedValue(dbError)

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('não deve incluir originalError quando erro não é instância de Error', async () => {
      vi.mocked(prisma.comentarioChamado.create).mockRejectedValue('string error')

      const error = await criarComentarioUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBeUndefined()
    })

    it('deve logar erro com chamadoId quando create falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.comentarioChamado.create).mockRejectedValue(dbError)

      await criarComentarioUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao criar comentário'
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.chamado.findUnique).mockImplementation((async () => {
        ordem.push('find_chamado')
        return makeChamado()
      }) as any)

      vi.mocked(prisma.comentarioChamado.create).mockImplementation((async () => {
        ordem.push('create_comentario')
        return makeComentario()
      }) as any)

      await criarComentarioUseCase(makeInput())

      expect(ordem).toEqual(['find_chamado', 'create_comentario'])
    })
  })
})