import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestUser } from '../setup/test.database';
import { generateUniqueEmail, extractErrorMessage, loginUser } from '../setup/test.helpers'; 

describe('E2E: Autenticação - Login', () => {
  describe('POST /api/auth/login', () => {
    it('deve fazer login com credenciais válidas', async () => {
      const userEmail = generateUniqueEmail('login-test');
      const userPassword = 'Senha123!';
      
      await createTestUser({
        nome: 'Teste',
        sobrenome: 'Login',
        email: userEmail,
        password: userPassword,
        regra: 'USUARIO',
      });
      
      // Act: Tenta fazer login
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: userEmail,
          password: userPassword,
        });
      
      // Assert: Verifica resposta
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('usuario');
      
      // Verifica dados do usuário
      expect(response.body.usuario.email).toBe(userEmail);
      expect(response.body.usuario.nome).toBe('Teste');
      expect(response.body.usuario.sobrenome).toBe('Login');
      
      // Não deve retornar senha
      expect(response.body.usuario).not.toHaveProperty('password');
      expect(response.body.usuario).not.toHaveProperty('refreshToken');
    });
    
    it('deve rejeitar login com email inválido', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'email-invalido',
          password: 'Senha123!',
        });
      
      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toContain('Email inválido');
    });
    
    it('deve rejeitar login sem email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'Senha123!',
        });
      
      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toContain('obrigatório');
    });
    
    it('deve rejeitar login sem senha', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
        });
      
      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toContain('obrigatório');
    });
    
    it('deve rejeitar login com usuário inexistente', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'naoexiste@example.com',
          password: 'Senha123!',
        });
      
      expect(response.status).toBe(401);
      expect(extractErrorMessage(response)).toContain('Credenciais inválidas');
    });
    
    it('deve rejeitar login com senha incorreta', async () => {
      const userEmail = generateUniqueEmail('wrong-password');
      await createTestUser({
        email: userEmail,
        password: 'SenhaCorreta123!',
      });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: userEmail,
          password: 'SenhaErrada123!',
        });
      
      expect(response.status).toBe(401);
      expect(extractErrorMessage(response)).toContain('Credenciais inválidas');
    });
    
    it('deve rejeitar login de usuário inativo', async () => {
      const userEmail = generateUniqueEmail('inactive');
      await createTestUser({
        email: userEmail,
        password: 'Senha123!',
        ativo: false,
      });
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: userEmail,
          password: 'Senha123!',
        });
      
      expect(response.status).toBe(401);
      expect(extractErrorMessage(response)).toContain('inativa');
    });
    
    it('deve bloquear após múltiplas tentativas falhas', async () => {
      const userEmail = generateUniqueEmail('brute-force');
      await createTestUser({
        email: userEmail,
        password: 'SenhaCorreta123!',
      });
      
      // Faz 5 tentativas com senha errada
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: userEmail,
            password: 'SenhaErrada!',
          });
      }
      
      // 6ª tentativa deve ser bloqueada
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: userEmail,
          password: 'SenhaCorreta123!',
        });
      
      expect(response.status).toBe(429);
      expect(extractErrorMessage(response)).toContain('Muitas tentativas');
    });
    
    it('deve permitir login com diferentes regras de usuário', async () => {
      const regras = ['ADMIN', 'TECNICO', 'USUARIO'] as const;
      
      for (const regra of regras) {
        const userEmail = generateUniqueEmail(`role-${regra.toLowerCase()}`);
        const userPassword = 'Senha123!';
        
        await createTestUser({
          email: userEmail,
          password: userPassword,
          regra,
        });
        
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: userEmail,
            password: userPassword,
          });
        
        expect(response.status).toBe(200);
        expect(response.body.usuario.regra).toBe(regra);
      }
    });
  });
  
  describe('POST /api/auth/logout', () => {
    it('deve fazer logout com sucesso', async () => {
      const { accessToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });
    
    it('deve rejeitar logout sem token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');
      
      expect(response.status).toBe(401);
    });
    
    it.skip('não deve permitir usar token após logout - PENDENTE: Implementar blacklist', async () => {
      const { accessToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/auth/me', () => {
    it('deve retornar perfil do usuário autenticado', async () => {
      const { accessToken, usuario } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(usuario.id);
      expect(response.body.email).toBe(usuario.email);
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('refreshToken');
    });
    
    it('deve rejeitar sem token', async () => {
      const response = await request(app)
        .get('/api/auth/me');
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/auth/status', () => {
    it('deve retornar status autenticado quando logado', async () => {
      const { accessToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      const response = await request(app)
        .get('/api/auth/status')
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.autenticado).toBe(true);
      expect(response.body).toHaveProperty('usuario');
    });
    
    it('deve retornar não autenticado sem token', async () => {
      const response = await request(app)
        .get('/api/auth/status');
      
      expect(response.status).toBe(401);
    });
  });
});