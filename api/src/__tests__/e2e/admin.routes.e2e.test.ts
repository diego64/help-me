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

// AUMENTA O TIMEOUT GLOBAL
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

describe('E2E - Rotas de Admin', () => {
  let adminToken: string;
  let adminId: string;
  let segundoAdminId: string;

  // ADICIONA TIMEOUT ESPECÍFICO NO beforeAll
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI_TEST || 
      'mongodb://teste:senha@localhost:27018/helpme-mongo-teste?authSource=admin';
    
    console.log('[INFO] BANCO DE DADOS MONGODB TESTE - CONECTANDO EM:', mongoUri);
    
    try {
      // Timeout de 10 segundos para MongoDB
      await Promise.race([
        mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 10000,
          connectTimeoutMS: 10000,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout ao conectar no MongoDB')), 10000)
        )
      ]);
      console.log('[INFO] MongoDB conectado com sucesso');
    } catch (error) {
      console.error('[ERROR] Falha ao conectar no MongoDB:', error);
      throw error;
    }

    try {
      // Testa conexão com PostgreSQL
      console.log('[INFO] Testando conexão com PostgreSQL...');
      await prisma.$connect();
      console.log('[INFO] PostgreSQL conectado com sucesso');
    } catch (error) {
      console.error('[ERROR] Falha ao conectar no PostgreSQL:', error);
      throw error;
    }

    // Limpar base de dados
    console.log('[INFO] Limpando base de dados...');
    await prisma.usuario.deleteMany({});

    // Criar admin principal para testes
    console.log('[INFO] Criando admin de teste...');
    const senhaHash = await bcrypt.hash('Admin123!', 10);
    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin',
        sobrenome: 'Principal',
        email: 'admin.teste@helpme.com',
        password: senhaHash,
        regra: 'ADMIN',
        setor: 'TECNOLOGIA_INFORMACAO',
        ativo: true,
      },
    });
    adminId = admin.id;

    // Gerar token JWT
    const secret = process.env.JWT_SECRET || 'testsecret';
    adminToken = jwt.sign(
      { 
        id: admin.id, 
        email: admin.email, 
        regra: admin.regra,
        type: 'access'
      },
      secret,
      { 
        expiresIn: '1h',
        issuer: 'helpme-api',
        audience: 'helpme-client'
      }
    );
    
    console.log('[INFO] Setup completo!');
  }, 30000);

  afterAll(async () => {
    console.log('[INFO] Limpando e desconectando...');
    await prisma.usuario.deleteMany({});
    await mongoose.disconnect();
    await prisma.$disconnect();
  }, 15000);

  describe('POST /admin - Criar novo administrador', () => {
    it('deve criar um novo administrador com dados válidos', async () => {
      const dados = {
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao.silva@helpme.com',
        password: 'Senha123!',
        setor: 'ADMINISTRACAO',
        telefone: '(11) 99999-0001',
        ramal: '1001',
      };

      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dados);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.nome).toBe(dados.nome);
      expect(response.body.sobrenome).toBe(dados.sobrenome);
      expect(response.body.email).toBe(dados.email);
      expect(response.body.regra).toBe('ADMIN');
      expect(response.body.ativo).toBe(true);
      expect(response.body).not.toHaveProperty('password');

      segundoAdminId = response.body.id;
    });

    it('deve retornar erro quando campos obrigatórios não forem enviados', async () => {
      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'João',
          // faltando sobrenome, email, password
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Campos obrigatórios');
    });

    it('deve retornar erro quando email for inválido', async () => {
      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'email-invalido',
          password: 'Senha123!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email inválido');
    });

    it('deve retornar erro quando senha for menor que 8 caracteres', async () => {
      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'teste@helpme.com',
          password: '123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve retornar erro quando email já estiver cadastrado', async () => {
      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao.silva@helpme.com', // já cadastrado no primeiro teste
          password: 'Senha123!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email já cadastrado');
    });

    it('deve reativar administrador deletado com mesmo email', async () => {
      // Primeiro, fazer soft delete de um admin
      await prisma.usuario.update({
        where: { id: segundoAdminId },
        data: {
          deletadoEm: new Date(),
          ativo: false,
        },
      });

      // Tentar criar novo admin com mesmo email
      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'João',
          sobrenome: 'Silva Atualizado',
          email: 'joao.silva@helpme.com',
          password: 'NovaSenha123!',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('reativado');
      expect(response.body.admin.ativo).toBe(true);
      expect(response.body.admin.deletadoEm).toBeNull();
    });
  });

  describe('GET /admin - Listar administradores', () => {
    it('deve listar todos os administradores ativos com paginação', async () => {
      const response = await request(app)
        .get('/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('totalPages');
      expect(response.body).toHaveProperty('admins');
      expect(Array.isArray(response.body.admins)).toBe(true);
      
      response.body.admins.forEach((admin: any) => {
        expect(admin.regra).toBe('ADMIN');
        expect(admin).not.toHaveProperty('password');
      });
    });

    it('deve respeitar parâmetros de paginação', async () => {
      const response = await request(app)
        .get('/admin?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(5);
      expect(response.body.admins.length).toBeLessThanOrEqual(5);
    });

    it('deve incluir administradores inativos quando solicitado', async () => {
      // Criar um admin e desativar
      const adminInativo = await prisma.usuario.create({
        data: {
          nome: 'Admin',
          sobrenome: 'Inativo',
          email: 'inativo@helpme.com',
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'ADMIN',
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const response = await request(app)
        .get('/admin?incluirInativos=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const temInativo = response.body.admins.some((a: any) => a.id === adminInativo.id);
      expect(temInativo).toBe(true);
    });
  });

  describe('GET /admin/:id - Buscar administrador por ID', () => {
    it('deve retornar dados do administrador quando encontrado', async () => {
      const response = await request(app)
        .get(`/admin/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(adminId);
      expect(response.body.regra).toBe('ADMIN');
      expect(response.body).not.toHaveProperty('password');
    });

    it('deve retornar erro 404 quando administrador não existir', async () => {
      const response = await request(app)
        .get('/admin/id-inexistente')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Administrador não encontrado');
    });
  });

  describe('PUT /admin/:id - Atualizar administrador', () => {
    it('deve atualizar dados do administrador com sucesso', async () => {
      const novosDados = {
        nome: 'João Atualizado',
        telefone: '(11) 99999-9999',
        ramal: '2000',
      };

      const response = await request(app)
        .put(`/admin/${segundoAdminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(novosDados);

      expect(response.status).toBe(200);
      expect(response.body.nome).toBe(novosDados.nome);
      expect(response.body.telefone).toBe(novosDados.telefone);
      expect(response.body.ramal).toBe(novosDados.ramal);
    });

    it('deve atualizar senha quando fornecida', async () => {
      const novaSenha = 'NovaSenha123!';

      const response = await request(app)
        .put(`/admin/${segundoAdminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: novaSenha });

      expect(response.status).toBe(200);

      // Verificar se senha foi atualizada
      const admin = await prisma.usuario.findUnique({
        where: { id: segundoAdminId },
      });
      const senhaCorreta = await bcrypt.compare(novaSenha, admin?.password || '');
      expect(senhaCorreta).toBe(true);
    });

    it('deve retornar erro quando email já estiver em uso', async () => {
      const response = await request(app)
        .put(`/admin/${segundoAdminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'admin.teste@helpme.com', // email do admin principal
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email já cadastrado');
    });

    it('deve retornar erro 404 quando administrador não existir', async () => {
      const response = await request(app)
        .put('/admin/id-inexistente')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Teste' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Administrador não encontrado');
    });

    it('deve retornar erro quando senha for menor que 8 caracteres', async () => {
      const response = await request(app)
        .put(`/admin/${segundoAdminId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: '123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no mínimo 8 caracteres');
    });
  });

  describe('DELETE /admin/:id - Deletar administrador', () => {
    it('deve fazer soft delete do administrador', async () => {
      const response = await request(app)
        .delete(`/admin/${segundoAdminId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('desativado com sucesso');

      // Verificar soft delete
      const admin = await prisma.usuario.findUnique({
        where: { id: segundoAdminId },
      });
      expect(admin?.deletadoEm).not.toBeNull();
      expect(admin?.ativo).toBe(false);
    });

    it('deve fazer hard delete quando solicitado', async () => {
      // Criar novo admin para deletar permanentemente
      const adminParaDeletar = await prisma.usuario.create({
        data: {
          nome: 'Para',
          sobrenome: 'Deletar',
          email: 'deletar@helpme.com',
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'ADMIN',
        },
      });

      const response = await request(app)
        .delete(`/admin/${adminParaDeletar.id}?permanente=true`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('excluído permanentemente');

      // Verificar que foi deletado permanentemente
      const admin = await prisma.usuario.findUnique({
        where: { id: adminParaDeletar.id },
      });
      expect(admin).toBeNull();
    });

    it('deve retornar erro ao tentar deletar a própria conta', async () => {
      const response = await request(app)
        .delete(`/admin/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Não é possível deletar sua própria conta');
    });

    it('deve retornar erro 404 quando administrador não existir', async () => {
      const response = await request(app)
        .delete('/admin/id-inexistente')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Administrador não encontrado');
    });
  });

  describe('PATCH /admin/:id/reativar - Reativar administrador', () => {
    it('deve reativar administrador deletado com sucesso', async () => {
      const response = await request(app)
        .patch(`/admin/${segundoAdminId}/reativar`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('reativado com sucesso');
      expect(response.body.admin.ativo).toBe(true);

      // Verificar no banco
      const admin = await prisma.usuario.findUnique({
        where: { id: segundoAdminId },
      });
      expect(admin?.deletadoEm).toBeNull();
      expect(admin?.ativo).toBe(true);
    });

    it('deve retornar erro quando administrador já estiver ativo', async () => {
      const response = await request(app)
        .patch(`/admin/${segundoAdminId}/reativar`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('já está ativo');
    });

    it('deve retornar erro 404 quando administrador não existir', async () => {
      const response = await request(app)
        .patch('/admin/id-inexistente/reativar')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Administrador não encontrado');
    });
  });

  describe('Autorização - Verificar permissões', () => {
    it('deve negar acesso sem token de autenticação', async () => {
      const response = await request(app)
        .get('/admin');

      expect(response.status).toBe(401);
    });

    it('deve negar acesso com token inválido', async () => {
      const response = await request(app)
        .get('/admin')
        .set('Authorization', 'Bearer token-invalido');

      expect(response.status).toBe(401);
    });

    it('deve negar acesso para usuário sem perfil ADMIN', async () => {
      // Criar usuário comum
      const usuario = await prisma.usuario.create({
        data: {
          nome: 'Usuario',
          sobrenome: 'Comum',
          email: 'usuario@helpme.com',
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
        },
      });

      const secret = process.env.JWT_SECRET || 'testsecret';
      const usuarioToken = jwt.sign(
        { 
          id: usuario.id, 
          email: usuario.email, 
          regra: usuario.regra,
          type: 'access'
        },
        secret,
        { 
          expiresIn: '1h',
          issuer: 'helpme-api',
          audience: 'helpme-client'
        }
      );

      const response = await request(app)
        .get('/admin')
        .set('Authorization', `Bearer ${usuarioToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Validações de dados', () => {
    it('deve validar formato de email ao criar', async () => {
      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'Teste',
          sobrenome: 'Validação',
          email: 'email@invalido',
          password: 'Senha123!',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Email inválido');
    });

    it('deve validar tamanho mínimo da senha', async () => {
      const response = await request(app)
        .post('/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'Teste',
          sobrenome: 'Validação',
          email: 'teste.validacao@helpme.com',
          password: '123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no mínimo 8 caracteres');
    });
  });
});