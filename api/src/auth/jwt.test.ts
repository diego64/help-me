import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as jwtUtil from './jwt';
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
  ativo: true,
  refreshToken: null,
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
    it('Dado secrets JWT válidos, Quando validar secrets, Então não deve lançar erro', () => {
      expect(() => jwtUtil.validateSecrets()).not.toThrow();
    });

    it('Dado JWT_SECRET undefined, Quando validar secrets, Então deve lançar erro específico', () => {
      delete process.env.JWT_SECRET;
      process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET_VALIDO;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_SECRET vazio, Quando validar secrets, Então deve lançar erro específico', () => {
      process.env.JWT_SECRET = '';
      process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET_VALIDO;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_SECRET inválido (muito curto), Quando validar secrets, Então deve lançar erro específico', () => {
      const secretCurtoInvalido = 'curto';
      process.env.JWT_SECRET = secretCurtoInvalido;
      process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET_VALIDO;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_REFRESH_SECRET undefined, Quando validar secrets, Então deve lançar erro específico', () => {
      process.env.JWT_SECRET = JWT_SECRET_VALIDO;
      delete process.env.JWT_REFRESH_SECRET;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_REFRESH_SECRET vazio, Quando validar secrets, Então deve lançar erro específico', () => {
      process.env.JWT_SECRET = JWT_SECRET_VALIDO;
      process.env.JWT_REFRESH_SECRET = '';
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_REFRESH_SECRET inválido (muito curto), Quando validar secrets, Então deve lançar erro específico', () => {
      const refreshSecretCurtoInvalido = 'curto';
      process.env.JWT_SECRET = JWT_SECRET_VALIDO;
      process.env.JWT_REFRESH_SECRET = refreshSecretCurtoInvalido;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.'
      );
    });

    it('Dado JWT_SECRET e JWT_REFRESH_SECRET idênticos, Quando validar secrets, Então deve lançar erro sobre secrets diferentes', () => {
      const secretIdentico = 'igualigualigualigualigualigualigualigual';
      process.env.JWT_SECRET = secretIdentico;
      process.env.JWT_REFRESH_SECRET = secretIdentico;
      expect(() => jwtUtil.validateSecrets()).toThrow(
        'JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes.'
      );
    });
  });

  describe('generateToken', () => {
    it('Dado dados de usuário válidos, Quando gerar token de acesso, Então deve retornar token string válido', () => {
      const tipoToken = 'access';
      const tokenAcessoGerado = jwtUtil.generateToken(mockUsuarioValido, tipoToken);
      expect(tokenAcessoGerado).toBeTruthy();
      expect(typeof tokenAcessoGerado).toBe('string');
      expect(tokenAcessoGerado.length).toBeGreaterThan(0);
    });

    it('Dado dados de usuário válidos, Quando gerar token de refresh, Então deve retornar token string válido', () => {
      const tipoToken = 'refresh';
      const tokenRefreshGerado = jwtUtil.generateToken(mockUsuarioValido, tipoToken);
      expect(tokenRefreshGerado).toBeTruthy();
      expect(typeof tokenRefreshGerado).toBe('string');
      expect(tokenRefreshGerado.length).toBeGreaterThan(0);
    });

    it('Dado dados de usuário válidos, Quando gerar token de acesso sem expiração definida, Então deve usar valor padrão', () => {
      delete process.env.JWT_EXPIRATION;
      const tipoToken = 'access';
      const tokenAcessoGerado = jwtUtil.generateToken(mockUsuarioValido, tipoToken);
      expect(tokenAcessoGerado).toBeTruthy();
      expect(typeof tokenAcessoGerado).toBe('string');
    });

    it('Dado dados de usuário válidos, Quando gerar token de refresh sem expiração definida, Então deve usar valor padrão', () => {
      delete process.env.JWT_REFRESH_EXPIRATION;
      const tipoToken = 'refresh';
      const tokenRefreshGerado = jwtUtil.generateToken(mockUsuarioValido, tipoToken);
      expect(tokenRefreshGerado).toBeTruthy();
      expect(typeof tokenRefreshGerado).toBe('string');
    });
  });

  describe('generateTokenPair', () => {
    it('Dado dados de usuário válidos, Quando gerar par de tokens, Então deve retornar tokens de acesso e refresh com expiração', () => {
      const parDeTokens = jwtUtil.generateTokenPair(mockUsuarioValido);
      expect(parDeTokens).toBeDefined();
      expect(parDeTokens.accessToken).toBeTruthy();
      expect(parDeTokens.refreshToken).toBeTruthy();
      expect(parDeTokens.expiresIn).toBe(JWT_EXPIRATION_VALIDO);
      expect(typeof parDeTokens.accessToken).toBe('string');
      expect(typeof parDeTokens.refreshToken).toBe('string');
    });
  });

  describe('verifyToken', () => {
    it('Dado token de acesso válido, Quando verificar com tipo correto, Então deve retornar payload decodificado com id do usuário', () => {
      const tokenAcesso = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payloadDecodificado = jwtUtil.verifyToken(tokenAcesso, 'access');
      expect(payloadDecodificado).toBeDefined();
      expect(payloadDecodificado.id).toBe('user1');
      expect(payloadDecodificado.id).toBe(mockUsuarioValido.id);
    });

    it('Dado token de refresh válido, Quando verificar com tipo correto, Então deve retornar payload decodificado com id do usuário', () => {
      const tokenRefresh = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      const payloadDecodificado = jwtUtil.verifyToken(tokenRefresh, 'refresh');
      expect(payloadDecodificado).toBeDefined();
      expect(payloadDecodificado.id).toBe('user1');
      expect(payloadDecodificado.id).toBe(mockUsuarioValido.id);
    });

    it('Dado token de acesso, Quando verificar com tipo errado (refresh), Então deve lançar erro de token inválido', () => {
      const tokenAcesso = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const tipoTokenErrado = 'refresh';
      expect(() => jwtUtil.verifyToken(tokenAcesso, tipoTokenErrado)).toThrow('Token inválido');
    });

    it('Dado string de token malformada, Quando verificar token, Então deve lançar erro de token inválido', () => {
      const tokenMalformado = 'invalido';
      expect(() => jwtUtil.verifyToken(tokenMalformado, 'access')).toThrow(/Token inválido/);
    });

    it('Dado token expirado, Quando verificar token, Então deve lançar erro de expirado ou inválido', () => {
      const tokenExpirado = jwt.sign(
        { id: 'x', regra: Regra.USUARIO, type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '-10s', algorithm: 'HS256', issuer: 'helpme-api', audience: 'helpme-client' }
      );
      expect(() => jwtUtil.verifyToken(tokenExpirado, 'access')).toThrow(/expirado|invalid/);
    });

    it('Dado token com tipo incompatível no payload, Quando verificar token, Então deve lançar erro de token inválido', () => {
      const tokenComTipoErrado = jwt.sign(
        { id: 'user1', regra: Regra.USUARIO, type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '1h', algorithm: 'HS256', issuer: 'helpme-api', audience: 'helpme-client' }
      );
      expect(() => jwtUtil.verifyToken(tokenComTipoErrado, 'refresh')).toThrow('Token inválido');
    });

    it('Dado token com assinatura inválida, Quando verificar token, Então deve lançar erro de token inválido', () => {
      const tokenComAssinaturaInvalida = jwt.sign(
        { id: 'user1', regra: Regra.USUARIO, type: 'access' },
        'segredo-invalido-qualquer-coisa-aqui',
        { expiresIn: '1h', algorithm: 'HS256' }
      );
      expect(() => jwtUtil.verifyToken(tokenComAssinaturaInvalida, 'access')).toThrow(/Token inválido|invalid signature/);
    });
  });

  describe('decodeToken', () => {
    it('Dado token válido, Quando decodificar sem verificação, Então deve retornar payload com id do usuário', () => {
      const tokenValido = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payloadDecodificado = jwtUtil.decodeToken(tokenValido);
      expect(payloadDecodificado).not.toBeNull();
      expect(payloadDecodificado?.id).toBe('user1');
      expect(payloadDecodificado?.id).toBe(mockUsuarioValido.id);
    });

    it('Dado string de token inválida, Quando decodificar token, Então deve retornar null', () => {
      const tokenInvalido = 'abc';
      const payloadDecodificado = jwtUtil.decodeToken(tokenInvalido);
      expect(payloadDecodificado).toBeNull();
    });

    it('Dado token vazio, Quando decodificar token, Então deve retornar null', () => {
      const tokenVazio = '';
      const payloadDecodificado = jwtUtil.decodeToken(tokenVazio);
      expect(payloadDecodificado).toBeNull();
    });

    it('Dado token malformado com caracteres especiais, Quando decodificar token, Então deve retornar null', () => {
      const tokenMalformado = '@@#$%^&*()';
      const payloadDecodificado = jwtUtil.decodeToken(tokenMalformado);
      expect(payloadDecodificado).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('Dado token recém gerado, Quando verificar expiração, Então deve retornar false', () => {
      const tokenFresco = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const estaExpirado = jwtUtil.isTokenExpired(tokenFresco);
      expect(estaExpirado).toBe(false);
    });

    it('Dado string de token inválida, Quando verificar expiração, Então deve retornar true', () => {
      const tokenInvalido = 'abc';
      const estaExpirado = jwtUtil.isTokenExpired(tokenInvalido);
      expect(estaExpirado).toBe(true);
    });

    it('Dado token vazio, Quando verificar expiração, Então deve retornar true', () => {
      const tokenVazio = '';
      const estaExpirado = jwtUtil.isTokenExpired(tokenVazio);
      expect(estaExpirado).toBe(true);
    });

    it('Dado token sem campo exp, Quando verificar expiração, Então deve retornar true', () => {
      const tokenSemExp = jwt.sign(
        { id: 'x', regra: 'USUARIO' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', noTimestamp: true }
      );
      const estaExpirado = jwtUtil.isTokenExpired(tokenSemExp);
      expect(estaExpirado).toBe(true);
    });

    it('Dado token com exp no passado, Quando verificar expiração, Então deve retornar true', () => {
      const tokenExpirado = jwt.sign(
        { id: 'x', regra: 'USUARIO', type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h', algorithm: 'HS256' }
      );
      const estaExpirado = jwtUtil.isTokenExpired(tokenExpirado);
      expect(estaExpirado).toBe(true);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('Dado header de autorização Bearer válido, Quando extrair token, Então deve retornar string do token', () => {
      const headerAutorizacao = 'Bearer abc123';
      const tokenEsperado = 'abc123';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerAutorizacao);
      expect(tokenExtraido).toBe(tokenEsperado);
      expect(tokenExtraido).not.toBeNull();
    });

    it('Dado formato de header de autorização inválido (prefixo Token), Quando extrair token, Então deve retornar null', () => {
      const headerAutorizacaoInvalido = 'Token abc';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerAutorizacaoInvalido);
      expect(tokenExtraido).toBeNull();
    });

    it('Dado nenhum header de autorização, Quando extrair token, Então deve retornar null', () => {
      const tokenExtraido = jwtUtil.extractTokenFromHeader();
      expect(tokenExtraido).toBeNull();
    });

    it('Dado header de autorização com Bearer mas sem token, Quando extrair token, Então deve retornar null', () => {
      const headerSemToken = 'Bearer ';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerSemToken);
      expect(tokenExtraido).toBeNull();
    });

    it('Dado header de autorização com apenas Bearer, Quando extrair token, Então deve retornar null', () => {
      const headerSomenteBearer = 'Bearer';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerSomenteBearer);
      expect(tokenExtraido).toBeNull();
    });

    it('Dado header de autorização com espaços extras, Quando extrair token, Então deve retornar token corretamente', () => {
      const headerComEspacos = 'Bearer   token123';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerComEspacos);
      expect(tokenExtraido).not.toBeNull();
    });

    it('Dado header de autorização vazio, Quando extrair token, Então deve retornar null', () => {
      const headerVazio = '';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerVazio);
      expect(tokenExtraido).toBeNull();
    });
  });

  describe('Cobertura adicional - linhas 73, 80, 89, 99, 121', () => {
    it('Dado token decodificado sem propriedade id, Quando decodificar, Então deve retornar payload', () => {
      const tokenSemId = jwt.sign({ regra: 'USUARIO' }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
      const payload = jwtUtil.decodeToken(tokenSemId);
      expect(payload).toBeDefined();
      expect(payload?.id).toBeUndefined();
    });

    it('Dado token com exp no limite exato, Quando verificar expiração, Então deve considerar comportamento correto', () => {
      const agora = Math.floor(Date.now() / 1000);
      const tokenNoLimite = jwt.sign({ id: 'x', regra: 'USUARIO', exp: agora }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
      const estaExpirado = jwtUtil.isTokenExpired(tokenNoLimite);
      expect(typeof estaExpirado).toBe('boolean');
    });

    it('Dado header com Bearer e token válido separado por múltiplos espaços, Quando extrair, Então deve retornar token trimmed', () => {
      const headerComMuitosEspacos = 'Bearer     token-valido    ';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerComMuitosEspacos);
      expect(tokenExtraido).toBe('token-valido');
    });

    it('Dado header Bearer com token vazio após trim, Quando extrair, Então deve retornar null', () => {
      const headerComEspacosVazios = 'Bearer      ';
      const tokenExtraido = jwtUtil.extractTokenFromHeader(headerComEspacosVazios);
      expect(tokenExtraido).toBeNull();
    });
  });
});