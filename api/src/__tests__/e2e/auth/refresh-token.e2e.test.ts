import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { createTestUser } from '../setup/test.database';
import { generateUniqueEmail, extractErrorMessage, loginUser } from '../setup/test.helpers'; 

// Helper para aguardar
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('E2E: Autenticação - Refresh Token', () => {
  describe('POST /api/auth/refresh-token', () => {
    it('deve renovar tokens com refresh token válido', async () => {
      const userEmail = generateUniqueEmail('refresh-test');
      const userPassword = 'Senha123!';
      
      await createTestUser({
        email: userEmail,
        password: userPassword,
      });
      
      const loginResponse = await loginUser(userEmail, userPassword);
      const { refreshToken: oldRefreshToken, accessToken: oldAccessToken } = loginResponse;
      
      // Aguarda um pouco para garantir timestamps diferentes
      await sleep(1000);
      
      // Renova os tokens
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({
          refreshToken: oldRefreshToken,
        });
      
      // Verifica resposta
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn');
      
      // Novos tokens devem ser diferentes dos antigos
      expect(response.body.accessToken).not.toBe(oldAccessToken);
      expect(response.body.refreshToken).not.toBe(oldRefreshToken);
    });
    
    it('deve rejeitar sem refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({});
      
      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toContain('obrigatório');
    });
    
    it('deve rejeitar refresh token vazio', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({
          refreshToken: '',
        });
      
      expect(response.status).toBe(400);
      expect(extractErrorMessage(response)).toContain('obrigatório');
    });
    
    it('deve rejeitar refresh token inválido', async () => {
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({
          refreshToken: 'token-invalido-qualquer',
        });
      
      expect(response.status).toBe(401);
      expect(extractErrorMessage(response)).toContain('inválido');
    });
    
    it.skip('não deve permitir reutilizar refresh token antigo - PENDENTE: Token Rotation', async () => {
      // NOTA: Token rotation (invalidar token antigo após renovação) não está implementado
      // Para implementar: invalide o refresh token anterior no banco após gerar um novo
      
      const { refreshToken: firstRefreshToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      // Renova tokens (primeira vez)
      const firstRenewal = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: firstRefreshToken })
        .expect(200);
      
      const { refreshToken: secondRefreshToken } = firstRenewal.body;
      
      // Tenta reutilizar o primeiro refresh token
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: firstRefreshToken });
      
      expect(response.status).toBe(401);
      expect(extractErrorMessage(response)).toContain('inválido');
      
      // Mas o segundo refresh token deve funcionar
      const validRenewal = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: secondRefreshToken });
      
      expect(validRenewal.status).toBe(200);
    });
    
    it('deve invalidar refresh token após logout', async () => {
      const { accessToken, refreshToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      
      // Tenta usar refresh token após logout
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });
      
      expect(response.status).toBe(401);
      expect(extractErrorMessage(response)).toContain('inválido');
    });
    
    it('deve rejeitar refresh token de usuário inativo', async () => {
      const userEmail = generateUniqueEmail('to-deactivate');
      const userPassword = 'Senha123!';
      
      const user = await createTestUser({
        email: userEmail,
        password: userPassword,
        ativo: true,
      });
      
      const { refreshToken } = await loginUser(userEmail, userPassword);
      
      const { prisma } = await import('../../../infrastructure/database/prisma/client');
      await prisma.usuario.update({
        where: { id: user.id },
        data: { ativo: false },
      });
      
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });
      
      expect(response.status).toBe(401);
      expect(extractErrorMessage(response)).toContain('inativa');
    });
    
    it('deve funcionar múltiplas renovações em sequência', async () => {
      let { refreshToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      for (let i = 0; i < 3; i++) {
        await sleep(500);
        
        const response = await request(app)
          .post('/api/auth/refresh-token')
          .send({ refreshToken })
          .expect(200);
        
        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        
        refreshToken = response.body.refreshToken;
      }
    });
    
    it('novo access token deve funcionar normalmente', async () => {
      const { refreshToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      const renewalResponse = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken })
        .expect(200);
      
      const { accessToken: newAccessToken } = renewalResponse.body;
      
      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${newAccessToken}`);
      
      expect(meResponse.status).toBe(200);
      expect(meResponse.body).toHaveProperty('email');
    });
    
    it('deve manter dados do usuário após renovação', async () => {
      const loginResponse = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      const originalUserId = loginResponse.usuario.id;
      const originalUserEmail = loginResponse.usuario.email;
      
      const renewalResponse = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: loginResponse.refreshToken })
        .expect(200);
      
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${renewalResponse.body.accessToken}`)
        .expect(200);
      
      expect(profileResponse.body.id).toBe(originalUserId);
      expect(profileResponse.body.email).toBe(originalUserEmail);
    });
    
    it('deve retornar tempo de expiração correto', async () => {
      const { refreshToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      const response = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken })
        .expect(200);
      
      expect(response.body.expiresIn).toBeDefined();
      
      const expiresIn = typeof response.body.expiresIn === 'string' 
        ? parseInt(response.body.expiresIn, 10)
        : response.body.expiresIn;
      
      expect(expiresIn).toBeGreaterThan(0);
    });
    
    it('deve permitir logout após renovação de token', async () => {
      const { refreshToken } = await loginUser(
        process.env.USER_EMAIL || 'user@helpme.com',
        process.env.USER_PASSWORD || 'User123!'
      );
      
      const renewalResponse = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken })
        .expect(200);
      
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${renewalResponse.body.accessToken}`);
      
      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body).toHaveProperty('message');
    });
  });
});