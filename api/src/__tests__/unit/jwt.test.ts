import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
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

    it('verifyToken deve usar secret correto para access token', () => {
      const token = jwt.sign(
        { id: 'test', regra: Regra.ADMIN, type: 'access' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', issuer: 'helpme-api', audience: 'helpme-client', expiresIn: '1h' }
      );
      
      const payload = jwtUtil.verifyToken(token, 'access');
      expect(payload.type).toBe('access');
    });

    it('verifyToken deve usar secret correto para refresh token', () => {
      const token = jwt.sign(
        { id: 'test', regra: Regra.ADMIN, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET!,
        { algorithm: 'HS256', issuer: 'helpme-api', audience: 'helpme-client', expiresIn: '7d' }
      );
      
      const payload = jwtUtil.verifyToken(token, 'refresh');
      expect(payload.type).toBe('refresh');
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

    it('deve retornar null para token que retorna null do jwt.decode', () => {
      const resultado = jwtUtil.decodeToken('not.a.valid.jwt');
      expect(resultado).toBeNull();
    });

    it('deve decodificar token mesmo sem verificação de assinatura', () => {
      const tokenComSecretDiferente = jwt.sign(
        { id: 'abc', regra: Regra.USUARIO, type: 'access' },
        'outro-secret-completamente-diferente-123456789',
        { algorithm: 'HS256' }
      );
      
      const payload = jwtUtil.decodeToken(tokenComSecretDiferente);
      expect(payload).not.toBeNull();
      expect(payload?.id).toBe('abc');
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

    it('isTokenExpired deve processar corretamente token com exp válido', () => {
      const tokenValido = jwt.sign(
        { id: 'user', regra: Regra.USUARIO },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      
      expect(jwtUtil.isTokenExpired(tokenValido)).toBe(false);
    });

    it('isTokenExpired deve retornar true para token expirado há muito tempo', () => {
      const tokenExpirado = jwt.sign(
        { id: 'user', regra: Regra.USUARIO },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', expiresIn: '-10h' }
      );
      
      expect(jwtUtil.isTokenExpired(tokenExpirado)).toBe(true);
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