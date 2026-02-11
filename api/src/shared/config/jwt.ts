import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import type ms from 'ms';
import { Usuario, Regra } from '@prisma/client';

/**
 * Tamanho máximo permitido para o payload do JWT (em caracteres)
 * Baseado em: Gitlab DoS attacks - previne JWT bombing
 */
const MAX_PAYLOAD_SIZE = 4096; // 4KB de payload

/**
 * Profundidade máxima permitida para objetos nested no payload
 * Baseado em: DoS attacks com objetos profundamente aninhados
 */
const MAX_OBJECT_DEPTH = 10;

/**
 * Tamanho mínimo de entropia para secrets (bits)
 * Baseado em: CVE reports de secrets fracos
 */
const MIN_SECRET_ENTROPY_BITS = 128;

/**
 * Lista de padrões comuns/fracos em secrets
 * Baseado em: Análise de data breaches e secrets vazados
 */
const WEAK_SECRET_PATTERNS = [
  /^[0-9]+$/, // Apenas números
  /^[a-z]+$/, // Apenas letras minúsculas
  /^(.)\1+$/, // Caracteres repetidos
  /password/i,
  /admin/i,
  /secret/i,
  /qwerty/i,
  /12345/,
];

/**
 * Calcula a entropia de Shannon de uma string
 * Usado para detectar secrets fracos
 */
function calculateEntropy(str: string): number {
  const len = str.length;
  const frequencies = new Map<string, number>();
  
  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }
  
  return entropy * len; // Entropia total em bits
}

/**
 * Valida a força de um secret
 * Verifica padrões fracos e entropia mínima
 */
function validateSecretStrength(secret: string, secretName: string): void {
  // Verifica padrões fracos conhecidos
  for (const pattern of WEAK_SECRET_PATTERNS) {
    if (pattern.test(secret)) {
      console.warn(
        `[SECURITY WARNING] ${secretName} contém padrão fraco. ` +
        `Considere usar um secret mais complexo em produção.`
      );
    }
  }
  
  // Verifica entropia mínima
  const entropy = calculateEntropy(secret);
  if (entropy < MIN_SECRET_ENTROPY_BITS) {
    console.warn(
      `[SECURITY WARNING] ${secretName} tem entropia baixa (${entropy.toFixed(2)} bits). ` +
      `Recomendado: >= ${MIN_SECRET_ENTROPY_BITS} bits. ` +
      `Use um secret mais aleatório em produção.`
    );
  }
}

/**
 * Valida os secrets JWT
 * Previne: Secrets fracos, idênticos, ou curtos demais
 * Inspirado em: GitHub 2021 secret leakage, AWS key rotation
 */
export function validateSecrets(): void {
  const JWT_SECRET = process.env.JWT_SECRET!;
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
  
  // Validações básicas (mantidas da implementação original)
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve estar definido e conter pelo menos 32 caracteres.');
  }
  if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET deve estar definido e conter pelo menos 32 caracteres.');
  }
  if (JWT_SECRET === JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes.');
  }
  
  // Validações de força de secret (apenas warnings)
  // Não lançam erro para não quebrar funcionalidade existente
  validateSecretStrength(JWT_SECRET, 'JWT_SECRET');
  validateSecretStrength(JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');
}

/**
 * Calcula a profundidade máxima de um objeto
 * Previne: DoS attacks com objetos profundamente aninhados
 */
function getObjectDepth(obj: any, currentDepth = 0): number {
  if (obj === null || typeof obj !== 'object') {
    return currentDepth;
  }
  
  let maxDepth = currentDepth;
  for (const value of Object.values(obj)) {
    const depth = getObjectDepth(value, currentDepth + 1);
    maxDepth = Math.max(maxDepth, depth);
  }
  
  return maxDepth;
}

/**
 * Valida o tamanho e estrutura do payload
 * Previne: JWT bombing, DoS attacks
 * Inspirado em: Gitlab, Shopify vulnerabilities
 */
