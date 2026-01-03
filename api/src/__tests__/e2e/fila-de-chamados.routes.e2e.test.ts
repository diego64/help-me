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
import app from '../../app';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

vi.setConfig({ testTimeout: 20000 });

const BASE_URL = '/filadechamados';

// ✅ Contador global para gerar OS únicos
let osCounter = 0;
const gerarOSUnico = () => {
  osCounter++;
  return `LST${String(osCounter).padStart(8, '0')}`;
};

describe('E2E - Rotas de Listagem de Chamados', () => {
  // ========================================
  // DADOS DE TESTES & CONFIGURAÇÃO
  // ========================================
  
  let tokenAutenticacaoUsuario: string;
  let tokenAutenticacaoTecnico: string;
  let tokenAutenticacaoAdmin: string;
  let idUsuario: string;
  let idTecnico: string;
  let idAdmin: string;
  let idChamadoAberto: string;
  let idChamadoEmAtendimento: string;

  const limparBancoDeDados = async () => {
    await prisma.ordemDeServico.deleteMany({});
    await prisma.chamado.deleteMany({});
    await prisma.expediente.deleteMany({});
    await prisma.servico.deleteMany({});
    await prisma.usuario.deleteMany({});
  };

  const criarUsuariosDeTeste = async () => {
    const senhaHash = await bcrypt.hash('Senha123!', 10);

    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Usuario',
        sobrenome: 'Teste',
        email: 'usuario.listagem@test.com',
        password: senhaHash,
        regra: 'USUARIO',
        ativo: true,
      },
    });

    const tecnico = await prisma.usuario.create({
      data: {
        nome: 'Tecnico',
        sobrenome: 'Teste',
        email: 'tecnico.listagem@test.com',
        password: senhaHash,
        regra: 'TECNICO',
        ativo: true,
      },
    });

    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin.listagem@test.com',
        password: senhaHash,
        regra: 'ADMIN',
        ativo: true,
      },
    });

    return { usuario, tecnico, admin };
  };

  const criarServicoTeste = async () => {
    return await prisma.servico.create({
      data: {
        nome: 'Suporte Técnico Listagem',
        ativo: true,
      },
    });
  };

  const criarChamadosDeTeste = async (usuarioId: string, tecnicoId: string) => {
    const chamadoAberto = await prisma.chamado.create({
      data: {
        OS: gerarOSUnico(),
        descricao: 'Chamado Aberto para testes de listagem',
        usuarioId,
        status: 'ABERTO',
      },
    });

    const chamadoEmAtendimento = await prisma.chamado.create({
      data: {
        OS: gerarOSUnico(),
        descricao: 'Chamado Em Atendimento para testes de listagem',
        usuarioId,
        tecnicoId,
        status: 'EM_ATENDIMENTO',
      },
    });

    return { chamadoAberto, chamadoEmAtendimento };
  };

  const gerarTokensAutenticacao = (usuarios: any) => {
    const secret = process.env.JWT_SECRET || 'testsecret';

    const tokenUsuario = jwt.sign(
      { 
        id: usuarios.usuario.id, 
        regra: 'USUARIO',
        nome: 'Usuario',
        email: 'usuario.listagem@test.com',
        type: 'access'
      },
      secret,
      {
        audience: 'helpme-client',
        issuer: 'helpme-api',
        expiresIn: '1h' as const,
      }
    );

    const tokenTecnico = jwt.sign(
      { 
        id: usuarios.tecnico.id, 
        regra: 'TECNICO',
        nome: 'Tecnico',
        email: 'tecnico.listagem@test.com',
        type: 'access'
      },
      secret,
      {
        audience: 'helpme-client',
        issuer: 'helpme-api',
        expiresIn: '1h' as const,
      }
    );

    const tokenAdmin = jwt.sign(
      { 
        id: usuarios.admin.id, 
        regra: 'ADMIN',
        nome: 'Admin',
        email: 'admin.listagem@test.com',
        type: 'access'
      },
      secret,
      {
        audience: 'helpme-client',
        issuer: 'helpme-api',
        expiresIn: '1h' as const,
      }
    );

    return { tokenUsuario, tokenTecnico, tokenAdmin };
  };

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI_TEST ||
      'mongodb://teste:senha@localhost:27018/helpme-mongo-teste?authSource=admin';
    
    console.log('[INFO] BANCO DE DADOS MONGODB TESTE - CONECTADO EM:', mongoUri);
    await mongoose.connect(mongoUri);

    await limparBancoDeDados();

    const usuariosTeste = await criarUsuariosDeTeste();
    idUsuario = usuariosTeste.usuario.id;
    idTecnico = usuariosTeste.tecnico.id;
    idAdmin = usuariosTeste.admin.id;

    await criarServicoTeste();

    const chamadosTeste = await criarChamadosDeTeste(idUsuario, idTecnico);
    idChamadoAberto = chamadosTeste.chamadoAberto.id;
    idChamadoEmAtendimento = chamadosTeste.chamadoEmAtendimento.id;

    const tokens = gerarTokensAutenticacao(usuariosTeste);
    tokenAutenticacaoUsuario = tokens.tokenUsuario;
    tokenAutenticacaoTecnico = tokens.tokenTecnico;
    tokenAutenticacaoAdmin = tokens.tokenAdmin;
  });

  afterAll(async () => {
    await limparBancoDeDados();
    await mongoose.disconnect();
    await prisma.$disconnect();
  });

  describe('GET /meus-chamados', () => {
    it('deve retornar chamados do usuário com estrutura de paginação', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('data');
      expect(resposta.body).toHaveProperty('pagination');
      expect(Array.isArray(resposta.body.data)).toBe(true);
      expect(resposta.body.data.length).toBeGreaterThan(0);
      
      expect(resposta.body.pagination).toHaveProperty('page');
      expect(resposta.body.pagination).toHaveProperty('limit');
      expect(resposta.body.pagination).toHaveProperty('total');
      expect(resposta.body.pagination).toHaveProperty('totalPages');
      expect(resposta.body.pagination).toHaveProperty('hasNext');
      expect(resposta.body.pagination).toHaveProperty('hasPrev');
      
      resposta.body.data.forEach((chamado: any) => {
        expect(chamado.usuario.id).toBe(idUsuario);
      });
    });

    it('deve filtrar chamados por status quando fornecido', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/meus-chamados?status=ABERTO`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
      
      resposta.body.data.forEach((chamado: any) => {
        expect(chamado.status).toBe('ABERTO');
      });
    });

    it('deve respeitar parâmetros de paginação', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/meus-chamados?page=1&limit=1`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.pagination.page).toBe(1);
      expect(resposta.body.pagination.limit).toBe(1);
      expect(resposta.body.data.length).toBeLessThanOrEqual(1);
    });

    it('deve retornar estrutura vazia quando usuário não tem chamados', async () => {
      const usuarioSemChamados = await prisma.usuario.create({
        data: {
          nome: 'Usuario',
          sobrenome: 'Sem Chamados',
          email: 'sem.chamados.listagem@test.com',
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'USUARIO',
          ativo: true,
        },
      });

      const secret = process.env.JWT_SECRET || 'testsecret';
      const tokenUsuarioSemChamados = jwt.sign(
        { 
          id: usuarioSemChamados.id, 
          regra: 'USUARIO',
          nome: 'Usuario',
          email: 'sem.chamados.listagem@test.com',
          type: 'access'
        },
        secret,
        { 
          audience: 'helpme-client', 
          issuer: 'helpme-api',
          expiresIn: '1h' as const
        }
      );

      const resposta = await request(app)
        .get(`${BASE_URL}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenUsuarioSemChamados}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
      expect(resposta.body.data.length).toBe(0);
      expect(resposta.body.pagination.total).toBe(0);

      await prisma.usuario.delete({ where: { id: usuarioSemChamados.id } });
    });

    it('deve rejeitar requisição sem autenticação', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/meus-chamados`);

      expect(resposta.status).toBe(401);
    });
  });

  describe('GET /chamados-atribuidos', () => {
    it('deve retornar apenas chamados atribuídos ao técnico', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('data');
      expect(resposta.body).toHaveProperty('pagination');
      expect(Array.isArray(resposta.body.data)).toBe(true);
      
      resposta.body.data.forEach((chamado: any) => {
        expect(chamado.tecnico.id).toBe(idTecnico);
        expect(['EM_ATENDIMENTO', 'REABERTO']).toContain(chamado.status);
      });
    });

    it('deve suportar ordenação por prioridade', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/chamados-atribuidos?prioridade=reabertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
    });

    it('deve retornar estrutura vazia quando técnico não tem atribuições', async () => {
      const tecnicoSemChamados = await prisma.usuario.create({
        data: {
          nome: 'Tecnico',
          sobrenome: 'Sem Atribuicoes',
          email: 'tecnico.vazio.listagem@test.com',
          password: await bcrypt.hash('Senha123!', 10),
          regra: 'TECNICO',
          ativo: true,
        },
      });

      const secret = process.env.JWT_SECRET || 'testsecret';
      const tokenTecnicoVazio = jwt.sign(
        { 
          id: tecnicoSemChamados.id, 
          regra: 'TECNICO',
          nome: 'Tecnico',
          email: 'tecnico.vazio.listagem@test.com',
          type: 'access'
        },
        secret,
        { 
          audience: 'helpme-client', 
          issuer: 'helpme-api',
          expiresIn: '1h' as const
        }
      );

      const resposta = await request(app)
        .get(`${BASE_URL}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenTecnicoVazio}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
      expect(resposta.body.data.length).toBe(0);

      await prisma.usuario.delete({ where: { id: tecnicoSemChamados.id } });
    });

    it('deve rejeitar usuário comum tentando acessar', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(403);
    });
  });

  describe('GET /todos-chamados', () => {
    it('deve retornar todos os chamados sem filtro obrigatório', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/todos-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('data');
      expect(resposta.body).toHaveProperty('pagination');
      expect(Array.isArray(resposta.body.data)).toBe(true);
    });

    it('deve filtrar por status quando fornecido', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/todos-chamados?status=ABERTO`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
      
      resposta.body.data.forEach((chamado: any) => {
        expect(chamado.status).toBe('ABERTO');
      });
    });

    it('deve retornar erro com status inválido', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/todos-chamados?status=STATUS_INVALIDO`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Status inválido');
    });

    it('deve filtrar por técnico quando fornecido', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/todos-chamados?tecnicoId=${idTecnico}`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      resposta.body.data.forEach((chamado: any) => {
        if (chamado.tecnico) {
          expect(chamado.tecnico.id).toBe(idTecnico);
        }
      });
    });

    it('deve suportar busca por OS ou descrição', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/todos-chamados?busca=Aberto`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
    });

    it('deve rejeitar técnico tentando acessar', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/todos-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(403);
    });
  });

  describe('GET /abertos', () => {
    it('deve retornar apenas chamados ABERTO ou REABERTO', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/abertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('data');
      expect(Array.isArray(resposta.body.data)).toBe(true);
      
      resposta.body.data.forEach((chamado: any) => {
        expect(['ABERTO', 'REABERTO']).toContain(chamado.status);
      });
    });

    it('deve permitir técnico consultar chamados disponíveis', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/abertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
      
      resposta.body.data.forEach((chamado: any) => {
        expect(['ABERTO', 'REABERTO']).toContain(chamado.status);
      });
    });

    it('deve suportar ordenação personalizada', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/abertos?ordenacao=prioridade`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data).toBeInstanceOf(Array);
    });

    it('deve rejeitar usuário comum tentando acessar', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/abertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(403);
    });
  });

  describe('GET /estatisticas', () => {
    it('deve retornar estatísticas completas do sistema', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/estatisticas`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('total');
      expect(resposta.body).toHaveProperty('porStatus');
      expect(resposta.body).toHaveProperty('pendentes');
      expect(resposta.body).toHaveProperty('semTecnico');
      expect(resposta.body).toHaveProperty('timestamp');
      
      expect(resposta.body.porStatus).toHaveProperty('abertos');
      expect(resposta.body.porStatus).toHaveProperty('emAtendimento');
      expect(resposta.body.porStatus).toHaveProperty('encerrados');
      expect(resposta.body.porStatus).toHaveProperty('cancelados');
      expect(resposta.body.porStatus).toHaveProperty('reabertos');
      
      expect(typeof resposta.body.total).toBe('number');
      expect(typeof resposta.body.pendentes).toBe('number');
      expect(typeof resposta.body.semTecnico).toBe('number');
    });

    it('deve rejeitar técnico tentando acessar estatísticas', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/estatisticas`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(403);
    });

    it('deve rejeitar usuário comum tentando acessar estatísticas', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/estatisticas`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(403);
    });
  });

  describe('Integridade de Dados Retornados', () => {
    it('deve incluir informações completas do chamado', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.data.length).toBeGreaterThan(0);
      
      const primeiroChamado = resposta.body.data[0];
      expect(primeiroChamado).toHaveProperty('id');
      expect(primeiroChamado).toHaveProperty('OS');
      expect(primeiroChamado).toHaveProperty('descricao');
      expect(primeiroChamado).toHaveProperty('status');
      expect(primeiroChamado).toHaveProperty('geradoEm');
      expect(primeiroChamado).toHaveProperty('usuario');
      expect(primeiroChamado.usuario).toHaveProperty('id');
      expect(primeiroChamado.usuario).toHaveProperty('nome');
      expect(primeiroChamado.usuario).toHaveProperty('email');
    });

    it('deve incluir dados do técnico quando atribuído', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(200);
      
      if (resposta.body.data.length > 0) {
        const chamadoComTecnico = resposta.body.data[0];
        expect(chamadoComTecnico).toHaveProperty('tecnico');
        expect(chamadoComTecnico.tecnico).toHaveProperty('id');
        expect(chamadoComTecnico.tecnico).toHaveProperty('nome');
        expect(chamadoComTecnico.tecnico.id).toBe(idTecnico);
      }
    });

    it('deve incluir informações de serviços quando presentes', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(200);
      
      if (resposta.body.data.length > 0) {
        const chamado = resposta.body.data[0];
        expect(chamado).toHaveProperty('servicos');
        expect(Array.isArray(chamado.servicos)).toBe(true);
      }
    });
  });
});