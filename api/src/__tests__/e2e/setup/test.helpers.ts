import request from 'supertest';
import { app } from '../../../app';
import type { Usuario } from '@prisma/client';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  usuario: Omit<Usuario, 'password' | 'refreshToken'>;
}

export async function loginUser(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  
  return response.body;
}

export class AuthenticatedClient {
  private accessToken: string;
  
  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  get(url: string) {
    return request(app)
      .get(url)
      .set('Authorization', `Bearer ${this.accessToken}`);
  }

  post(url: string, body?: any) {
    const req = request(app)
      .post(url)
      .set('Authorization', `Bearer ${this.accessToken}`);
    
    if (body) {
      req.send(body);
    }
    
    return req;
  }

  put(url: string, body?: any) {
    const req = request(app)
      .put(url)
      .set('Authorization', `Bearer ${this.accessToken}`);
    
    if (body) {
      req.send(body);
    }
    
    return req;
  }

  patch(url: string, body?: any) {
    const req = request(app)
      .patch(url)
      .set('Authorization', `Bearer ${this.accessToken}`);
    
    if (body) {
      req.send(body);
    }
    
    return req;
  }

  delete(url: string) {
    return request(app)
      .delete(url)
      .set('Authorization', `Bearer ${this.accessToken}`);
  }
}

export async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<AuthenticatedClient> {
  const { accessToken } = await loginUser(email, password);
  return new AuthenticatedClient(accessToken);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateUniqueEmail(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@helpme.test`;
}

export function generateCPF(): string {
  const randomDigits = () => Math.floor(Math.random() * 10);
  
  // Gera 9 primeiros dígitos
  const digits = Array.from({ length: 9 }, randomDigits);
  
  // Calcula primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  const firstCheck = (sum * 10) % 11;
  digits.push(firstCheck === 10 ? 0 : firstCheck);
  
  // Calcula segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  const secondCheck = (sum * 10) % 11;
  digits.push(secondCheck === 10 ? 0 : secondCheck);
  
  return digits.join('');
}

export function formatCPF(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function generatePhone(): string {
  const ddd = Math.floor(Math.random() * 89) + 11; // 11-99
  const firstPart = 90000 + Math.floor(Math.random() * 9999);
  const secondPart = 1000 + Math.floor(Math.random() * 8999);
  return `(${ddd}) ${firstPart}-${secondPart}`;
}

export function extractNumbers(str: string): string {
  return str.replace(/\D/g, '');
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }
  
  throw new Error(`Timeout: condição não foi satisfeita em ${timeout}ms`);
}

export function createUserTestData(overrides?: Partial<{
  nome: string;
  sobrenome: string;
  email: string;
  password: string;
  setor: string;
  telefone: string;
  ramal: string;
}>) {
  return {
    nome: overrides?.nome || 'João',
    sobrenome: overrides?.sobrenome || 'Silva',
    email: overrides?.email || generateUniqueEmail('user'),
    password: overrides?.password || 'Senha123!',
    setor: overrides?.setor || 'TECNOLOGIA_INFORMACAO',
    telefone: overrides?.telefone || generatePhone(),
    ramal: overrides?.ramal || '1234',
  };
}

export function createChamadoTestData(overrides?: Partial<{
  descricao: string;
  servicoId: string;
  prioridade: 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
}>) {
  return {
    descricao: overrides?.descricao || 'O computador não está ligando',
    servicoId: overrides?.servicoId || '1',
    prioridade: overrides?.prioridade || 'NORMAL',
  };
}

export function extractErrorMessage(response: any): string {
  if (typeof response.body === 'string') {
    return response.body;
  }
  
  if (response.body?.error) {
    if (typeof response.body.error === 'string') {
      return response.body.error;
    }
    if (response.body.error.message) {
      return response.body.error.message;
    }
  }
  
  if (response.body?.message) {
    return response.body.message;
  }
  
  return 'Erro desconhecido';
}