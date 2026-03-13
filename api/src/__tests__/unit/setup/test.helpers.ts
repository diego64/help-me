import request, { Response } from 'supertest';
import app from '@/app';

interface AuthenticatedClient {
  get:    (url: string) => request.Test;
  post:   (url: string, body?: object) => request.Test;
  put:    (url: string, body?: object) => request.Test;
  patch:  (url: string, body?: object) => request.Test;
  delete: (url: string) => request.Test;
}

/**
 * Faz login e retorna um cliente supertest com o header Authorization
 * (Bearer token) já configurado em todas as requisições.
 */
export async function createAuthenticatedClient(
  email: string,
  senha: string,
): Promise<AuthenticatedClient> {
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ email, password: senha });

  if (loginResponse.status !== 200) {
    throw new Error(
      `Login falhou para ${email}: ${loginResponse.status} – ${JSON.stringify(loginResponse.body)}`,
    );
  }

  const token: string = loginResponse.body.accessToken;

  if (!token) {
    throw new Error(`accessToken não retornado no login de ${email}`);
  }

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  return {
    get:    (url)        => auth(request(app).get(url)),
    post:   (url, body)  => auth(request(app).post(url).send(body)),
    put:    (url, body)  => auth(request(app).put(url).send(body)),
    patch:  (url, body)  => auth(request(app).patch(url).send(body)),
    delete: (url)        => auth(request(app).delete(url)),
  };
}

/**
 * Gera um e-mail único usando timestamp + número aleatório.
 * Útil para criar usuários temporários sem colisão entre testes.
 */
export function generateUniqueEmail(domain = 'test.helpme.com'): string {
  const timestamp = Date.now();
  const random    = Math.floor(Math.random() * 10_000);
  return `user_${timestamp}_${random}@${domain}`;
}

/**
 * Extrai a mensagem de erro de uma resposta supertest de forma resiliente.
 *
 * Cobre os formatos mais comuns de resposta de erro:
 *   { message }
 *   { error }
 *   { errors: [{ message }] }
 *   { errors: [string] }
 *   string pura no body
 */
export function extractErrorMessage(response: Response): string {
  const body = response.body;

  if (!body) return '';

  if (typeof body === 'string') return body;

  if (typeof body.message === 'string') return body.message;

  if (typeof body.error === 'string') return body.error;

  if (Array.isArray(body.errors)) {
    const first = body.errors[0];
    if (typeof first === 'string')           return first;
    if (typeof first?.message === 'string')  return first.message;
  }

  return JSON.stringify(body);
}