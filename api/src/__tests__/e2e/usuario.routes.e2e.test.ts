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
import fs from 'fs';
import path from 'path';

vi.setConfig({ testTimeout: 20000 });

const BASE_URL = '/usuario';

let emailCounter = 0;
const gerarEmailUnico = () => {
  emailCounter++;
  return `usuario.teste${String(emailCounter).padStart(4, '0')}@test.com`;
};

function gerarTokenAcesso(usuarioId: string, regra: string, email: string): string {
  const secret = process.env.JWT_SECRET || 'testsecret';
  
  const payload = {
    id: usuarioId,
    regra: regra,
    nome: 'Usuario',
    email: email,
    type: 'access',
  };
  
  return jwt.sign(
    payload,
    secret,
    { 
      algorithm: 'HS256',
      audience: 'helpme-client', 
      issuer: 'helpme-api',
      expiresIn: '8h' as const
    }
  );
}

async function limparBancoDeDados() {
  try {
    await prisma.ordemDeServico.deleteMany({});
    await prisma.chamado.deleteMany({});
    await prisma.expediente.deleteMany({});
    await prisma.usuario.deleteMany({});
    
    console.log('[INFO] Banco de dados limpo com sucesso');
  } catch (error) {
    console.error('[ERROR] Erro ao limpar banco de dados:', error);
    throw error;
  }
}

