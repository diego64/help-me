import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request } from 'express'

import { loginUseCase } from '../../../../application/auth/login.use-case'
import { prisma } from '../../../../infrastructure/database/prisma/client'
import { verifyPassword, precisaRehash, hashPassword } from '../../../../shared/config/password'
import { generateTokenPair } from '../../../../shared/config/jwt'
import { publishSenhaAlterada } from '../../../../infrastructure/messaging/kafka/events/usuario.events'

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    auditoriaAuth: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@shared/config/password', () => ({
  verifyPassword: vi.fn(),
  precisaRehash: vi.fn(),
  hashPassword: vi.fn(),
}))

vi.mock('@shared/config/jwt', () => ({
  generateTokenPair: vi.fn(),
}))

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@infrastructure/messaging/kafka/events/usuario.events', () => ({
  publishSenhaAlterada: vi.fn(),
}))

const makeRequest = (overrides = {}): Request =>
  ({
    headers: { 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    get: vi.fn().mockReturnValue('Mozilla/5.0'),
    ...overrides,
  } as unknown as Request)

const makeUsuario = (overrides = {}) => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed_password',
  regra: 'ADMIN',
  ativo: true,
  ...overrides,
})

const makeTokens = () => ({
  accessToken: 'access_token_mock',
  refreshToken: 'refresh_token_mock',
  expiresIn: '15m',
})

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(prisma.usuario.findUnique).mockResolvedValue(makeUsuario() as any)
  vi.mocked(prisma.usuario.findUniqueOrThrow).mockResolvedValue(makeUsuario() as any)
  vi.mocked(prisma.usuario.update).mockResolvedValue(makeUsuario() as any)
  vi.mocked(prisma.auditoriaAuth.create).mockResolvedValue({} as any)
  vi.mocked(verifyPassword).mockReturnValue(true)
  vi.mocked(precisaRehash).mockReturnValue(false)
  vi.mocked(generateTokenPair).mockReturnValue(makeTokens() as any)
})

