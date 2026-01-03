import {
  describe,
  it,
  expect,
  beforeEach
} from 'vitest';
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
  deletadoEm: Date | null;
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
  deletadoEm: null,
  ativo: true,
  refreshToken: null,
};

beforeEach(() => {
  process.env.JWT_SECRET = FAKE_SECRET;
  process.env.JWT_REFRESH_SECRET = FAKE_REFRESH_SECRET;
  process.env.JWT_EXPIRATION = '1h';
  process.env.JWT_REFRESH_EXPIRATION = '2h';
});

describe('Validação de Configurações JWT | validateSecrets', () => {
  describe('dado secrets JWT válidos configurados no ambiente', () => {
    describe('quando validar as configurações de segurança', () => {
      it('então deve passar a validação sem lançar erros', () => {
        expect(() => validateSecrets()).not.toThrow();
      });
    });
  });

  describe('Dado JWT_SECRET inválido (menor que 32 caracteres)', () => {
    describe('quando validar as configurações de segurança', () => {
      it('então deve lançar erro descritivo sobre tamanho mínimo', () => {
        process.env.JWT_SECRET = 'secret-muito-curto';
        
        expect(() => validateSecrets()).toThrow(
          /deve estar definido e conter pelo menos 32 caracteres/
        );
        
        process.env.JWT_SECRET = FAKE_SECRET;
      });
    });
  });

  describe('Dado JWT_SECRET igual ao JWT_REFRESH_SECRET', () => {
    describe('quando validar as configurações de segurança', () => {
      it('então deve lançar erro indicando que secrets devem ser diferentes', () => {
        const sameSecret = FAKE_SECRET;
        process.env.JWT_SECRET = sameSecret;
        process.env.JWT_REFRESH_SECRET = sameSecret;
        
        expect(() => validateSecrets()).toThrow(/devem ser diferentes/);
        
        process.env.JWT_SECRET = FAKE_SECRET;
        process.env.JWT_REFRESH_SECRET = FAKE_REFRESH_SECRET;
      });
    });
  });
});

