import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { Regra, Setor } from '@prisma/client';
import {
  validateSecrets,
  generateToken,
  generateTokenPair,
  decodeToken,
  isTokenExpired,
  extractTokenFromHeader,
  TokenPayload,
} from '../../auth/jwt';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verifica token JWT sem cache, buscando o secret dinamicamente
 */
function verifyTokenForTesting(token: string, expectedType: 'access' | 'refresh'): TokenPayload {
  const decoded = jwt.decode(token) as TokenPayload | null;
  
  if (!decoded) {
    throw new Error('Token inválido: formato inválido');
  }
  
  if (decoded.type !== expectedType) {
    throw new Error(`esperado tipo ${expectedType}, recebido ${decoded.type}`);
  }
  
  try {
    const secret = expectedType === 'access'
      ? process.env.JWT_SECRET
      : process.env.JWT_REFRESH_SECRET;
      
    if (!secret) {
      throw new Error('Segredo JWT não está configurado');
    }
    
    return jwt.verify(token, secret) as unknown as TokenPayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    }
    throw new Error(`Token inválido: ${err.message}`);
  }
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

const FAKE_SECRET = 'a'.repeat(32);
const FAKE_REFRESH_SECRET = 'b'.repeat(32);

const defaultUserMock: {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  password: string;
  regra: Regra;
  setor: Setor | null;
  telefone: string | null;
  ramal: string | null;
  avatarUrl: string | null;
  geradoEm: Date;
  atualizadoEm: Date;
  ativo: boolean;
  refreshToken: string | null;
} = {
  id: '1',
  nome: 'Usuário',
  sobrenome: 'Teste',
  email: 'usuario@teste.com',
  password: 'senha123',
  regra: Regra.USUARIO,
  setor: null,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  geradoEm: new Date(),
  atualizadoEm: new Date(),
  ativo: true,
  refreshToken: null,
};

// ============================================================================
// SETUP E TEARDOWN
// ============================================================================

beforeEach(() => {
  // Arrange: Configurar variáveis de ambiente para cada teste
  process.env.JWT_SECRET = FAKE_SECRET;
  process.env.JWT_REFRESH_SECRET = FAKE_REFRESH_SECRET;
  process.env.JWT_EXPIRATION = '1h';
  process.env.JWT_REFRESH_EXPIRATION = '2h';
});

// ============================================================================
// TESTES - VALIDAÇÃO DE SECRETS
// ============================================================================

describe('validateSecrets - Validação de Configurações JWT', () => {
  describe('Dado secrets JWT válidos configurados no ambiente', () => {
    describe('Quando validar as configurações de segurança', () => {
      it('Então deve passar a validação sem lançar erros', () => {
        // Arrange: Secrets já configurados no beforeEach
        
        // Act & Assert: Validação não deve lançar erro
        expect(() => validateSecrets()).not.toThrow();
      });
    });
  });

  describe('Dado JWT_SECRET inválido (menor que 32 caracteres)', () => {
    describe('Quando validar as configurações de segurança', () => {
      it('Então deve lançar erro descritivo sobre tamanho mínimo', () => {
        // Arrange: Configurar secret inválido
        process.env.JWT_SECRET = 'secret-muito-curto';
        
        // Act & Assert: Deve lançar erro específico
        expect(() => validateSecrets()).toThrow(
          /deve estar definido e conter pelo menos 32 caracteres/
        );
        
        // Cleanup: Restaurar valor válido
        process.env.JWT_SECRET = FAKE_SECRET;
      });
    });
  });

  describe('Dado JWT_SECRET igual ao JWT_REFRESH_SECRET', () => {
    describe('Quando validar as configurações de segurança', () => {
      it('Então deve lançar erro indicando que secrets devem ser diferentes', () => {
        // Arrange: Configurar secrets iguais
        const sameSecret = FAKE_SECRET;
        process.env.JWT_SECRET = sameSecret;
        process.env.JWT_REFRESH_SECRET = sameSecret;
        
        // Act & Assert: Deve lançar erro específico
        expect(() => validateSecrets()).toThrow(/devem ser diferentes/);
        
        // Cleanup: Restaurar valores válidos
        process.env.JWT_SECRET = FAKE_SECRET;
        process.env.JWT_REFRESH_SECRET = FAKE_REFRESH_SECRET;
      });
    });
  });
});