describe('loginUseCase', () => {
  describe('validação de campos obrigatórios', () => {
    it('deve lançar BadRequestError quando email não for informado', async () => {
      await expect(
        loginUseCase({ email: '', password: 'senha123' }, makeRequest())
      ).rejects.toThrow('Email e senha são obrigatórios.')
    })

    it('deve lançar BadRequestError quando senha não for informada', async () => {
      await expect(
        loginUseCase({ email: 'diego@email.com', password: '' }, makeRequest())
      ).rejects.toThrow('Email e senha são obrigatórios.')
    })

    it('deve lançar BadRequestError quando ambos os campos estiverem vazios', async () => {
      await expect(
        loginUseCase({ email: '', password: '' }, makeRequest())
      ).rejects.toThrow('Email e senha são obrigatórios.')
    })
  })

  describe('validação de usuário', () => {
    it('deve lançar UnauthorizedError quando usuário não existir', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await expect(
        loginUseCase({ email: 'naoexiste@email.com', password: 'senha123' }, makeRequest())
      ).rejects.toThrow('Email ou senha inválidos.')
    })

    it('deve lançar UnauthorizedError quando usuário estiver inativo', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        makeUsuario({ ativo: false }) as any
      )

      await expect(
        loginUseCase({ email: 'diego@email.com', password: 'senha123' }, makeRequest())
      ).rejects.toThrow('Email ou senha inválidos.')
    })

    it('não deve revelar se o email existe ou não (mensagem genérica)', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      const error = await loginUseCase(
        { email: 'qualquer@email.com', password: 'qualquer' },
        makeRequest()
      ).catch(e => e)

      // Garante que a mensagem não expõe informação sobre existência do email
      expect(error.message).toBe('Email ou senha inválidos.')
      expect(error.message).not.toContain('não encontrado')
      expect(error.message).not.toContain('não existe')
    })
  })

  describe('verificação de senha', () => {
    it('deve lançar UnauthorizedError quando senha for incorreta', async () => {
      vi.mocked(verifyPassword).mockReturnValue(false)

      await expect(
        loginUseCase({ email: 'diego@email.com', password: 'senha_errada' }, makeRequest())
      ).rejects.toThrow('Email ou senha inválidos.')
    })

    it('deve autenticar com credenciais válidas', async () => {
      vi.mocked(verifyPassword).mockReturnValue(true)

      const result = await loginUseCase(
        { email: 'diego@email.com', password: 'senha_correta' },
        makeRequest()
      )

      expect(result.accessToken).toBe('access_token_mock')
      expect(result.refreshToken).toBe('refresh_token_mock')
    })
  })

  describe('rehash automático de senha', () => {
    it('não deve fazer rehash quando hash estiver atualizado', async () => {
      vi.mocked(precisaRehash).mockReturnValue(false)

      await loginUseCase({ email: 'diego@email.com', password: 'senha123' }, makeRequest())

      expect(hashPassword).not.toHaveBeenCalled()
      expect(publishSenhaAlterada).not.toHaveBeenCalled()
    })

    it('deve fazer rehash quando hash estiver desatualizado', async () => {
      vi.mocked(precisaRehash).mockReturnValue(true)
      vi.mocked(hashPassword).mockReturnValue('novo_hash')

      await loginUseCase({ email: 'diego@email.com', password: 'senha123' }, makeRequest())

      expect(hashPassword).toHaveBeenCalledWith('senha123')
      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { password: 'novo_hash' },
        })
      )
    })

    it('deve publicar evento Kafka após rehash', async () => {
      vi.mocked(precisaRehash).mockReturnValue(true)
      vi.mocked(hashPassword).mockReturnValue('novo_hash')

      await loginUseCase(
        { email: 'diego@email.com', password: 'senha123' },
        makeRequest(),
        'correlation-id-abc'
      )

      expect(publishSenhaAlterada).toHaveBeenCalledTimes(1)
    })
  })

  describe('retorno do login', () => {
    it('deve retornar tokens e dados do usuário no formato correto', async () => {
      const result = await loginUseCase(
        { email: 'diego@email.com', password: 'senha123' },
        makeRequest()
      )

      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(String),
        usuario: {
          id: expect.any(String),
          nome: expect.any(String),
          sobrenome: expect.any(String),
          email: expect.any(String),
          regra: expect.any(String),
        },
      })
    })

    it('não deve expor o hash da senha no retorno', async () => {
      const result = await loginUseCase(
        { email: 'diego@email.com', password: 'senha123' },
        makeRequest()
      )

      expect(result.usuario).not.toHaveProperty('password')
    })

    it('deve salvar o refreshToken no banco após login bem-sucedido', async () => {
      await loginUseCase({ email: 'diego@email.com', password: 'senha123' }, makeRequest())

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { refreshToken: 'refresh_token_mock' },
        })
      )
    })
  })

  describe('registro de auditoria', () => {
    it('deve registrar auditoria de LOGIN_SUCESSO após login válido', async () => {
      await loginUseCase({ email: 'diego@email.com', password: 'senha123' }, makeRequest())

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ evento: 'LOGIN_SUCESSO' }),
        })
      )
    })

    it('deve registrar auditoria de LOGIN_FALHA quando usuário não existe', async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)

      await loginUseCase(
        { email: 'inexistente@email.com', password: 'senha123' },
        makeRequest()
      ).catch(() => {})

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evento: 'LOGIN_FALHA',
            usuarioId: null,
          }),
        })
      )
    })

    it('deve registrar auditoria de LOGIN_FALHA quando senha for incorreta', async () => {
      vi.mocked(verifyPassword).mockReturnValue(false)

      await loginUseCase(
        { email: 'diego@email.com', password: 'senha_errada' },
        makeRequest()
      ).catch(() => {})

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evento: 'LOGIN_FALHA',
            usuarioId: 'usuario-id-123',
          }),
        })
      )
    })

    it('deve incluir correlationId na auditoria quando fornecido', async () => {
      await loginUseCase(
        { email: 'diego@email.com', password: 'senha123' },
        makeRequest(),
        'correlation-xyz'
      )

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { correlationId: 'correlation-xyz' },
          }),
        })
      )
    })
  })

  describe('extração de IP e User-Agent', () => {
    it('deve usar o IP do header x-forwarded-for quando disponível', async () => {
      const req = makeRequest({
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
      })

      await loginUseCase({ email: 'diego@email.com', password: 'senha123' }, req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ip: '192.168.1.100' }),
        })
      )
    })

    it('deve usar remoteAddress como fallback quando x-forwarded-for não existir', async () => {
      const req = makeRequest({
        headers: {},
        socket: { remoteAddress: '10.0.0.5' },
      })

      await loginUseCase({ email: 'diego@email.com', password: 'senha123' }, req)

      expect(prisma.auditoriaAuth.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ip: '10.0.0.5' }),
        })
      )
    })
  })
})