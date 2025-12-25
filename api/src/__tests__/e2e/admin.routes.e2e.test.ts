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
import { prisma } from '../../lib/prisma'; // ← VOLTA PARA O PRISMA NORMAL
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import app from '../../app';
import jwt from 'jsonwebtoken';

vi.setConfig({ testTimeout: 20000 });

describe('E2E - Rotas de Técnicos', () => {
  let adminToken: string;
  let tecnicoToken: string;
  let adminId: string;
  let tecnicoId: string;
  let senhaOriginal: string;

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI_TEST || 
      'mongodb://teste:senha@localhost:27018/helpme-mongo-teste?authSource=admin';
    
    console.log('[INFO] BANCO DE DADOS MONGODB TESTE - CONECTADO EM:', mongoUri);
    await mongoose.connect(mongoUri);

    await prisma.expediente.deleteMany({});
    await prisma.usuario.deleteMany({});

    senhaOriginal = 'SenhaSegura';
    const hashed = await bcrypt.hash(senhaOriginal, 10);

    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin',
        sobrenome: 'Sistema',
        email: 'admin-admin-test@teste.com',
        password: hashed,
        regra: 'ADMIN',
      },
    });
    adminId = admin.id;

    const tecnico = await prisma.usuario.create({
      data: {
        nome: 'Tecnico',
        sobrenome: 'Apoio',
        email: 'tecnico1@teste.com',
        password: hashed,
        regra: 'TECNICO',
        setor: 'TECNOLOGIA_INFORMACAO',
      },
    });
    tecnicoId = tecnico.id;

    await prisma.expediente.create({ 
      data: { 
        usuarioId: tecnicoId, 
        entrada: '09:00', 
        saida: '17:00' 
      } 
    });

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
    tecnicoToken = jwt.sign(
      { 
        id: tecnico.id, 
        email: tecnico.email, 
        regra: tecnico.regra,
        type: 'access'
      },
      secret,
      { 
        expiresIn: '1h',
        issuer: 'helpme-api',
        audience: 'helpme-client'
      }
    );
  });

  afterAll(async () => {
    await prisma.expediente.deleteMany({});
    await prisma.usuario.deleteMany({});
    await mongoose.disconnect();
    await prisma.$disconnect();
  });

  describe('Dado um admin autenticado, Quando POST /tecnico com dados válidos, Então deve criar um novo técnico', () => {
    it('cria um novo técnico', async () => {
      // Arrange
      const dados = {
        nome: 'Novo',
        sobrenome: 'Tecnico',
        email: 'novotecnico@teste.com',
        password: 'minhasenha123',
        telefone: '11999999999',
        ramal: '220',
      };
      // Act
      const response = await request(app)
        .post('/tecnico')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dados);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body.nome).toBe(dados.nome);
      expect(response.body.regra).toBe('TECNICO');
      // Verifica se horário foi criado
      const exped = await prisma.expediente.findFirst({ where: { usuarioId: response.body.id } });
      expect(exped).not.toBeNull();
    });
    
    it('recusa criação sem senha', async () => {
      const response = await request(app)
        .post('/tecnico')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'SemSenha',
          sobrenome: 'Tecnico',
          email: 'sem@teste.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Senha obrigatória');
    });
  });

  describe('Dado admin autenticado, Quando GET /tecnico, Então deve listar todos os técnicos', () => {
    it('lista todos técnicos', async () => {
      // Act
      const response = await request(app)
        .get('/tecnico')
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((tecnico: any) => {
        expect(tecnico.regra).toBe('TECNICO');
        expect(tecnico).toHaveProperty('tecnicoDisponibilidade');
      });
    });
  });

  describe('Dado admin ou técnico autenticado, Quando PUT /tecnico/:id com dados válidos, Então edita o perfil', () => {
    it('edita dados do técnico', async () => {
      // Arrange
      const novoNome = 'TecnicoAtualizado';
      // Act
      const response = await request(app)
        .put(`/tecnico/${tecnicoId}`)
        .set('Authorization', `Bearer ${tecnicoToken}`)
        .send({ nome: novoNome });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.nome).toBe(novoNome);
    });
    it('retorna erro se ID não encontrado', async () => {
      const response = await request(app)
        .put('/tecnico/id-nao-existe')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Qualquer' });
      expect(response.status).toBe(400);
      expect(response.body.error).not.toBe('');
    });
  });

  describe('Dado admin ou técnico autenticado, Quando PUT /tecnico/:id/password, Então altera a senha do técnico', () => {
    it('altera senha personalizada', async () => {
      // Arrange
      const novaSenha = 'novaSenha123';
      // Act
      const response = await request(app)
        .put(`/tecnico/${tecnicoId}/password`)
        .set('Authorization', `Bearer ${tecnicoToken}`)
        .send({ password: novaSenha });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Senha alterada com sucesso');

      // Valida no banco se está com hash novo
      const tecnicoDb = await prisma.usuario.findUnique({ where: { id: tecnicoId } });
      const hashBate = await bcrypt.compare(novaSenha, tecnicoDb?.password ?? '');
      expect(hashBate).toBe(true);
    });
    it('recusa alteração sem senha', async () => {
      const response = await request(app)
        .put(`/tecnico/${tecnicoId}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Senha obrigatória');
    });
  });

  describe('Dado admin ou técnico autenticado, Quando PUT /tecnico/:id/horarios, Então altera horários do técnico', () => {
    it('atualiza horários do técnico', async () => {
      // Arrange
      const entrada = '07:00';
      const saida = '18:00';

      // Act
      const response = await request(app)
        .put(`/tecnico/${tecnicoId}/horarios`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entrada, saida });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Horário de disponibilidade atualizado');
      expect(response.body.horario.entrada).toBe(entrada);
      expect(response.body.horario.saida).toBe(saida);
    });
    it('falta campos obrigatórios', async () => {
      const response = await request(app)
        .put(`/tecnico/${tecnicoId}/horarios`)
        .set('Authorization', `Bearer ${tecnicoToken}`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Campos entrada e saida são obrigatórios');
    });
  });

  describe('Dado admin autenticado, Quando DELETE /tecnico/:id, Então exclui técnico e seus horários', () => {
    it('exclui com sucesso', async () => {
      // Arrange
      // Cria novo técnico para remover
      const tecnicoNovo = await prisma.usuario.create({
        data: {
          nome: 'ParaRemover',
          sobrenome: 'Apagar',
          email: 'remove@teste.com',
          password: await bcrypt.hash('remover123', 10),
          regra: 'TECNICO',
          setor: 'TECNOLOGIA_INFORMACAO',
        },
      });
      const idRemover = tecnicoNovo.id;
      await prisma.expediente.create({ data: { usuarioId: idRemover, entrada: '08:00', saida: '16:00' } });

      // Act
      const response = await request(app)
        .delete(`/tecnico/${idRemover}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('excluídos com sucesso');
      // Confirma remoção
      const existe = await prisma.usuario.findUnique({ where: { id: idRemover } });
      expect(existe).toBeNull();
      const exped = await prisma.expediente.findMany({ where: { usuarioId: idRemover } });
      expect(exped.length).toBe(0);
    });
    it('erro ao remover id inexistente', async () => {
      const response = await request(app)
        .delete('/tecnico/id-inexistente')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(400);
      expect(response.body.error).not.toBe('');
    });
  });

  describe('Dado admin ou técnico autenticado, Quando POST /tecnico/:id/avatar com arquivo, Então faz upload do avatar', () => {
    it('envia avatar com sucesso', async () => {
      // Arrange
      // Como é e2e, usar um arquivo pequeno qualquer, pode ser um buffer simples:
      const fakeAvatar = Buffer.from('imagemfake123');
      // Act
      const response = await request(app)
        .post(`/tecnico/${tecnicoId}/avatar`)
        .set('Authorization', `Bearer ${tecnicoToken}`)
        .attach('avatar', fakeAvatar, 'avatar.png');
      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Imagem enviada com sucesso');
      expect(response.body.tecnico.avatarUrl).toContain('uploads/');
    });

    it('erro se não enviar arquivo', async () => {
      const response = await request(app)
        .post(`/tecnico/${tecnicoId}/avatar`)
        .set('Authorization', `Bearer ${tecnicoToken}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Arquivo não enviado');
    });
  });
});