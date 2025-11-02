import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authMiddleware, authorizeRoles, AuthRequest } from './auth';
import { Regra } from '@prisma/client';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Factory para criar mock de resposta Express
 */
const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

/**
 * Mock da função next do Express
 */
const next = vi.fn();

// ============================================================================
// TEST FIXTURES
// ============================================================================

const tokenPayload = {
  id: 'id',
  email: 'u@t.com',
  regra: Regra.USUARIO,
  type: 'access',
  jti: 'ABC123'
};

// ============================================================================
// MODULE MOCKS
// ============================================================================

vi.mock('../auth/jwt', () => ({
  extractTokenFromHeader: vi.fn((h) => h?.split(' ')[1]),
  verifyToken: vi.fn(() => ({
    id: 'id',
    email: 'u@t.com',
    regra: 'USUARIO',
    type: 'access',
    jti: 'ABC123'
  })),
}));

vi.mock('../services/redisClient', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
}));

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

beforeEach(async () => {
  vi.clearAllMocks();
  next.mockClear();
  
  // Reset mocks para comportamento padrão
  const { verifyToken } = await import('../auth/jwt');
  const { cacheGet } = await import('../services/redisClient');
  
  (verifyToken as any).mockReturnValue(tokenPayload);
  (cacheGet as any).mockResolvedValue(null);
});

// ============================================================================
// TEST SUITES
// ============================================================================

describe('authMiddleware (middleware de autenticação)', () => {
  it('deve permitir acesso e chamar next() quando o token for válido e não estiver na blacklist', async () => {
    const req = { 
      headers: { authorization: 'Bearer valid-token' } 
    } as AuthRequest;
    const res = mockRes();
    
    await authMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.usuario).toEqual(tokenPayload);
  });

  it('deve retornar status 401 com mensagem de erro quando o token não for fornecido no header', async () => {
    const req = { 
      headers: {} 
    } as AuthRequest;
    const res = mockRes();
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar status 401 quando o token estiver na blacklist (revogado)', async () => {
    const req = { 
      headers: { authorization: 'Bearer revoked-token' } 
    } as AuthRequest;
    const res = mockRes();
    
    const { cacheGet } = await import('../services/redisClient');
    (cacheGet as any).mockResolvedValueOnce('revogado');
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ 
      error: 'Token revogado. Faça login novamente.' 
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar status 401 quando o token estiver expirado', async () => {
    const req = { 
      headers: { authorization: 'Bearer expired-token' } 
    } as AuthRequest;
    const res = mockRes();
    
    const { verifyToken } = await import('../auth/jwt');
    (verifyToken as any).mockImplementationOnce(() => { 
      throw new Error('Token expirado.'); 
    });
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar status 401 quando o token for inválido', async () => {
    const req = { 
      headers: { authorization: 'Bearer invalid-token' } 
    } as AuthRequest;
    const res = mockRes();
    
    const { verifyToken } = await import('../auth/jwt');
    (verifyToken as any).mockImplementationOnce(() => { 
      throw new Error('Token inválido.'); 
    });
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar status 401 quando o header Authorization estiver malformado', async () => {
    const req = { 
      headers: { authorization: 'InvalidFormat' } 
    } as AuthRequest;
    const res = mockRes();
    
    const { extractTokenFromHeader } = await import('../auth/jwt');
    (extractTokenFromHeader as any).mockReturnValueOnce(null);
    
    await authMiddleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve anexar os dados do usuário à requisição quando a autenticação for bem-sucedida', async () => {
    const req = { 
      headers: { authorization: 'Bearer valid-token' } 
    } as AuthRequest;
    const res = mockRes();
    
    await authMiddleware(req, res, next);
    
    expect(req.usuario).toBeDefined();
    expect(req.usuario).toMatchObject({
      id: 'id',
      email: 'u@t.com',
      regra: Regra.USUARIO,
      type: 'access',
      jti: 'ABC123'
    });
  });
});

describe('authorizeRoles (middleware de autorização por role)', () => {
  it('deve permitir acesso e chamar next() quando o usuário possuir uma das roles permitidas', () => {
    const req = { 
      usuario: { regra: Regra.USUARIO } 
    } as AuthRequest;
    const res = mockRes();
    const middleware = authorizeRoles(Regra.USUARIO, Regra.ADMIN);
    
    middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve permitir acesso quando o usuário for ADMIN e ADMIN estiver nas roles permitidas', () => {
    const req = { 
      usuario: { regra: Regra.ADMIN } 
    } as AuthRequest;
    const res = mockRes();
    const middleware = authorizeRoles(Regra.ADMIN);
    
    middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve retornar status 401 quando o usuário não estiver autenticado (req.usuario não existe)', () => {
    const req = {} as AuthRequest;
    const res = mockRes();
    const middleware = authorizeRoles(Regra.USUARIO);
    
    middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autorizado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar status 403 quando o usuário estiver autenticado mas não possuir a role necessária', () => {
    const req = { 
      usuario: { regra: Regra.USUARIO } 
    } as AuthRequest;
    const res = mockRes();
    const middleware = authorizeRoles(Regra.ADMIN);
    
    middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso negado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar status 403 quando o usuário for TECNICO mas apenas ADMIN for permitido', () => {
    const req = { 
      usuario: { regra: Regra.TECNICO } 
    } as AuthRequest;
    const res = mockRes();
    const middleware = authorizeRoles(Regra.ADMIN);
    
    middleware(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso negado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve permitir acesso quando múltiplas roles forem permitidas e o usuário possuir uma delas', () => {
    const req = { 
      usuario: { regra: Regra.TECNICO } 
    } as AuthRequest;
    const res = mockRes();
    const middleware = authorizeRoles(Regra.USUARIO, Regra.TECNICO, Regra.ADMIN);
    
    middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});