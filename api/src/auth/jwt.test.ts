import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as jwtUtil from './jwt';
import jwt from 'jsonwebtoken';
import { Regra } from '@prisma/client';

// ============================================================================
// DEFINIÇÕES DE TIPOS
// ============================================================================

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
  ativo: boolean;
  refreshToken: string | null;
};

// ============================================================================
// CONFIGURAÇÃO DOS TESTES
// ============================================================================

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
  ativo: true,
  refreshToken: null,
};

// ============================================================================
// SETUP E TEARDOWN
// ============================================================================

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET_VALIDO;
  process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET_VALIDO;
  process.env.JWT_EXPIRATION = JWT_EXPIRATION_VALIDO;
  process.env.JWT_REFRESH_EXPIRATION = JWT_REFRESH_EXPIRATION_VALIDO;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ============================================================================
// SUITE DE TESTES: JWT UTILS
// ============================================================================

describe('JWT Utils', () => {
  // ==========================================================================
  // validateSecrets()
  // ==========================================================================

  describe('validateSecrets', () => {
    it('Dado secrets JWT válidos, Quando validar secrets, Então não deve lançar erro', () => {
      // Arrange
      // Secrets já configurados no beforeEach
      
      // Act & Assert
      expect(() => jwtUtil.validateSecrets()).not.toThrow();
    });

    it('Dado JWT_SECRET inválido (muito curto), Quando validar secrets, Então deve lançar erro específico', () => {
      // Arrange
      const secretCurtoInvalido = 'curto';
      process.env.JWT_SECRET = secretCurtoInvalido;
      process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET_VALIDO;
      
      // Act & Assert
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_REFRESH_SECRET inválido (muito curto), Quando validar secrets, Então deve lançar erro específico', () => {
      // Arrange
      const refreshSecretCurtoInvalido = 'curto';
      process.env.JWT_SECRET = JWT_SECRET_VALIDO;
      process.env.JWT_REFRESH_SECRET = refreshSecretCurtoInvalido;
      
      // Act & Assert
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_SECRET e JWT_REFRESH_SECRET idênticos, Quando validar secrets, Então deve lançar erro sobre secrets diferentes', () => {
      // Arrange
      const secretIdentico = 'igualigualigualigualigualigualigualigual';
      process.env.JWT_SECRET = secretIdentico;
      process.env.JWT_REFRESH_SECRET = secretIdentico;
      
      // Act & Assert
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes.'
      );
    });
  });

  // ==========================================================================
  // generateToken()
  // ==========================================================================

  describe('generateToken', () => {
    it('Dado dados de usuário válidos, Quando gerar token de acesso, Então deve retornar token string válido', () => {
      // Arrange
      const tipoToken = 'access';
      
      // Act
      const tokenAcessoGerado = jwtUtil.generateToken(mockUsuarioValido, tipoToken);
      
      // Assert
      expect(tokenAcessoGerado).toBeTruthy();
      expect(typeof tokenAcessoGerado).toBe('string');
      expect(tokenAcessoGerado.length).toBeGreaterThan(0);
    });

    it('Dado dados de usuário válidos, Quando gerar token de refresh, Então deve retornar token string válido', () => {
      // Arrange
      const tipoToken = 'refresh';
      
      // Act
      const tokenRefreshGerado = jwtUtil.generateToken(mockUsuarioValido, tipoToken);
      
      // Assert
      expect(tokenRefreshGerado).toBeTruthy();
      expect(typeof tokenRefreshGerado).toBe('string');
      expect(tokenRefreshGerado.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // generateTokenPair()
  // ==========================================================================

  describe('generateTokenPair', () => {
    it('Dado dados de usuário válidos, Quando gerar par de tokens, Então deve retornar tokens de acesso e refresh com expiração', () => {
      // Arrange
      // mockUsuarioValido já disponível
      
      // Act
      const parDeTokens = jwtUtil.generateTokenPair(mockUsuarioValido);
      
      // Assert
      expect(parDeTokens).toBeDefined();
      expect(parDeTokens.accessToken).toBeTruthy();
      expect(parDeTokens.refreshToken).toBeTruthy();
      expect(parDeTokens.expiresIn).toBe(JWT_EXPIRATION_VALIDO);
      expect(typeof parDeTokens.accessToken).toBe('string');
      expect(typeof parDeTokens.refreshToken).toBe('string');
    });
  });

  // ==========================================================================
  // verifyToken()
  // ==========================================================================

  describe('verifyToken', () => {
    it('Dado token de acesso válido, Quando verificar com tipo correto, Então deve retornar payload decodificado com id do usuário', () => {
      // Arrange
      const tokenAcesso = jwtUtil.generateToken(mockUsuarioValido, 'access');
      
      // Act
      const payloadDecodificado = jwtUtil.verifyToken(tokenAcesso, 'access');
      
      // Assert
      expect(payloadDecodificado).toBeDefined();
      expect(payloadDecodificado.id).toBe('user1');
      expect(payloadDecodificado.id).toBe(mockUsuarioValido.id);
    });

    it('Dado token de refresh válido, Quando verificar com tipo correto, Então deve retornar payload decodificado com id do usuário', () => {
      // Arrange
      const tokenRefresh = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      
      // Act
      const payloadDecodificado = jwtUtil.verifyToken(tokenRefresh, 'refresh');
      
      // Assert
      expect(payloadDecodificado).toBeDefined();
      expect(payloadDecodificado.id).toBe('user1');
      expect(payloadDecodificado.id).toBe(mockUsuarioValido.id);
    });

    it('Dado token de acesso, Quando verificar com tipo errado (refresh), Então deve lançar erro de token inválido', () => {
      // Arrange
      const tokenAcesso = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const tipoTokenErrado = 'refresh';
      
      // Act & Assert
      expect(() => jwtUtil.verifyToken(tokenAcesso, tipoTokenErrado)).toThrow('Token inválido');
    });

    it('Dado string de token malformada, Quando verificar token, Então deve lançar erro de token inválido', () => {
      // Arrange
      const tokenMalformado = 'invalido';
      
      // Act & Assert
      expect(() => jwtUtil.verifyToken(tokenMalformado, 'access')).toThrow(/Token inválido/);
    });

    it('Dado token expirado, Quando verificar token, Então deve lançar erro de expirado ou inválido', () => {
      // Arrange
      const tokenExpirado = jwt.sign(
        {
          id: 'x',
          regra: Regra.USUARIO,
          type: 'access',
        },
        process.env.JWT_SECRET!,
        {
          expiresIn: '-10s',
          algorithm: 'HS256',
          issuer: 'helpme-api',
          audience: 'helpme-client',
        }
      );
      
      // Act & Assert
      expect(() => jwtUtil.verifyToken(tokenExpirado, 'access')).toThrow(/expirado|invalid/);
    });
  });

  // ==========================================================================
  // decodeToken()
  // ==========================================================================

  describe('decodeToken', () => {
    it('Dado token válido, Quando decodificar sem verificação, Então deve retornar payload com id do usuário', () => {
      // Arrange
      const tokenValido = jwtUtil.generateToken(mockUsuarioValido, 'access');
      
      // Act
      const payloadDecodificado = jwtUtil.decodeToken(tokenValido);
      
      // Assert
      expect(payloadDecodificado).not.toBeNull();
      expect(payloadDecodificado?.id).toBe('user1');
      expect(payloadDecodificado?.id).toBe(mockUsuarioValido.id);
    });

    it('Dado string de token inválida, Quando decodificar token, Então deve retornar null', () => {
      // Arrange
      const tokenInvalido = 'abc';
      
      // Act
      const payloadDecodificado = jwtUtil.decodeToken(tokenInvalido);
      
      // Assert
      expect(payloadDecodificado).toBeNull();
    });

    it('Dado token vazio, Quando decodificar token, Então deve retornar null', () => {
      // Arrange
      const tokenVazio = '';
      
      // Act
      const payloadDecodificado = jwtUtil.decodeToken(tokenVazio);
      
      // Assert
      expect(payloadDecodificado).toBeNull();
    });

    it('Dado token malformado com caracteres especiais, Quando decodificar token, Então deve retornar null', () => {
      // Arrange
      const tokenMalformado = '@@#$%^&*()';
      
      // Act
      const payloadDecodificado = jwtUtil.decodeToken(tokenMalformado);
      
      // Assert
      expect(payloadDecodificado).toBeNull();
    });
  });

  // ==========================================================================
  // isTokenExpired()
  // ==========================================================================

  describe('isTokenExpired', () => {
    it('Dado token recém gerado, Quando verificar expiração, Então deve retornar false', () => {
      // Arrange
      const tokenFresco = jwtUtil.generateToken(mockUsuarioValido, 'access');
      
      // Act
      const estaExpirado = jwtUtil.isTokenExpired(tokenFresco);
      
      // Assert
      expect(estaExpirado).toBe(false);
    });

    it('Dado string de token inválida, Quando verificar expiração, Então deve retornar true', () => {
      // Arrange
      const tokenInvalido = 'abc';
      
      // Act
      const estaExpirado = jwtUtil.isTokenExpired(tokenInvalido);
      
      // Assert
      expect(estaExpirado).toBe(true);
    });

    it('Dado token vazio, Quando verificar expiração, Então deve retornar true', () => {
      // Arrange
      const tokenVazio = '';
      
      // Act
      const estaExpirado = jwtUtil.isTokenExpired(tokenVazio);
      
      // Assert
      expect(estaExpirado).toBe(true);
    });

    it('Dado token sem campo exp, Quando verificar expiração, Então deve retornar true', () => {
      // Arrange
      const tokenSemExp = jwt.sign(
        { id: 'x', regra: 'USUARIO' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', noTimestamp: true }
      );
      
      // Act
      const estaExpirado = jwtUtil.isTokenExpired(tokenSemExp);
      
      // Assert
      expect(estaExpirado).toBe(true);
    });
  });

  // ==========================================================================
  // extractTokenFromHeader()
  // ==========================================================================

  describe('extractTokenFromHeader', () => {
    it('Dado header de autorização Bearer válido, Quando extrair token, Então deve retornar string do token', () => {
      // Arrange
      const headerAutorizacao = 'Bearer abc123';
      const tokenEsperado = 'abc123';
      
      // Act
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerAutorizacao);
      
      // Assert
      expect(tokenExtraido).toBe(tokenEsperado);
      expect(tokenExtraido).not.toBeNull();
    });

    it('Dado formato de header de autorização inválido (prefixo Token), Quando extrair token, Então deve retornar null', () => {
      // Arrange
      const headerAutorizacaoInvalido = 'Token abc';
      
      // Act
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerAutorizacaoInvalido);
      
      // Assert
      expect(tokenExtraido).toBeNull();
    });

    it('Dado nenhum header de autorização, Quando extrair token, Então deve retornar null', () => {
      // Arrange
      // Sem header
      
      // Act
      const tokenExtraido = jwtUtil.extractTokenFromHeader();
      
      // Assert
      expect(tokenExtraido).toBeNull();
    });
  });
});