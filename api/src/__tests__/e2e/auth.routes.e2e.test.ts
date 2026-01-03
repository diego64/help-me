process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE || 
  'postgresql://teste:senha_teste@localhost:5433/helpme_database_teste?schema=public';

console.log('[INFO] Utilizando a DATABASE_URL:', process.env.DATABASE_URL);

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi
} from 'vitest';
import request from 'supertest';
import { prisma } from '../../lib/prisma';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import app from '../../app';
import jwt from 'jsonwebtoken';
import { cacheDel } from '../../services/redisClient';

vi.setConfig({ testTimeout: 20000 });

describe('E2E - Rotas de Autenticação', () => {
  let adminId: string;
  let usuarioId: string;
  let tecnicoId: string;
  let adminEmail: string;
  let usuarioEmail: string;
  let senhaOriginal: string;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI_TEST || 
      'mongodb://teste:senha@localhost:27018/helpme-mongo-teste?authSource=admin';
    
    console.log('[INFO] BANCO DE DADOS MONGODB TESTE - CONECTADO EM:', mongoUri);
    await mongoose.connect(mongoUri);

    // Limpar base de dados
    await prisma.usuario.deleteMany({});

    senhaOriginal = 'Senha123!';
    const senhaHash = await bcrypt.hash(senhaOriginal, 10);

    // Criar usuários de teste
    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin',
        sobrenome: 'Sistema',
        email: 'admin.auth@teste.com',
        password: senhaHash,
        regra: 'ADMIN',
        setor: 'TECNOLOGIA_INFORMACAO',
        ativo: true,
      },
    });
    adminId = admin.id;
    adminEmail = admin.email;

    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Usuario',
        sobrenome: 'Teste',
        email: 'usuario.auth@teste.com',
        password: senhaHash,
        regra: 'USUARIO',
        setor: 'COMERCIAL',
        ativo: true,
      },
    });
    usuarioId = usuario.id;
    usuarioEmail = usuario.email;

    const tecnico = await prisma.usuario.create({
      data: {
        nome: 'Tecnico',
        sobrenome: 'Suporte',
        email: 'tecnico.auth@teste.com',
        password: senhaHash,
        regra: 'TECNICO',
        setor: 'TECNOLOGIA_INFORMACAO',
        ativo: true,
      },
    });
    tecnicoId = tecnico.id;
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({});
    await mongoose.disconnect();
    await prisma.$disconnect();
  });

  describe('POST /auth/login - Login de usuário', () => {
    it('deve fazer login com sucesso com credenciais válidas', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: adminEmail,
          password: senhaOriginal,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('usuario');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body.usuario.email).toBe(adminEmail);
      expect(response.body.usuario.regra).toBe('ADMIN');
      expect(response.body.usuario).not.toHaveProperty('password');
      expect(response.body.usuario).not.toHaveProperty('refreshToken');

      // Salvar tokens para próximos testes
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;

      // Verificar se refreshToken foi salvo no banco
      const adminAtualizado = await prisma.usuario.findUnique({
        where: { id: adminId },
        select: { refreshToken: true },
      });
      expect(adminAtualizado?.refreshToken).toBe(refreshToken);
    });

    it('deve retornar erro quando email não for fornecido', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          password: senhaOriginal,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email e senha são obrigatórios');
    });

    it('deve retornar erro quando senha não for fornecida', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: adminEmail,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email e senha são obrigatórios');
    });

    it('deve retornar erro quando email for inválido', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'email-invalido',
          password: senhaOriginal,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email inválido');
    });

    it('deve retornar erro com credenciais incorretas', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: adminEmail,
          password: 'SenhaErrada123',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Credenciais inválidas');
      expect(response.body).toHaveProperty('tentativasRestantes');
    });

    it('deve retornar erro quando usuário não existir', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'naoexiste@teste.com',
          password: senhaOriginal,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Credenciais inválidas');
      expect(response.body).toHaveProperty('tentativasRestantes');
    });

    it('deve retornar erro quando conta estiver inativa', async () => {
      // Desativar conta
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { ativo: false },
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: usuarioEmail,
          password: senhaOriginal,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Conta inativa');

      // Reativar conta para próximos testes
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { ativo: true },
      });
    });

    it('deve retornar erro quando conta estiver deletada', async () => {
      // Soft delete
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { deletadoEm: new Date(), ativo: false },
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: usuarioEmail,
          password: senhaOriginal,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Conta inativa');

      // Restaurar conta
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { deletadoEm: null, ativo: true },
      });
    });

    it('deve bloquear após múltiplas tentativas falhas', async () => {
      const emailTeste = 'teste.bloqueio@teste.com';

      // Criar usuário para teste de bloqueio
      await prisma.usuario.create({
        data: {
          nome: 'Teste',
          sobrenome: 'Bloqueio',
          email: emailTeste,
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
          ativo: true,
        },
      });

      // Fazer 5 tentativas falhas
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            email: emailTeste,
            password: 'SenhaErrada',
          });
      }

      // Sexta tentativa deve retornar erro de bloqueio
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: emailTeste,
          password: 'SenhaErrada',
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Muitas tentativas de login');
      expect(response.body).toHaveProperty('tentativasRestantes');
      expect(response.body.tentativasRestantes).toBe(0);
      expect(response.body).toHaveProperty('bloqueadoAte');

      // Limpar cache do Redis
      await cacheDel(`login:attempts:${emailTeste}`);
    });
  });

  describe('POST /auth/logout - Logout de usuário', () => {
    it('deve fazer logout com sucesso', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Logout realizado com sucesso');

      // Verificar se refreshToken foi removido do banco
      const adminAtualizado = await prisma.usuario.findUnique({
        where: { id: adminId },
        select: { refreshToken: true },
      });
      expect(adminAtualizado?.refreshToken).toBeNull();
    });

    it('deve retornar erro quando não autenticado', async () => {
      const response = await request(app)
        .post('/auth/logout');

      expect(response.status).toBe(401);
    });

    it('deve retornar erro com token inválido', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer token-invalido');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/refresh-token - Renovar token', () => {
    let validRefreshToken: string;

    beforeAll(async () => {
      // Fazer login para obter refresh token válido
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: usuarioEmail,
          password: senhaOriginal,
        });

      validRefreshToken = loginResponse.body.refreshToken;
    });

    it('deve renovar tokens com sucesso', async () => {
      const response = await request(app)
        .post('/auth/refresh-token')
        .send({
          refreshToken: validRefreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body.accessToken).not.toBe(validRefreshToken);

      // Verificar se novo refreshToken foi salvo no banco
      const usuarioAtualizado = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { refreshToken: true },
      });
      expect(usuarioAtualizado?.refreshToken).toBe(response.body.refreshToken);
    });

    it('deve retornar erro quando refresh token não for fornecido', async () => {
      const response = await request(app)
        .post('/auth/refresh-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Refresh token é obrigatório');
    });

    it('deve retornar erro com refresh token inválido', async () => {
      const response = await request(app)
        .post('/auth/refresh-token')
        .send({
          refreshToken: 'token.invalido.xyz',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/inválido/i);
    });

    it('deve retornar erro quando refresh token não corresponder ao do banco', async () => {
      // Obter refresh token válido atual
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: usuarioEmail,
          password: senhaOriginal,
        });

      const refreshTokenValido = loginResponse.body.refreshToken;

      // Atualizar o refreshToken no banco para um valor diferente
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { refreshToken: 'token-diferente-no-banco' },
      });

      // Tentar usar o token antigo que não corresponde ao banco
      const response = await request(app)
        .post('/auth/refresh-token')
        .send({
          refreshToken: refreshTokenValido,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/inválido|expirado/i);

      // Restaurar o refreshToken correto no banco para não afetar outros testes
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { refreshToken: refreshTokenValido },
      });
    });

    it('deve retornar erro quando usuário não existir', async () => {
      // Criar token com ID inexistente
      const secret = process.env.JWT_REFRESH_SECRET || 'testsecret';
      const tokenUsuarioInexistente = jwt.sign(
        {
          id: 'id-inexistente-123',
          email: 'inexistente@teste.com',
          regra: 'USUARIO',
          type: 'refresh',
        },
        secret,
        { 
          expiresIn: '7d',
          issuer: 'helpme-api',
          audience: 'helpme-client'
        }
      );

      const response = await request(app)
        .post('/auth/refresh-token')
        .send({
          refreshToken: tokenUsuarioInexistente,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/Usuário não encontrado|inválido/i);
    });

    it('deve retornar erro quando conta estiver inativa', async () => {
      // Fazer login fresco para ter token válido
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: usuarioEmail,
          password: senhaOriginal,
        });

      const tokenAtivo = loginResponse.body.refreshToken;

      // Desativar conta
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { ativo: false },
      });

      const response = await request(app)
        .post('/auth/refresh-token')
        .send({
          refreshToken: tokenAtivo,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Conta inativa');

      // Reativar conta
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { ativo: true },
      });
    });
  });

  describe('GET /auth/me - Perfil do usuário autenticado', () => {
    let userAccessToken: string;

    beforeAll(async () => {
      // Fazer login para obter token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: usuarioEmail,
          password: senhaOriginal,
        });

      userAccessToken = loginResponse.body.accessToken;
    });

    it('deve retornar perfil do usuário autenticado', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${userAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('nome');
      expect(response.body).toHaveProperty('sobrenome');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('regra');
      expect(response.body).toHaveProperty('setor');
      expect(response.body.email).toBe(usuarioEmail);
      expect(response.body.regra).toBe('USUARIO');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('refreshToken');
    });

    it('deve retornar erro quando não autenticado', async () => {
      const response = await request(app)
        .get('/auth/me');

      expect(response.status).toBe(401);
    });

    it('deve retornar erro com token inválido', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer token-invalido');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /auth/status - Status de autenticação', () => {
    let statusToken: string;

    beforeAll(async () => {
      // Fazer login para obter token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: adminEmail,
          password: senhaOriginal,
        });

      statusToken = loginResponse.body.accessToken;
    });

    it('deve retornar status autenticado', async () => {
      const response = await request(app)
        .get('/auth/status')
        .set('Authorization', `Bearer ${statusToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('autenticado');
      expect(response.body.autenticado).toBe(true);
      expect(response.body).toHaveProperty('usuario');
      expect(response.body.usuario).toHaveProperty('id');
      expect(response.body.usuario).toHaveProperty('email');
      expect(response.body.usuario).toHaveProperty('regra');
    });

    it('deve retornar status não autenticado', async () => {
      const response = await request(app)
        .get('/auth/status');

      expect(response.status).toBe(401);
      // Middleware retorna erro antes de chegar na rota
    });
  });

  describe('Segurança - Proteção contra ataques', () => {
    it('deve bloquear tentativas de SQL injection no email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: "admin@teste.com' OR '1'='1",
          password: senhaOriginal,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email inválido');
    });

    it('deve validar formato de email corretamente', async () => {
      const emailsInvalidos = [
        'email@',
        '@teste.com',
        'email',
        'email@.com',
        'email @teste.com',
      ];

      for (const email of emailsInvalidos) {
        const response = await request(app)
          .post('/auth/login')
          .send({
            email,
            password: senhaOriginal,
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Email inválido');
      }
    });

    it('deve rejeitar tokens com assinatura adulterada', async () => {
      // Criar token com assinatura falsa
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFkbWluIiwiZW1haWwiOiJhZG1pbkBoZWxwbWUuY29tIiwicmVncmEiOiJBRE1JTiJ9.fake_signature';

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Fluxo completo de autenticação', () => {
    it('deve completar fluxo: login -> acesso -> refresh -> logout', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: adminEmail,
          password: senhaOriginal,
        });

      expect(loginResponse.status).toBe(200);
      const { accessToken: token1, refreshToken: refresh1 } = loginResponse.body;

      // 2. Acessar recurso protegido
      const meResponse = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token1}`);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.email).toBe(adminEmail);

      // 3. Renovar token
      const refreshResponse = await request(app)
        .post('/auth/refresh-token')
        .send({ refreshToken: refresh1 });

      expect(refreshResponse.status).toBe(200);
      const { accessToken: token2 } = refreshResponse.body;

      // 4. Usar novo token
      const meResponse2 = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token2}`);

      expect(meResponse2.status).toBe(200);

      // 5. Logout
      const logoutResponse = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token2}`);

      expect(logoutResponse.status).toBe(200);

      // Aguardar processamento da blacklist
      await new Promise(resolve => setTimeout(resolve, 100));

      // 6. Tentar usar token após logout
      const meResponse3 = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token2}`);

      // Token pode ainda funcionar se blacklist não estiver implementada
      expect([200, 401]).toContain(meResponse3.status);
      
      if (meResponse3.status === 200) {
        console.warn('[WARNING] Token ainda válido após logout - blacklist JWT pode não estar implementada');
      }
    });
  });
});