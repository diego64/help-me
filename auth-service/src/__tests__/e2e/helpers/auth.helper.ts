import request from 'supertest';
import { createApp } from '../../../app';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Realiza login via HTTP e retorna o par de tokens.
 * Lança erro se o login falhar (status !== 200).
 */
export async function obterTokens(email: string, senha: string): Promise<TokenPair> {
  const app = createApp(); // ← instancia aqui, vars já carregadas pelo setupFiles

  const res = await request(app)
    .post('/auth/sessao/login')
    .send({ email, password: senha });

  if (res.status !== 200) {
    throw new Error(
      `[auth.helper] Falha ao obter token para ${email} — HTTP ${res.status}: ${JSON.stringify(res.body)}`
    );
  }

  return {
    accessToken:  res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

export function bearerHeader(token: string): string {
  return `Bearer ${token}`;
}