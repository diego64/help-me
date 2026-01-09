import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from 'vitest';
import * as jwtUtil from '../../auth/jwt';
import jwt from 'jsonwebtoken';
import { Regra } from '@prisma/client';

type Usuario = {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  password: string;
  regra: Regra;
  setor: any;
  telefone: string | null;
  ramal: string | null;
  avatarUrl: string | null;
  geradoEm: Date;
  atualizadoEm: Date;
  deletadoEm: Date | null;
  ativo: boolean;
  refreshToken: string | null;
};

const ORIGINAL_ENV = { ...process.env };

const JWT_SECRET_VALIDO = '12345678901234567890123456789012XYZ!';
const JWT_REFRESH_SECRET_VALIDO = 'abcdeabcdeabcdeabcdeabcdeabcdeabcdeXYZ!';
const JWT_EXPIRATION_VALIDO = '8h';
const JWT_REFRESH_EXPIRATION_VALIDO = '7d';

const mockUsuarioValido: Usuario = {
  id: 'user1',
  nome: 'Usuário',
  sobrenome: 'Teste',
  email: 'u@teste.com',
  password: 'senhaForte123',
  regra: Regra.USUARIO,
  setor: null,
  telefone: null,
  ramal: null,
  avatarUrl: null,
  geradoEm: new Date(),
  atualizadoEm: new Date(),
  deletadoEm: null,
  ativo: true,
  refreshToken: null
};

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET_VALIDO;
  process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET_VALIDO;
  process.env.JWT_EXPIRATION = JWT_EXPIRATION_VALIDO;
  process.env.JWT_REFRESH_EXPIRATION = JWT_REFRESH_EXPIRATION_VALIDO;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('JWT Utils', () => {
  describe('validateSecrets', () => {
    it('deve validar secrets JWT válidos sem lançar erro', () => {
      expect(() => jwtUtil.validateSecrets()).not.toThrow();
    });

    it('deve lançar erro quando JWT_SECRET for undefined', () => {
      delete process.env.JWT_SECRET;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('deve lançar erro quando JWT_SECRET for vazio', () => {
      process.env.JWT_SECRET = '';
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('deve lançar erro quando JWT_SECRET for muito curto', () => {
      process.env.JWT_SECRET = 'curto';
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('deve lançar erro quando JWT_REFRESH_SECRET for undefined', () => {
      delete process.env.JWT_REFRESH_SECRET;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('deve lançar erro quando JWT_REFRESH_SECRET for vazio', () => {
      process.env.JWT_REFRESH_SECRET = '';
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('deve lançar erro quando JWT_REFRESH_SECRET for muito curto', () => {
      process.env.JWT_REFRESH_SECRET = 'curto';
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('deve lançar erro quando secrets forem idênticos', () => {
      const secretIdentico = 'igualigualigualigualigualigualigualigual';
      process.env.JWT_SECRET = secretIdentico;
      process.env.JWT_REFRESH_SECRET = secretIdentico;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes.'
      );
    });
  });

  describe('generateToken', () => {
    it('deve gerar token de acesso válido', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('deve gerar token de refresh válido', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('deve usar valor padrão 8h quando JWT_EXPIRATION não estiver definido', () => {
      delete process.env.JWT_EXPIRATION;
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      expect(token).toBeTruthy();
    });

    it('deve usar valor padrão 7d quando JWT_REFRESH_EXPIRATION não estiver definido', () => {
      delete process.env.JWT_REFRESH_EXPIRATION;
      const token = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      expect(token).toBeTruthy();
    });

    it('deve incluir payload correto no token', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      
      expect(decoded.id).toBe(mockUsuarioValido.id);
      expect(decoded.email).toBe(mockUsuarioValido.email);
      expect(decoded.regra).toBe(mockUsuarioValido.regra);
      expect(decoded.type).toBe('access');
    });
  });

  describe('generateTokenPair', () => {
    it('deve gerar par de tokens com expiração', () => {
      const tokens = jwtUtil.generateTokenPair(mockUsuarioValido);

      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
      expect(tokens.expiresIn).toBe(JWT_EXPIRATION_VALIDO);
    });

    it('deve usar valor padrão 8h quando JWT_EXPIRATION não estiver definido', () => {
      delete process.env.JWT_EXPIRATION;
      const tokens = jwtUtil.generateTokenPair(mockUsuarioValido);

      expect(tokens.expiresIn).toBe('8h');
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
    });
  });

  describe('verifyToken', () => {
    it('deve verificar token de acesso válido', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payload = jwtUtil.verifyToken(token, 'access');

      expect(payload.id).toBe(mockUsuarioValido.id);
      expect(payload.type).toBe('access');
    });

    it('deve verificar token de refresh válido', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      const payload = jwtUtil.verifyToken(token, 'refresh');

      expect(payload.id).toBe(mockUsuarioValido.id);
      expect(payload.type).toBe('refresh');
    });

    it('deve usar access como tipo padrão quando não especificado', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payload = jwtUtil.verifyToken(token);

      expect(payload.type).toBe('access');
    });

    it('deve lançar erro quando token de acesso for verificado como refresh', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      expect(() => jwtUtil.verifyToken(token, 'refresh')).toThrow('Token inválido');
    });

    it('deve lançar erro quando token de refresh for verificado como access', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      expect(() => jwtUtil.verifyToken(token, 'access')).toThrow('Token inválido');
    });

    it('deve lançar erro quando token for malformado', () => {
      expect(() => jwtUtil.verifyToken('invalido', 'access')).toThrow(/Token inválido/);
    });

    it('deve lançar erro quando token estiver expirado', () => {
      const tokenExpirado = jwt.sign(
        { id: 'x', regra: Regra.USUARIO, type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '-10s', algorithm: 'HS256', issuer: 'helpme-api', audience: 'helpme-client' }
      );

      expect(() => jwtUtil.verifyToken(tokenExpirado, 'access')).toThrow(/expirado/);
    });

    it('deve lançar erro quando assinatura for inválida', () => {
      const tokenInvalido = jwt.sign(
        { id: 'user1', regra: Regra.USUARIO, type: 'access' },
        'segredo-invalido-qualquer-coisa-aqui',
        { expiresIn: '1h', algorithm: 'HS256' }
      );

      expect(() => jwtUtil.verifyToken(tokenInvalido, 'access')).toThrow(/Token inválido/);
    });

    // ========================================================================
    // 🎯 TESTE CRÍTICO PARA LINHA 73 - Relançar erro não-JWT
    // ========================================================================
    it('deve relançar TypeError quando não for erro JWT (linha 73)', () => {
      const verifySpy = vi.spyOn(jwt, 'verify');
      
      // Mocka para lançar TypeError (não é JsonWebTokenError)
      verifySpy.mockImplementation(() => {
        throw new TypeError('Cannot read property of undefined');
      });

      // Deve relançar o TypeError
      expect(() => jwtUtil.verifyToken('token-teste', 'access'))
        .toThrow(TypeError);

      verifySpy.mockRestore();
    });

    it('deve relançar RangeError quando não for erro JWT (linha 73)', () => {
      const verifySpy = vi.spyOn(jwt, 'verify');
      
      verifySpy.mockImplementation(() => {
        throw new RangeError('Valor fora do intervalo');
      });

      expect(() => jwtUtil.verifyToken('xyz', 'access')).toThrow(RangeError);

      verifySpy.mockRestore();
    });

    it('deve relançar ReferenceError quando não for erro JWT (linha 73)', () => {
      const verifySpy = vi.spyOn(jwt, 'verify');
      
      verifySpy.mockImplementation(() => {
        throw new ReferenceError('Variable is not defined');
      });

      expect(() => jwtUtil.verifyToken('abc', 'refresh')).toThrow(ReferenceError);

      verifySpy.mockRestore();
    });

    it('deve relançar SyntaxError quando não for erro JWT (linha 73)', () => {
      const verifySpy = vi.spyOn(jwt, 'verify');
      
      verifySpy.mockImplementation(() => {
        throw new SyntaxError('Unexpected token');
      });

      expect(() => jwtUtil.verifyToken('malformed', 'access')).toThrow(SyntaxError);

      verifySpy.mockRestore();
    });

    it('deve relançar erro customizado quando não for erro JWT (linha 73)', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const verifySpy = vi.spyOn(jwt, 'verify');
      
      verifySpy.mockImplementation(() => {
        throw new CustomError('Erro personalizado do sistema');
      });

      expect(() => jwtUtil.verifyToken('token', 'access')).toThrow(CustomError);

      verifySpy.mockRestore();
    });
  });

  describe('decodeToken', () => {
    it('deve decodificar token válido sem verificação', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payload = jwtUtil.decodeToken(token);

      expect(payload?.id).toBe(mockUsuarioValido.id);
      expect(payload?.email).toBe(mockUsuarioValido.email);
    });

    it('deve retornar null quando token for inválido', () => {
      expect(jwtUtil.decodeToken('abc')).toBeNull();
    });

    it('deve retornar null quando token for vazio', () => {
      expect(jwtUtil.decodeToken('')).toBeNull();
    });

    it('deve retornar null quando token for malformado', () => {
      expect(jwtUtil.decodeToken('@@#$%^&*()')).toBeNull();
    });

    // ========================================================================
    // 🎯 TESTE CRÍTICO PARA LINHA 121 - Retornar null quando decode lançar erro
    // ========================================================================
    it('deve retornar null quando jwt.decode lançar Error (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode');
      
      // Força jwt.decode a lançar um erro
      decodeSpy.mockImplementation(() => {
        throw new Error('Erro interno ao decodificar');
      });

      const resultado = jwtUtil.decodeToken('token-problema');
      
      expect(resultado).toBeNull();

      decodeSpy.mockRestore();
    });

    it('deve retornar null quando jwt.decode lançar TypeError (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode');
      
      decodeSpy.mockImplementation(() => {
        throw new TypeError('Invalid argument type');
      });

      expect(jwtUtil.decodeToken('bad-token')).toBeNull();

      decodeSpy.mockRestore();
    });

    it('deve retornar null quando jwt.decode lançar SyntaxError (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode');
      
      decodeSpy.mockImplementation(() => {
        throw new SyntaxError('Malformed JSON');
      });

      expect(jwtUtil.decodeToken('invalid-json')).toBeNull();

      decodeSpy.mockRestore();
    });

    it('deve retornar null quando jwt.decode lançar RangeError (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode');
      
      decodeSpy.mockImplementation(() => {
        throw new RangeError('Out of range');
      });

      expect(jwtUtil.decodeToken('out-of-range')).toBeNull();

      decodeSpy.mockRestore();
    });

    it('deve retornar null quando jwt.decode lançar ReferenceError (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode');
      
      decodeSpy.mockImplementation(() => {
        throw new ReferenceError('Variable undefined');
      });

      expect(jwtUtil.decodeToken('ref-error')).toBeNull();

      decodeSpy.mockRestore();
    });

    it('deve retornar null para qualquer exceção durante decode (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode');
      
      // Lança uma string como erro (edge case)
      decodeSpy.mockImplementation(() => {
        throw 'String como erro';
      });

      expect(jwtUtil.decodeToken('string-error')).toBeNull();

      decodeSpy.mockRestore();
    });
  });

  describe('isTokenExpired', () => {
    it('deve retornar false para token recém gerado', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      expect(jwtUtil.isTokenExpired(token)).toBe(false);
    });

    it('deve retornar true quando token for inválido', () => {
      expect(jwtUtil.isTokenExpired('abc')).toBe(true);
    });

    it('deve retornar true quando token for vazio', () => {
      expect(jwtUtil.isTokenExpired('')).toBe(true);
    });

    it('deve retornar true quando token não tiver campo exp', () => {
      const tokenSemExp = jwt.sign(
        { id: 'x', regra: 'USUARIO' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', noTimestamp: true }
      );

      expect(jwtUtil.isTokenExpired(tokenSemExp)).toBe(true);
    });

    it('deve retornar true quando token estiver expirado', () => {
      const tokenExpirado = jwt.sign(
        { id: 'x', regra: 'USUARIO', type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h', algorithm: 'HS256' }
      );

      expect(jwtUtil.isTokenExpired(tokenExpirado)).toBe(true);
    });

    it('deve retornar true quando ocorrer erro no decode', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode');
      
      decodeSpy.mockImplementation(() => {
        throw new Error('Decode error');
      });

      expect(jwtUtil.isTokenExpired('token')).toBe(true);

      decodeSpy.mockRestore();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('deve extrair token de header Bearer válido', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer abc123')).toBe('abc123');
    });

    it('deve retornar null quando formato for inválido', () => {
      expect(jwtUtil.extractTokenFromHeader('Token abc')).toBeNull();
    });

    it('deve retornar null quando header for undefined', () => {
      expect(jwtUtil.extractTokenFromHeader()).toBeNull();
    });

    it('deve retornar null quando header for vazio', () => {
      expect(jwtUtil.extractTokenFromHeader('')).toBeNull();
    });

    it('deve retornar null quando Bearer não tiver token', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer ')).toBeNull();
    });

    it('deve retornar null quando só tiver Bearer', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer')).toBeNull();
    });

    it('deve funcionar com bearer em lowercase', () => {
      expect(jwtUtil.extractTokenFromHeader('bearer token123')).toBe('token123');
    });

    it('deve funcionar com Bearer em mixed case', () => {
      expect(jwtUtil.extractTokenFromHeader('BeArEr token456')).toBe('token456');
    });

    it('deve retornar null quando header tiver mais de 2 partes', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer token parte3')).toBeNull();
    });

    it('deve lidar com espaços extras entre Bearer e token', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer   token123')).toBe('token123');
    });

    it('deve retornar null quando token contiver espaços', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer token com espacos')).toBeNull();
    });

    it('deve retornar null quando Bearer tiver apenas espaços', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer      ')).toBeNull();
    });
  });

  describe('Casos adicionais', () => {
    it('payload deve conter todos os campos esperados', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payload = jwtUtil.decodeToken(token);

      expect(payload?.id).toBe(mockUsuarioValido.id);
      expect(payload?.email).toBe(mockUsuarioValido.email);
      expect(payload?.regra).toBe(mockUsuarioValido.regra);
      expect(payload?.type).toBe('access');
    });

    it('token refresh deve conter regra e type corretos', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      const payload = jwtUtil.verifyToken(token, 'refresh');

      expect(payload.regra).toBe(Regra.USUARIO);
      expect(payload.type).toBe('refresh');
    });

    it('token decodificado sem id deve retornar payload', () => {
      const tokenSemId = jwt.sign(
        { regra: 'USUARIO' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256' }
      );

      const payload = jwtUtil.decodeToken(tokenSemId);
      expect(payload).toBeDefined();
      expect(payload?.id).toBeUndefined();
    });
  });
});