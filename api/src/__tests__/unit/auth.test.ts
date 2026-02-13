import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { Response, NextFunction } from 'express';
import { authMiddleware, authorizeRoles, AuthRequest } from '../../infrastructure/http/middlewares/auth';
import { extractTokenFromHeader, verifyToken } from '../../shared/config/jwt';
import { cacheGet } from '../../infrastructure/database/redis/client';
import { prisma } from '../../infrastructure/database/prisma/client';

vi.mock('../../shared/config/jwt', () => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock('../../infrastructure/database/redis/client', () => ({
  cacheGet: vi.fn(),
}));

vi.mock('../../infrastructure/database/prisma/client', () => ({
  prisma: { usuario: { findUnique: vi.fn() } },
}));

const mockExtract    = extractTokenFromHeader          as MockedFunction<typeof extractTokenFromHeader>;
const mockVerify     = verifyToken                     as MockedFunction<typeof verifyToken>;
const mockCacheGet   = cacheGet                        as MockedFunction<typeof cacheGet>;
const mockFindUnique = prisma.usuario.findUnique       as unknown       as MockedFunction<typeof prisma.usuario.findUnique>;

const USUARIO = { id: 'u1', nome: 'João', email: 'joao@test.com', regra: 'ADMIN' };
const DECODED  = { id: 'u1', jti: 'jti-abc' };

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as any).mockReturnValue(res);
  (res.json   as any).mockReturnValue(res);
  return res;
}

function makeReq(auth = 'Bearer token'): AuthRequest {
  return { headers: { authorization: auth } } as unknown as AuthRequest;
}

describe('authMiddleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deve retornar 401 quando nenhum token é enviado no header', async () => {
    mockExtract.mockReturnValue(null);
    const res = makeRes(); const next = vi.fn();
    await authMiddleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando o token consta na blacklist do Redis', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockReturnValue(DECODED as any);
    mockCacheGet.mockResolvedValue('1');
    const res = makeRes(); const next = vi.fn();
    await authMiddleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token revogado. Faça login novamente.' });
  });

  it('deve retornar 401 quando o payload decodificado não identifica nenhum usuário', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockReturnValue({ jti: 'x' } as any);
    mockCacheGet.mockResolvedValue(null);
    const res = makeRes(); const next = vi.fn();
    await authMiddleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido: ID do usuário ausente.' });
  });

  it('deve retornar 401 quando o id do token não corresponde a nenhum usuário cadastrado', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockReturnValue(DECODED as any);
    mockCacheGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    const res = makeRes(); const next = vi.fn();
    await authMiddleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado.' });
  });

  it('deve popular req.usuario e chamar next() quando token e usuário são válidos', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockReturnValue(DECODED as any);
    mockCacheGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(USUARIO as any);
    const req = makeReq(); const res = makeRes(); const next = vi.fn();
    await authMiddleware(req, res, next);
    expect(req.usuario).toEqual(USUARIO);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve aceitar o campo userId como alternativa ao campo id no payload', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockReturnValue({ userId: 'u1', jti: 'x' } as any);
    mockCacheGet.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(USUARIO as any);
    const next = vi.fn();
    await authMiddleware(makeReq(), makeRes(), next);
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    expect(next).toHaveBeenCalledOnce();
  });

  it('não consulta Redis quando jti está ausente', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockReturnValue({ id: 'u1' } as any);
    mockFindUnique.mockResolvedValue(USUARIO as any);
    await authMiddleware(makeReq(), makeRes(), vi.fn());
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  it('deve retornar 401 com mensagem de expiração quando a biblioteca JWT lança erro de tempo', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockImplementation(() => { throw new Error('jwt expired'); });
    const res = makeRes();
    await authMiddleware(makeReq(), res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' });
  });

  it('deve retornar 401 com mensagem genérica quando a verificação do token falha por qualquer outro motivo', async () => {
    mockExtract.mockReturnValue('tok');
    mockVerify.mockImplementation(() => { throw new Error('invalid signature'); });
    const res = makeRes();
    await authMiddleware(makeReq(), res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' });
  });
});

describe('authorizeRoles', () => {
  function req(regra?: string): AuthRequest {
    const r = {} as AuthRequest;
    if (regra) r.usuario = { id: 'u1', nome: 'T', email: 't@t.com', regra };
    return r;
  }

  it('deve retornar 401 quando a rota é acessada sem passar pelo middleware de autenticação', () => {
    const res = makeRes(); const next = vi.fn();
    authorizeRoles('ADMIN')(req(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autorizado.' });
  });

  it('deve retornar 403 quando o usuário autenticado não tem privilégios suficientes para o recurso', () => {
    const res = makeRes(); const next = vi.fn();
    authorizeRoles('ADMIN')(req('USER'), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso negado.' });
  });

  it('deve chamar next() quando a regra do usuário corresponde à regra exigida', () => {
    const next = vi.fn();
    authorizeRoles('ADMIN')(req('ADMIN'), makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('deve chamar next() quando o middleware é configurado com várias regras e o usuário possui uma delas', () => {
    const next = vi.fn();
    authorizeRoles('ADMIN', 'TECNICO', 'USUARIO')(req('ADMIN'), makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});