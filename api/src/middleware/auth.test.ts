import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Response, NextFunction } from 'express';
import { Regra } from '@prisma/client';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../auth/jwt', () => ({
  verifyToken: vi.fn(),
  extractTokenFromHeader: vi.fn(),
}));

vi.mock('../services/redisClient', () => ({
  cacheGet: vi.fn(),
}));

import { authMiddleware, authorizeRoles, AuthRequest } from './auth';
import * as jwtModule from '../auth/jwt';
import * as redisModule from '../services/redisClient';

const verifyTokenMock = vi.mocked(jwtModule.verifyToken);
const extractTokenFromHeaderMock = vi.mocked(jwtModule.extractTokenFromHeader);
const cacheGetMock = vi.mocked(redisModule.cacheGet);

// ============================================================================
// SETUP E HELPERS
// ============================================================================

function createMockRequest(authorization?: string): Partial<AuthRequest> {
  return {
    headers: {
      authorization,
    },
  } as Partial<AuthRequest>;
}

function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

function createMockNext(): NextFunction {
  return vi.fn() as NextFunction;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// TESTES DO authMiddleware
// ============================================================================

describe('authMiddleware', () => {
  it('Deve retornar 401 quando token não for fornecido', async () => {
    // Arrange
    extractTokenFromHeaderMock.mockReturnValue(null);
    const req = createMockRequest() as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('Deve retornar 401 quando extractTokenFromHeader retornar null', async () => {
    // Arrange
    extractTokenFromHeaderMock.mockReturnValue(null);
    const req = createMockRequest('Bearer invalid') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(extractTokenFromHeaderMock).toHaveBeenCalledWith('Bearer invalid');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido.' });
  });

  it('Deve retornar 401 quando token estiver na blacklist', async () => {
    // Arrange
    const mockToken = 'valid-token';
    const mockDecoded = { id: 'user1', regra: Regra.USUARIO, jti: 'token-jti', type: 'access' as const };
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockReturnValue(mockDecoded);
    cacheGetMock.mockResolvedValue('revogado');
    
    const req = createMockRequest('Bearer valid-token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(cacheGetMock).toHaveBeenCalledWith('jwt:blacklist:token-jti');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token revogado. Faça login novamente.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('Deve chamar next quando token for válido e não estiver na blacklist', async () => {
    // Arrange
    const mockToken = 'valid-token';
    const mockDecoded = { id: 'user1', regra: Regra.USUARIO, jti: 'token-jti', type: 'access' as const };
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockReturnValue(mockDecoded);
    cacheGetMock.mockResolvedValue(null);
    
    const req = createMockRequest('Bearer valid-token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(req.usuario).toEqual(mockDecoded);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Deve chamar next quando token não tiver jti', async () => {
    // Arrange
    const mockToken = 'valid-token';
    const mockDecoded = { id: 'user1', regra: Regra.USUARIO, type: 'access' as const };
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockReturnValue(mockDecoded);
    
    const req = createMockRequest('Bearer valid-token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(cacheGetMock).not.toHaveBeenCalled();
    expect(req.usuario).toEqual(mockDecoded);
    expect(next).toHaveBeenCalled();
  });

  it('Deve retornar 401 com mensagem de token expirado quando erro contiver "expir"', async () => {
    // Arrange
    const mockToken = 'expired-token';
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockImplementation(() => {
      throw new Error('Token expirado');
    });
    
    const req = createMockRequest('Bearer expired-token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('Deve retornar 401 com mensagem de token expirado quando erro contiver "expire" (case insensitive)', async () => {
    // Arrange
    const mockToken = 'expired-token';
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockImplementation(() => {
      throw new Error('JWT EXPIRED at 2024');
    });
    
    const req = createMockRequest('Bearer expired-token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expirado.' });
  });

  it('Deve retornar 401 com mensagem genérica quando token for inválido', async () => {
    // Arrange
    const mockToken = 'invalid-token';
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockImplementation(() => {
      throw new Error('Token inválido');
    });
    
    const req = createMockRequest('Bearer invalid-token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('Deve retornar 401 quando erro não for instância de Error (linha 35)', async () => {
    // Arrange
    const mockToken = 'token-com-erro-estranho';
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockImplementation(() => {
      throw 'String de erro não estruturado';
    });
    
    const req = createMockRequest('Bearer token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('Deve retornar 401 quando erro for null', async () => {
    // Arrange
    const mockToken = 'token-com-erro-null';
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockImplementation(() => {
      throw null;
    });
    
    const req = createMockRequest('Bearer token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' });
  });

  it('Deve retornar 401 quando erro for objeto sem message', async () => {
    // Arrange
    const mockToken = 'token-com-erro-objeto';
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockImplementation(() => {
      throw { code: 500, detail: 'Erro desconhecido' };
    });
    
    const req = createMockRequest('Bearer token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido.' });
  });

  it('Deve pular verificação de blacklist quando decoded não tiver jti', async () => {
    // Arrange
    const mockToken = 'valid-token-sem-jti';
    const mockDecoded = { id: 'user1', regra: Regra.USUARIO, type: 'access' as const };
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockReturnValue(mockDecoded);
    
    const req = createMockRequest('Bearer valid-token-sem-jti') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(cacheGetMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('Deve logar erro no console quando ocorrer exceção', async () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const mockToken = 'token-com-erro';
    const mockError = new Error('Erro de verificação');
    extractTokenFromHeaderMock.mockReturnValue(mockToken);
    verifyTokenMock.mockImplementation(() => {
      throw mockError;
    });
    
    const req = createMockRequest('Bearer token') as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    await authMiddleware(req, res, next);

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith('authMiddleware error:', mockError);
  });
});

// ============================================================================
// TESTES DO authorizeRoles
// ============================================================================

describe('authorizeRoles', () => {
  it('Deve retornar 401 quando req.usuario não estiver definido', () => {
    // Arrange
    const middleware = authorizeRoles(Regra.ADMIN);
    const req = {} as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autorizado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('Deve retornar 403 quando usuário não tiver permissão', () => {
    // Arrange
    const middleware = authorizeRoles(Regra.ADMIN);
    const req = {
      usuario: { id: 'user1', regra: Regra.USUARIO, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso negado.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('Deve chamar next quando usuário tiver permissão adequada', () => {
    // Arrange
    const middleware = authorizeRoles(Regra.ADMIN);
    const req = {
      usuario: { id: 'user1', regra: Regra.ADMIN, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Deve aceitar múltiplas regras e permitir acesso se usuário tiver uma delas', () => {
    // Arrange
    // Usando string explícita para garantir que funciona
    const middleware = authorizeRoles('ADMIN', 'USUARIO');
    const req = {
      usuario: { id: 'user1', regra: 'USUARIO' as any, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Deve aceitar regras como strings', () => {
    // Arrange
    const middleware = authorizeRoles('ADMIN', 'USUARIO');
    const req = {
      usuario: { id: 'user1', regra: 'ADMIN' as any, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
  });

  it('Deve negar acesso quando usuário não tiver nenhuma das regras permitidas', () => {
    // Arrange
    const middleware = authorizeRoles(Regra.ADMIN);
    const req = {
      usuario: { id: 'user1', regra: Regra.USUARIO, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso negado.' });
  });

  it('Deve converter todas as regras para string antes de comparar', () => {
    // Arrange
    const middleware = authorizeRoles(Regra.ADMIN);
    const req = {
      usuario: { id: 'user1', regra: 'ADMIN' as any, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
  });

  it('Deve funcionar com uma única regra', () => {
    // Arrange
    const middleware = authorizeRoles(Regra.USUARIO);
    const req = {
      usuario: { id: 'user1', regra: Regra.USUARIO, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
  });

  it('Deve funcionar com duas ou mais regras', () => {
    // Arrange
    const middleware = authorizeRoles(Regra.ADMIN, Regra.USUARIO);
    const req = {
      usuario: { id: 'user1', regra: Regra.USUARIO, type: 'access' as const }
    } as AuthRequest;
    const res = createMockResponse() as Response;
    const next = createMockNext();

    // Act
    middleware(req, res, next);

    // Assert
    expect(next).toHaveBeenCalled();
  });
});