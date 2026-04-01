import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { atualizarUsuarioUseCase } from '../../../../application/usuario/atualizar-usuario.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { hashPassword, validarForcaSenha } from '../../../../shared/config/password'
import { logger } from '../../../../shared/config/logger'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../infrastructure/http/middlewares/error.middleware'
import {
  publishUsuarioAtualizado,
  publishSenhaAlterada,
} from '../../../../infrastructure/messaging/kafka/events/usuario.events'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/password', () => ({
  hashPassword: vi.fn(),
  validarForcaSenha: vi.fn(),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@infrastructure/messaging/kafka/events/usuario.events', () => ({
  publishUsuarioAtualizado: vi.fn(),
  publishSenhaAlterada: vi.fn(),
}))

const makeInput = (overrides = {}): Parameters<typeof atualizarUsuarioUseCase>[0] => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  ...overrides,
})

const makeUsuarioExistente = (overrides = {}): Usuario => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN' as Regra,
  ativo: true,
  refreshToken: null,
  deletadoEm: null,
  geradoEm: new Date(),
  atualizadoEm: new Date(),
  ...overrides,
} as unknown as Usuario)

const makeUsuarioAtualizado = (overrides = {}) => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  regra: 'ADMIN' as Regra,
  ativo: true,
  atualizadoEm: new Date(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuarioExistente())
  vi.mocked(prisma.usuario.findUniqueOrThrow).mockResolvedValue(makeUsuarioExistente())
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuarioAtualizado() as any)
  vi.mocked(publishUsuarioAtualizado).mockResolvedValue(undefined as any)
  vi.mocked(publishSenhaAlterada).mockResolvedValue(undefined as any)
  vi.mocked(validarForcaSenha).mockReturnValue({ ehValida: true, pontuacao: 4, erros: [], sugestoes: [] })
  vi.mocked(hashPassword).mockReturnValue('nova_senha_hashed')
})