describe('Testes E2E nas Rotas de Usuários', () => {
  let tokenAdmin: string;
  let tokenUsuario: string;
  let tokenOutroUsuario: string;
  let idAdmin: string;
  let idUsuario: string;
  let idOutroUsuario: string;

  beforeAll(async () => {
    try {
      // Criar diretório de uploads
      const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('[INFO] Diretório de uploads criado:', uploadDir);
      }

      const uriMongo = process.env.MONGO_URI_TEST || 
        'mongodb://teste:senha@localhost:27018/helpme-mongo-teste?authSource=admin';
      
      console.log('[INFO] BANCO DE DADOS MONGODB TESTE - CONECTADO EM:', uriMongo);
      await mongoose.connect(uriMongo);

      await limparBancoDeDados();

      const senhaHash = await bcrypt.hash('Senha123!', 10);

      const admin = await prisma.usuario.create({
        data: {
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin.usuario@test.com',
          password: senhaHash,
          regra: 'ADMIN',
          ativo: true,
        },
      });
      idAdmin = admin.id;

      const usuario = await prisma.usuario.create({
        data: {
          nome: 'Usuario',
          sobrenome: 'Principal',
          email: 'usuario.principal@test.com',
          password: senhaHash,
          regra: 'USUARIO',
          setor: 'TECNOLOGIA_INFORMACAO',
          ativo: true,
        },
      });
      idUsuario = usuario.id;

      const outroUsuario = await prisma.usuario.create({
        data: {
          nome: 'Outro',
          sobrenome: 'Usuario',
          email: 'outro.usuario@test.com',
          password: senhaHash,
          regra: 'USUARIO',
          setor: 'ADMINISTRACAO',
          ativo: true,
        },
      });
      idOutroUsuario = outroUsuario.id;

      tokenAdmin = gerarTokenAcesso(idAdmin, 'ADMIN', admin.email);
      tokenUsuario = gerarTokenAcesso(idUsuario, 'USUARIO', usuario.email);
      tokenOutroUsuario = gerarTokenAcesso(idOutroUsuario, 'USUARIO', outroUsuario.email);
      
      console.log('[INFO] Setup completo - Tokens e usuários criados');
    } catch (error) {
      console.error('[ERROR] Erro no beforeAll:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await limparBancoDeDados();
      await mongoose.disconnect();
      await prisma.$disconnect();
      
      console.log('[INFO] Cleanup completo');
    } catch (error) {
      console.error('[ERROR] Erro no afterAll:', error);
      await mongoose.disconnect().catch(() => {});
      await prisma.$disconnect().catch(() => {});
    }
  });

  describe('POST /', () => {
    it('deve criar usuário com dados válidos', async () => {
      const dados = {
        nome: 'Novo',
        sobrenome: 'Usuario',
        email: gerarEmailUnico(),
        password: 'Senha123!',
        telefone: '11999999999',
        ramal: '220',
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      if (resposta.status !== 201) {
        console.error('[DEBUG] Erro na criação:', resposta.body);
      }

      expect(resposta.status).toBe(201);
      expect(resposta.body).toHaveProperty('id');
      expect(resposta.body.nome).toBe(dados.nome);
      expect(resposta.body.regra).toBe('USUARIO');
      expect(resposta.body.setor).toBe(dados.setor);
      expect(resposta.body).not.toHaveProperty('password');
    });

    it('deve rejeitar criação sem nome', async () => {
      const dados = {
        sobrenome: 'Teste',
        email: gerarEmailUnico(),
        password: 'Senha123!',
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve rejeitar criação sem sobrenome', async () => {
      const dados = {
        nome: 'Teste',
        email: gerarEmailUnico(),
        password: 'Senha123!',
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Sobrenome é obrigatório');
    });

    it('deve rejeitar criação sem senha', async () => {
      const dados = {
        nome: 'Teste',
        sobrenome: 'Sem Senha',
        email: gerarEmailUnico(),
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });

    it('deve rejeitar senha muito curta', async () => {
      const dados = {
        nome: 'Teste',
        sobrenome: 'Senha Curta',
        email: gerarEmailUnico(),
        password: '123',
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve rejeitar criação sem setor', async () => {
      const dados = {
        nome: 'Teste',
        sobrenome: 'Sem Setor',
        email: gerarEmailUnico(),
        password: 'Senha123!',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Setor inválido');
    });

    it('deve rejeitar email duplicado', async () => {
      const email = gerarEmailUnico();
      
      await prisma.usuario.create({
        data: {
          nome: 'Existe',
          sobrenome: 'Ja',
          email: email,
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
          setor: 'FINANCEIRO',
          ativo: true,
        },
      });

      const dados = {
        nome: 'Duplicado',
        sobrenome: 'Email',
        email: email,
        password: 'Senha123!',
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já cadastrado');
    });

    it('deve rejeitar não-admin tentando criar', async () => {
      const dados = {
        nome: 'Nao',
        sobrenome: 'Permitido',
        email: gerarEmailUnico(),
        password: 'Senha123!',
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send(dados);

      expect(resposta.status).toBe(403);
    });
  });

  describe('GET /', () => {
    it('deve retornar usuários com estrutura de paginação', async () => {
      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('data');
      expect(resposta.body).toHaveProperty('pagination');
      expect(Array.isArray(resposta.body.data)).toBe(true);
      expect(resposta.body.data.length).toBeGreaterThan(0);
      
      resposta.body.data.forEach((usuario: any) => {
        expect(usuario.regra).toBe('USUARIO');
      });
    });

    it('deve listar apenas usuários ativos por padrão', async () => {
      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      
      resposta.body.data.forEach((usuario: any) => {
        expect(usuario.ativo).toBe(true);
      });
    });

    it('deve suportar busca por nome', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}?busca=Principal`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data.length).toBeGreaterThan(0);
    });

    it('deve respeitar parâmetros de paginação', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}?page=1&limit=5`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.page).toBe(1);
      expect(resposta.body.pagination.limit).toBe(5);
      expect(resposta.body.data.length).toBeLessThanOrEqual(5);
    });

    it('deve filtrar por setor quando fornecido', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}?setor=TECNOLOGIA_INFORMACAO`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      
      resposta.body.data.forEach((usuario: any) => {
        expect(usuario.setor).toBe('TECNOLOGIA_INFORMACAO');
      });
    });

    it('deve rejeitar usuário tentando listar', async () => {
      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenUsuario}`);

      expect(resposta.status).toBe(403);
    });
  });

  describe('GET /:id', () => {
    it('deve retornar usuário específico por ID', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/${idUsuario}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe(idUsuario);
      expect(resposta.body).toHaveProperty('_count');
    });

    it('deve permitir usuário buscar próprio perfil', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/${idUsuario}`)
        .set('Authorization', `Bearer ${tokenUsuario}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe(idUsuario);
    });

    it('deve retornar 403 quando usuário tentar ver outro perfil', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/${idOutroUsuario}`)
        .set('Authorization', `Bearer ${tokenUsuario}`);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode visualizar seu próprio perfil');
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-123';

      const resposta = await request(app)
        .get(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });

  describe('POST /email', () => {
    it('deve retornar usuário quando email for encontrado', async () => {
      const resposta = await request(app)
        .post(`${BASE_URL}/email`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ email: 'usuario.principal@test.com' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.email).toBe('usuario.principal@test.com');
    });

    it('deve retornar 400 quando email não for enviado', async () => {
      const resposta = await request(app)
        .post(`${BASE_URL}/email`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Email é obrigatório');
    });

    it('deve retornar 404 quando usuário não existir', async () => {
      const resposta = await request(app)
        .post(`${BASE_URL}/email`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ email: 'naoexiste@test.com' });

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });

    it('deve rejeitar não-admin', async () => {
      const resposta = await request(app)
        .post(`${BASE_URL}/email`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send({ email: 'teste@test.com' });

      expect(resposta.status).toBe(403);
    });
  });

  describe('PUT /:id', () => {
    it('deve atualizar dados do usuário', async () => {
      const dados = {
        nome: 'Usuario Atualizado',
        telefone: '11988888888',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idUsuario}`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send(dados);

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe(dados.nome);
      expect(resposta.body.telefone).toBe(dados.telefone);
    });

    it('deve permitir admin atualizar qualquer usuário', async () => {
      const dados = {
        nome: 'Admin Atualizou',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idUsuario}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe(dados.nome);
    });

    it('deve rejeitar usuário editando outro usuário', async () => {
      const dados = {
        nome: 'Nao Pode',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroUsuario}`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send(dados);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode editar seu próprio perfil');
    });

    it('deve rejeitar email duplicado', async () => {
      const emailExistente = 'outro.usuario@test.com';

      const dados = {
        email: emailExistente,
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idUsuario}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já está em uso');
    });

    it('deve permitir admin atualizar setor', async () => {
      const dados = {
        setor: 'FINANCEIRO',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idUsuario}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(200);
      expect(resposta.body.setor).toBe('FINANCEIRO');
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-456';
      const dados = { nome: 'Teste' };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });
  
  describe('PUT /:id/senha', () => {
    it('deve alterar senha do próprio usuário', async () => {
      const novaSenha = 'NovaSenha123!';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idUsuario}/senha`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send({ password: novaSenha });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Senha alterada com sucesso');

      const usuarioDb = await prisma.usuario.findUnique({
        where: { id: idUsuario },
      });
      const senhaCorreta = await bcrypt.compare(novaSenha, usuarioDb?.password ?? '');
      expect(senhaCorreta).toBe(true);
    });

    it('deve permitir admin alterar senha de qualquer usuário', async () => {
      const novaSenha = 'AdminMudou123!';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroUsuario}/senha`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ password: novaSenha });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Senha alterada com sucesso');
    });

    it('deve rejeitar usuário alterando senha de outro', async () => {
      const novaSenha = 'NaoPode123!';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroUsuario}/senha`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send({ password: novaSenha });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode alterar sua própria senha');
    });

    it('deve rejeitar senha muito curta', async () => {
      const senhaCurta = '123';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idUsuario}/senha`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send({ password: senhaCurta });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve rejeitar requisição sem senha', async () => {
      const resposta = await request(app)
        .put(`${BASE_URL}/${idUsuario}/senha`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });
  });
  
  describe('POST /:id/avatar', () => {
    it('deve fazer upload de avatar com sucesso', async () => {
      const fakeImageBuffer = Buffer.from('fake-image-content');

      const resposta = await request(app)
        .post(`${BASE_URL}/${idUsuario}/avatar`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .attach('avatar', fakeImageBuffer, 'avatar.png');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Avatar enviado com sucesso');
      expect(resposta.body.avatarUrl).toContain('uploads/avatars/');
    });

    it('deve rejeitar usuário fazendo upload para outro usuário', async () => {
      const fakeImageBuffer = Buffer.from('fake-image-content');

      const resposta = await request(app)
        .post(`${BASE_URL}/${idOutroUsuario}/avatar`)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .attach('avatar', fakeImageBuffer, 'avatar.png');

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('só pode fazer upload do seu próprio avatar');
    });

    it('deve rejeitar requisição sem arquivo', async () => {
      const resposta = await request(app)
        .post(`${BASE_URL}/${idUsuario}/avatar`)
        .set('Authorization', `Bearer ${tokenUsuario}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });
  });

  describe('DELETE /:id', () => {
    it('deve fazer soft delete por padrão', async () => {
      const usuarioParaDeletar = await prisma.usuario.create({
        data: {
          nome: 'Para',
          sobrenome: 'Deletar',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
          setor: 'FINANCEIRO',
          ativo: true,
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${usuarioParaDeletar.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('deletado com sucesso');

      const verificacao = await prisma.usuario.findUnique({
        where: { id: usuarioParaDeletar.id },
      });
      expect(verificacao).not.toBeNull();
      expect(verificacao?.deletadoEm).not.toBeNull();
      expect(verificacao?.ativo).toBe(false);
    });

    it('deve fazer hard delete quando solicitado', async () => {
      const usuarioParaDeletar = await prisma.usuario.create({
        data: {
          nome: 'Para',
          sobrenome: 'Deletar Hard',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
          setor: 'FINANCEIRO',
          ativo: true,
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${usuarioParaDeletar.id}?permanente=true`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('removido permanentemente');

      const verificacao = await prisma.usuario.findUnique({
        where: { id: usuarioParaDeletar.id },
      });
      expect(verificacao).toBeNull();
    });

    it('deve rejeitar usuário tentando deletar', async () => {
      const resposta = await request(app)
        .delete(`${BASE_URL}/${idOutroUsuario}`)
        .set('Authorization', `Bearer ${tokenUsuario}`);

      expect(resposta.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-abc';

      const resposta = await request(app)
        .delete(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });
  
  describe('PATCH /:id/restaurar', () => {
    it('deve restaurar usuário deletado', async () => {
      const usuarioDeletado = await prisma.usuario.create({
        data: {
          nome: 'Deletado',
          sobrenome: 'Para Restaurar',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
          setor: 'FINANCEIRO',
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const resposta = await request(app)
        .patch(`${BASE_URL}/${usuarioDeletado.id}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('restaurado com sucesso');
      expect(resposta.body.usuario.ativo).toBe(true);

      const verificacao = await prisma.usuario.findUnique({
        where: { id: usuarioDeletado.id },
      });
      expect(verificacao?.deletadoEm).toBeNull();
      expect(verificacao?.ativo).toBe(true);
    });

    it('deve rejeitar restauração de usuário não deletado', async () => {
      const resposta = await request(app)
        .patch(`${BASE_URL}/${idUsuario}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não está deletado');
    });

    it('deve rejeitar não-admin tentando restaurar', async () => {
      const usuarioDeletado = await prisma.usuario.create({
        data: {
          nome: 'Del',
          sobrenome: 'Teste',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
          setor: 'FINANCEIRO',
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const resposta = await request(app)
        .patch(`${BASE_URL}/${usuarioDeletado.id}/restaurar`)
        .set('Authorization', `Bearer ${tokenUsuario}`);

      expect(resposta.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-def';

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idInexistente}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Usuário não encontrado');
    });
  });
});