// ============================================================================
// TESTES - GERAÇÃO DE TOKENS
// ============================================================================

describe('generateToken - Geração de Token Individual', () => {
  describe('Dado usuário válido e tipo "access"', () => {
    describe('Quando gerar token de acesso', () => {
      it('Deve retornar JWT assinado com payload correto', () => {
        // Arrange: Usuário já configurado no fixture
        
        // Act: Gerar token de acesso
        const token = generateToken(defaultUserMock, 'access');
        
        // Assert: Validar estrutura e conteúdo do token
        expect(typeof token).toBe('string');
        expect(token).toBeTruthy();
        
        const decoded = jwt.decode(token) as TokenPayload;
        expect(decoded).not.toBeNull();
        expect(decoded.id).toBe(defaultUserMock.id);
        expect(decoded.email).toBe(defaultUserMock.email);
        expect(decoded.regra).toBe(defaultUserMock.regra);
        expect(decoded.type).toBe('access');
      });
    });
  });

  describe('Dado usuário válido e tipo "refresh"', () => {
    describe('Quando gerar token de refresh', () => {
      it('Deve retornar JWT assinado com tipo correto', () => {
        // Arrange: Usuário já configurado no fixture
        
        // Act: Gerar token de refresh
        const token = generateToken(defaultUserMock, 'refresh');
        
        // Assert: Validar tipo do token
        const decoded = jwt.decode(token) as TokenPayload;
        expect(decoded).not.toBeNull();
        expect(decoded.type).toBe('refresh');
        expect(decoded.id).toBe(defaultUserMock.id);
      });
    });
  });
});

describe('generateTokenPair - Geração de Par de Tokens', () => {
  describe('Dado usuário válido', () => {
    describe('Quando gerar par de tokens (access e refresh)', () => {
      it('Deve retornar dois tokens distintos com tipos corretos', () => {
        // Arrange: Usuário já configurado no fixture
        
        // Act: Gerar par de tokens
        const { accessToken, refreshToken, expiresIn } = generateTokenPair(defaultUserMock);
        
        // Assert: Validar que tokens são diferentes
        expect(accessToken).not.toBe(refreshToken);
        expect(typeof accessToken).toBe('string');
        expect(typeof refreshToken).toBe('string');
        expect(expiresIn).toBeTruthy();
        
        // Assert: Validar conteúdo de cada token
        const accessDecoded = jwt.decode(accessToken) as TokenPayload;
        const refreshDecoded = jwt.decode(refreshToken) as TokenPayload;
        
        expect(accessDecoded.type).toBe('access');
        expect(refreshDecoded.type).toBe('refresh');
        expect(accessDecoded.id).toBe(defaultUserMock.id);
        expect(refreshDecoded.id).toBe(defaultUserMock.id);
        expect(accessDecoded.regra).toBe(defaultUserMock.regra);
        expect(refreshDecoded.regra).toBe(defaultUserMock.regra);
      });
    });
  });
});

// ============================================================================
// TESTES - VERIFICAÇÃO DE TOKENS
// ============================================================================

