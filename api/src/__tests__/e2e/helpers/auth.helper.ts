import jwt from 'jsonwebtoken';
import { Regra } from '@prisma/client';
import { UsuarioCriado } from './factory';

/**
 * Gera um access token JWT compatível com a API (issuer/audience obrigatórios).
 * Usa o JWT_SECRET do ambiente de teste.
 */
export function gerarToken(usuario: UsuarioCriado, expiresIn: string | number = '8h'): string {
  const secret = process.env.JWT_SECRET!;
  return jwt.sign(
    {
      id:    usuario.id,
      email: usuario.email,
      regra: usuario.regra,
      type:  'access',
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn,
      issuer:   'helpme-api',
      audience: 'helpme-client',
    } as jwt.SignOptions,
  );
}

/**
 * Retorna o valor do header Authorization para o token informado.
 */
export function bearerHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Gera um token expirado para testar cenários de token inválido.
 */
export function gerarTokenExpirado(usuario: UsuarioCriado): string {
  return gerarToken(usuario, -1);
}

/** Payload de um usuário ADMIN para usar em testes de token sem banco. */
export function payloadAdmin(id = '00000000-0000-0000-0000-000000000001'): UsuarioCriado {
  return { id, nome: 'Admin', sobrenome: 'Teste', email: 'admin@e2e.com', regra: Regra.ADMIN };
}
