import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChamadoStatus } from '@prisma/client'

import { cancelarChamadoUseCase } from '@application/use-cases/chamado/cancelar-chamado.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado:      { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  salvarHistoricoChamado: vi.fn(),
}))

vi.mock('@application/use-cases/chamado/selects', () => ({ CHAMADO_INCLUDE: {} }))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn((c) => c),
}))

const DATA_FIXA = new Date('2024-06-15T10:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof cancelarChamadoUseCase>[0] => ({
  id: 'chamado-id-123',
  descricaoEncerramento: 'Cancelado a pedido do usuário.',
  usuarioId: 'admin-id-123',
  usuarioNome: 'Diego Admin',
  usuarioEmail: 'diego@email.com',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id:        'chamado-id-123',
  OS:        'INC0001',
  status:    ChamadoStatus.ABERTO,
  usuarioId: 'usuario-id-123',
  ...overrides,
})

const makeChamadoCancelado = (overrides = {}) => ({
  ...makeChamado(),
  status: ChamadoStatus.CANCELADO,
  descricaoEncerramento: 'Cancelado a pedido do usuário.',
  encerradoEm: DATA_FIXA,
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(DATA_FIXA)

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({ chamado: { update: vi.fn().mockResolvedValue(makeChamadoCancelado()) } })
  )
  vi.mocked(salvarHistoricoChamado).mockResolvedValue(undefined as any)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cancelarChamadoUseCase', () => {
  describe('verificação do chamado', () => {
    it('deve lançar ChamadoError quando chamado não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(cancelarChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('guard de permissão — USUARIO', () => {
    it('deve lançar ChamadoError quando USUARIO tenta cancelar chamado de outro usuário', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      await expect(
        cancelarChamadoUseCase(makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN para USUARIO cancelando chamado alheio', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      const error = await cancelarChamadoUseCase(
        makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 para USUARIO cancelando chamado alheio', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      const error = await cancelarChamadoUseCase(
        makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' })
      ).catch(e => e)

      expect(error.statusCode).toBe(403)
    })

    it('deve permitir USUARIO cancelar seu próprio chamado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'usuario-id-123' }) as any
      )

      await expect(
        cancelarChamadoUseCase(makeInput({ usuarioRegra: 'USUARIO', usuarioId: 'usuario-id-123' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir ADMIN cancelar chamado de qualquer usuário', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      await expect(
        cancelarChamadoUseCase(makeInput({ usuarioRegra: 'ADMIN' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir TECNICO cancelar chamado de qualquer usuário', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ usuarioId: 'outro-usuario-id' }) as any
      )

      await expect(
        cancelarChamadoUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })
  })

  describe('guards de status do chamado', () => {
    it('deve lançar ChamadoError para chamado ENCERRADO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      await expect(cancelarChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code INVALID_STATUS para chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar ChamadoError com statusCode 400 para chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve lançar ChamadoError com mensagem correta para chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      await expect(cancelarChamadoUseCase(makeInput())).rejects.toThrow(
        'Não é possível cancelar um chamado encerrado'
      )
    })

    it('deve lançar ChamadoError para chamado já CANCELADO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      await expect(cancelarChamadoUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code ALREADY_CANCELLED para chamado já cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('ALREADY_CANCELLED')
    })

    it('deve lançar ChamadoError com statusCode 400 para chamado já cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve lançar ChamadoError com mensagem correta para chamado já cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      await expect(cancelarChamadoUseCase(makeInput())).rejects.toThrow('Este chamado já está cancelado')
    })

    it('deve permitir cancelar chamado ABERTO', async () => {
      await expect(cancelarChamadoUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve permitir cancelar chamado EM_ATENDIMENTO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.EM_ATENDIMENTO }) as any
      )

      await expect(cancelarChamadoUseCase(makeInput())).resolves.toBeDefined()
    })
  })

  describe('atualização do chamado', () => {
    it('deve gravar status CANCELADO, descricaoEncerramento e encerradoEm no update', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoCancelado())
            }),
          },
        })
      )

      await cancelarChamadoUseCase(makeInput({ descricaoEncerramento: '  Motivo detalhado aqui.  ' }))

      expect(dataGravada.status).toBe(ChamadoStatus.CANCELADO)
      expect(dataGravada.descricaoEncerramento).toBe('Motivo detalhado aqui.')
      expect(dataGravada.encerradoEm).toEqual(DATA_FIXA)
      expect(dataGravada.atualizadoEm).toEqual(DATA_FIXA)
    })

    it('deve aplicar trim na descricaoEncerramento antes de gravar', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoCancelado())
            }),
          },
        })
      )

      await cancelarChamadoUseCase(makeInput({ descricaoEncerramento: '   com espaços   ' }))

      expect(dataGravada.descricaoEncerramento).toBe('com espaços')
    })
  })

  describe('side effects assíncronos', () => {
    it('deve salvar histórico com tipo CANCELAMENTO', async () => {
      await cancelarChamadoUseCase(makeInput())

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'CANCELAMENTO' })
      )
    })

    it('deve salvar histórico com de/para corretos', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ABERTO }) as any
      )

      await cancelarChamadoUseCase(makeInput())

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ de: ChamadoStatus.ABERTO, para: ChamadoStatus.CANCELADO })
      )
    })

    it('deve salvar histórico com dados do autor', async () => {
      await cancelarChamadoUseCase(makeInput())

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({
          autorId:    'admin-id-123',
          autorNome:  'Diego Admin',
          autorEmail: 'diego@email.com',
        })
      )
    })

    it('deve salvar histórico com descricaoEncerramento após trim', async () => {
      await cancelarChamadoUseCase(makeInput({ descricaoEncerramento: '  Motivo válido.  ' }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: 'Motivo válido.' })
      )
    })

    it('deve continuar mesmo se salvarHistoricoChamado falhar', async () => {
      vi.mocked(salvarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

      await expect(cancelarChamadoUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve logar erro quando salvarHistoricoChamado falhar', async () => {
      vi.mocked(salvarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

      await cancelarChamadoUseCase(makeInput())
      await vi.runAllTimersAsync()

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        '[CHAMADO] Erro ao salvar histórico'
      )
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar message com texto de sucesso', async () => {
      const result = await cancelarChamadoUseCase(makeInput())

      expect(result.message).toBe('Chamado cancelado com sucesso')
    })

    it('deve retornar chamado formatado', async () => {
      const result = await cancelarChamadoUseCase(makeInput())

      expect(result).toHaveProperty('chamado')
      expect(result.chamado).toHaveProperty('id')
      expect(result.chamado).toHaveProperty('OS')
      expect(result.chamado).toHaveProperty('status')
    })

    it('deve logar sucesso com chamadoId e usuarioId', async () => {
      await cancelarChamadoUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', usuarioId: 'admin-id-123' },
        '[CHAMADO] Chamado cancelado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code CANCEL_ERROR quando update falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('CANCEL_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      await expect(cancelarChamadoUseCase(makeInput())).rejects.toThrow('Erro ao cancelar o chamado')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      const error = await cancelarChamadoUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro com chamadoId quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      await cancelarChamadoUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao cancelar'
      )
    })
  })
})