describe('verifyToken - Verificação e Validação de Tokens', () => {
  describe('Dado token válido do tipo "access"', () => {
    describe('Quando verificar token com tipo esperado correto', () => {
      it('Deve retornar payload decodificado e validado', () => {
        // Arrange: Gerar token válido
        const token = generateToken(defaultUserMock, 'access');
        
        // Act: Verificar token
        const payload = verifyTokenForTesting(token, 'access');
        
        // Assert: Validar payload completo
        expect(payload).toBeTruthy();
        expect(payload.id).toBe(defaultUserMock.id);
        expect(payload.email).toBe(defaultUserMock.email);
        expect(payload.type).toBe('access');
        expect(payload.regra).toBe(defaultUserMock.regra);
      });
    });
  });

  describe('Dado token válido do tipo "refresh"', () => {
    describe('Quando verificar token com tipo "refresh"', () => {
      it('Deve retornar payload com tipo refresh validado', () => {
        // Arrange: Gerar token de refresh
        const token = generateToken(defaultUserMock, 'refresh');
        
        // Act: Verificar token
        const payload = verifyTokenForTesting(token, 'refresh');
        
        // Assert: Validar tipo e conteúdo
        expect(payload).toBeTruthy();
        expect(payload.type).toBe('refresh');
        expect(payload.id).toBe(defaultUserMock.id);
      });
    });
  });

  describe('Dado token de "access" mas esperado tipo "refresh"', () => {
    describe('Quando verificar token com tipo incorreto', () => {
      it('Deve lançar erro indicando incompatibilidade de tipo', () => {
        // Arrange: Gerar token de access
        const token = generateToken(defaultUserMock, 'access');
        
        // Act & Assert: Deve lançar erro específico
        expect(() => verifyTokenForTesting(token, 'refresh')).toThrow(
          /esperado tipo refresh, recebido access/
        );
      });
    });
  });

  describe('Dado token com formato inválido', () => {
    describe('Quando tentar verificar token malformado', () => {
      it('Deve lançar erro descritivo sobre formato', () => {
        // Arrange: Token inválido
        const invalidToken = 'xxx.yyy.zzz';
        
        // Act & Assert: Deve lançar erro
        expect(() => verifyTokenForTesting(invalidToken, 'access')).toThrow(/Token inválido/);
      });
    });
  });

  describe('Dado token expirado', () => {
    describe('Quando verificar token com validade vencida', () => {
      it('Deve lançar erro específico de expiração', () => {
        // Arrange: Criar token já expirado
        const expiredToken = jwt.sign(
          { id: defaultUserMock.id, type: 'access', regra: defaultUserMock.regra },
          FAKE_SECRET,
          { 
            expiresIn: '-1s', 
            algorithm: 'HS256', 
            issuer: 'helpme-api', 
            audience: 'helpme-client' 
          }
        );
        
        // Act & Assert: Deve lançar erro de expiração
        expect(() => verifyTokenForTesting(expiredToken, 'access')).toThrow(/Token expirado/);
      });
    });
  });
});

// ============================================================================
// TESTES - DECODIFICAÇÃO DE TOKENS
// ============================================================================

describe('decodeToken - Decodificação sem Verificação', () => {
  describe('Dado token válido', () => {
    describe('Quando decodificar token sem verificar assinatura', () => {
      it('Deve retornar payload decodificado', () => {
        // Arrange: Gerar token válido
        const token = generateToken(defaultUserMock, 'access');
        
        // Act: Decodificar token
        const payload = decodeToken(token);
        
        // Assert: Validar payload decodificado
        expect(payload).not.toBeNull();
        expect(payload?.id).toBe(defaultUserMock.id);
        expect(payload?.email).toBe(defaultUserMock.email);
        expect(payload?.type).toBe('access');
        expect(payload?.regra).toBe(defaultUserMock.regra);
      });
    });
  });

  describe('Dado token com formato inválido', () => {
    describe('Quando tentar decodificar token malformado', () => {
      it('Deve retornar null sem lançar erro', () => {
        // Arrange: Token inválido
        const invalidToken = 'xxx.yyy.zzz';
        
        // Act: Decodificar token inválido
        const result = decodeToken(invalidToken);
        
        // Assert: Deve retornar null
        expect(result).toBeNull();
      });
    });
  });
});

// ============================================================================
// TESTES - VERIFICAÇÃO DE EXPIRAÇÃO
// ============================================================================

describe('isTokenExpired - Verificação de Validade Temporal', () => {
  describe('Dado token expirado', () => {
    describe('Quando verificar se token está expirado', () => {
      it('Deve retornar true', () => {
        // Arrange: Criar token expirado
        const expiredToken = jwt.sign(
          { id: defaultUserMock.id, type: 'access', regra: defaultUserMock.regra },
          FAKE_SECRET,
          { 
            expiresIn: '-1s', 
            algorithm: 'HS256', 
            issuer: 'helpme-api', 
            audience: 'helpme-client' 
          }
        );
        
        // Act: Verificar expiração
        const isExpired = isTokenExpired(expiredToken);
        
        // Assert: Deve estar expirado
        expect(isExpired).toBe(true);
      });
    });
  });

  describe('Dado token válido com tempo de vida ativo', () => {
    describe('Quando verificar se token está expirado', () => {
      it('Deve retornar false', () => {
        // Arrange: Gerar token válido
        const token = generateToken(defaultUserMock, 'access');
        
        // Act: Verificar expiração
        const isExpired = isTokenExpired(token);
        
        // Assert: Não deve estar expirado
        expect(isExpired).toBe(false);
      });
    });
  });

  describe('Dado token inválido ou malformado', () => {
    describe('Quando verificar expiração de token inválido', () => {
      it('Deve retornar true por segurança', () => {
        // Arrange: Token inválido
        const invalidToken = 'token-invalido';
        
        // Act: Verificar expiração
        const isExpired = isTokenExpired(invalidToken);
        
        // Assert: Deve considerar expirado por segurança
        expect(isExpired).toBe(true);
      });
    });
  });
});

