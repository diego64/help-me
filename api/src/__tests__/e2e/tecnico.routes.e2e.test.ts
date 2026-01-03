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

const BASE_URL = '/tecnico';

function horarioParaDateTime(horario: string): Date {
  const [hora, minuto] = horario.split(':').map(Number);
  const date = new Date();
  date.setHours(hora, minuto, 0, 0);
  return date;
}

let emailCounter = 0;
const gerarEmailUnico = () => {
  emailCounter++;
  return `tecnico.teste${String(emailCounter).padStart(4, '0')}@test.com`;
};

function gerarTokenAcesso(usuarioId: string, regra: string, email: string): string {
  const secret = process.env.JWT_SECRET || 'testsecret';
  
  const payload = {
    id: usuarioId,
    regra: regra,
    nome: 'Tecnico',
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
describe('Testes E2E nas Rotas de Técnicos', () => {
  let tokenAdmin: string;
  let tokenTecnico: string;
  let tokenOutroTecnico: string;
  let idAdmin: string;
  let idTecnico: string;
  let idOutroTecnico: string;

  beforeAll(async () => {
    try {
      // Criar diretório de uploads
      const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('[INFO] Diretório de uploads criado:', uploadDir);
      }

      // Conectar ao MongoDB
      const uriMongo = process.env.MONGO_URI_TEST || 
        'mongodb://teste:senha@localhost:27018/helpme-mongo-teste?authSource=admin';
      
      console.log('[INFO] BANCO DE DADOS MONGODB TESTE - CONECTADO EM:', uriMongo);
      await mongoose.connect(uriMongo);

      await limparBancoDeDados();

      const senhaHash = await bcrypt.hash('Senha123!', 10);

      // Criar admin
      const admin = await prisma.usuario.create({
        data: {
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin.tecnico@test.com',
          password: senhaHash,
          regra: 'ADMIN',
          ativo: true,
        },
      });
      idAdmin = admin.id;

      // Criar técnico principal
      const tecnico = await prisma.usuario.create({
        data: {
          nome: 'Tecnico',
          sobrenome: 'Principal',
          email: 'tecnico.principal@test.com',
          password: senhaHash,
          regra: 'TECNICO',
          setor: 'TECNOLOGIA_INFORMACAO',
          ativo: true,
        },
      });
      idTecnico = tecnico.id;

      await prisma.expediente.create({
        data: {
          usuarioId: idTecnico,
          entrada: horarioParaDateTime('09:00'),
          saida: horarioParaDateTime('17:00'),
        },
      });

      // Criar outro técnico
      const outroTecnico = await prisma.usuario.create({
        data: {
          nome: 'Outro',
          sobrenome: 'Tecnico',
          email: 'outro.tecnico@test.com',
          password: senhaHash,
          regra: 'TECNICO',
          setor: 'TECNOLOGIA_INFORMACAO',
          ativo: true,
        },
      });
      idOutroTecnico = outroTecnico.id;

      await prisma.expediente.create({
        data: {
          usuarioId: idOutroTecnico,
          entrada: horarioParaDateTime('08:00'),
          saida: horarioParaDateTime('18:00'),
        },
      });

      tokenAdmin = gerarTokenAcesso(idAdmin, 'ADMIN', admin.email);
      tokenTecnico = gerarTokenAcesso(idTecnico, 'TECNICO', tecnico.email);
      tokenOutroTecnico = gerarTokenAcesso(idOutroTecnico, 'TECNICO', outroTecnico.email);
      
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
    it('deve criar técnico com dados válidos', async () => {
      const dados = {
        nome: 'Novo',
        sobrenome: 'Tecnico',
        email: gerarEmailUnico(),
        password: 'Senha123!',
        telefone: '11999999999',
        ramal: '220',
        entrada: '08:00',
        saida: '17:00',
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
      expect(resposta.body.regra).toBe('TECNICO');
      expect(resposta.body).toHaveProperty('tecnicoDisponibilidade');
      
      // Verificar expedientes ativos
      const expedientesAtivos = resposta.body.tecnicoDisponibilidade.filter(
        (e: any) => e.ativo && e.deletadoEm === null
      );
      expect(expedientesAtivos.length).toBeGreaterThan(0);
      expect(resposta.body).not.toHaveProperty('password');
    });

    it('deve criar técnico com horário padrão quando não informado', async () => {
      const dados = {
        nome: 'Tecnico',
        sobrenome: 'Padrao',
        email: gerarEmailUnico(),
        password: 'Senha123!',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(201);
      
      const expedientesAtivos = resposta.body.tecnicoDisponibilidade.filter(
        (e: any) => e.ativo && e.deletadoEm === null
      );
      expect(expedientesAtivos.length).toBeGreaterThan(0);
      expect(expedientesAtivos[0]).toHaveProperty('entrada');
      expect(expedientesAtivos[0]).toHaveProperty('saida');
    });

    it('deve rejeitar criação sem nome', async () => {
      const dados = {
        sobrenome: 'Teste',
        email: gerarEmailUnico(),
        password: 'Senha123!',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve rejeitar criação sem senha', async () => {
      const dados = {
        nome: 'Teste',
        sobrenome: 'Sem Senha',
        email: gerarEmailUnico(),
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
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve rejeitar email duplicado', async () => {
      const email = gerarEmailUnico();
      
      await prisma.usuario.create({
        data: {
          nome: 'Existe',
          sobrenome: 'Ja',
          email: email,
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'TECNICO',
          ativo: true,
        },
      });

      const dados = {
        nome: 'Duplicado',
        sobrenome: 'Email',
        email: email,
        password: 'Senha123!',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já cadastrado');
    });

    it('deve rejeitar horário de saída anterior à entrada', async () => {
      const dados = {
        nome: 'Horario',
        sobrenome: 'Invalido',
        email: gerarEmailUnico(),
        password: 'Senha123!',
        entrada: '18:00',
        saida: '08:00',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída deve ser posterior');
    });

    it('deve rejeitar técnico tentando criar', async () => {
      const dados = {
        nome: 'Nao',
        sobrenome: 'Permitido',
        email: gerarEmailUnico(),
        password: 'Senha123!',
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(dados);

      expect(resposta.status).toBe(403);
    });
  });

  describe('GET /', () => {
    it('deve retornar técnicos com estrutura de paginação', async () => {
      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('data');
      expect(resposta.body).toHaveProperty('pagination');
      expect(Array.isArray(resposta.body.data)).toBe(true);
      expect(resposta.body.data.length).toBeGreaterThan(0);
      
      resposta.body.data.forEach((tecnico: any) => {
        expect(tecnico.regra).toBe('TECNICO');
        expect(tecnico).toHaveProperty('tecnicoDisponibilidade');
      });
    });

    it('deve listar apenas técnicos ativos por padrão', async () => {
      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      
      resposta.body.data.forEach((tecnico: any) => {
        expect(tecnico.ativo).toBe(true);
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

    it('deve rejeitar técnico tentando listar', async () => {
      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenTecnico}`);

      expect(resposta.status).toBe(403);
    });
  });
  
  describe('GET /:id', () => {
    it('deve retornar técnico específico por ID', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/${idTecnico}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe(idTecnico);
      expect(resposta.body).toHaveProperty('tecnicoDisponibilidade');
      expect(resposta.body).toHaveProperty('_count');
    });

    it('deve permitir técnico buscar próprio perfil', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/${idTecnico}`)
        .set('Authorization', `Bearer ${tokenTecnico}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.id).toBe(idTecnico);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-123';

      const resposta = await request(app)
        .get(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });
  
  describe('PUT /:id', () => {
    it('deve atualizar dados do técnico', async () => {
      const dados = {
        nome: 'Tecnico Atualizado',
        telefone: '11988888888',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(dados);

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe(dados.nome);
      expect(resposta.body.telefone).toBe(dados.telefone);
    });

    it('deve permitir admin atualizar qualquer técnico', async () => {
      const dados = {
        nome: 'Admin Atualizou',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe(dados.nome);
    });

    it('deve rejeitar técnico editando outro técnico', async () => {
      const dados = {
        nome: 'Nao Pode',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroTecnico}`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(dados);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('Você só pode editar seu próprio perfil');
    });

    it('deve rejeitar email duplicado', async () => {
      const emailExistente = 'outro.tecnico@test.com';

      const dados = {
        email: emailExistente,
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Email já está em uso');
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-456';
      const dados = { nome: 'Teste' };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });
  
  describe('PUT /:id/password', () => {
    it('deve alterar senha do próprio técnico', async () => {
      const novaSenha = 'NovaSenha123!';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}/password`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send({ password: novaSenha });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Senha alterada com sucesso');

      const tecnicoDb = await prisma.usuario.findUnique({
        where: { id: idTecnico },
      });
      const senhaCorreta = await bcrypt.compare(novaSenha, tecnicoDb?.password ?? '');
      expect(senhaCorreta).toBe(true);
    });

    it('deve permitir admin alterar senha de qualquer técnico', async () => {
      const novaSenha = 'AdminMudou123!';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroTecnico}/password`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ password: novaSenha });

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Senha alterada com sucesso');
    });

    it('deve rejeitar técnico alterando senha de outro', async () => {
      const novaSenha = 'NaoPode123!';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroTecnico}/password`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send({ password: novaSenha });

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('Você só pode alterar sua própria senha');
    });

    it('deve rejeitar senha muito curta', async () => {
      const senhaCurta = '123';

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}/password`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send({ password: senhaCurta });

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 8 caracteres');
    });

    it('deve rejeitar requisição sem senha', async () => {
      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}/password`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Senha é obrigatória');
    });
  });
  
  describe('PUT /:id/horarios', () => {
    it('deve atualizar horários do técnico', async () => {
      const horarios = {
        entrada: '07:00',
        saida: '16:00',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}/horarios`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(horarios);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Horário de disponibilidade atualizado');
      expect(resposta.body.horario).toHaveProperty('entrada');
      expect(resposta.body.horario).toHaveProperty('saida');
    });

    it('deve permitir admin atualizar horários de qualquer técnico', async () => {
      const horarios = {
        entrada: '10:00',
        saida: '19:00',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroTecnico}/horarios`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(horarios);

      expect(resposta.status).toBe(200);
      expect(resposta.body.horario).toHaveProperty('entrada');
    });

    it('deve rejeitar técnico alterando horários de outro', async () => {
      const horarios = {
        entrada: '08:00',
        saida: '17:00',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idOutroTecnico}/horarios`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(horarios);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('Você só pode alterar seus próprios horários');
    });

    it('deve rejeitar horário de saída anterior à entrada', async () => {
      const horarios = {
        entrada: '18:00',
        saida: '08:00',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}/horarios`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(horarios);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de saída deve ser posterior');
    });

    it('deve rejeitar requisição sem entrada', async () => {
      const horarios = {
        saida: '17:00',
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idTecnico}/horarios`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(horarios);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Horário de entrada é obrigatório');
    });
  });
 
  describe('POST /:id/avatar', () => {
    it('deve fazer upload de avatar com sucesso', async () => {
      const fakeImageBuffer = Buffer.from('fake-image-content');

      const resposta = await request(app)
        .post(`${BASE_URL}/${idTecnico}/avatar`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .attach('avatar', fakeImageBuffer, 'avatar.png');

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('Avatar enviado com sucesso');
      expect(resposta.body.avatarUrl).toContain('uploads/avatars/');
    });

    it('deve rejeitar técnico fazendo upload para outro técnico', async () => {
      const fakeImageBuffer = Buffer.from('fake-image-content');

      const resposta = await request(app)
        .post(`${BASE_URL}/${idOutroTecnico}/avatar`)
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .attach('avatar', fakeImageBuffer, 'avatar.png');

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('Você só pode fazer upload do seu próprio avatar');
    });

    it('deve rejeitar requisição sem arquivo', async () => {
      const resposta = await request(app)
        .post(`${BASE_URL}/${idTecnico}/avatar`)
        .set('Authorization', `Bearer ${tokenTecnico}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Arquivo não enviado');
    });
  });

  describe('DELETE /:id', () => {
    it('deve fazer soft delete por padrão', async () => {
      const tecnicoParaDeletar = await prisma.usuario.create({
        data: {
          nome: 'Para',
          sobrenome: 'Deletar',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'TECNICO',
          ativo: true,
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${tecnicoParaDeletar.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('deletado com sucesso');

      const verificacao = await prisma.usuario.findUnique({
        where: { id: tecnicoParaDeletar.id },
      });
      expect(verificacao).not.toBeNull();
      expect(verificacao?.deletadoEm).not.toBeNull();
      expect(verificacao?.ativo).toBe(false);
    });

    it('deve fazer hard delete quando solicitado', async () => {
      const tecnicoParaDeletar = await prisma.usuario.create({
        data: {
          nome: 'Para',
          sobrenome: 'Deletar Hard',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'TECNICO',
          ativo: true,
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${tecnicoParaDeletar.id}?permanente=true`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('removido permanentemente');

      const verificacao = await prisma.usuario.findUnique({
        where: { id: tecnicoParaDeletar.id },
      });
      expect(verificacao).toBeNull();
    });

    it('deve rejeitar técnico tentando deletar', async () => {
      const resposta = await request(app)
        .delete(`${BASE_URL}/${idOutroTecnico}`)
        .set('Authorization', `Bearer ${tokenTecnico}`);

      expect(resposta.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-abc';

      const resposta = await request(app)
        .delete(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });
  
  describe('PATCH /:id/restaurar', () => {
    it('deve restaurar técnico deletado', async () => {
      const tecnicoDeletado = await prisma.usuario.create({
        data: {
          nome: 'Deletado',
          sobrenome: 'Para Restaurar',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'TECNICO',
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const resposta = await request(app)
        .patch(`${BASE_URL}/${tecnicoDeletado.id}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('restaurado com sucesso');
      expect(resposta.body.tecnico.ativo).toBe(true);

      const verificacao = await prisma.usuario.findUnique({
        where: { id: tecnicoDeletado.id },
      });
      expect(verificacao?.deletadoEm).toBeNull();
      expect(verificacao?.ativo).toBe(true);
    });

    it('deve rejeitar restauração de técnico não deletado', async () => {
      const resposta = await request(app)
        .patch(`${BASE_URL}/${idTecnico}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Técnico não está deletado');
    });

    it('deve rejeitar técnico tentando restaurar', async () => {
      const tecnicoDeletado = await prisma.usuario.create({
        data: {
          nome: 'Del',
          sobrenome: 'Teste',
          email: gerarEmailUnico(),
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'TECNICO',
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const resposta = await request(app)
        .patch(`${BASE_URL}/${tecnicoDeletado.id}/restaurar`)
        .set('Authorization', `Bearer ${tokenTecnico}`);

      expect(resposta.status).toBe(403);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-def';

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idInexistente}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Técnico não encontrado');
    });
  });
});