import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi
} from 'vitest';
import request from 'supertest';
import { prisma } from '../../lib/prisma';
import mongoose from 'mongoose';
import app from '../../app';
import jwt from 'jsonwebtoken';
import { hashPassword } from '../../utils/password';

vi.setConfig({ testTimeout: 20000 });

const BASE_URL = '/chamado';

describe('E2E - Rotas de Chamados', () => {

  let tokenAutenticacaoUsuario: string;
  let tokenAutenticacaoUsuario2: string;
  let tokenAutenticacaoTecnico: string;
  let tokenAutenticacaoAdmin: string;
  let idUsuario: string;
  let idUsuario2: string;
  let idTecnico: string;
  let idAdmin: string;
  let idServico: string;
  let idChamado: string;

  let contadorOS = 0;

  const gerarOSUnicoTeste = (): string => {
    const timestamp = Date.now().toString().slice(-6);
    contadorOS++;
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const contador = contadorOS.toString().padStart(3, '0');
    return `INC${timestamp}${contador}${random}`;
  };

  const limparBancoDeDados = async () => {
    await prisma.ordemDeServico.deleteMany({});
    await prisma.chamado.deleteMany({});
    await prisma.expediente.deleteMany({});
    await prisma.servico.deleteMany({});
    await prisma.usuario.deleteMany({});
  };

  const criarUsuariosDeTeste = async () => {
    const senhaHash = hashPassword('Senha123!');

    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Usuario',
        sobrenome: 'Teste',
        email: 'usuario.chamado@test.com',
        password: senhaHash,
        regra: 'USUARIO',
        ativo: true,
      },
    });

    const usuario2 = await prisma.usuario.create({
      data: {
        nome: 'Usuario2',
        sobrenome: 'Teste',
        email: 'usuario2.chamado@test.com',
        password: senhaHash,
        regra: 'USUARIO',
        ativo: true,
      },
    });

    const tecnico = await prisma.usuario.create({
      data: {
        nome: 'Tecnico',
        sobrenome: 'Teste',
        email: 'tecnico.chamado@test.com',
        password: senhaHash,
        regra: 'TECNICO',
        ativo: true,
      },
    });

    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin',
        sobrenome: 'Teste',
        email: 'admin.chamado@test.com',
        password: senhaHash,
        regra: 'ADMIN',
        ativo: true,
      },
    });

    return { usuario, usuario2, tecnico, admin };
  };

  const criarExpedienteTecnico = async (tecnicoId: string) => {
    const agora = new Date();
    const entrada = new Date(agora);
    entrada.setHours(8, 0, 0, 0);
    
    const saida = new Date(agora);
    saida.setHours(18, 0, 0, 0);

    return await prisma.expediente.create({
      data: {
        usuarioId: tecnicoId,
        entrada: entrada,
        saida: saida,
        ativo: true,
      },
    });
  };

  const criarServicoTeste = async () => {
    return await prisma.servico.create({
      data: {
        nome: 'Suporte Técnico',
        ativo: true,
      },
    });
  };

  const gerarTokensAutenticacao = (usuarios: any) => {
    const secret = process.env.JWT_SECRET || 'testsecret-must-be-at-least-32-chars-long!!';
    
    const tokenUsuario = jwt.sign(
      {
        id: usuarios.usuario.id,
        regra: 'USUARIO',
        nome: 'Usuario',
        email: 'usuario.chamado@test.com',
        type: 'access',
      },
      secret,
      {
        audience: 'helpme-client',
        issuer: 'helpme-api',
        expiresIn: '1h',
      }
    );

    const tokenUsuario2 = jwt.sign(
      {
        id: usuarios.usuario2.id,
        regra: 'USUARIO',
        nome: 'Usuario2',
        email: 'usuario2.chamado@test.com',
        type: 'access',
      },
      secret,
      {
        audience: 'helpme-client',
        issuer: 'helpme-api',
        expiresIn: '1h',
      }
    );

    const tokenTecnico = jwt.sign(
      {
        id: usuarios.tecnico.id,
        regra: 'TECNICO',
        nome: 'Tecnico',
        email: 'tecnico.chamado@test.com',
        type: 'access',
      },
      secret,
      {
        audience: 'helpme-client',
        issuer: 'helpme-api',
        expiresIn: '1h',
      }
    );

    const tokenAdmin = jwt.sign(
      {
        id: usuarios.admin.id,
        regra: 'ADMIN',
        nome: 'Admin',
        email: 'admin.chamado@test.com',
        type: 'access',
      },
      secret,
      {
        audience: 'helpme-client',
        issuer: 'helpme-api',
        expiresIn: '1h',
      }
    );

    return { tokenUsuario, tokenUsuario2, tokenTecnico, tokenAdmin };
  };

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI_TEST ||
      'mongodb://teste:senha@localhost:27018/helpme-mongo-teste?authSource=admin';
    
    console.log('[INFO] BANCO DE DADOS MONGODB TESTE - CONECTADO EM:', mongoUri);
    await mongoose.connect(mongoUri);

    await limparBancoDeDados();

    const usuariosTeste = await criarUsuariosDeTeste();
    idUsuario = usuariosTeste.usuario.id;
    idUsuario2 = usuariosTeste.usuario2.id;
    idTecnico = usuariosTeste.tecnico.id;
    idAdmin = usuariosTeste.admin.id;

    await criarExpedienteTecnico(idTecnico);

    const servico = await criarServicoTeste();
    idServico = servico.id;

    const tokens = gerarTokensAutenticacao(usuariosTeste);
    tokenAutenticacaoUsuario = tokens.tokenUsuario;
    tokenAutenticacaoUsuario2 = tokens.tokenUsuario2;
    tokenAutenticacaoTecnico = tokens.tokenTecnico;
    tokenAutenticacaoAdmin = tokens.tokenAdmin;
  });

  afterAll(async () => {
    await limparBancoDeDados();
    await mongoose.disconnect();
    await prisma.$disconnect();
  });

  describe('POST /abertura-chamado', () => {
    it('deve criar chamado com dados válidos e retornar número OS', async () => {
      const payloadChamado = {
        descricao: 'Problema com impressora não está imprimindo corretamente',
        servico: 'Suporte Técnico',
      };

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadChamado);

      expect(resposta.status).toBe(201);
      expect(resposta.body).toHaveProperty('id');
      expect(resposta.body).toHaveProperty('OS');
      expect(resposta.body.OS).toMatch(/^INC\d{4}$/);
      expect(resposta.body.descricao).toContain('Problema com impressora');
      expect(resposta.body.status).toBe('ABERTO');
      expect(resposta.body.servicos).toBeInstanceOf(Array);
      expect(resposta.body.servicos.length).toBeGreaterThan(0);
      
      idChamado = resposta.body.id;
    });

    it('deve retornar erro quando descrição não for fornecida', async () => {
      const payloadInvalido = {
        servico: 'Suporte Técnico',
      };

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadInvalido);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Descrição é obrigatória');
    });

    it('deve retornar erro quando descrição for muito curta', async () => {
      const payloadInvalido = {
        descricao: 'Curto',
        servico: 'Suporte Técnico',
      };

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadInvalido);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 10 caracteres');
    });

    it('deve retornar erro quando serviço não for fornecido', async () => {
      const payloadInvalido = {
        descricao: 'Descrição válida com mais de dez caracteres aqui',
      };

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadInvalido);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('pelo menos um serviço válido');
    });

    it('deve retornar erro quando serviço não existir', async () => {
      const payloadInvalido = {
        descricao: 'Descrição válida com mais de dez caracteres aqui',
        servico: 'Serviço Inexistente',
      };

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadInvalido);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('não encontrados ou inativos');
    });

    it('deve aceitar array de serviços válidos', async () => {
      const payloadComArray = {
        descricao: 'Múltiplos problemas técnicos identificados no sistema',
        servico: ['Suporte Técnico'],
      };

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadComArray);

      expect(resposta.status).toBe(201);
      expect(resposta.body.servicos).toBeInstanceOf(Array);
    }, 30000); // 30 segundos

    it('deve gerar números OS sequenciais e incrementais', async () => {
      const primeiroChamado = {
        descricao: 'Primeiro chamado de teste para verificar sequência',
        servico: 'Suporte Técnico',
      };
      const segundoChamado = {
        descricao: 'Segundo chamado de teste para verificar sequência',
        servico: 'Suporte Técnico',
      };

      const resposta1 = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(primeiroChamado);

      const resposta2 = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(segundoChamado);

      expect(resposta1.status).toBe(201);
      expect(resposta2.status).toBe(201);

      const numeroOS1 = parseInt(resposta1.body.OS.replace('INC', ''), 10);
      const numeroOS2 = parseInt(resposta2.body.OS.replace('INC', ''), 10);
      expect(numeroOS2).toBeGreaterThan(numeroOS1);
    });
  });

  describe('PATCH /:id/status', () => {
    it('deve permitir técnico assumir chamado dentro do expediente', async () => {
      vi.setSystemTime(new Date('2025-01-15T10:00:00'));
      
      const atualizacaoStatus = {
        status: 'EM_ATENDIMENTO',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idChamado}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
        .send(atualizacaoStatus);

      expect(resposta.status).toBe(200);
      expect(resposta.body.status).toBe('EM_ATENDIMENTO');
      expect(resposta.body.tecnico).toBeDefined();
      expect(resposta.body.tecnico.nome).toBe('Tecnico');

      vi.useRealTimers();
    });

    it('deve rejeitar técnico assumindo chamado fora do expediente', async () => {
      const novoChamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Teste horário fora do expediente verificação',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      vi.setSystemTime(new Date('2025-01-15T20:00:00'));
      
      const atualizacaoStatus = {
        status: 'EM_ATENDIMENTO',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${novoChamado.id}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
        .send(atualizacaoStatus);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('horário de trabalho');

      vi.useRealTimers();
      await prisma.chamado.delete({ where: { id: novoChamado.id } });
    });

    it('deve permitir admin encerrar chamado com descrição', async () => {
      const encerramentoChamado = {
        status: 'ENCERRADO',
        descricaoEncerramento: 'Problema resolvido com sucesso após análise detalhada',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idChamado}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
        .send(encerramentoChamado);

      expect(resposta.status).toBe(200);
      expect(resposta.body.status).toBe('ENCERRADO');
      expect(resposta.body.encerradoEm).toBeDefined();
      expect(resposta.body.descricaoEncerramento).toBeDefined();
    });

    it('deve rejeitar encerramento sem descrição', async () => {
      const novoChamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Teste encerramento sem descrição adequada',
          usuarioId: idUsuario,
          status: 'EM_ATENDIMENTO',
          tecnicoId: idTecnico,
        },
      });

      const encerramentoSemDescricao = {
        status: 'ENCERRADO',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${novoChamado.id}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
        .send(encerramentoSemDescricao);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Descrição de encerramento inválida');

      await prisma.chamado.delete({ where: { id: novoChamado.id } });
    });

    it('deve rejeitar técnico tentando cancelar chamado', async () => {
      const novoChamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Teste cancelamento por técnico não permitido',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const cancelamento = {
        status: 'CANCELADO',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${novoChamado.id}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
        .send(cancelamento);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('não podem cancelar');

      await prisma.chamado.delete({ where: { id: novoChamado.id } });
    });

    it('deve rejeitar status inválido', async () => {
      const statusInvalido = {
        status: 'STATUS_INVALIDO',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idChamado}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
        .send(statusInvalido);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Status inválido');
    });

    it('deve rejeitar técnico alterando chamado encerrado', async () => {
      const chamadoEncerrado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Teste encerrado não pode ser alterado por técnico',
          usuarioId: idUsuario,
          status: 'ENCERRADO',
          encerradoEm: new Date(),
          descricaoEncerramento: 'Finalizado anteriormente',
        },
      });

      const tentativaAlteracao = {
        status: 'EM_ATENDIMENTO',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${chamadoEncerrado.id}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
        .send(tentativaAlteracao);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('encerrados não podem ser alterados por técnicos');

      await prisma.chamado.delete({ where: { id: chamadoEncerrado.id } });
    });

    it('deve rejeitar alteração de chamado cancelado', async () => {
      const chamadoCancelado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Teste cancelado não pode ser reaberto por status',
          usuarioId: idUsuario,
          status: 'CANCELADO',
          encerradoEm: new Date(),
          descricaoEncerramento: 'Cancelado pelo usuário previamente',
        },
      });

      const tentativaReabertura = {
        status: 'EM_ATENDIMENTO',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${chamadoCancelado.id}/status`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
        .send(tentativaReabertura);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('cancelados não podem ser alterados');

      await prisma.chamado.delete({ where: { id: chamadoCancelado.id } });
    });
  });

  describe('GET /:id/historico', () => {
    it('deve retornar histórico do chamado em array', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/${idChamado}/historico`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(200);
      expect(Array.isArray(resposta.body)).toBe(true);
      
      if (resposta.body.length > 0) {
        const primeiroEvento = resposta.body[0];
        expect(primeiroEvento).toHaveProperty('tipo');
        expect(primeiroEvento).toHaveProperty('dataHora');
        expect(primeiroEvento).toHaveProperty('autorId');
      }
    });

    it('deve permitir qualquer usuário autenticado consultar histórico', async () => {
      const resposta = await request(app)
        .get(`${BASE_URL}/${idChamado}/historico`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(200);
    });
  });

  describe('PATCH /:id/reabrir-chamado', () => {
    let idChamadoEncerrado: string;

    beforeEach(async () => {
      const chamadoEncerrado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Chamado para reabrir dentro do prazo estabelecido',
          usuarioId: idUsuario,
          status: 'ENCERRADO',
          encerradoEm: new Date(),
          descricaoEncerramento: 'Finalizado anteriormente',
          tecnicoId: idTecnico,
        },
      });
      idChamadoEncerrado = chamadoEncerrado.id;
    });

    it('deve reabrir chamado do usuário dentro de 48h', async () => {
      const payloadReabertura = {
        atualizacaoDescricao: 'Problema voltou a acontecer necessitando atenção',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadReabertura);

      expect(resposta.status).toBe(200);
      expect(resposta.body.status).toBe('REABERTO');
      expect(resposta.body.encerradoEm).toBeNull();
      expect(resposta.body.descricaoEncerramento).toBeNull();
    });

    it('deve aceitar reabertura sem descrição adicional', async () => {
      const payloadVazio = {};

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadVazio);

      expect(resposta.status).toBe(200);
      expect(resposta.body.status).toBe('REABERTO');
    });

    it('deve rejeitar usuário reabrindo chamado de outro', async () => {
      const payloadReabertura = {};

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario2}`)
        .send(payloadReabertura);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('Você só pode reabrir chamados criados por você');
    });

    it('deve rejeitar reabertura após 48 horas', async () => {
      await prisma.chamado.update({
        where: { id: idChamadoEncerrado },
        data: {
          encerradoEm: new Date(Date.now() - 50 * 60 * 60 * 1000),
        },
      });

      const payloadReabertura = {};

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadReabertura);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('48 horas');
    });

    it('deve rejeitar reabertura de chamado não encerrado', async () => {
      const chamadoAberto = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Chamado ainda aberto não pode ser reaberto',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const payloadReabertura = {};

      const resposta = await request(app)
        .patch(`${BASE_URL}/${chamadoAberto.id}/reabrir-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadReabertura);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Somente chamados encerrados');

      await prisma.chamado.delete({ where: { id: chamadoAberto.id } });
    });

    it('deve retornar 404 para chamado inexistente', async () => {
      const idInexistente = 'id-inexistente-123';
      const payloadReabertura = {};

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idInexistente}/reabrir-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadReabertura);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('não encontrado');
    });
  });

  describe('PATCH /:id/cancelar-chamado', () => {
    it('deve cancelar chamado do usuário com justificativa', async () => {
      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Chamado para cancelar com justificativa adequada',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const payloadCancelamento = {
        descricaoEncerramento: 'Não precisa mais do suporte solicitado anteriormente',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${chamado.id}/cancelar-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadCancelamento);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('cancelado com sucesso');
      expect(resposta.body.chamado.status).toBe('CANCELADO');
      expect(resposta.body.chamado.encerradoEm).toBeDefined();
    });

    it('deve permitir admin cancelar qualquer chamado', async () => {
      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Chamado para admin cancelar administrativamente',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const payloadCancelamento = {
        descricaoEncerramento: 'Cancelado administrativamente por decisão gerencial',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${chamado.id}/cancelar-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
        .send(payloadCancelamento);

      expect(resposta.status).toBe(200);
      expect(resposta.body.chamado.status).toBe('CANCELADO');
    });

    it('deve rejeitar cancelamento sem justificativa', async () => {
      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Teste sem justificativa adequada de cancelamento',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const payloadVazio = {};

      const resposta = await request(app)
        .patch(`${BASE_URL}/${chamado.id}/cancelar-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadVazio);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Justificativa do cancelamento inválida');

      await prisma.chamado.delete({ where: { id: chamado.id } });
    });

    it('deve rejeitar usuário cancelando chamado de outro', async () => {
      const outroChamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Chamado de outro usuário para teste de permissão',
          usuarioId: idAdmin,
          status: 'ABERTO',
        },
      });

      const payloadCancelamento = {
        descricaoEncerramento: 'Tentativa de cancelamento não autorizada',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${outroChamado.id}/cancelar-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadCancelamento);

      expect(resposta.status).toBe(403);
      expect(resposta.body.error).toContain('não tem permissão');

      await prisma.chamado.delete({ where: { id: outroChamado.id } });
    });

    it('deve rejeitar cancelamento de chamado encerrado', async () => {
      const chamadoEncerrado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Teste encerrado não pode ser cancelado posteriormente',
          usuarioId: idUsuario,
          status: 'ENCERRADO',
          encerradoEm: new Date(),
          descricaoEncerramento: 'Resolvido com sucesso',
        },
      });

      const payloadCancelamento = {
        descricaoEncerramento: 'Tentando cancelar chamado já encerrado',
      };

      const resposta = await request(app)
        .patch(`${BASE_URL}/${chamadoEncerrado.id}/cancelar-chamado`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
        .send(payloadCancelamento);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('cancelar um chamado encerrado');

      await prisma.chamado.delete({ where: { id: chamadoEncerrado.id } });
    });
  });

  describe('DELETE /:id', () => {
    it('deve fazer soft delete do chamado por padrão', async () => {
      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Chamado para soft delete padrão do sistema',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${chamado.id}`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('desativado com sucesso');

      const chamadoDeletado = await prisma.chamado.findUnique({
        where: { id: chamado.id },
        select: { deletadoEm: true },
      });
      expect(chamadoDeletado?.deletadoEm).toBeDefined();
    });

    it('deve fazer hard delete quando solicitado', async () => {
      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Chamado para hard delete permanente do sistema',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${chamado.id}?permanente=true`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('excluído permanentemente');

      const chamadoDeletado = await prisma.chamado.findUnique({
        where: { id: chamado.id },
      });
      expect(chamadoDeletado).toBeNull();
    });

    it('deve rejeitar técnico tentando deletar chamado', async () => {
      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Técnico não pode deletar chamados do sistema',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${chamado.id}`)
        .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

      expect(resposta.status).toBe(403);

      await prisma.chamado.delete({ where: { id: chamado.id } });
    });

    it('deve rejeitar usuário comum tentando deletar chamado', async () => {
      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOSUnicoTeste(),
          descricao: 'Usuário comum não pode deletar chamados',
          usuarioId: idUsuario,
          status: 'ABERTO',
        },
      });

      const resposta = await request(app)
        .delete(`${BASE_URL}/${chamado.id}`)
        .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

      expect(resposta.status).toBe(403);

      await prisma.chamado.delete({ where: { id: chamado.id } });
    });

    it('deve retornar 404 para chamado inexistente', async () => {
      const idInexistente = 'id-inexistente-456';

      const resposta = await request(app)
        .delete(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('não encontrado');
    });
  });

  describe('Autenticação e Segurança', () => {
    it('deve rejeitar requisição sem token de autenticação', async () => {
      const payloadChamado = {
        descricao: 'Teste sem autenticação não deve ser permitido',
        servico: 'Suporte Técnico',
      };

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .send(payloadChamado);

      expect(resposta.status).toBe(401);
    });

    it('deve rejeitar token inválido ou malformado', async () => {
      const payloadChamado = {
        descricao: 'Teste com token inválido não deve ser permitido',
        servico: 'Suporte Técnico',
      };
      const tokenInvalido = 'Bearer token-invalido-xyz';

      const resposta = await request(app)
        .post(`${BASE_URL}/abertura-chamado`)
        .set('Authorization', tokenInvalido)
        .send(payloadChamado);

      expect(resposta.status).toBe(401);
    });
  });
});