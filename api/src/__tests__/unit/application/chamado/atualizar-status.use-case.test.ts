import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client'

import { atualizarStatusUseCase } from '@application/use-cases/chamado/atualizar-status.use-case'
import { ChamadoError } from '@application/use-cases/chamado/errors'
import { prisma } from '@infrastructure/database/prisma/client'
import { logger } from '@shared/config/logger'
import { salvarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository'
import { verificarExpedienteTecnico } from '@application/use-cases/chamado/helpers/expediente.helper'
import { encerrarFilhosRecursivo } from '@application/use-cases/chamado/helpers/filhos.helper'
import { publicarChamadoAtribuido } from '@infrastructure/messaging/kafka/producers/notificacao.producer'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    chamado:      { findUnique: vi.fn(), update: vi.fn() },
    usuario:      { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@shared/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  salvarHistoricoChamado: vi.fn(),
}))

vi.mock('@application/use-cases/chamado/helpers/expediente.helper', () => ({
  verificarExpedienteTecnico: vi.fn(),
}))

vi.mock('@application/use-cases/chamado/helpers/filhos.helper', () => ({
  encerrarFilhosRecursivo: vi.fn(),
}))

vi.mock('@infrastructure/messaging/kafka/producers/notificacao.producer', () => ({
  publicarChamadoAtribuido: vi.fn(),
}))

vi.mock('@application/use-cases/chamado/selects', () => ({ CHAMADO_INCLUDE: {} }))

vi.mock('@application/use-cases/chamado/formatters', () => ({
  formatarChamadoResposta: vi.fn((c) => c),
}))

const DATA_FIXA = new Date('2024-06-15T10:00:00.000Z')

const makeInput = (overrides = {}): Parameters<typeof atualizarStatusUseCase>[0] => ({
  id: 'chamado-id-123',
  status: ChamadoStatus.ENCERRADO,
  descricaoEncerramento: 'Chamado resolvido com sucesso.',
  usuarioId: 'admin-id-123',
  usuarioNome: 'Diego Admin',
  usuarioEmail: 'diego@email.com',
  usuarioRegra: 'ADMIN',
  ...overrides,
})

const makeChamado = (overrides = {}) => ({
  id: 'chamado-id-123',
  OS: 'INC0000001',
  status: ChamadoStatus.ABERTO,
  prioridade: PrioridadeChamado.P3,
  descricao: 'Problema reportado pelo usuário',
  tecnicoId: null,
  usuario: { nome: 'João', sobrenome: 'Silva' },
  ...overrides,
})

const makeChamadoAtualizado = (overrides = {}) => ({
  ...makeChamado(),
  atualizadoEm: DATA_FIXA,
  ...overrides,
})