describe('atualizarUsuarioUseCase', () => {

  describe('verificação de existência do usuário', () => {
    it('deve buscar usuário pelo id ignorando deletados', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123', deletadoEm: null },
      })
    })

    it('deve lançar NotFoundError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarUsuarioUseCase(makeInput())).rejects.toThrow(NotFoundError)
    })

    it('deve lançar NotFoundError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(atualizarUsuarioUseCase(makeInput())).rejects.toThrow('Usuário não encontrado.')
    })
  })

  describe('validação de email', () => {
    it('não deve validar email quando não fornecido', async () => {
      const input = makeInput({ email: undefined })

      await atualizarUsuarioUseCase(input)

      // findUnique só deve ser chamado para buscar o usuário existente, não para checar email
      expect(prisma.usuario.findUnique).toHaveBeenCalledTimes(1)
    })

    it('não deve validar email quando igual ao atual', async () => {
      const input = makeInput({ email: 'diego@email.com' })

      await atualizarUsuarioUseCase(input)

      expect(prisma.usuario.findUnique).toHaveBeenCalledTimes(1)
    })

    it('deve lançar BadRequestError para email com formato inválido', async () => {
      const input = makeInput({ email: 'email-invalido' })

      await expect(atualizarUsuarioUseCase(input)).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError com mensagem correta para email inválido', async () => {
      const input = makeInput({ email: 'email-invalido' })

      await expect(atualizarUsuarioUseCase(input)).rejects.toThrow('Email inválido.')
    })

    it('deve verificar unicidade quando email novo é válido', async () => {
      const input = makeInput({ email: 'novo@email.com' })
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeUsuarioExistente())
        .mockResolvedValueOnce(null)

      await atualizarUsuarioUseCase(input)

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({ where: { email: 'novo@email.com' } })
    })

    it('deve lançar ConflictError quando email já estiver em uso por outro usuário', async () => {
      const input = makeInput({ email: 'novo@email.com' })
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeUsuarioExistente())
        .mockResolvedValueOnce(makeUsuarioExistente({ id: 'outro-usuario-id' }))

      await expect(atualizarUsuarioUseCase(input)).rejects.toThrow(ConflictError)
    })

    it('deve lançar ConflictError com mensagem correta', async () => {
      const input = makeInput({ email: 'novo@email.com' })
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeUsuarioExistente())
        .mockResolvedValueOnce(makeUsuarioExistente({ id: 'outro-usuario-id' }))

      await expect(atualizarUsuarioUseCase(input)).rejects.toThrow('Email já cadastrado.')
    })

    it('não deve lançar erro quando email já está em uso pelo próprio usuário', async () => {
      const input = makeInput({ email: 'novo@email.com' })
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeUsuarioExistente())
        .mockResolvedValueOnce(makeUsuarioExistente({ email: 'novo@email.com' })) // mesmo id

      await expect(atualizarUsuarioUseCase(input)).resolves.toBeDefined()
    })
  })

  describe('validação e hash de senha', () => {
    it('não deve processar senha quando não fornecida', async () => {
      await atualizarUsuarioUseCase(makeInput({ password: undefined }))

      expect(validarForcaSenha).not.toHaveBeenCalled()
      expect(hashPassword).not.toHaveBeenCalled()
    })

    it('deve validar força da senha quando fornecida', async () => {
      await atualizarUsuarioUseCase(makeInput({ password: 'Senha@123' }))

      expect(validarForcaSenha).toHaveBeenCalledWith('Senha@123')
    })

    it('deve lançar ValidationError quando senha não atender requisitos', async () => {
      vi.mocked(validarForcaSenha).mockReturnValue({
        ehValida: false,
        pontuacao: 0,
        erros: ['Senha muito curta'],
        sugestoes: ['Use pelo menos 8 caracteres'],
      })

      await expect(
        atualizarUsuarioUseCase(makeInput({ password: '123' }))
      ).rejects.toThrow(ValidationError)
    })

    it('deve lançar ValidationError com mensagem correta', async () => {
      vi.mocked(validarForcaSenha).mockReturnValue({
        ehValida: false,
        pontuacao: 0,
        erros: ['Senha muito curta'],
        sugestoes: [],
      })

      await expect(
        atualizarUsuarioUseCase(makeInput({ password: '123' }))
      ).rejects.toThrow('Senha não atende aos requisitos de segurança.')
    })

    it('deve hashear a senha válida antes de salvar', async () => {
      await atualizarUsuarioUseCase(makeInput({ password: 'Senha@123' }))

      expect(hashPassword).toHaveBeenCalledWith('Senha@123')
    })

    it('deve incluir senha hasheada no update', async () => {
      vi.mocked(hashPassword).mockReturnValue('hash_gerado')

      await atualizarUsuarioUseCase(makeInput({ password: 'Senha@123' }))

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: 'hash_gerado' }),
        })
      )
    })
  })

  describe('atualização dos campos', () => {
    it('deve atualizar apenas os campos fornecidos', async () => {
      await atualizarUsuarioUseCase({ id: 'usuario-id-123', nome: 'NovoNome' })

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nome: 'NovoNome' },
        })
      )
    })

    it('deve chamar update com where correto', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'usuario-id-123' } })
      )
    })

    it('deve selecionar apenas os campos do output', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nome: true,
            sobrenome: true,
            email: true,
            regra: true,
            ativo: true,
            atualizadoEm: true,
          },
        })
      )
    })

    it('deve incluir todos os campos fornecidos no update', async () => {
      const input = makeInput({
        nome: 'NovoNome',
        sobrenome: 'NovoSobrenome',
        email: 'novo@email.com',
        regra: 'TECNICO' as Regra,
        ativo: false,
      })

      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(makeUsuarioExistente())
        .mockResolvedValueOnce(null)

      await atualizarUsuarioUseCase(input)

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nome: 'NovoNome',
            sobrenome: 'NovoSobrenome',
            email: 'novo@email.com',
            regra: 'TECNICO',
            ativo: false,
          }),
        })
      )
    })

    it('não deve incluir campos undefined no update', async () => {
      await atualizarUsuarioUseCase({ id: 'usuario-id-123' })

      const chamada = vi.mocked(prisma.usuario.update).mock.calls[0][0]
      expect(chamada.data).toEqual({})
    })
  })

  describe('publicação de eventos Kafka', () => {
    it('deve buscar usuário completo antes de publicar eventos', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(prisma.usuario.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'usuario-id-123' },
      })
    })

    it('deve publicar evento usuarioAtualizado sempre', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(publishUsuarioAtualizado).toHaveBeenCalled()
    })

    it('deve publicar usuarioAtualizado com correlationId quando fornecido', async () => {
      const usuarioCompleto = makeUsuarioExistente()
      vi.mocked(prisma.usuario.findUniqueOrThrow).mockResolvedValue(usuarioCompleto)

      await atualizarUsuarioUseCase(makeInput(), 'correlation-xyz')

      expect(publishUsuarioAtualizado).toHaveBeenCalledWith(usuarioCompleto, 'correlation-xyz')
    })

    it('não deve publicar senhaAlterada quando senha não for atualizada', async () => {
      await atualizarUsuarioUseCase(makeInput({ password: undefined }))

      expect(publishSenhaAlterada).not.toHaveBeenCalled()
    })

    it('deve publicar senhaAlterada quando senha for atualizada', async () => {
      await atualizarUsuarioUseCase(makeInput({ password: 'Senha@123' }))

      expect(publishSenhaAlterada).toHaveBeenCalled()
    })

    it('deve publicar senhaAlterada com correlationId quando fornecido', async () => {
      const usuarioCompleto = makeUsuarioExistente()
      vi.mocked(prisma.usuario.findUniqueOrThrow).mockResolvedValue(usuarioCompleto)

      await atualizarUsuarioUseCase(makeInput({ password: 'Senha@123' }), 'correlation-abc')

      expect(publishSenhaAlterada).toHaveBeenCalledWith(usuarioCompleto, 'correlation-abc')
    })
  })

  describe('retorno e logging', () => {
    it('deve retornar os dados do usuário atualizado', async () => {
      const atualizado = makeUsuarioAtualizado({ nome: 'Novo Nome' })
      vi.mocked(prisma.usuario.update).mockResolvedValue(atualizado as any)

      const result = await atualizarUsuarioUseCase(makeInput())

      expect(result).toEqual(atualizado)
    })

    it('deve logar sucesso após atualização', async () => {
      await atualizarUsuarioUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'usuario-id-123' },
        '[USUARIO] Usuário atualizado com sucesso'
      )
    })
  })

  describe('fluxo completo', () => {
    it('deve executar etapas na ordem correta sem alteração de senha', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find_existente')
        return makeUsuarioExistente()
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('update')
        return makeUsuarioAtualizado()
      }) as any)

      vi.mocked(prisma.usuario.findUniqueOrThrow).mockImplementation((async () => {
        ordem.push('find_completo')
        return makeUsuarioExistente()
      }) as any)

      vi.mocked(publishUsuarioAtualizado).mockImplementation(async () => {
        ordem.push('publish_atualizado')
      })

      await atualizarUsuarioUseCase(makeInput())

      expect(ordem).toEqual([
        'find_existente',
        'update',
        'find_completo',
        'publish_atualizado',
      ])
    })

    it('deve executar etapas na ordem correta com alteração de senha', async () => {
      const ordem: string[] = []

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find_existente')
        return makeUsuarioExistente()
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('update')
        return makeUsuarioAtualizado()
      }) as any)

      vi.mocked(prisma.usuario.findUniqueOrThrow).mockImplementation((async () => {
        ordem.push('find_completo')
        return makeUsuarioExistente()
      }) as any)

      vi.mocked(publishUsuarioAtualizado).mockImplementation(async () => {
        ordem.push('publish_atualizado')
      })

      vi.mocked(publishSenhaAlterada).mockImplementation(async () => {
        ordem.push('publish_senha_alterada')
      })

      await atualizarUsuarioUseCase(makeInput({ password: 'Senha@123' }))

      expect(ordem).toEqual([
        'find_existente',
        'update',
        'find_completo',
        'publish_atualizado',
        'publish_senha_alterada',
      ])
    })
  })
})