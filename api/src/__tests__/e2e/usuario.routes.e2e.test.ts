import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../../lib/prisma';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import app from '../../app';
import jwt from 'jsonwebtoken';

vi.setConfig({ testTimeout: 20000 });

function gerarTokenAcesso(usuarioId: string, regra: string): string {
  const secret = process.env.JWT_SECRET || 'testsecret';
  
  const payload = {
    id: usuarioId,
    regra: regra,
    type: 'access',
  };
  
  return jwt.sign(
    payload,
    secret,
    { 
      algorithm: 'HS256',
      audience: 'helpme-client', 
      issuer: 'helpme-api',
      expiresIn: '8h'
    }
  );
}

async function limparBancoDados() {
  try {
    await prisma.chamado.deleteMany({});
    await prisma.expediente.deleteMany({});
    await prisma.servico.deleteMany({});
    await prisma.usuario.deleteMany({});
    console.log('Banco de dados limpo');
  } catch (error) {
    console.error('Erro ao limpar banco de dados:', error);
    throw error;
  }
}

describe('E2E - Rotas de Usuário', () => {
  let tokenAdmin: string;
  let tokenUsuario: string;
  let idAdmin: string;
  let idUsuario: string;

  beforeAll(async () => {
    try {
      const uriMongo = process.env.MONGO_INITDB_URI || 'mongodb://teste:senha@localhost:27017/helpme-mongo-teste?authSource=admin';
      await mongoose.connect(uriMongo);

      await limparBancoDados();

      const senhaHasheada = await bcrypt.hash('SenhaSegura123', 10);

      const usuarioAdmin = await prisma.usuario.create({
        data: {
          nome: 'Admin',
          sobrenome: 'Sistema',
          email: 'admin@teste.com',
          password: senhaHasheada,
          regra: 'ADMIN',
        },
      });
      idAdmin = usuarioAdmin.id;

      const usuarioComum = await prisma.usuario.create({
        data: {
          nome: 'Usuario',
          sobrenome: 'Comum',
          email: 'usuario@teste.com',
          password: senhaHasheada,
          regra: 'USUARIO',
          setor: 'TECNOLOGIA_INFORMACAO',
        },
      });
      idUsuario = usuarioComum.id;

      tokenAdmin = gerarTokenAcesso(idAdmin, 'ADMIN');
      tokenUsuario = gerarTokenAcesso(idUsuario, 'USUARIO');

      console.log('Setup completo para testes E2E - Usuários e tokens criados');
    } catch (error) {
      console.error('Erro no beforeAll:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await limparBancoDados();
      await mongoose.disconnect();
      await prisma.$disconnect();
      console.log('Cleanup completo');
    } catch (error) {
      console.error('Erro no afterAll:', error);
      await mongoose.disconnect().catch(() => {});
      await prisma.$disconnect().catch(() => {});
    }
  });

  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar POST /usuario com dados válidos', () => {
      it('Então deve criar um novo usuário com sucesso', async () => {
        const dadosNovoUsuario = {
          nome: 'Novo',
          sobrenome: 'Usuario',
          email: 'novousuario@teste.com',
          password: 'senha123',
          telefone: '11987654321',
          ramal: '100',
          setor: 'TECNOLOGIA_INFORMACAO',
        };

        const resposta = await request(app)
          .post('/usuario')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send(dadosNovoUsuario);

        expect(resposta.status).toBe(201);
        expect(resposta.body).toHaveProperty('id');
        expect(resposta.body.nome).toBe(dadosNovoUsuario.nome);
        expect(resposta.body.sobrenome).toBe(dadosNovoUsuario.sobrenome);
        expect(resposta.body.email).toBe(dadosNovoUsuario.email);
        expect(resposta.body.regra).toBe('USUARIO');
        
        if (resposta.body.password) {
          expect(resposta.body.password).not.toBe(dadosNovoUsuario.password);
          expect(resposta.body.password).toMatch(/^\$2b\$/);
        }
      });
    });

    describe('Quando enviar POST /usuario sem o campo senha', () => {
      it('Então deve rejeitar a criação com erro 400', async () => {
        const dadosSemSenha = {
          nome: 'SemSenha',
          sobrenome: 'Usuario',
          email: 'semsenhaa@teste.com',
          setor: 'TECNOLOGIA_INFORMACAO',
        };

        const resposta = await request(app)
          .post('/usuario')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send(dadosSemSenha);

        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toContain('Senha obrigatória');
      });
    });
  });

  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar GET /usuario', () => {
      it('Então deve listar todos os usuários com regra USUARIO', async () => {
        const resposta = await request(app)
          .get('/usuario')
          .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(resposta.status).toBe(200);
        expect(Array.isArray(resposta.body)).toBe(true);
        expect(resposta.body.length).toBeGreaterThan(0);

        resposta.body.forEach((usuario: any) => {
          expect(usuario).toHaveProperty('id');
          expect(usuario).toHaveProperty('nome');
          expect(usuario).toHaveProperty('email');
          expect(usuario).toHaveProperty('setor');
          expect(usuario).not.toHaveProperty('password');
        });
      });
    });
  });

  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar POST /usuario/email com e-mail válido', () => {
      it('Então deve retornar o usuário correspondente', async () => {
        const emailBusca = 'usuario@teste.com';

        const resposta = await request(app)
          .post('/usuario/email')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ email: emailBusca });

        expect(resposta.status).toBe(200);
        expect(resposta.body.email).toBe(emailBusca);
        expect(resposta.body).toHaveProperty('id');
        expect(resposta.body).toHaveProperty('nome');
        expect(resposta.body).toHaveProperty('regra');
      });
    });

    describe('Quando enviar POST /usuario/email com e-mail inexistente', () => {
      it('Então deve retornar erro 404', async () => {
        const emailInexistente = 'naoexiste@teste.com';

        const resposta = await request(app)
          .post('/usuario/email')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ email: emailInexistente });

        expect(resposta.status).toBe(404);
        expect(resposta.body.error).toContain('Usuário não encontrado');
      });
    });

    describe('Quando enviar POST /usuario/email com e-mail inválido', () => {
      it('Então deve retornar erro 400', async () => {
        const resposta = await request(app)
          .post('/usuario/email')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ email: '' });

        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toContain('E-mail é obrigatório');
      });
    });
  });

  describe('Dado um usuário autenticado', () => {
    describe('Quando enviar PUT /usuario/:id com dados válidos', () => {
      it('Então deve atualizar os dados do usuário com sucesso', async () => {
        const dadosAtualizacao = {
          nome: 'UsuarioAtualizado',
          telefone: '11999999999',
          ramal: '200',
        };

        const resposta = await request(app)
          .put(`/usuario/${idUsuario}`)
          .set('Authorization', `Bearer ${tokenUsuario}`)
          .send(dadosAtualizacao);

        expect(resposta.status).toBe(200);
        expect(resposta.body.nome).toBe(dadosAtualizacao.nome);
        expect(resposta.body.telefone).toBe(dadosAtualizacao.telefone);
        expect(resposta.body.ramal).toBe(dadosAtualizacao.ramal);
        expect(resposta.body.id).toBe(idUsuario);
      });
    });

    describe('Quando enviar PUT /usuario/:id com ID inexistente', () => {
      it('Então deve retornar erro 400', async () => {
        const idInexistente = 'id-invalido';

        const resposta = await request(app)
          .put(`/usuario/${idInexistente}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ nome: 'Teste' });

        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toBeDefined();
        expect(resposta.body.error).not.toBe('');
      });
    });
  });

  describe('Dado um usuário autenticado', () => {
    describe('Quando enviar PUT /usuario/:id/senha com nova senha', () => {
      it('Então deve alterar a senha com sucesso', async () => {
        const novaSenha = 'NovaSenha123';

        const resposta = await request(app)
          .put(`/usuario/${idUsuario}/senha`)
          .set('Authorization', `Bearer ${tokenUsuario}`)
          .send({ password: novaSenha });

        expect(resposta.status).toBe(200);
        expect(resposta.body.message).toContain('Senha alterada com sucesso');

        const usuarioAtualizado = await prisma.usuario.findUnique({ 
          where: { id: idUsuario } 
        });
        expect(usuarioAtualizado).not.toBeNull();
        
        const senhaCorresponde = await bcrypt.compare(
          novaSenha, 
          usuarioAtualizado?.password ?? ''
        );
        expect(senhaCorresponde).toBe(true);
      });
    });

    describe('Quando enviar PUT /usuario/:id/senha sem senha', () => {
      it('Então deve retornar erro 400', async () => {
        const resposta = await request(app)
          .put(`/usuario/${idUsuario}/senha`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({});

        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toContain('nova senha é obrigatória');
      });
    });
  });

  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar DELETE /usuario/:id para usuário existente', () => {
      it('Então deve excluir o usuário e chamados associados', async () => {
        const usuarioParaRemover = await prisma.usuario.create({
          data: {
            nome: 'ParaRemover',
            sobrenome: 'Usuario',
            email: 'remover@teste.com',
            password: await bcrypt.hash('senha123', 10),
            regra: 'USUARIO',
            setor: 'TECNOLOGIA_INFORMACAO',
          },
        });
        const idParaRemover = usuarioParaRemover.id;

        await prisma.chamado.create({
          data: {
            OS: 'OS-TESTE-001',
            descricao: 'Descrição do chamado de teste',
            usuarioId: idParaRemover,
          },
        });

        const resposta = await request(app)
          .delete(`/usuario/${idParaRemover}`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(resposta.status).toBe(200);
        expect(resposta.body.message).toContain('excluídos com sucesso');

        const usuarioExcluido = await prisma.usuario.findUnique({ 
          where: { id: idParaRemover } 
        });
        expect(usuarioExcluido).toBeNull();

        const chamadosExcluidos = await prisma.chamado.findMany({ 
          where: { usuarioId: idParaRemover } 
        });
        expect(chamadosExcluidos.length).toBe(0);
      });
    });
  });

  describe('Dado um usuário autenticado', () => {
    describe('Quando enviar POST /usuario/:id/avatar com arquivo de imagem', () => {
      it('Então deve fazer upload e atualizar o avatar', async () => {
        const avatarFalso = Buffer.from('imagemfake123');

        const resposta = await request(app)
          .post(`/usuario/${idUsuario}/avatar`)
          .set('Authorization', `Bearer ${tokenUsuario}`)
          .attach('avatar', avatarFalso, 'avatar.png');

        expect(resposta.status).toBe(200);
        expect(resposta.body.message).toContain('Imagem de perfil atualizada');
        expect(resposta.body.usuario).toBeDefined();
        expect(resposta.body.usuario.avatarUrl).toBeDefined();
        expect(resposta.body.usuario.avatarUrl).toContain('uploads/');
      });
    });

    describe('Quando enviar POST /usuario/:id/avatar sem arquivo', () => {
      it('Então deve retornar erro 400', async () => {
        const resposta = await request(app)
          .post(`/usuario/${idUsuario}/avatar`)
          .set('Authorization', `Bearer ${tokenUsuario}`);

        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toContain('Arquivo não enviado');
      });
    });
  });
});