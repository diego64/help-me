import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

    it('Dado dados de usuário válidos, Quando gerar token de refresh sem expiração definida, Então deve usar valor padrão 7d (linha 80)', () => {
      delete process.env.JWT_REFRESH_EXPIRATION;
      const tipoToken = 'refresh';
      const tokenRefreshGerado = jwtUtil.generateToken(mockUsuarioValido, tipoToken);
      expect(tokenRefreshGerado).toBeTruthy();
      expect(typeof tokenRefreshGerado).toBe('string');
      const partes = tokenRefreshGerado.split('.');
      expect(partes.length).toBe(3);
    });

    it('Dado usuário válido, Quando gerar token, Então jwt.sign deve retornar string JWT válida (linha 89)', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded).toBeDefined();
      expect(decoded.id).toBe(mockUsuarioValido.id);
      expect(decoded.type).toBe('access');
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

    it('Dado JWT_EXPIRATION indefinido, Quando gerar par de tokens, Então deve usar valor padrão 8h (linha 99)', () => {
      delete process.env.JWT_EXPIRATION;
      const parDeTokens = jwtUtil.generateTokenPair(mockUsuarioValido);

      expect(parDeTokens.expiresIn).toBe('8h');
      expect(parDeTokens.accessToken).toBeTruthy();
      expect(parDeTokens.refreshToken).toBeTruthy();
    });
  });

  describe('verifyToken', () => {
    it('Dado token de acesso válido, Quando verificar com tipo correto, Então deve retornar payload decodificado com id do usuário', () => {
      const tokenAcesso = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payloadDecodificado = jwtUtil.verifyToken(tokenAcesso, 'access');

      expect(payloadDecodificado).toBeDefined();
      expect(payloadDecodificado.id).toBe('user1');
    });

    it('Dado token de refresh válido, Quando verificar com tipo correto, Então deve retornar payload decodificado com id do usuário', () => {
      const tokenRefresh = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      const payloadDecodificado = jwtUtil.verifyToken(tokenRefresh, 'refresh');

      expect(payloadDecodificado.id).toBe(mockUsuarioValido.id);
    });

    it('Dado token de acesso, Quando verificar com tipo errado (refresh), Então deve lançar erro de token inválido', () => {
      const tokenAcesso = jwtUtil.generateToken(mockUsuarioValido, 'access');
      expect(() => jwtUtil.verifyToken(tokenAcesso, 'refresh')).toThrow('Token inválido');
    });

    it('Dado string de token malformada, Quando verificar token, Então deve lançar erro de token inválido', () => {
      expect(() => jwtUtil.verifyToken('invalido', 'access')).toThrow(/Token inválido/);
    });

    it('Dado token expirado, Quando verificar token, Então deve lançar erro de expirado ou inválido', () => {
      const tokenExpirado = jwt.sign(
        { id: 'x', regra: Regra.USUARIO, type: 'access' },
        process.env.JWT_SECRET!,
        {
          expiresIn: '-10s',
          algorithm: 'HS256',
          issuer: 'helpme-api',
          audience: 'helpme-client'
        }
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

      expect(() => jwtUtil.verifyToken(tokenComAssinaturaInvalida, 'access')).toThrow(
        /Token inválido|invalid signature/
      );
    });

    it('Dado erro não-JWT durante verificação, Quando verificar token, Então deve re-lançar erro original (linha 73)', () => {
      const erroGenerico = new Error('Erro genérico de sistema');
      const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw erroGenerico;
      });

      expect(() => jwtUtil.verifyToken('qualquer-token', 'access')).toThrow('Erro genérico de sistema');
      verifySpy.mockRestore();
    });

    it('Dado erro TypeError durante verificação, Quando verificar token, Então deve re-lançar erro original (linha 73)', () => {
      const typeError = new TypeError('Cannot read property of undefined');
      const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw typeError;
      });

      expect(() => jwtUtil.verifyToken('qualquer-token', 'access')).toThrow(TypeError);
      verifySpy.mockRestore();
    });
  });

  describe('decodeToken', () => {
    it('Dado token válido, Quando decodificar sem verificação, Então deve retornar payload com id do usuário', () => {
      const tokenValido = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payloadDecodificado = jwtUtil.decodeToken(tokenValido);

      expect(payloadDecodificado?.id).toBe(mockUsuarioValido.id);
    });

    it('Dado string de token inválida, Quando decodificar token, Então deve retornar null', () => {
      expect(jwtUtil.decodeToken('abc')).toBeNull();
    });

    it('Dado token vazio, Quando decodificar token, Então deve retornar null', () => {
      expect(jwtUtil.decodeToken('')).toBeNull();
    });

    it('Dado token malformado com caracteres especiais, Quando decodificar token, Então deve retornar null', () => {
      expect(jwtUtil.decodeToken('@@#$%^&*()')).toBeNull();
    });

    it('Dado erro durante jwt.decode, Quando decodificar token, Então deve retornar null (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new Error('Erro interno do decode');
      });

      expect(jwtUtil.decodeToken('qualquer-token')).toBeNull();
      decodeSpy.mockRestore();
    });

    it('Dado erro TypeError durante jwt.decode, Quando decodificar token, Então deve retornar null (linha 121)', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new TypeError('Invalid input');
      });

      expect(jwtUtil.decodeToken('token-invalido')).toBeNull();
      decodeSpy.mockRestore();
    });

    it('Dado jwt.decode que retorna null, Quando decodificar token, Então deve retornar null', () => {
      expect(jwtUtil.decodeToken('not.a.jwt')).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('Dado token recém gerado, Quando verificar expiração, Então deve retornar false', () => {
      const tokenFresco = jwtUtil.generateToken(mockUsuarioValido, 'access');
      expect(jwtUtil.isTokenExpired(tokenFresco)).toBe(false);
    });

    it('Dado string de token inválida, Quando verificar expiração, Então deve retornar true', () => {
      expect(jwtUtil.isTokenExpired('abc')).toBe(true);
    });

    it('Dado token vazio, Quando verificar expiração, Então deve retornar true', () => {
      expect(jwtUtil.isTokenExpired('')).toBe(true);
    });

    it('Dado token sem campo exp, Quando verificar expiração, Então deve retornar true', () => {
      const tokenSemExp = jwt.sign(
        { id: 'x', regra: 'USUARIO' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256', noTimestamp: true }
      );

      expect(jwtUtil.isTokenExpired(tokenSemExp)).toBe(true);
    });

    it('Dado token com exp no passado, Quando verificar expiração, Então deve retornar true', () => {
      const tokenExpirado = jwt.sign(
        { id: 'x', regra: 'USUARIO', type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h', algorithm: 'HS256' }
      );

      expect(jwtUtil.isTokenExpired(tokenExpirado)).toBe(true);
    });

    it('Dado erro durante jwt.decode em isTokenExpired, Quando verificar expiração, Então deve retornar true', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new Error('Decode error');
      });

      expect(jwtUtil.isTokenExpired('qualquer-token')).toBe(true);
      decodeSpy.mockRestore();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('Dado header de autorização Bearer válido, Quando extrair token, Então deve retornar string do token', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer abc123')).toBe('abc123');
    });

    it('Dado formato de header inválido, Quando extrair token, Então deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader('Token abc')).toBeNull();
    });

    it('Dado nenhum header, Quando extrair token, Então deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader()).toBeNull();
    });

    it('Dado header Bearer mas sem token, Quando extrair token, Então deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer ')).toBeNull();
    });

    it('Dado header somente com Bearer, Quando extrair token, Então deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer')).toBeNull();
    });

    it('Dado header com espaços extras, Deve extrair o token corretamente', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer   token123')).not.toBeNull();
    });

    it('Dado header vazio, Deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader('')).toBeNull();
    });

    it('Dado Bearer em lowercase, deve funcionar', () => {
      expect(jwtUtil.extractTokenFromHeader('bearer token123')).toBe('token123');
    });

    it('Dado Bearer em mixed case, deve funcionar', () => {
      expect(jwtUtil.extractTokenFromHeader('BeArEr token456')).toBe('token456');
    });

    it('Dado header com mais de 2 partes, deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer token parte3')).toBeNull();
    });

    it('Dado header undefined, deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader(undefined)).toBeNull();
    });
  });

  describe('Cobertura adicional - branches e edge cases', () => {
    it('Token decodificado sem id deve retornar payload mesmo assim', () => {
      const tokenSemId = jwt.sign(
        { regra: 'USUARIO' },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256' }
      );

      const payload = jwtUtil.decodeToken(tokenSemId);

      expect(payload).toBeDefined();
      expect(payload?.id).toBeUndefined();
    });

    it('Token com exp no limite deve retornar boolean válido', () => {
      const agora = Math.floor(Date.now() / 1000);

      const token = jwt.sign(
        { id: 'x', regra: 'USUARIO', exp: agora },
        process.env.JWT_SECRET!,
        { algorithm: 'HS256' }
      );

      expect(typeof jwtUtil.isTokenExpired(token)).toBe('boolean');
    });

    it('Header "Bearer token" deve extrair token corretamente', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer     token-valido')).toBe('token-valido');
    });

    it('Header "Bearer" deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer      ')).toBeNull();
    });

    it('Payload deve ter email do usuário', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payload = jwtUtil.verifyToken(token, 'access');

      expect(payload.email).toBe(mockUsuarioValido.email);
    });

    it('Token refresh deve conter regra e type', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      const payload = jwtUtil.verifyToken(token, 'refresh');

      expect(payload.regra).toBe(Regra.USUARIO);
      expect(payload.type).toBe('refresh');
    });

    it('Payload deve conter propriedades esperadas', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payload = jwtUtil.decodeToken(token);

      expect(payload?.id).toBe(mockUsuarioValido.id);
      expect(payload?.email).toBe(mockUsuarioValido.email);
      expect(payload?.regra).toBe(mockUsuarioValido.regra);
      expect(payload?.type).toBe('access');
    });

    it('verifyToken deve usar access como tipo padrão', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'access');
      const payload = jwtUtil.verifyToken(token);

      expect(payload.type).toBe('access');
    });
  });

  describe('Garantir a cobertura de testes para as linhas 73 e 121', () => {
    it('Deve re-lançar erro genérico não-JWT', () => {
      const erroGenerico = new Error('Erro de sistema inesperado');
      const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw erroGenerico;
      });

      expect(() => jwtUtil.verifyToken('qualquer-token', 'access')).toThrow('Erro de sistema inesperado');
      verifySpy.mockRestore();
    });

    it('Deve re-lançar TypeError durante verificação', () => {
      const typeError = new TypeError('Não é possível ler propriedade');
      const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw typeError;
      });

      expect(() => jwtUtil.verifyToken('token-teste', 'access')).toThrow(TypeError);
      verifySpy.mockRestore();
    });

    it('Deve re-lançar RangeError durante verificação', () => {
      const rangeError = new RangeError('Valor fora do intervalo');
      const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw rangeError;
      });

      expect(() => jwtUtil.verifyToken('abc123', 'refresh')).toThrow(RangeError);
      verifySpy.mockRestore();
    });

    it('Erro genérico no decode deve retornar null', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new Error('Erro interno do decode');
      });

      expect(jwtUtil.decodeToken('qualquer-token-aqui')).toBeNull();
      decodeSpy.mockRestore();
    });

    it('TypeError no decode deve retornar null', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new TypeError('Entrada inválida para decode');
      });

      expect(jwtUtil.decodeToken('token-invalido-xyz')).toBeNull();
      decodeSpy.mockRestore();
    });

    it('SyntaxError no decode deve retornar null', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new SyntaxError('JSON malformado');
      });

      expect(jwtUtil.decodeToken('###invalid###')).toBeNull();
      decodeSpy.mockRestore();
    });

    it('Erro customizado no decode deve retornar null', () => {
      const erroCustomizado = new Error('Falha crítica no decode');
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw erroCustomizado;
      });

      expect(jwtUtil.decodeToken('token-que-causa-erro')).toBeNull();
      decodeSpy.mockRestore();
    });

    it('isTokenExpired com erro no decode deve retornar true', () => {
      const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new Error('Falha no decode');
      });

      expect(jwtUtil.isTokenExpired('token-com-erro')).toBe(true);
      decodeSpy.mockRestore();
    });

    it('verifyToken com token refresh e tipo access deve lançar erro', () => {
      const token = jwtUtil.generateToken(mockUsuarioValido, 'refresh');
      expect(() => jwtUtil.verifyToken(token, 'access')).toThrow(/Token inválido/);
    });

    it('Header com token contendo espaços deve retornar null', () => {
      expect(jwtUtil.extractTokenFromHeader('Bearer token com espacos')).toBeNull();
    });

    it('Header não-string deve retornar null', () => {
      // @ts-expect-error testando comportamento incorreto
      expect(jwtUtil.extractTokenFromHeader(123)).toBeNull();
    });

    it('Header como objeto deve retornar null', () => {
      // @ts-expect-error testando comportamento incorreto
      expect(jwtUtil.extractTokenFromHeader({})).toBeNull();
    });
  });

  describe('Deve forçar a cobertura das condições específicas do código', () => {
    it('Força throw de erro não-JWT em verifyToken', () => {
      const originalVerify = jwt.verify;
      (jwt as any).verify = () => {
        throw new Error('ERRO_GENERICO_NAO_JWT');
      };

      expect(() => jwtUtil.verifyToken('token', 'access')).toThrow('ERRO_GENERICO_NAO_JWT');
      (jwt as any).verify = originalVerify;
    });

    it('Força catch em decodeToken', () => {
      const originalDecode = jwt.decode;

      (jwt as any).decode = () => {
        throw new Error('ERRO_DECODE_FORCADO');
      };

      expect(jwtUtil.decodeToken('token')).toBeNull();
      (jwt as any).decode = originalDecode;
    });

    it('Deve relançar erro não-JWT no verifyToken (cobre linha 73)', () => {
      const erroGenerico = new Error('Erro genérico inesperado');

      const spy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw erroGenerico;
      });

      expect(() => jwtUtil.verifyToken('token-qualquer', 'access')).toThrow('Erro genérico inesperado');

      spy.mockRestore();
    });

    it('Deve retornar null quando jwt.decode lança exceção (cobre linha 121)', () => {
      const spy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new Error('falha inesperada no decode');
      });

      expect(jwtUtil.decodeToken('token')).toBeNull();

      spy.mockRestore();
    });

    it('Cobertura do throw em verifyToken', () => {
      class CustomNonJWTError extends Error {}
      const spy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new CustomNonJWTError('Erro para coverage');
      });

      expect(() => jwtUtil.verifyToken('abc', 'access')).toThrow(CustomNonJWTError);

      spy.mockRestore();
    });

    it('Força execução do catch em decodeToken', () => {
      const spy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new Error('Forçando catch');
      });

      const result = jwtUtil.decodeToken('token-qualquer');
      expect(result).toBeNull();

      spy.mockRestore();
    });
  });

  describe('Lançar erros inesperados que não são erros de JWT', () => {
    describe('Throw error no verifyToken', () => {
      it('Deve lançar erro personalizado quando jwt.verify falha com erro não-JWT', () => {
        class CustomError extends Error {
          constructor(message: string) {
            super(message);
            this.name = 'CustomError';
          }
        }

        const erroCustomizado = new CustomError('Erro customizado do sistema');
        const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
          throw erroCustomizado;
        });

        expect(() => jwtUtil.verifyToken('token-qualquer', 'access')).toThrow(CustomError);
        verifySpy.mockRestore();
      });

      it('Deve lançar ReferenceError quando ocorre durante verificação', () => {
        const refError = new ReferenceError('Variável não definida');
        const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
          throw refError;
        });

        expect(() => jwtUtil.verifyToken('abc', 'refresh')).toThrow(ReferenceError);
        verifySpy.mockRestore();
      });

      it('Deve lançar Error genérico do sistema', () => {
        const erroSistema = new Error('Falha crítica do sistema');
        const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
          throw erroSistema;
        });

        try {
          jwtUtil.verifyToken('token-teste', 'access');
          expect.fail('Deveria ter lançado erro');
        } catch (error) {
          expect(error).toBe(erroSistema);
        }

        verifySpy.mockRestore();
      });
    });

    describe('Catch no decodeToken', () => {
      it('Erro genérico deve retornar null', () => {
        const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
          throw new Error('Falha ao decodificar');
        });

        expect(jwtUtil.decodeToken('token')).toBeNull();
        decodeSpy.mockRestore();
      });

      it('TypeError deve retornar null', () => {
        const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
          throw new TypeError('Tipo inválido');
        });

        expect(jwtUtil.decodeToken('token')).toBeNull();
        decodeSpy.mockRestore();
      });

      it('SyntaxError deve retornar null', () => {
        const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
          throw new SyntaxError('JSON inválido');
        });

        expect(jwtUtil.decodeToken('token')).toBeNull();
        decodeSpy.mockRestore();
      });

      it('RangeError deve retornar null', () => {
        const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
          throw new RangeError('Range inválido');
        });

        expect(jwtUtil.decodeToken('###')).toBeNull();
        decodeSpy.mockRestore();
      });

      it('Qualquer exceção deve retornar null', () => {
        const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
          throw 'String como erro';
        });

        expect(jwtUtil.decodeToken('token')).toBeNull();
        decodeSpy.mockRestore();
      });
    });

    describe('Edge cases adicionais', () => {
      it('Erro não-JWT deve ser relançado corretamente', () => {
        const customError = { message: 'Erro customizado', code: 500 };
        const verifySpy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
          throw customError;
        });

        expect(() => jwtUtil.verifyToken('token', 'access')).toThrow();
        verifySpy.mockRestore();
      });

      it('decodeToken deve retornar null mesmo se erro for undefined', () => {
        const decodeSpy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
          throw undefined;
        });

        expect(jwtUtil.decodeToken('x')).toBeNull();
        decodeSpy.mockRestore();
      });
    });
  });

  describe('Forçar cobertura de linhas críticas', () => {
    it('Força catch em verifyToken (linha 73) com erro não-JWT', () => {
      const spy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new TypeError('Erro forçado para linha 73');
      });

      expect(() => jwtUtil.verifyToken('token-fake', 'access')).toThrow(TypeError);

      spy.mockRestore();
    });

    it('Força catch em decodeToken (linha 121)', () => {
      const spy = vi.spyOn(jwt, 'decode').mockImplementation(() => {
        throw new Error('Erro forçado para linha 121');
      });

      const result = jwtUtil.decodeToken('qualquer-token');
      expect(result).toBeNull();

      spy.mockRestore();
    });
  });
});
