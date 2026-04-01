import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Usuario, Regra } from '@prisma/client'

import { criarUsuarioUseCase } from '../../../../application/usuario/criar-usuario.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { hashPassword, validarForcaSenha } from '../../../../shared/config/password'
import { logger } from '../../../../shared/config/logger'
import {
  BadRequestError,
  ConflictError,
  ValidationError,
} from '../../../../infrastructure/http/middlewares/error.middleware'
import { publishUsuarioCriado } from '../../../../infrastructure/messaging/kafka/events/usuario.events'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      create: vi.fn(),
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
  publishUsuarioCriado: vi.fn(),
}))

const makeInput = (overrides = {}): Parameters<typeof criarUsuarioUseCase>[0] => ({
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'Senha@123',
  regra: 'ADMIN' as Regra,
  ...overrides,
})

const makeUsuario = (overrides = {}): Usuario => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN' as Regra,
  ativo: true,
  refreshToken: null,
  deletadoEm: null,
  geradoEm: new Date('2024-01-01'),
  atualizadoEm: new Date('2024-01-01'),
  ...overrides,
} as unknown as Usuario)

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.usuario.create).mockResolvedValue(makeUsuario())
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario())
  vi.mocked(publishUsuarioCriado).mockResolvedValue(undefined as any)
  vi.mocked(validarForcaSenha).mockReturnValue({ ehValida: true, pontuacao: 4, erros: [], sugestoes: [] })
  vi.mocked(hashPassword).mockReturnValue('hashed_password')
})

