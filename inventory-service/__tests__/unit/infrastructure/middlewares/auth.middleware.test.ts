import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { authMiddleware, authorizeRoles } from '@infrastructure/http/middlewares/auth.middleware'

vi.mock('@shared/config/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const JWT_SECRET = 'test-secret'

const makeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() } as any
  res.status.mockReturnValue(res)
  return res
}

const next = vi.fn()

const makeValidToken = (payload = { id: 'user-1', email: 'u@u.com', regra: 'ADMIN' }) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })

describe('authMiddleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('chama next com token válido', () => {
    const req = { headers: { authorization: `Bearer ${makeValidToken()}` } } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.usuario.id).toBe('user-1')
    expect(req.usuario.regra).toBe('ADMIN')
  })

  it('retorna 401 quando Authorization não fornecido', () => {
    const req = { headers: {} } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('retorna 401 quando header não começa com Bearer', () => {
    const req = { headers: { authorization: 'Basic token' } } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('retorna 500 quando JWT_SECRET não configurado', () => {
    delete process.env.JWT_SECRET
    const req = { headers: { authorization: `Bearer ${makeValidToken()}` } } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('retorna 401 quando token expirado', () => {
    const token = jwt.sign({ id: 'u', regra: 'ADMIN' }, JWT_SECRET, { expiresIn: '-1s' })
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' })
  })

  it('retorna 401 quando token inválido', () => {
    const req = { headers: { authorization: 'Bearer token.invalido.aqui' } } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' })
  })

  it('retorna 401 quando payload não tem id ou regra', () => {
    const token = jwt.sign({ email: 'u@u.com' }, JWT_SECRET)
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('inclui setor no usuario quando presente no payload', () => {
    const token = makeValidToken({ id: 'u', email: 'u@u.com', regra: 'TECNICO', setor: 'TI' } as any)
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    const res = makeRes()

    authMiddleware(req, res, next)

    expect(req.usuario.setor).toBe('TI')
  })
})

describe('authorizeRoles', () => {
  it('chama next quando usuário tem a regra correta', () => {
    const middleware = authorizeRoles('ADMIN', 'GESTOR')
    const req = { usuario: { id: 'u', email: 'u@u.com', regra: 'ADMIN' } } as any
    const res = makeRes()

    middleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('retorna 401 quando req.usuario está ausente', () => {
    const middleware = authorizeRoles('ADMIN')
    const req = {} as any
    const res = makeRes()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('retorna 403 quando usuário não tem a regra necessária', () => {
    const middleware = authorizeRoles('ADMIN')
    const req = { usuario: { id: 'u', email: 'u@u.com', regra: 'TECNICO' } } as any
    const res = makeRes()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
  })
})