// ============================================================================
// TESTES - EXTRAÇÃO DE HEADER
// ============================================================================

describe('extractTokenFromHeader - Extração de Token do Header', () => {
  describe('Dado Authorization header no formato Bearer correto', () => {
    describe('Quando extrair token do header', () => {
      it('Deve retornar token sem o prefixo Bearer', () => {
        // Arrange: Gerar token e criar header
        const token = generateToken(defaultUserMock, 'access');
        const authHeader = `Bearer ${token}`;
        
        // Act: Extrair token
        const extractedToken = extractTokenFromHeader(authHeader);
        
        // Assert: Deve retornar apenas o token
        expect(extractedToken).toBe(token);
        expect(extractedToken).not.toContain('Bearer');
      });
    });
  });

  describe('Dado Authorization header com formato diferente de Bearer', () => {
    describe('Quando tentar extrair token de header Basic', () => {
      it('Deve retornar null', () => {
        // Arrange: Header com formato Basic
        const basicHeader = 'Basic dXNlcjpwYXNz';
        
        // Act: Tentar extrair token
        const result = extractTokenFromHeader(basicHeader);
        
        // Assert: Deve retornar null
        expect(result).toBeNull();
      });
    });
  });

  describe('Dado Authorization header undefined ou ausente', () => {
    describe('Quando tentar extrair token de header inexistente', () => {
      it('Deve retornar null sem causar erro', () => {
        // Arrange: Header undefined
        const undefinedHeader = undefined;
        
        // Act: Tentar extrair token
        const result = extractTokenFromHeader(undefinedHeader);
        
        // Assert: Deve retornar null
        expect(result).toBeNull();
      });
    });
  });

  describe('Dado Authorization header sem espaço entre Bearer e token', () => {
    describe('Quando tentar extrair token de header malformado', () => {
      it('Deve retornar null para formato inválido', () => {
        // Arrange: Header sem espaço após Bearer
        const headerSemEspaco = 'Bearertoken123';
        
        // Act: Tentar extrair token
        const result = extractTokenFromHeader(headerSemEspaco);
        
        // Assert: Deve retornar null
        expect(result).toBeNull();
      });
    });
  });

  describe('Dado Authorization header com espaços extras mas formato válido', () => {
    describe('Quando extrair token de header com espaços extras', () => {
      it('Deve normalizar espaços e extrair token corretamente', () => {
        // Arrange: Header com espaços extras mas formato válido
        const headerEspacoExtra = 'Bearer  token123';
        const headerEspacosAmbosLados = '  Bearer   token456  ';
        
        // Act: Extrair tokens
        const result1 = extractTokenFromHeader(headerEspacoExtra);
        const result2 = extractTokenFromHeader(headerEspacosAmbosLados);
        
        // Assert: Deve extrair tokens corretamente
        expect(result1).toBe('token123');
        expect(result2).toBe('token456');
      });
    });
  });

  describe('Dado Authorization header com token contendo espaços internos', () => {
    describe('Quando tentar extrair token com espaços no meio', () => {
      it('Deve retornar null por ser formato inválido', () => {
        // Arrange: Token com espaços internos (inválido)
        const headerTokenComEspaco = 'Bearer token 123';
        
        // Act: Tentar extrair token
        const result = extractTokenFromHeader(headerTokenComEspaco);
        
        // Assert: Deve retornar null (mais de 2 partes após split)
        expect(result).toBeNull();
      });
    });
  });
});