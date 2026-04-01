import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request } from 'express'
import jwt from 'jsonwebtoken'
import type { Usuario, Regra } from '@prisma/client'

import {
  generateToken,
  generateTokenPair,
  verifyToken,
  decodeToken,
  isTokenExpired,
  extractTokenFromHeader,
  generateFingerprint,
  generateJti,
  validateSecrets,
  shouldRotateRefreshToken,
  securityUtils,
  type TokenPayload,
} from '../../../../shared/config/jwt'

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const makeUsuario = (overrides = {}): Usuario => ({
  id: 'usuario-id-123',
  nome: 'Diego',
  sobrenome: 'Dev',
  email: 'diego@email.com',
  password: 'hashed',
  regra: 'ADMIN' as Regra,
  ativo: true,
  refreshToken: null,
  deletadoEm: null,
  geradoEm: new Date(),
  atualizadoEm: new Date(),
  ...overrides,
} as unknown as Usuario)

const makeReq = (overrides = {}): Request => ({
  headers: { 'x-forwarded-for': '192.168.1.1' },
  socket: { remoteAddress: '127.0.0.1' },
  get: vi.fn().mockReturnValue('Mozilla/5.0'),
  ...overrides,
} as unknown as Request)

const JWT_SECRET = 'super-secret-key-for-testing-minimum-32-chars!!'
const JWT_REFRESH_SECRET = 'another-secret-key-refresh-minimum-32-chars!!'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.JWT_SECRET = JWT_SECRET
  process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET
  process.env.JWT_EXPIRES_IN = '15m'
  process.env.JWT_REFRESH_EXPIRES_IN = '7d'
})

afterEach(() => {
  delete process.env.JWT_SECRET
  delete process.env.JWT_REFRESH_SECRET
  delete process.env.JWT_EXPIRES_IN
  delete process.env.JWT_REFRESH_EXPIRES_IN
})