const makeTecnico = (overrides = {}) => ({
  id: 'tec-id-123',
  email: 'tec@empresa.com',
  nome: 'Carlos',
  sobrenome: 'Lima',
  nivel: NivelTecnico.N2,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(DATA_FIXA)

  vi.mocked(prisma.chamado.findUnique).mockResolvedValue(makeChamado() as any)
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    fn({
      chamado: {
        update: vi.fn().mockResolvedValue(makeChamadoAtualizado()),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    })
  )
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeTecnico() as any)
  vi.mocked(verificarExpedienteTecnico).mockResolvedValue(true)
  vi.mocked(salvarHistoricoChamado).mockResolvedValue(undefined as any)
  vi.mocked(publicarChamadoAtribuido).mockResolvedValue(undefined as any)
  vi.mocked(encerrarFilhosRecursivo).mockResolvedValue(undefined as any)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('atualizarStatusUseCase', () => {
  describe('validação do status', () => {
    it('deve lançar ChamadoError para status inválido', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ status: 'INVALIDO' as any }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code INVALID_STATUS para status não permitido', async () => {
      const error = await atualizarStatusUseCase(makeInput({ status: 'ABERTO' as any })).catch(e => e)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar ChamadoError com statusCode 400 para status inválido', async () => {
      const error = await atualizarStatusUseCase(makeInput({ status: 'REABERTO' as any })).catch(e => e)
      expect(error.statusCode).toBe(400)
    })

    it('deve aceitar status EM_ATENDIMENTO', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO }))
      ).resolves.toBeDefined()
    })

    it('deve aceitar status ENCERRADO', async () => {
      await expect(atualizarStatusUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve aceitar status CANCELADO', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ status: ChamadoStatus.CANCELADO, descricaoEncerramento: undefined }))
      ).resolves.toBeDefined()
    })
  })

  describe('verificação do chamado', () => {
    it('deve lançar ChamadoError quando chamado não encontrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      await expect(atualizarStatusUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code NOT_FOUND quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await atualizarStatusUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com statusCode 404 quando chamado não existir', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await atualizarStatusUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(404)
    })
  })

  describe('guards de estado do chamado', () => {
    it('deve lançar ChamadoError para chamado com status CANCELADO', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      await expect(atualizarStatusUseCase(makeInput())).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code INVALID_STATUS para chamado cancelado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.CANCELADO }) as any
      )

      const error = await atualizarStatusUseCase(makeInput()).catch(e => e)
      expect(error.code).toBe('INVALID_STATUS')
    })

    it('deve lançar ChamadoError quando TECNICO tenta alterar chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      await expect(
        atualizarStatusUseCase(makeInput({ usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN quando TECNICO tenta alterar chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      const error = await atualizarStatusUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)
      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 quando TECNICO tenta alterar chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      const error = await atualizarStatusUseCase(makeInput({ usuarioRegra: 'TECNICO' })).catch(e => e)
      expect(error.statusCode).toBe(403)
    })

    it('deve permitir ADMIN alterar chamado encerrado', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ENCERRADO }) as any
      )

      await expect(atualizarStatusUseCase(makeInput({ usuarioRegra: 'ADMIN' }))).resolves.toBeDefined()
    })
  })

  describe('guard: TECNICO não pode cancelar chamado', () => {
    it('deve lançar ChamadoError quando TECNICO tenta cancelar', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ status: ChamadoStatus.CANCELADO, usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN quando TECNICO tenta cancelar', async () => {
      const error = await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.CANCELADO, usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 quando TECNICO tenta cancelar', async () => {
      const error = await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.CANCELADO, usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.statusCode).toBe(403)
    })
  })

  describe('validação de descricaoEncerramento', () => {
    it('deve lançar ChamadoError quando descricaoEncerramento está ausente no encerramento', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ descricaoEncerramento: undefined }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError quando descricaoEncerramento está vazia', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ descricaoEncerramento: '' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError quando descricaoEncerramento tem menos de 10 caracteres', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ descricaoEncerramento: '123456789' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code VALIDATION_ERROR para descrição inválida', async () => {
      const error = await atualizarStatusUseCase(
        makeInput({ descricaoEncerramento: 'curta' })
      ).catch(e => e)

      expect(error.code).toBe('VALIDATION_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 400 para descrição inválida', async () => {
      const error = await atualizarStatusUseCase(
        makeInput({ descricaoEncerramento: 'curta' })
      ).catch(e => e)

      expect(error.statusCode).toBe(400)
    })

    it('deve aceitar descricaoEncerramento com exatamente 10 caracteres', async () => {
      await expect(
        atualizarStatusUseCase(makeInput({ descricaoEncerramento: '1234567890' }))
      ).resolves.toBeDefined()
    })

    it('deve gravar encerradoEm e descricaoEncerramento no update', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoAtualizado())
            }),
          },
        })
      )

      await atualizarStatusUseCase(makeInput({ descricaoEncerramento: 'Resolução detalhada aqui.' }))

      expect(dataGravada.encerradoEm).toEqual(DATA_FIXA)
      expect(dataGravada.descricaoEncerramento).toBe('Resolução detalhada aqui.')
    })
  })

  describe('validação de expediente e nível — TECNICO + EM_ATENDIMENTO', () => {
    it('deve verificar expediente quando TECNICO assume chamado', async () => {
      await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO', usuarioId: 'tec-1' })
      )

      expect(verificarExpedienteTecnico).toHaveBeenCalledWith('tec-1')
    })

    it('não deve verificar expediente quando usuarioRegra é ADMIN', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'ADMIN' }))

      expect(verificarExpedienteTecnico).not.toHaveBeenCalled()
    })

    it('deve lançar ChamadoError quando TECNICO está fora do expediente', async () => {
      vi.mocked(verificarExpedienteTecnico).mockResolvedValue(false)

      await expect(
        atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN quando TECNICO está fora do expediente', async () => {
      vi.mocked(verificarExpedienteTecnico).mockResolvedValue(false)

      const error = await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve lançar ChamadoError com statusCode 403 quando TECNICO está fora do expediente', async () => {
      vi.mocked(verificarExpedienteTecnico).mockResolvedValue(false)

      const error = await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.statusCode).toBe(403)
    })

    it('deve lançar ChamadoError quando TECNICO N1 tenta assumir chamado P1', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ prioridade: PrioridadeChamado.P1 }) as any
      )
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N1 } as any)

      await expect(
        atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO' }))
      ).rejects.toThrow(ChamadoError)
    })

    it('deve lançar ChamadoError com code FORBIDDEN para TECNICO com nível incompatível', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ prioridade: PrioridadeChamado.P1 }) as any
      )
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N2 } as any)

      const error = await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO' })
      ).catch(e => e)

      expect(error.code).toBe('FORBIDDEN')
    })

    it('deve permitir TECNICO N3 assumir chamado P1', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ prioridade: PrioridadeChamado.P1 }) as any
      )
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: NivelTecnico.N3 } as any)

      await expect(
        atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })

    it('deve permitir quando técnico não tem nível definido', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nivel: null } as any)

      await expect(
        atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO' }))
      ).resolves.toBeDefined()
    })

    it('deve atribuir tecnicoId no payload quando TECNICO assume chamado', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoAtualizado())
            }),
          },
        })
      )

      await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'TECNICO', usuarioId: 'tec-99' })
      )

      expect(dataGravada.tecnicoId).toBe('tec-99')
    })

    it('não deve atribuir tecnicoId para outros status', async () => {
      let dataGravada: any
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          chamado: {
            update: vi.fn().mockImplementation(({ data }) => {
              dataGravada = data
              return Promise.resolve(makeChamadoAtualizado())
            }),
          },
        })
      )

      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.CANCELADO }))

      expect(dataGravada.tecnicoId).toBeUndefined()
    })
  })

  describe('side effects assíncronos', () => {
    it('deve salvar histórico com tipo STATUS', async () => {
      await atualizarStatusUseCase(makeInput())

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'STATUS', autorId: 'admin-id-123', autorNome: 'Diego Admin' })
      )
    })

    it('deve salvar histórico com de/para corretos', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(
        makeChamado({ status: ChamadoStatus.ABERTO }) as any
      )

      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.ENCERRADO }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ de: ChamadoStatus.ABERTO, para: ChamadoStatus.ENCERRADO })
      )
    })

    it('deve usar atualizacaoDescricao customizada no histórico quando fornecida', async () => {
      await atualizarStatusUseCase(makeInput({ atualizacaoDescricao: 'Resolvido pela equipe de infra' }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: 'Resolvido pela equipe de infra' })
      )
    })

    it('deve usar descrição padrão no histórico para EM_ATENDIMENTO', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: 'Chamado assumido pelo técnico' })
      )
    })

    it('deve usar descrição padrão no histórico para ENCERRADO', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.ENCERRADO }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: 'Chamado encerrado' })
      )
    })

    it('deve usar descrição padrão no histórico para CANCELADO', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.CANCELADO }))

      expect(salvarHistoricoChamado).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: 'Chamado cancelado' })
      )
    })

    it('deve disparar encerrarFilhosRecursivo ao ENCERRAR chamado', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.ENCERRADO }))

      await vi.runAllTimersAsync()
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })

    it('deve disparar encerrarFilhosRecursivo ao CANCELAR chamado', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.CANCELADO }))

      await vi.runAllTimersAsync()
      expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    })

    it('não deve disparar encerrarFilhosRecursivo para EM_ATENDIMENTO', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO }))

      await vi.runAllTimersAsync()
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('deve publicar evento Kafka ao mover para EM_ATENDIMENTO', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'ADMIN' }))

      await vi.runAllTimersAsync()
      expect(publicarChamadoAtribuido).toHaveBeenCalledOnce()
    })

    it('deve publicar Kafka com payload contendo chamadoId e tecnico', async () => {
      await atualizarStatusUseCase(
        makeInput({ status: ChamadoStatus.EM_ATENDIMENTO, usuarioRegra: 'ADMIN', usuarioId: 'tec-1' })
      )

      await vi.runAllTimersAsync()
      expect(publicarChamadoAtribuido).toHaveBeenCalledWith(
        expect.objectContaining({
          chamadoId: 'chamado-id-123',
          tecnico:   expect.objectContaining({ id: 'tec-id-123' }),
        })
      )
    })

    it('não deve publicar Kafka para ENCERRADO', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.ENCERRADO }))

      await vi.runAllTimersAsync()
      expect(publicarChamadoAtribuido).not.toHaveBeenCalled()
    })

    it('não deve publicar Kafka para CANCELADO', async () => {
      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.CANCELADO }))

      await vi.runAllTimersAsync()
      expect(publicarChamadoAtribuido).not.toHaveBeenCalled()
    })

    it('deve continuar mesmo se salvarHistoricoChamado falhar', async () => {
      vi.mocked(salvarHistoricoChamado).mockRejectedValue(new Error('Mongo error'))

      await expect(atualizarStatusUseCase(makeInput())).resolves.toBeDefined()
    })

    it('deve logar erro quando encerrarFilhosRecursivo falhar', async () => {
      vi.mocked(prisma.$transaction)
        .mockResolvedValueOnce(makeChamadoAtualizado() as any)
        .mockRejectedValueOnce(new Error('TX error'))

      await atualizarStatusUseCase(makeInput({ status: ChamadoStatus.ENCERRADO }))
      await vi.runAllTimersAsync()

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        '[CHAMADO] Erro ao encerrar filhos'
      )
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar o chamado formatado', async () => {
      const result = await atualizarStatusUseCase(makeInput())

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('OS')
      expect(result).toHaveProperty('status')
    })

    it('deve logar sucesso com chamadoId, status e usuarioId', async () => {
      await atualizarStatusUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { chamadoId: 'chamado-id-123', status: ChamadoStatus.ENCERRADO, usuarioId: 'admin-id-123' },
        '[CHAMADO] Status atualizado'
      )
    })
  })

  describe('tratamento de erros', () => {
    it('deve relançar ChamadoError sem encapsular', async () => {
      vi.mocked(prisma.chamado.findUnique).mockResolvedValue(null)

      const error = await atualizarStatusUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('NOT_FOUND')
    })

    it('deve lançar ChamadoError com code STATUS_ERROR quando update falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      const error = await atualizarStatusUseCase(makeInput()).catch(e => e)

      expect(error).toBeInstanceOf(ChamadoError)
      expect(error.code).toBe('STATUS_ERROR')
    })

    it('deve lançar ChamadoError com statusCode 500 quando update falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      const error = await atualizarStatusUseCase(makeInput()).catch(e => e)
      expect(error.statusCode).toBe(500)
    })

    it('deve lançar ChamadoError com mensagem correta quando update falhar', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

      await expect(atualizarStatusUseCase(makeInput())).rejects.toThrow('Erro ao atualizar status do chamado')
    })

    it('deve incluir originalError quando update falhar com instância de Error', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      const error = await atualizarStatusUseCase(makeInput()).catch(e => e)
      expect(error.originalError).toBe(dbError)
    })

    it('deve logar erro com chamadoId quando update falhar', async () => {
      const dbError = new Error('Database error')
      vi.mocked(prisma.$transaction).mockRejectedValue(dbError)

      await atualizarStatusUseCase(makeInput()).catch(() => {})

      expect(logger.error).toHaveBeenCalledWith(
        { error: dbError, chamadoId: 'chamado-id-123' },
        '[CHAMADO] Erro ao atualizar status'
      )
    })
  })
})