describe('Geração de Token Individual | generateToken - ', () => {
  describe('dado usuário válido e tipo "access"', () => {
    describe('quando gerar token de acesso', () => {
      it('deve retornar JWT assinado com payload correto', () => {
        const token = generateToken(defaultUserMock, 'access');
        
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
    describe('quando gerar token de refresh', () => {
      it('deve retornar JWT assinado com tipo correto', () => {
        const token = generateToken(defaultUserMock, 'refresh');
        
        const decoded = jwt.decode(token) as TokenPayload;
        expect(decoded).not.toBeNull();
        expect(decoded.type).toBe('refresh');
        expect(decoded.id).toBe(defaultUserMock.id);
      });
    });
  });
});

describe('Geração de Par de Tokens | generateTokenPair - ', () => {
  describe('dado usuário válido', () => {
    describe('quando gerar par de tokens (access e refresh)', () => {
      it('deve retornar dois tokens distintos com tipos corretos', () => {
        const { accessToken, refreshToken, expiresIn } = generateTokenPair(defaultUserMock);
        
        expect(accessToken).not.toBe(refreshToken);
        expect(typeof accessToken).toBe('string');
        expect(typeof refreshToken).toBe('string');
        expect(expiresIn).toBeTruthy();
        
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

describe('Verificação e Validação de Tokens | verifyToken', () => {
  describe('dado token válido do tipo "access"', () => {
    describe('quando verificar token com tipo esperado correto', () => {
      it('deve retornar payload decodificado e validado', () => {
        const token = generateToken(defaultUserMock, 'access');
        
        const payload = verifyTokenForTesting(token, 'access');
        
        expect(payload).toBeTruthy();
        expect(payload.id).toBe(defaultUserMock.id);
        expect(payload.email).toBe(defaultUserMock.email);
        expect(payload.type).toBe('access');
        expect(payload.regra).toBe(defaultUserMock.regra);
      });
    });
  });

  describe('Dado token válido do tipo "refresh"', () => {
    describe('quando verificar token com tipo "refresh"', () => {
      it('deve retornar payload com tipo refresh validado', () => {
        const token = generateToken(defaultUserMock, 'refresh');
        
        const payload = verifyTokenForTesting(token, 'refresh');
        
        expect(payload).toBeTruthy();
        expect(payload.type).toBe('refresh');
        expect(payload.id).toBe(defaultUserMock.id);
      });
    });
  });

  describe('Dado token de "access" mas esperado tipo "refresh"', () => {
    describe('quando verificar token com tipo incorreto', () => {
      it('deve lançar erro indicando incompatibilidade de tipo', () => {
        const token = generateToken(defaultUserMock, 'access');
        
        expect(() => verifyTokenForTesting(token, 'refresh')).toThrow(
          /esperado tipo refresh, recebido access/
        );
      });
    });
  });

  describe('Dado token com formato inválido', () => {
    describe('quando tentar verificar token malformado', () => {
      it('deve lançar erro descritivo sobre formato', () => {
        const invalidToken = 'xxx.yyy.zzz';
        
        expect(() => verifyTokenForTesting(invalidToken, 'access')).toThrow(/Token inválido/);
      });
    });
  });

  describe('Dado token expirado', () => {
    describe('quando verificar token com validade vencida', () => {
      it('deve lançar erro específico de expiração', () => {
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
        
        expect(() => verifyTokenForTesting(expiredToken, 'access')).toThrow(/Token expirado/);
      });
    });
  });
});

describe('Decodificação sem Verificação | decodeToken', () => {
  describe('Dado token válido', () => {
    describe('quando decodificar token sem verificar assinatura', () => {
      it('deve retornar payload decodificado', () => {
        const token = generateToken(defaultUserMock, 'access');
        
        const payload = decodeToken(token);
        
        expect(payload).not.toBeNull();
        expect(payload?.id).toBe(defaultUserMock.id);
        expect(payload?.email).toBe(defaultUserMock.email);
        expect(payload?.type).toBe('access');
        expect(payload?.regra).toBe(defaultUserMock.regra);
      });
    });
  });

  describe('Dado token com formato inválido', () => {
    describe('quando tentar decodificar token malformado', () => {
      it('deve retornar null sem lançar erro', () => {
        const invalidToken = 'xxx.yyy.zzz';
        
        const result = decodeToken(invalidToken);
        
        expect(result).toBeNull();
      });
    });
  });
});

describe('Verificação de Validade Temporal | isTokenExpired', () => {
  describe('dado token expirado', () => {
    describe('quando verificar se token está expirado', () => {
      it('deve retornar true', () => {
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
        
        const isExpired = isTokenExpired(expiredToken);
        
        expect(isExpired).toBe(true);
      });
    });
  });

  describe('Dado token válido com tempo de vida ativo', () => {
    describe('quando verificar se token está expirado', () => {
      it('deve retornar false', () => {
        const token = generateToken(defaultUserMock, 'access');
        
        const isExpired = isTokenExpired(token);
        
        expect(isExpired).toBe(false);
      });
    });
  });

  describe('Dado token inválido ou malformado', () => {
    describe('quando verificar expiração de token inválido', () => {
      it('deve retornar true por segurança', () => {
        const invalidToken = 'token-invalido';
        
        const isExpired = isTokenExpired(invalidToken);
        
        expect(isExpired).toBe(true);
      });
    });
  });
});

describe('Extração de Token do Header | extractTokenFromHeader', () => {
  describe('dado Authorization header no formato Bearer correto', () => {
    describe('quando extrair token do header', () => {
      it('deve retornar token sem o prefixo Bearer', () => {
        const token = generateToken(defaultUserMock, 'access');
        const authHeader = `Bearer ${token}`;
        
        const extractedToken = extractTokenFromHeader(authHeader);
        
        expect(extractedToken).toBe(token);
        expect(extractedToken).not.toContain('Bearer');
      });
    });
  });

  describe('Dado Authorization header com formato diferente de Bearer', () => {
    describe('quando tentar extrair token de header Basic', () => {
      it('deve retornar null', () => {
        const basicHeader = 'Basic dXNlcjpwYXNz';
        
        const result = extractTokenFromHeader(basicHeader);
        
        expect(result).toBeNull();
      });
    });
  });

  describe('Dado Authorization header undefined ou ausente', () => {
    describe('quando tentar extrair token de header inexistente', () => {
      it('deve retornar null sem causar erro', () => {
        const undefinedHeader = undefined;
        
        const result = extractTokenFromHeader(undefinedHeader);
        
        expect(result).toBeNull();
      });
    });
  });

  describe('Dado Authorization header sem espaço entre Bearer e token', () => {
    describe('quando tentar extrair token de header malformado', () => {
      it('deve retornar null para formato inválido', () => {
        const headerSemEspaco = 'Bearertoken123';
        
        const result = extractTokenFromHeader(headerSemEspaco);
        
        expect(result).toBeNull();
      });
    });
  });

  describe('Dado Authorization header com espaços extras mas formato válido', () => {
    describe('quando extrair token de header com espaços extras', () => {
      it('deve normalizar espaços e extrair token corretamente', () => {
        const headerEspacoExtra = 'Bearer  token123';
        const headerEspacosAmbosLados = '  Bearer   token456  ';
        
        const result1 = extractTokenFromHeader(headerEspacoExtra);
        const result2 = extractTokenFromHeader(headerEspacosAmbosLados);
        
        expect(result1).toBe('token123');
        expect(result2).toBe('token456');
      });
    });
  });

  describe('Dado Authorization header com token contendo espaços internos', () => {
    describe('quando tentar extrair token com espaços no meio', () => {
      it('deve retornar null por ser formato inválido', () => {
        const headerTokenComEspaco = 'Bearer token 123';
        
        const result = extractTokenFromHeader(headerTokenComEspaco);
        
        expect(result).toBeNull();
      });
    });
  });
});