describe('jwt', () => {
  describe('validateSecrets', () => {
    it('deve passar quando secrets são válidos e diferentes', () => {
      expect(() => validateSecrets()).not.toThrow()
    })

    it('deve lançar erro quando JWT_SECRET não definido', () => {
      delete process.env.JWT_SECRET
      expect(() => validateSecrets()).toThrow('JWT_SECRET deve estar definido')
    })

    it('deve lançar erro quando JWT_SECRET menor que 32 caracteres', () => {
      process.env.JWT_SECRET = 'curto'
      expect(() => validateSecrets()).toThrow('JWT_SECRET deve estar definido e conter pelo menos 32 caracteres')
    })

    it('deve lançar erro quando JWT_REFRESH_SECRET não definido', () => {
      delete process.env.JWT_REFRESH_SECRET
      expect(() => validateSecrets()).toThrow('JWT_REFRESH_SECRET deve estar definido')
    })

    it('deve lançar erro quando JWT_REFRESH_SECRET menor que 32 caracteres', () => {
      process.env.JWT_REFRESH_SECRET = 'curto'
      expect(() => validateSecrets()).toThrow('JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres')
    })

    it('deve lançar erro quando JWT_SECRET e JWT_REFRESH_SECRET são iguais', () => {
      process.env.JWT_SECRET = JWT_SECRET
      process.env.JWT_REFRESH_SECRET = JWT_SECRET
      expect(() => validateSecrets()).toThrow('JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes')
    })
  })

  describe('generateJti', () => {
    it('deve gerar string hexadecimal de 32 caracteres', () => {
      const jti = generateJti()
      expect(jti).toMatch(/^[0-9a-f]{32}$/)
    })

    it('deve gerar JTIs únicos a cada chamada', () => {
      const jti1 = generateJti()
      const jti2 = generateJti()
      expect(jti1).not.toBe(jti2)
    })
  })

  describe('generateFingerprint', () => {
    it('deve gerar string hexadecimal de 16 caracteres', () => {
      const fp = generateFingerprint(makeReq())
      expect(fp).toMatch(/^[0-9a-f]{16}$/)
    })

    it('deve gerar fingerprint diferente para user-agents diferentes', () => {
      const req1 = makeReq({ get: vi.fn().mockReturnValue('Chrome/100') })
      const req2 = makeReq({ get: vi.fn().mockReturnValue('Firefox/100') })
      expect(generateFingerprint(req1)).not.toBe(generateFingerprint(req2))
    })

    it('deve gerar fingerprint diferente para IPs diferentes', () => {
      const req1 = makeReq({ headers: { 'x-forwarded-for': '1.1.1.1' } })
      const req2 = makeReq({ headers: { 'x-forwarded-for': '2.2.2.2' } })
      expect(generateFingerprint(req1)).not.toBe(generateFingerprint(req2))
    })

    it('deve gerar fingerprint igual para mesma combinação user-agent + IP', () => {
      const req = makeReq()
      expect(generateFingerprint(req)).toBe(generateFingerprint(req))
    })

    it('deve usar x-forwarded-for como IP prioritário', () => {
      const req1 = makeReq({ headers: { 'x-forwarded-for': '10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } })
      const req2 = makeReq({ headers: { 'x-forwarded-for': '10.0.0.2' }, socket: { remoteAddress: '127.0.0.1' } })
      expect(generateFingerprint(req1)).not.toBe(generateFingerprint(req2))
    })

    it('deve usar remoteAddress como fallback quando sem headers', () => {
      const req = makeReq({ headers: {}, socket: { remoteAddress: '192.168.1.1' } })
      const fp = generateFingerprint(req)
      expect(fp).toHaveLength(16)
    })
  })

  describe('generateToken', () => {
    it('deve gerar token JWT válido para access', () => {
      const token = generateToken(makeUsuario(), 'access')
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('deve gerar token JWT válido para refresh', () => {
      const token = generateToken(makeUsuario(), 'refresh')
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('deve incluir id do usuário no payload', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.id).toBe('usuario-id-123')
    })

    it('deve incluir email no payload', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.email).toBe('diego@email.com')
    })

    it('deve incluir regra no payload', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.regra).toBe('ADMIN')
    })

    it('deve incluir type correto no payload', () => {
      const accessToken = generateToken(makeUsuario(), 'access')
      const refreshToken = generateToken(makeUsuario(), 'refresh')
      expect((jwt.decode(accessToken) as TokenPayload).type).toBe('access')
      expect((jwt.decode(refreshToken) as TokenPayload).type).toBe('refresh')
    })

    it('deve incluir jti no payload', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.jti).toBeDefined()
      expect(typeof decoded.jti).toBe('string')
    })

    it('deve incluir fingerprint no access token quando req fornecido', () => {
      const token = generateToken(makeUsuario(), 'access', makeReq())
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.fingerprint).toBeDefined()
      expect(decoded.fingerprint).toHaveLength(16)
    })

    it('não deve incluir fingerprint no access token sem req', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.fingerprint).toBeUndefined()
    })

    it('não deve incluir fingerprint no refresh token mesmo com req', () => {
      const token = generateToken(makeUsuario(), 'refresh', makeReq())
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.fingerprint).toBeUndefined()
    })

    it('deve usar HS256 como algoritmo', () => {
      const token = generateToken(makeUsuario(), 'access')
      const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64').toString())
      expect(header.alg).toBe('HS256')
    })

    it('deve usar issuer helpme-api', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.iss).toBe('helpme-api')
    })

    it('deve usar audience helpme-client', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = jwt.decode(token) as TokenPayload
      expect(decoded.aud).toBe('helpme-client')
    })

    it('deve usar JWT_SECRET para access token', () => {
      const token = generateToken(makeUsuario(), 'access')
      expect(() => jwt.verify(token, JWT_SECRET)).not.toThrow()
    })

    it('deve usar JWT_REFRESH_SECRET para refresh token', () => {
      const token = generateToken(makeUsuario(), 'refresh')
      expect(() => jwt.verify(token, JWT_REFRESH_SECRET)).not.toThrow()
    })

    it('deve gerar JTIs únicos para tokens diferentes', () => {
      const token1 = generateToken(makeUsuario(), 'access')
      const token2 = generateToken(makeUsuario(), 'access')
      const jti1 = (jwt.decode(token1) as TokenPayload).jti
      const jti2 = (jwt.decode(token2) as TokenPayload).jti
      expect(jti1).not.toBe(jti2)
    })

    it('deve lançar erro quando payload for muito grande', () => {
      const usuario = makeUsuario({ email: 'a'.repeat(5000) + '@b.com' })
      expect(() => generateToken(usuario, 'access')).toThrow('Payload muito grande')
    })
  })

  describe('generateTokenPair', () => {
    it('deve retornar accessToken e refreshToken', () => {
      const pair = generateTokenPair(makeUsuario())
      expect(pair.accessToken).toBeDefined()
      expect(pair.refreshToken).toBeDefined()
    })

    it('deve retornar expiresIn', () => {
      const pair = generateTokenPair(makeUsuario())
      expect(pair.expiresIn).toBe('15m')
    })

    it('deve retornar expiresIn padrão quando env não definido', () => {
      delete process.env.JWT_EXPIRES_IN
      const pair = generateTokenPair(makeUsuario())
      expect(pair.expiresIn).toBe('15m')
    })

    it('deve gerar access token com type=access', () => {
      const { accessToken } = generateTokenPair(makeUsuario())
      expect((jwt.decode(accessToken) as TokenPayload).type).toBe('access')
    })

    it('deve gerar refresh token com type=refresh', () => {
      const { refreshToken } = generateTokenPair(makeUsuario())
      expect((jwt.decode(refreshToken) as TokenPayload).type).toBe('refresh')
    })

    it('deve incluir fingerprint no access token quando req fornecido', () => {
      const { accessToken } = generateTokenPair(makeUsuario(), makeReq())
      expect((jwt.decode(accessToken) as TokenPayload).fingerprint).toBeDefined()
    })
  })

  describe('verifyToken', () => {
    it('deve verificar access token válido', () => {
      const token = generateToken(makeUsuario(), 'access')
      expect(() => verifyToken(token, 'access')).not.toThrow()
    })

    it('deve verificar refresh token válido', () => {
      const token = generateToken(makeUsuario(), 'refresh')
      expect(() => verifyToken(token, 'refresh')).not.toThrow()
    })

    it('deve retornar payload completo', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = verifyToken(token, 'access')
      expect(decoded.id).toBe('usuario-id-123')
      expect(decoded.regra).toBe('ADMIN')
      expect(decoded.type).toBe('access')
    })

    it('deve lançar erro quando token expirado', () => {
      const token = jwt.sign(
        { id: 'u1', regra: 'ADMIN', type: 'access', jti: 'jti-test' },
        JWT_SECRET,
        { expiresIn: -1, algorithm: 'HS256', issuer: 'helpme-api', audience: 'helpme-client' }
      )
      expect(() => verifyToken(token, 'access')).toThrow('Token expirado.')
    })

    it('deve lançar erro quando assinatura inválida', () => {
      const token = jwt.sign(
        { id: 'u1', regra: 'ADMIN', type: 'access', jti: 'jti-test' },
        'wrong-secret',
        { algorithm: 'HS256', issuer: 'helpme-api', audience: 'helpme-client' }
      )
      expect(() => verifyToken(token, 'access')).toThrow('Token inválido')
    })

    it('deve lançar erro quando type não bate', () => {
      const token = generateToken(makeUsuario(), 'refresh')
      expect(() => verifyToken(token, 'access')).toThrow('Token inválido')
    })

    it('deve lançar erro quando access token verificado como refresh', () => {
      const token = generateToken(makeUsuario(), 'access')
      expect(() => verifyToken(token, 'refresh')).toThrow()
    })

    it('deve usar access como tipo padrão quando não especificado', () => {
      const token = generateToken(makeUsuario(), 'access')
      expect(() => verifyToken(token)).not.toThrow()
    })

    it('deve lançar erro para token malformado', () => {
      expect(() => verifyToken('token.invalido.aqui', 'access')).toThrow()
    })
  })

  describe('decodeToken', () => {
    it('deve decodificar token sem verificar assinatura', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = decodeToken(token)
      expect(decoded?.id).toBe('usuario-id-123')
    })

    it('deve retornar payload com type', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = decodeToken(token)
      expect(decoded?.type).toBe('access')
    })

    it('deve retornar null para token inválido', () => {
      expect(decodeToken('nao-e-um-jwt')).toBeNull()
    })

    it('deve retornar null para string vazia', () => {
      expect(decodeToken('')).toBeNull()
    })

    it('deve decodificar token expirado sem erro', () => {
      const token = jwt.sign(
        { id: 'u1', regra: 'ADMIN', type: 'access', jti: 'jti-test' },
        JWT_SECRET,
        { expiresIn: -1, algorithm: 'HS256' }
      )
      const decoded = decodeToken(token)
      expect(decoded?.id).toBe('u1')
    })

    it('deve retornar jti no payload decodificado', () => {
      const token = generateToken(makeUsuario(), 'access')
      const decoded = decodeToken(token)
      expect(decoded?.jti).toBeDefined()
    })
  })

  describe('isTokenExpired', () => {
    it('deve retornar false para token válido', () => {
      const token = generateToken(makeUsuario(), 'access')
      expect(isTokenExpired(token)).toBe(false)
    })

    it('deve retornar true para token expirado', () => {
      const token = jwt.sign(
        { id: 'u1', type: 'access', jti: 'j1' },
        JWT_SECRET,
        { expiresIn: -1, algorithm: 'HS256' }
      )
      expect(isTokenExpired(token)).toBe(true)
    })

    it('deve retornar true para token malformado', () => {
      expect(isTokenExpired('token-invalido')).toBe(true)
    })

    it('deve retornar true quando token não tem exp', () => {
      const token = jwt.sign({ id: 'u1' }, JWT_SECRET)
      expect(isTokenExpired(token)).toBe(true)
    })
  })

  describe('extractTokenFromHeader', () => {
    it('deve extrair token de header Bearer válido', () => {
      expect(extractTokenFromHeader('Bearer meu-token-valido')).toBe('meu-token-valido')
    })

    it('deve retornar null para header undefined', () => {
      expect(extractTokenFromHeader(undefined)).toBeNull()
    })

    it('deve retornar null para string vazia', () => {
      expect(extractTokenFromHeader('')).toBeNull()
    })

    it('deve retornar null quando scheme não é Bearer', () => {
      expect(extractTokenFromHeader('Basic meu-token')).toBeNull()
    })

    it('deve retornar null quando sem token após Bearer', () => {
      expect(extractTokenFromHeader('Bearer')).toBeNull()
    })

    it('deve ser case-insensitive para "bearer"', () => {
      expect(extractTokenFromHeader('bearer meu-token')).toBe('meu-token')
    })

    it('deve retornar null quando header contém CRLF', () => {
      expect(extractTokenFromHeader('Bearer token\r\nInject')).toBeNull()
    })

    it('deve retornar null quando header contém \\n', () => {
      expect(extractTokenFromHeader('Bearer token\nInject')).toBeNull()
    })

    it('deve retornar null quando header contém caracteres de controle', () => {
      expect(extractTokenFromHeader('Bearer \x00token')).toBeNull()
    })

    it('deve retornar null quando token tem espaço interno', () => {
      expect(extractTokenFromHeader('Bearer token com espaco')).toBeNull()
    })

    it('deve retornar null quando token tem mais de 8000 caracteres', () => {
      const token = 'a'.repeat(8001)
      expect(extractTokenFromHeader(`Bearer ${token}`)).toBeNull()
    })

    it('deve aceitar token JWT real (3 partes separadas por ponto)', () => {
      const token = generateToken(makeUsuario(), 'access')
      expect(extractTokenFromHeader(`Bearer ${token}`)).toBe(token)
    })

    it('deve retornar null para valor não-string', () => {
      expect(extractTokenFromHeader(123 as any)).toBeNull()
    })
  })

  describe('shouldRotateRefreshToken', () => {
    it('deve retornar true quando token expira em menos de 24h', () => {
      const exp = Math.floor((Date.now() + 12 * 60 * 60 * 1000) / 1000) // 12h
      const payload = { id: 'u1', regra: 'ADMIN' as Regra, type: 'refresh' as const, jti: 'j1', exp }
      expect(shouldRotateRefreshToken(payload)).toBe(true)
    })

    it('deve retornar false quando token expira em mais de 24h', () => {
      const exp = Math.floor((Date.now() + 48 * 60 * 60 * 1000) / 1000) // 48h
      const payload = { id: 'u1', regra: 'ADMIN' as Regra, type: 'refresh' as const, jti: 'j1', exp }
      expect(shouldRotateRefreshToken(payload)).toBe(false)
    })

    it('deve retornar false quando token não tem exp', () => {
      const payload = { id: 'u1', regra: 'ADMIN' as Regra, type: 'refresh' as const, jti: 'j1' }
      expect(shouldRotateRefreshToken(payload)).toBe(false)
    })
  })

  describe('securityUtils', () => {
    describe('calculateEntropy', () => {
      it('deve retornar 0 para string de caracteres repetidos', () => {
        expect(securityUtils.calculateEntropy('aaaaaaa')).toBe(0)
      })

      it('deve retornar entropia maior para string mais variada', () => {
        const low = securityUtils.calculateEntropy('aaaa')
        const high = securityUtils.calculateEntropy('aAbBcC123!')
        expect(high).toBeGreaterThan(low)
      })
    })

    describe('getObjectDepth', () => {
      it('deve retornar 0 para primitivo', () => {
        expect(securityUtils.getObjectDepth('string')).toBe(0)
      })

      it('deve retornar 0 para null', () => {
        expect(securityUtils.getObjectDepth(null)).toBe(0)
      })

      it('deve retornar 1 para objeto plano', () => {
        expect(securityUtils.getObjectDepth({ a: 1 })).toBe(1)
      })

      it('deve retornar 2 para objeto com um nível de aninhamento', () => {
        expect(securityUtils.getObjectDepth({ a: { b: 1 } })).toBe(2)
      })

      it('deve retornar profundidade máxima para objetos aninhados', () => {
        const obj = { a: { b: { c: { d: 1 } } } }
        expect(securityUtils.getObjectDepth(obj)).toBe(4)
      })
    })

    describe('validatePayload', () => {
      it('deve passar para payload normal', () => {
        expect(() => securityUtils.validatePayload({ id: 'u1', regra: 'ADMIN' })).not.toThrow()
      })

      it('deve lançar erro para payload maior que MAX_PAYLOAD_SIZE', () => {
        const large = { data: 'x'.repeat(securityUtils.MAX_PAYLOAD_SIZE + 1) }
        expect(() => securityUtils.validatePayload(large)).toThrow('Payload muito grande')
      })

      it('deve lançar erro para payload profundo demais', () => {
        let deep: Record<string, unknown> = { value: 1 }
        for (let i = 0; i < securityUtils.MAX_OBJECT_DEPTH + 2; i++) {
          deep = { nested: deep }
        }
        expect(() => securityUtils.validatePayload(deep)).toThrow('Payload com objetos muito profundos')
      })
    })

    describe('constantes de segurança', () => {
      it('MAX_PAYLOAD_SIZE deve ser 4096', () => {
        expect(securityUtils.MAX_PAYLOAD_SIZE).toBe(4096)
      })

      it('MAX_OBJECT_DEPTH deve ser 10', () => {
        expect(securityUtils.MAX_OBJECT_DEPTH).toBe(10)
      })

      it('MIN_SECRET_ENTROPY_BITS deve ser 128', () => {
        expect(securityUtils.MIN_SECRET_ENTROPY_BITS).toBe(128)
      })
    })
  })
})