describe('criarUsuarioUseCase', () => {

  describe('validação de campos obrigatórios', () => {
    it('deve lançar BadRequestError quando nome não fornecido', async () => {
      await expect(criarUsuarioUseCase(makeInput({ nome: '' }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError quando sobrenome não fornecido', async () => {
      await expect(criarUsuarioUseCase(makeInput({ sobrenome: '' }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError quando email não fornecido', async () => {
      await expect(criarUsuarioUseCase(makeInput({ email: '' }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError quando password não fornecido', async () => {
      await expect(criarUsuarioUseCase(makeInput({ password: '' }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError quando regra não fornecida', async () => {
      await expect(criarUsuarioUseCase(makeInput({ regra: '' as Regra }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError com mensagem correta', async () => {
      await expect(criarUsuarioUseCase(makeInput({ nome: '' }))).rejects.toThrow(
        'Campos obrigatórios: nome, sobrenome, email, password, regra.'
      )
    })
  })

  describe('validação de formato do email', () => {
    it('deve lançar BadRequestError para email sem @', async () => {
      await expect(criarUsuarioUseCase(makeInput({ email: 'emailinvalido' }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError para email sem domínio', async () => {
      await expect(criarUsuarioUseCase(makeInput({ email: 'email@' }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError para email com espaço', async () => {
      await expect(criarUsuarioUseCase(makeInput({ email: 'email @email.com' }))).rejects.toThrow(BadRequestError)
    })

    it('deve lançar BadRequestError com mensagem correta para email inválido', async () => {
      await expect(criarUsuarioUseCase(makeInput({ email: 'invalido' }))).rejects.toThrow('Email inválido.')
    })

    it('deve aceitar email válido', async () => {
      await expect(criarUsuarioUseCase(makeInput({ email: 'diego@email.com' }))).resolves.toBeDefined()
    })
  })

  describe('validação de força da senha', () => {
    it('deve validar força da senha', async () => {
      await criarUsuarioUseCase(makeInput())

      expect(validarForcaSenha).toHaveBeenCalledWith('Senha@123')
    })

    it('deve lançar ValidationError quando senha não atender requisitos', async () => {
      vi.mocked(validarForcaSenha).mockReturnValue({
        ehValida: false,
        pontuacao: 0,
        erros: ['Senha muito curta'],
        sugestoes: ['Use pelo menos 8 caracteres'],
      })

      await expect(criarUsuarioUseCase(makeInput({ password: '123' }))).rejects.toThrow(ValidationError)
    })

    it('deve lançar ValidationError com mensagem correta', async () => {
      vi.mocked(validarForcaSenha).mockReturnValue({
        ehValida: false,
        pontuacao: 0,
        erros: ['Senha muito curta'],
        sugestoes: [],
      })

      await expect(criarUsuarioUseCase(makeInput({ password: '123' }))).rejects.toThrow(
        'Senha não atende aos requisitos de segurança.'
      )
    })
  })

  describe('verificação de duplicidade de email', () => {
    it('deve verificar se email já está cadastrado', async () => {
      await criarUsuarioUseCase(makeInput())

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'diego@email.com' },
      })
    })

    it('deve lançar ConflictError quando email já cadastrado e ativo', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario())

      await expect(criarUsuarioUseCase(makeInput())).rejects.toThrow(ConflictError)
    })

    it('deve lançar ConflictError com mensagem correta', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario())

      await expect(criarUsuarioUseCase(makeInput())).rejects.toThrow('Email já cadastrado.')
    })
  })

  describe('criação de novo usuário', () => {
    it('deve hashear a senha antes de salvar', async () => {
      await criarUsuarioUseCase(makeInput())

      expect(hashPassword).toHaveBeenCalledWith('Senha@123')
    })

    it('deve criar usuário com senha hasheada', async () => {
      vi.mocked(hashPassword).mockReturnValue('hash_gerado')

      await criarUsuarioUseCase(makeInput())

      expect(prisma.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: 'hash_gerado' }),
        })
      )
    })

    it('deve criar usuário com os dados corretos', async () => {
      await criarUsuarioUseCase(makeInput())

      expect(prisma.usuario.create).toHaveBeenCalledWith({
        data: {
          nome: 'Diego',
          sobrenome: 'Dev',
          email: 'diego@email.com',
          password: 'hashed_password',
          regra: 'ADMIN',
        },
      })
    })

    it('deve publicar evento usuarioCriado após criação', async () => {
      const usuario = makeUsuario()
      vi.mocked(prisma.usuario.create).mockResolvedValue(usuario)

      await criarUsuarioUseCase(makeInput())

      expect(publishUsuarioCriado).toHaveBeenCalledWith(usuario, undefined)
    })

    it('deve publicar evento com correlationId quando fornecido', async () => {
      const usuario = makeUsuario()
      vi.mocked(prisma.usuario.create).mockResolvedValue(usuario)

      await criarUsuarioUseCase(makeInput(), 'correlation-xyz')

      expect(publishUsuarioCriado).toHaveBeenCalledWith(usuario, 'correlation-xyz')
    })

    it('deve logar sucesso após criação', async () => {
      await criarUsuarioUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'usuario-id-123', email: 'diego@email.com', regra: 'ADMIN' },
        '[USUARIO] Usuário criado com sucesso'
      )
    })

    it('deve retornar os dados do usuário criado sem password e refreshToken', async () => {
      const result = await criarUsuarioUseCase(makeInput())

      expect(result).toEqual({
        id: 'usuario-id-123',
        nome: 'Diego',
        sobrenome: 'Dev',
        email: 'diego@email.com',
        regra: 'ADMIN',
        ativo: true,
        geradoEm: new Date('2024-01-01'),
      })

      expect(result).not.toHaveProperty('password')
      expect(result).not.toHaveProperty('refreshToken')
    })
  })

  describe('reativação de usuário soft deleted', () => {
    it('deve reativar usuário quando email já existia com soft delete', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: new Date('2024-01-01') })
      )

      await criarUsuarioUseCase(makeInput())

      expect(prisma.usuario.update).toHaveBeenCalled()
    })

    it('deve reativar com os dados corretos', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: new Date('2024-01-01') })
      )
      vi.mocked(hashPassword).mockReturnValue('hash_reativacao')

      await criarUsuarioUseCase(makeInput())

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { email: 'diego@email.com' },
        data: {
          nome: 'Diego',
          sobrenome: 'Dev',
          password: 'hash_reativacao',
          regra: 'ADMIN',
          ativo: true,
          deletadoEm: null,
          refreshToken: null,
        },
      })
    })

    it('não deve chamar create quando usuário for reativado', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: new Date('2024-01-01') })
      )

      await criarUsuarioUseCase(makeInput())

      expect(prisma.usuario.create).not.toHaveBeenCalled()
    })

    it('deve publicar evento usuarioCriado após reativação', async () => {
      const usuarioReativado = makeUsuario({ deletadoEm: new Date('2024-01-01') })
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(usuarioReativado)
      vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario())

      await criarUsuarioUseCase(makeInput())

      expect(publishUsuarioCriado).toHaveBeenCalled()
    })

    it('deve publicar evento com correlationId na reativação', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: new Date('2024-01-01') })
      )
      const reativado = makeUsuario()
      vi.mocked(prisma.usuario.update).mockResolvedValue(reativado)

      await criarUsuarioUseCase(makeInput(), 'correlation-abc')

      expect(publishUsuarioCriado).toHaveBeenCalledWith(reativado, 'correlation-abc')
    })

    it('deve logar reativação com userId e email', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: new Date('2024-01-01') })
      )

      await criarUsuarioUseCase(makeInput())

      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'usuario-id-123', email: 'diego@email.com' },
        '[USUARIO] Usuário reativado'
      )
    })

    it('deve retornar dados do usuário reativado sem password e refreshToken', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ deletadoEm: new Date('2024-01-01') })
      )
      vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario())

      const result = await criarUsuarioUseCase(makeInput())

      expect(result).toEqual({
        id: 'usuario-id-123',
        nome: 'Diego',
        sobrenome: 'Dev',
        email: 'diego@email.com',
        regra: 'ADMIN',
        ativo: true,
        geradoEm: new Date('2024-01-01'),
      })

      expect(result).not.toHaveProperty('password')
      expect(result).not.toHaveProperty('refreshToken')
    })
  })

  describe('fluxo completo — criação', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(validarForcaSenha).mockImplementation(() => {
        ordem.push('validar_senha')
        return { ehValida: true, pontuacao: 4, erros: [], sugestoes: [] }
      })

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find_email')
        return null
      }) as any)

      vi.mocked(prisma.usuario.create).mockImplementation((async () => {
        ordem.push('create')
        return makeUsuario()
      }) as any)

      vi.mocked(publishUsuarioCriado).mockImplementation(async () => {
        ordem.push('publish')
      })

      await criarUsuarioUseCase(makeInput())

      expect(ordem).toEqual(['validar_senha', 'find_email', 'create', 'publish'])
    })
  })

  describe('fluxo completo — reativação', () => {
    it('deve executar etapas na ordem correta', async () => {
      const ordem: string[] = []

      vi.mocked(validarForcaSenha).mockImplementation(() => {
        ordem.push('validar_senha')
        return { ehValida: true, pontuacao: 4, erros: [], sugestoes: [] }
      })

      vi.mocked(prisma.usuario.findUnique).mockImplementation((async () => {
        ordem.push('find_email')
        return makeUsuario({ deletadoEm: new Date('2024-01-01') })
      }) as any)

      vi.mocked(prisma.usuario.update).mockImplementation((async () => {
        ordem.push('update')
        return makeUsuario()
      }) as any)

      vi.mocked(publishUsuarioCriado).mockImplementation(async () => {
        ordem.push('publish')
      })

      await criarUsuarioUseCase(makeInput())

      expect(ordem).toEqual(['validar_senha', 'find_email', 'update', 'publish'])
    })
  })
})