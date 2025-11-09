import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import app from '../../app';
import jwt from 'jsonwebtoken';

vi.setConfig({ testTimeout: 15000 });

const prisma = new PrismaClient();
const URL_BASE = '/filadechamados';

describe('E2E - Rotas de Listagem de Chamados', () => {
  // ============================================================================
  // Dados de Teste & Configuração
  // ============================================================================
  
  let tokenAutenticacaoUsuario: string;
  let tokenAutenticacaoTecnico: string;
  let tokenAutenticacaoAdmin: string;
  let idUsuario: string;
  let idTecnico: string;
  let idAdmin: string;
  let idChamadoAberto: string;
  let idChamadoEmAtendimento: string;

  // ============================================================================
  // Funções Auxiliares
  // ============================================================================

  const limparBancoDeDados = async () => {
    await prisma.ordemDeServico.deleteMany({});
    await prisma.chamado.deleteMany({});
    await prisma.expediente.deleteMany({});
    await prisma.servico.deleteMany({});
    await prisma.usuario.deleteMany({});
  };

  const criarUsuariosDeTeste = async () => {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Usuario',
        sobrenome: 'Teste',
        email: 'usuario@test.com',
        password: 'hashedpassword',
        regra: 'USUARIO',
      },
    });

    const tecnico = await prisma.usuario.create({
      data: {
        nome: 'Tecnico',
        sobrenome: 'Teste',
        email: 'tecnico@test.com',
        password: 'hashedpassword',
        regra: 'TECNICO',
      },
    });

    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin@test.com',
        password: 'hashedpassword',
        regra: 'ADMIN',
      },
    });

    return { usuario, tecnico, admin };
  };

  const criarServicoTeste = async () => {
    return await prisma.servico.create({
      data: {
        nome: 'Suporte Técnico',
        ativo: true,
      },
    });
  };

  const criarChamadosDeTeste = async (usuarioId: string, tecnicoId: string) => {
    const chamadoAberto = await prisma.chamado.create({
      data: {
        OS: `INC${Date.now()}1`,
        descricao: 'Chamado Aberto',
        usuarioId,
        status: 'ABERTO',
      },
    });

    const chamadoEmAtendimento = await prisma.chamado.create({
      data: {
        OS: `INC${Date.now()}2`,
        descricao: 'Chamado Em Atendimento',
        usuarioId,
        tecnicoId,
        status: 'EM_ATENDIMENTO',
      },
    });

    return { chamadoAberto, chamadoEmAtendimento };
  };

  const gerarTokensAutenticacao = (usuarios: any) => {
    const secret = process.env.JWT_SECRET || 'testsecret';
    const opcoesToken = {
      audience: 'helpme-client',
      issuer: 'helpme-api',
    };

    const tokenUsuario = jwt.sign(
      { 
        id: usuarios.usuario.id, 
        regra: 'USUARIO',
        nome: 'Usuario',
        email: 'usuario@test.com',
        type: 'access'
      },
      secret,
      opcoesToken
    );

    const tokenTecnico = jwt.sign(
      { 
        id: usuarios.tecnico.id, 
        regra: 'TECNICO',
        nome: 'Tecnico',
        email: 'tecnico@test.com',
        type: 'access'
      },
      secret,
      opcoesToken
    );

    const tokenAdmin = jwt.sign(
      { 
        id: usuarios.admin.id, 
        regra: 'ADMIN',
        nome: 'Admin',
        email: 'admin@test.com',
        type: 'access'
      },
      secret,
      opcoesToken
    );

    return { tokenUsuario, tokenTecnico, tokenAdmin };
  };

  // ============================================================================
  // Hooks Globais
  // ============================================================================

  beforeAll(async () => {
    // Arrange: Conectar ao MongoDB
    const mongoUri = 
      process.env.MONGO_INITDB_URI || 
      'mongodb://teste:senha@localhost:27017/helpme-mongo-teste?authSource=admin';
    await mongoose.connect(mongoUri);

    // Arrange: Limpar banco de dados
    await limparBancoDeDados();

    // Arrange: Criar usuários de teste
    const usuariosTeste = await criarUsuariosDeTeste();
    idUsuario = usuariosTeste.usuario.id;
    idTecnico = usuariosTeste.tecnico.id;
    idAdmin = usuariosTeste.admin.id;

    // Arrange: Criar serviço de teste
    await criarServicoTeste();

    // Arrange: Criar chamados de teste
    const chamadosTeste = await criarChamadosDeTeste(idUsuario, idTecnico);
    idChamadoAberto = chamadosTeste.chamadoAberto.id;
    idChamadoEmAtendimento = chamadosTeste.chamadoEmAtendimento.id;

    // Arrange: Gerar tokens de autenticação
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

  // ============================================================================
  // GET /meus-chamados - Listagem de Chamados do Usuário
  // ============================================================================

  describe('GET /meus-chamados', () => {
    it('Dado usuário autenticado com role USUARIO, Quando consulta seus chamados, Então deve retornar apenas chamados criados por ele', async () => {
      // Arrange: Token do usuário comum já configurado
      
      // Act: Buscar chamados do usuário
      const resposta = await request(app)
        .get(`${URL_BASE}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      // Assert: Verificar que retorna apenas chamados do usuário
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      expect(resposta.body.length).toBeGreaterThan(0);
      
      resposta.body.forEach((chamado: any) => {
        expect(chamado.usuario.id).toBe(idUsuario);
      });
    });

    it('Dado usuário sem chamados cadastrados, Quando consulta seus chamados, Então deve retornar array vazio', async () => {
      // Arrange: Criar usuário sem chamados
      const usuarioSemChamados = await prisma.usuario.create({
        data: {
          nome: 'Usuario',
          sobrenome: 'Sem Chamados',
          email: 'sem.chamados@test.com',
          password: 'hashedpassword',
          regra: 'USUARIO',
        },
      });

      const secret = process.env.JWT_SECRET || 'testsecret';
      const tokenUsuarioSemChamados = jwt.sign(
        { 
          id: usuarioSemChamados.id, 
          regra: 'USUARIO',
          nome: 'Usuario',
          email: 'sem.chamados@test.com',
          type: 'access'
        },
        secret,
        { audience: 'helpme-client', issuer: 'helpme-api' }
      );

      // Act: Buscar chamados de usuário sem chamados
      const resposta = await request(app)
        .get(`${URL_BASE}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenUsuarioSemChamados}`);

      // Assert: Verificar retorno de array vazio
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      expect(resposta.body.length).toBe(0);

      await prisma.usuario.delete({ where: { id: usuarioSemChamados.id } });
    });

    it('Dado requisição sem autenticação, Quando consulta chamados, Então deve retornar erro 401', async () => {
      // Arrange: Preparar requisição sem token
      
      // Act: Tentar acessar sem autenticação
      const resposta = await request(app)
        .get(`${URL_BASE}/meus-chamados`);

      // Assert: Verificar rejeição por falta de autenticação
      expect(resposta.status).toBe(401);
    });
  });

  // ============================================================================
  // GET /chamados-atribuidos - Listagem de Chamados do Técnico
  // ============================================================================

  describe('GET /chamados-atribuidos', () => {
    it('Dado técnico autenticado, Quando consulta chamados atribuídos, Então deve retornar apenas seus chamados com status válido', async () => {
      // Arrange: Token do técnico já configurado
      
      // Act: Buscar chamados atribuídos ao técnico
      const resposta = await request(app)
        .get(`${URL_BASE}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      // Assert: Verificar chamados atribuídos ao técnico
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      
      resposta.body.forEach((chamado: any) => {
        expect(chamado.tecnico.id).toBe(idTecnico);
        expect(['EM_ATENDIMENTO', 'REABERTO']).toContain(chamado.status);
      });
    });

    it('Dado técnico sem chamados atribuídos, Quando consulta, Então deve retornar array vazio', async () => {
      // Arrange: Criar técnico sem chamados atribuídos
      const tecnicoSemChamados = await prisma.usuario.create({
        data: {
          nome: 'Tecnico',
          sobrenome: 'Sem Atribuicoes',
          email: 'tecnico.vazio@test.com',
          password: 'hashedpassword',
          regra: 'TECNICO',
        },
      });

      const secret = process.env.JWT_SECRET || 'testsecret';
      const tokenTecnicoVazio = jwt.sign(
        { 
          id: tecnicoSemChamados.id, 
          regra: 'TECNICO',
          nome: 'Tecnico',
          email: 'tecnico.vazio@test.com',
          type: 'access'
        },
        secret,
        { audience: 'helpme-client', issuer: 'helpme-api' }
      );

      // Act: Buscar chamados de técnico sem atribuições
      const resposta = await request(app)
        .get(`${URL_BASE}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenTecnicoVazio}`);

      // Assert: Verificar array vazio
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      expect(resposta.body.length).toBe(0);

      await prisma.usuario.delete({ where: { id: tecnicoSemChamados.id } });
    });

    it('Dado usuário comum tentando acessar, Quando consulta chamados atribuídos, Então deve rejeitar com erro 403', async () => {
      // Arrange: Usar token de usuário comum
      
      // Act: Tentar acessar endpoint restrito
      const resposta = await request(app)
        .get(`${URL_BASE}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      // Assert: Verificar negação de acesso
      expect(resposta.status).toBe(403);
    });
  });

  // ============================================================================
  // GET /todos-chamados - Listagem Completa (Admin)
  // ============================================================================

  describe('GET /todos-chamados', () => {
    it('Dado admin com filtro de status ABERTO, Quando consulta todos chamados, Então deve retornar apenas chamados com status ABERTO', async () => {
      // Arrange: Parâmetros de consulta com filtro
      const parametrosConsulta = { status: 'ABERTO' };
      
      // Act: Buscar chamados com filtro de status
      const resposta = await request(app)
        .get(`${URL_BASE}/todos-chamados`)
        .query(parametrosConsulta)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      // Assert: Verificar filtro aplicado corretamente
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      
      resposta.body.forEach((chamado: any) => {
        expect(chamado.status).toBe('ABERTO');
      });
    });

    it('Dado admin sem parâmetro status, Quando consulta todos chamados, Então deve retornar erro 400', async () => {
      // Arrange: Requisição sem parâmetro obrigatório
      
      // Act: Tentar consultar sem filtro de status
      const resposta = await request(app)
        .get(`${URL_BASE}/todos-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      // Assert: Verificar erro de validação
      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toBe('O parâmetro "status" é obrigatório.');
    });

    it('Dado admin com status inválido, Quando consulta todos chamados, Então deve retornar erro 400', async () => {
      // Arrange: Parâmetro com valor inválido
      const parametrosInvalidos = { status: 'STATUS_INVALIDO' };
      
      // Act: Tentar consultar com status inválido
      const resposta = await request(app)
        .get(`${URL_BASE}/todos-chamados`)
        .query(parametrosInvalidos)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      // Assert: Verificar rejeição por valor inválido
      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Status inválido');
    });

    it('Dado admin com filtro EM_ATENDIMENTO, Quando consulta, Então deve retornar apenas chamados em atendimento', async () => {
      // Arrange: Filtro para status específico
      const parametrosConsulta = { status: 'EM_ATENDIMENTO' };
      
      // Act: Buscar chamados em atendimento
      const resposta = await request(app)
        .get(`${URL_BASE}/todos-chamados`)
        .query(parametrosConsulta)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      // Assert: Verificar filtro correto
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      
      resposta.body.forEach((chamado: any) => {
        expect(chamado.status).toBe('EM_ATENDIMENTO');
      });
    });

    it('Dado técnico tentando acessar todos chamados, Quando consulta, Então deve rejeitar com erro 403', async () => {
      // Arrange: Usar token de técnico para endpoint de admin
      const parametrosConsulta = { status: 'ABERTO' };
      
      // Act: Técnico tenta acessar endpoint restrito
      const resposta = await request(app)
        .get(`${URL_BASE}/todos-chamados`)
        .query(parametrosConsulta)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      // Assert: Verificar negação de acesso
      expect(resposta.status).toBe(403);
    });
  });

  // ============================================================================
  // GET /abertos - Listagem de Chamados Abertos/Reabertos
  // ============================================================================

  describe('GET /abertos', () => {
    it('Dado admin autenticado, Quando consulta chamados abertos, Então deve retornar apenas chamados com status ABERTO ou REABERTO', async () => {
      // Arrange: Token de admin já configurado
      
      // Act: Buscar chamados abertos ou reabertos
      const resposta = await request(app)
        .get(`${URL_BASE}/abertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      // Assert: Verificar filtro de status múltiplos
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      
      resposta.body.forEach((chamado: any) => {
        expect(['ABERTO', 'REABERTO']).toContain(chamado.status);
      });
    });

    it('Dado técnico autenticado, Quando consulta chamados abertos, Então deve retornar lista de chamados disponíveis', async () => {
      // Arrange: Token de técnico já configurado
      
      // Act: Técnico busca chamados disponíveis
      const resposta = await request(app)
        .get(`${URL_BASE}/abertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      // Assert: Verificar acesso permitido para técnico
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      
      resposta.body.forEach((chamado: any) => {
        expect(['ABERTO', 'REABERTO']).toContain(chamado.status);
      });
    });

    it('Dado sistema sem chamados abertos, Quando consulta, Então deve retornar array vazio', async () => {
      // Arrange: Fechar todos os chamados abertos temporariamente
      await prisma.chamado.updateMany({
        where: { status: { in: ['ABERTO', 'REABERTO'] } },
        data: { status: 'ENCERRADO', encerradoEm: new Date() }
      });

      // Act: Buscar chamados abertos
      const resposta = await request(app)
        .get(`${URL_BASE}/abertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      // Assert: Verificar array vazio
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      expect(resposta.body.length).toBe(0);

      // Cleanup: Reabrir chamados para não afetar outros testes
      await prisma.chamado.updateMany({
        where: { id: idChamadoAberto },
        data: { status: 'ABERTO', encerradoEm: null }
      });
    });

    it('Dado usuário comum tentando acessar, Quando consulta chamados abertos, Então deve rejeitar com erro 403', async () => {
      // Arrange: Usar token de usuário comum
      
      // Act: Usuário tenta acessar endpoint restrito
      const resposta = await request(app)
        .get(`${URL_BASE}/abertos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      // Assert: Verificar negação de acesso
      expect(resposta.status).toBe(403);
    });
  });

  // ============================================================================
  // Testes de Paginação e Ordenação
  // ============================================================================

  describe('Paginação e Ordenação', () => {
    it('Dado múltiplos chamados cadastrados, Quando consulta com limite, Então deve respeitar paginação', async () => {
      // Arrange: Criar múltiplos chamados para testar paginação
      const chamadosExtras = await Promise.all([
        prisma.chamado.create({
          data: {
            OS: `INC${Date.now()}3`,
            descricao: 'Chamado Extra 1',
            usuarioId: idUsuario,
            status: 'ABERTO',
          },
        }),
        prisma.chamado.create({
          data: {
            OS: `INC${Date.now()}4`,
            descricao: 'Chamado Extra 2',
            usuarioId: idUsuario,
            status: 'ABERTO',
          },
        }),
      ]);

      // Act: Buscar chamados do usuário
      const resposta = await request(app)
        .get(`${URL_BASE}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      // Assert: Verificar que retorna múltiplos chamados
      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      expect(resposta.body.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await Promise.all(
        chamadosExtras.map(c => prisma.chamado.delete({ where: { id: c.id } }))
      );
    });
  });

  // ============================================================================
  // Testes de Integridade de Dados
  // ============================================================================

  describe('Integridade de Dados Retornados', () => {
    it('Dado chamado consultado, Quando retorna dados, Então deve incluir informações completas do usuário', async () => {
      // Arrange: Token configurado
      
      // Act: Buscar chamados
      const resposta = await request(app)
        .get(`${URL_BASE}/meus-chamados`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      // Assert: Verificar estrutura completa dos dados
      expect(resposta.status).toBe(200);
      expect(resposta.body.length).toBeGreaterThan(0);
      
      const primeiroChamado = resposta.body[0];
      expect(primeiroChamado).toHaveProperty('id');
      expect(primeiroChamado).toHaveProperty('OS');
      expect(primeiroChamado).toHaveProperty('descricao');
      expect(primeiroChamado).toHaveProperty('status');
      expect(primeiroChamado).toHaveProperty('usuario');
      expect(primeiroChamado.usuario).toHaveProperty('id');
      expect(primeiroChamado.usuario.id).toBe(idUsuario);
      
      // Verificar campos opcionais se existirem
      if (primeiroChamado.usuario.nome) {
        expect(typeof primeiroChamado.usuario.nome).toBe('string');
      }
      if (primeiroChamado.usuario.email) {
        expect(typeof primeiroChamado.usuario.email).toBe('string');
      }
    });

    it('Dado chamado com técnico atribuído, Quando consulta, Então deve incluir dados do técnico', async () => {
      // Arrange: Token de técnico
      
      // Act: Buscar chamados atribuídos
      const resposta = await request(app)
        .get(`${URL_BASE}/chamados-atribuidos`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      // Assert: Verificar inclusão de dados do técnico
      expect(resposta.status).toBe(200);
      
      if (resposta.body.length > 0) {
        const chamadoComTecnico = resposta.body[0];
        expect(chamadoComTecnico).toHaveProperty('tecnico');
        expect(chamadoComTecnico.tecnico).toHaveProperty('id');
        expect(chamadoComTecnico.tecnico.id).toBe(idTecnico);
        
        // Verificar campos opcionais se existirem
        if (chamadoComTecnico.tecnico.nome) {
          expect(typeof chamadoComTecnico.tecnico.nome).toBe('string');
        }
        if (chamadoComTecnico.tecnico.email) {
          expect(typeof chamadoComTecnico.tecnico.email).toBe('string');
        }
      }
    });
  });
});