function validatePayload(payload: any): void {
  const payloadStr = JSON.stringify(payload);
  
  // Validação de tamanho
  if (payloadStr.length > MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Payload muito grande (${payloadStr.length} chars). ` +
      `Máximo permitido: ${MAX_PAYLOAD_SIZE} chars. ` +
      `Isso pode indicar tentativa de DoS attack.`
    );
  }
  
  // Validação de profundidade
  const depth = getObjectDepth(payload);
  if (depth > MAX_OBJECT_DEPTH) {
    throw new Error(
      `Payload com objetos muito profundos (${depth} níveis). ` +
      `Máximo permitido: ${MAX_OBJECT_DEPTH} níveis. ` +
      `Isso pode causar stack overflow.`
    );
  }
}

/**
 * Sanitiza valores potencialmente perigosos no payload
 * Previne: SQL injection, XSS (documentação)
 * NOTA: Sanitização real deve ocorrer na camada de aplicação
 */
function sanitizePayloadForLogging(payload: any): any {
  // Apenas para logging - não modifica o payload real
  const sanitized = { ...payload };
  
  // Remove dados sensíveis do log
  if (sanitized.password) delete sanitized.password;
  if (sanitized.refreshToken) delete sanitized.refreshToken;
  
  return sanitized;
}

export interface TokenPayload extends JwtPayload {
  id: string;
  email?: string;
  regra: Regra;
  type: 'access' | 'refresh';
}

/**
 * Gera um token JWT (access ou refresh)
 * 
 * MELHORIAS DE SEGURANÇA APLICADAS:
 * - Validação de tamanho de payload (previne DoS)
 * - Validação de profundidade de objetos (previne stack overflow)
 * - Logging seguro (sem dados sensíveis)
 * - Algoritmo fixo HS256 (previne algorithm confusion)
 * - Issuer e audience fixos (previne token confusion)
 * 
 * Inspirado em: Auth0 CVE-2015-9235, Uber 2016 breach
 */
export function generateToken(usuario: Usuario, type: 'access' | 'refresh'): string {
  const payload: TokenPayload = {
    id: usuario.id,
    email: usuario.email,
    regra: usuario.regra,
    type,
  };

  // Validação de payload antes de gerar token
  try {
    validatePayload(payload);
  } catch (error) {
    console.error('[SECURITY] Token generation blocked:', error);
    throw error;
  }

  const secret = type === 'access'
    ? process.env.JWT_SECRET
    : process.env.JWT_REFRESH_SECRET;
  const expiresIn = (type === 'access'
    ? process.env.JWT_EXPIRATION || '8h'
    : process.env.JWT_REFRESH_EXPIRATION || '7d') as ms.StringValue;

  const options: SignOptions = {
    algorithm: 'HS256', // Fixo para prevenir algorithm confusion
    expiresIn,
    issuer: 'helpme-api', // Fixo para validação
    audience: 'helpme-client', // Fixo para validação
  };

  // Log seguro de geração de token (sem dados sensíveis)
  if (process.env.NODE_ENV === 'development') {
    console.debug('[JWT] Token generated:', {
      type,
      userId: usuario.id,
      regra: usuario.regra,
      expiresIn,
    });
  }

  return jwt.sign(payload, secret!, options);
}

/**
 * Gera um par de tokens (access + refresh)
 * 
 * NOTA IMPORTANTE: Em produção, implementar rotação de refresh tokens
 * para prevenir token reuse attacks (inspirado em: Facebook 2018, Twitter 2020)
 */
export function generateTokenPair(usuario: Usuario) {
  const accessToken = generateToken(usuario, 'access');
  const refreshToken = generateToken(usuario, 'refresh');

  return { 
    accessToken, 
    refreshToken, 
    expiresIn: process.env.JWT_EXPIRATION || '8h' 
  };
}

/**
 * Verifica e decodifica um token JWT
 * 
 * PROTEÇÕES APLICADAS:
 * - Validação de algoritmo (previne algorithm confusion)
 * - Validação de issuer/audience (previne token confusion)
 * - Validação de tipo (previne token type mismatch)
 * - Mensagens de erro seguras (previne information leakage)
 * 
 * Inspirado em: Auth0 CVE-2015-9235, multi-tenant vulnerabilities
 */
export function verifyToken(token: string, type: 'access' | 'refresh' = 'access'): TokenPayload {
  const secret = type === 'access'
    ? process.env.JWT_SECRET
    : process.env.JWT_REFRESH_SECRET;

  try {
    // Decodifica com validações de segurança
    const decoded = jwt.verify(token, secret!, {
      algorithms: ['HS256'], // CRÍTICO: Apenas HS256, previne algorithm confusion
      issuer: 'helpme-api', // Valida issuer
      audience: 'helpme-client', // Valida audience
    }) as TokenPayload;

    // Validação de tipo de token
    if (decoded.type !== type) {
      throw new Error(`Token inválido: esperado tipo ${type}, recebido ${decoded.type}`);
    }

    // Log de verificação bem-sucedida (desenvolvimento)
    if (process.env.NODE_ENV === 'development') {
      console.debug('[JWT] Token verified:', {
        type: decoded.type,
        userId: decoded.id,
        regra: decoded.regra,
      });
    }

    return decoded;
  } catch (error) {
    // Tratamento melhorado de erros
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expirado.');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      // Não vazar detalhes do erro em produção
      const errorMsg = process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'assinatura ou formato inválido';
      throw new Error(`Token inválido: ${errorMsg}`);
    }
    throw error;
  }
}

/**
 * Decodifica um token sem verificar a assinatura
 * 
 * AVISO DE SEGURANÇA: Use apenas para inspeção, NUNCA para autenticação
 * Tokens decodificados sem verificação podem ter sido adulterados
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null;
    return decoded || null;
  } catch {
    return null;
  }
}

/**
 * Verifica se um token está expirado
 * 
 * NOTA: Usa apenas o campo exp, não verifica assinatura
 * Para verificação completa, use verifyToken()
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded?.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Extrai token do header Authorization
 * 
 * PROTEÇÕES APLICADAS:
 * - Validação contra CRLF injection (previne header injection)
 * - Validação de formato estrito
 * - Validação contra null bytes e caracteres de controle
 * 
 * Inspirado em: HTTP header injection vulnerabilities
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  // Validar se o header existe e é uma string
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  // Detectar e rejeitar tentativas de CRLF injection
  if (authHeader.includes('\r') || authHeader.includes('\n')) {
    console.warn('[SECURITY] CRLF injection attempt detected in Authorization header');
    return null;
  }
  
  // Detectar e rejeitar null bytes e caracteres de controle perigosos
  if (/[\x00-\x1F]/.test(authHeader)) {
    console.warn('[SECURITY] Control characters detected in Authorization header');
    return null;
  }
  
  // Remover espaços extras e dividir em partes
  const parts = authHeader.trim().split(/\s+/);
  
  // Validar formato: deve ter exatamente 2 partes e começar com "Bearer"
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  const token = parts[1];
  
  // Validar que o token não está vazio e não contém espaços
  if (!token || token.trim() === '' || token.includes(' ')) {
    return null;
  }
  
  // Validação adicional de tamanho do token
  // Tokens JWT típicos têm entre 100-2000 caracteres
  // Tokens muito grandes podem indicar DoS attack
  if (token.length > 8000) {
    console.warn('[SECURITY] Suspiciously large token detected:', token.length, 'chars');
    return null;
  }
  
  return token;
}

/**
 * Verifica se um refresh token deve ser rotacionado
 * 
 * Inspirado em: Facebook 2018, Twitter 2020 session management issues
 */
export function shouldRotateRefreshToken(decoded: TokenPayload): boolean {
  // Exemplo de lógica: rotacionar se faltam menos de 24h para expirar
  if (!decoded.exp) return false;
  
  const expirationTime = decoded.exp * 1000;
  const timeUntilExpiration = expirationTime - Date.now();
  const oneDayInMs = 24 * 60 * 60 * 1000;
  
  return timeUntilExpiration < oneDayInMs;
}

/**
 * Gera um identificador único para o token (jti - JWT ID)
 * 
 * Inspirado em: OAuth2/OIDC best practices
 */
export function generateJti(): string {
  // Gera um ID único usando timestamp + random
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Utilitários expostos para testes e monitoramento
 */
export const securityUtils = {
  calculateEntropy,
  getObjectDepth,
  validatePayload,
  shouldRotateRefreshToken,
  generateJti,
  MAX_PAYLOAD_SIZE,
  MAX_OBJECT_DEPTH,
  MIN_SECRET_ENTROPY_BITS,
};