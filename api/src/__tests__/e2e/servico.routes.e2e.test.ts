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
import { hashPassword } from '../../utils/password';

vi.setConfig({ testTimeout: 20000 });

const BASE_URL = '/servico';

let nomeCounter = 0;
const gerarNomeUnico = () => {
  nomeCounter++;
  return `Serviço Teste ${String(nomeCounter).padStart(4, '0')}`;
};

function gerarTokenAcesso(usuarioId: string, regra: string): string {
  const secret = process.env.JWT_SECRET || 'testsecret-must-be-at-least-32-chars-long!!';
  
  const payload = {
    id: usuarioId,
    regra: regra,
    nome: 'Admin',
    email: 'admin@teste.com',
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

async function limparBancoDados() {
  try {
    await prisma.ordemDeServico.deleteMany({});
    await prisma.chamado.deleteMany({});
    await prisma.expediente.deleteMany({});
    await prisma.servico.deleteMany({});
    await prisma.usuario.deleteMany({});
    
    console.log('[INFO] Banco de dados limpo com sucesso');
  } catch (error) {
    console.error('[ERROR] Erro ao limpar banco de dados:', error);
    throw error;
  }
}

describe('E2E - Rotas de Serviços', () => {
  let tokenAdmin: string;
  let tokenUsuario: string;
  let idAdmin: string;
  let idUsuario: string;
  let idServico: string;

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGO_INITDB_URI!);
      console.log('[INFO] MongoDB conectado');

      await limparBancoDados();

      const senhaHash = hashPassword('Senha123!');

      const usuarioAdmin = await prisma.usuario.create({
        data: {
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin.servico@test.com',
          password: senhaHash,
          regra: 'ADMIN',
          ativo: true,
        },
      });
      idAdmin = usuarioAdmin.id;

      const usuarioComum = await prisma.usuario.create({
        data: {
          nome: 'Usuario',
          sobrenome: 'Teste',
          email: 'usuario.servico@test.com',
          password: senhaHash,
          regra: 'USUARIO',
          ativo: true,
        },
      });
      idUsuario = usuarioComum.id;

      tokenAdmin = gerarTokenAcesso(idAdmin, 'ADMIN');
      tokenUsuario = gerarTokenAcesso(idUsuario, 'USUARIO');
      
      console.log('[INFO] Setup completo - Tokens e usuários criados');
    } catch (error) {
      console.error('[ERROR] Erro no beforeAll:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await limparBancoDados();
      await mongoose.disconnect();
      await prisma.$disconnect();
      
      console.log('[INFO] Cleanup completo');
    } catch (error) {
      console.error('[ERROR] Erro no afterAll:', error);
      await mongoose.disconnect().catch(() => {});
      await prisma.$disconnect().catch(() => {});
    }
  });

  async function criarServicoTeste(ativo: boolean = true): Promise<string> {
    const servico = await prisma.servico.create({
      data: {
        nome: gerarNomeUnico(),
        descricao: 'Descrição do serviço de teste',
        ativo,
      },
    });
    return servico.id;
  }

  describe('POST /', () => {
    it('deve criar serviço com dados válidos', async () => {
      const dadosNovoServico = { 
        nome: gerarNomeUnico(), 
        descricao: 'Descrição do serviço teste' 
      };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dadosNovoServico);

      expect(resposta.status).toBe(201);
      expect(resposta.body).toHaveProperty('id');
      expect(resposta.body.nome).toBe(dadosNovoServico.nome);
      expect(resposta.body.descricao).toBe(dadosNovoServico.descricao);
      expect(resposta.body.ativo).toBe(true);

      idServico = resposta.body.id;
    });

    it('deve rejeitar criação sem nome', async () => {
      const dadosInvalidos = { descricao: 'Serviço sem nome' };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dadosInvalidos);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Nome é obrigatório');
    });

    it('deve rejeitar nome muito curto', async () => {
      const dadosInvalidos = { nome: 'AB' };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dadosInvalidos);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('no mínimo 3 caracteres');
    });

    it('deve rejeitar nome duplicado', async () => {
      const nomeDuplicado = gerarNomeUnico();
      
      await prisma.servico.create({
        data: { nome: nomeDuplicado, ativo: true },
      });

      const dadosDuplicados = { nome: nomeDuplicado };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dadosDuplicados);

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Já existe um serviço com esse nome');
    });

    it('deve rejeitar usuário não-admin tentando criar', async () => {
      const dados = { nome: gerarNomeUnico() };

      const resposta = await request(app)
        .post(BASE_URL)
        .set('Authorization', `Bearer ${tokenUsuario}`)
        .send(dados);

      expect(resposta.status).toBe(403);
    });
  });

  describe('GET /', () => {
    it('deve retornar serviços com estrutura de paginação', async () => {
      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`);

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
    });

    it('deve listar apenas serviços ativos por padrão', async () => {
      await criarServicoTeste(false);

      const resposta = await request(app)
        .get(BASE_URL)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      
      resposta.body.data.forEach((servico: any) => {
        expect(servico.ativo).toBe(true);
      });
    });

    it('deve incluir serviços inativos quando solicitado', async () => {
      await criarServicoTeste(false);

      const resposta = await request(app)
        .get(`${BASE_URL}?incluirInativos=true`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      const temInativo = resposta.body.data.some((s: any) => !s.ativo);
      expect(temInativo).toBe(true);
    });

    it('deve suportar busca por nome', async () => {
      const nomeUnico = gerarNomeUnico();
      await prisma.servico.create({
        data: { nome: nomeUnico, ativo: true },
      });

      const resposta = await request(app)
        .get(`${BASE_URL}?busca=${nomeUnico.substring(0, 10)}`)
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
  });

  describe('GET /:id', () => {
    it('deve retornar serviço específico por ID', async () => {
      if (!idServico) {
        idServico = await criarServicoTeste();
      }

      const resposta = await request(app)
        .get(`${BASE_URL}/${idServico}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveProperty('id');
      expect(resposta.body.id).toBe(idServico);
      expect(resposta.body).toHaveProperty('nome');
      expect(resposta.body).toHaveProperty('_count');
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-123';

      const resposta = await request(app)
        .get(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Serviço não encontrado');
    });
  });

  describe('PUT /:id', () => {
    it('deve atualizar serviço com dados válidos', async () => {
      if (!idServico) {
        idServico = await criarServicoTeste();
      }
      
      const dadosAtualizacao = { 
        nome: gerarNomeUnico(), 
        descricao: 'Descrição Atualizada' 
      };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idServico}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dadosAtualizacao);

      expect(resposta.status).toBe(200);
      expect(resposta.body.nome).toBe(dadosAtualizacao.nome);
      expect(resposta.body.descricao).toBe(dadosAtualizacao.descricao);
      expect(resposta.body.id).toBe(idServico);
    });

    it('deve rejeitar atualização com nome duplicado', async () => {
      const nomeExistente = gerarNomeUnico();
      await prisma.servico.create({
        data: { nome: nomeExistente, ativo: true },
      });

      const dados = { nome: nomeExistente };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idServico}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(409);
      expect(resposta.body.error).toContain('Já existe outro serviço com esse nome');
    }, 30000);

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-456';
      const dados = { nome: gerarNomeUnico() };

      const resposta = await request(app)
        .put(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Serviço não encontrado');
    });

    it('deve rejeitar edição de serviço deletado', async () => {
      const servicoDeletado = await prisma.servico.create({
        data: {
          nome: gerarNomeUnico(),
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const dados = { nome: gerarNomeUnico() };

      const resposta = await request(app)
        .put(`${BASE_URL}/${servicoDeletado.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(dados);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Não é possível editar um serviço deletado');
    });
  });

  describe('PATCH /:id/desativar', () => {
    it('deve desativar serviço ativo', async () => {
      const servicoAtivo = await criarServicoTeste(true);

      const resposta = await request(app)
        .patch(`${BASE_URL}/${servicoAtivo}/desativar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('desativado com sucesso');

      const verificacao = await prisma.servico.findUnique({ 
        where: { id: servicoAtivo } 
      });
      expect(verificacao?.ativo).toBe(false);
    });

    it('deve rejeitar desativação de serviço já inativo', async () => {
      const servicoInativo = await criarServicoTeste(false);

      const resposta = await request(app)
        .patch(`${BASE_URL}/${servicoInativo}/desativar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('já está desativado');
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-789';

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idInexistente}/desativar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Serviço não encontrado');
    });
  });

  describe('PATCH /:id/reativar', () => {
    it('deve reativar serviço inativo', async () => {
      const servicoInativo = await criarServicoTeste(false);

      const resposta = await request(app)
        .patch(`${BASE_URL}/${servicoInativo}/reativar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('reativado com sucesso');
      expect(resposta.body.servico.ativo).toBe(true);
    });

    it('deve rejeitar reativação de serviço já ativo', async () => {
      const servicoAtivo = await criarServicoTeste(true);

      const resposta = await request(app)
        .patch(`${BASE_URL}/${servicoAtivo}/reativar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('já está ativo');
    });

    it('deve rejeitar reativação de serviço deletado', async () => {
      const servicoDeletado = await prisma.servico.create({
        data: {
          nome: gerarNomeUnico(),
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const resposta = await request(app)
        .patch(`${BASE_URL}/${servicoDeletado.id}/reativar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Não é possível reativar um serviço deletado');
    });
  });

  describe('DELETE /:id', () => {
    it('deve fazer soft delete por padrão', async () => {
      const servicoParaDeletar = await criarServicoTeste();

      const resposta = await request(app)
        .delete(`${BASE_URL}/${servicoParaDeletar}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('deletado com sucesso');

      const verificacao = await prisma.servico.findUnique({ 
        where: { id: servicoParaDeletar } 
      });
      expect(verificacao).not.toBeNull();
      expect(verificacao?.deletadoEm).not.toBeNull();
      expect(verificacao?.ativo).toBe(false);
    });

    it('deve fazer hard delete quando solicitado', async () => {
      const servicoParaDeletar = await criarServicoTeste();

      const resposta = await request(app)
        .delete(`${BASE_URL}/${servicoParaDeletar}?permanente=true`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('removido permanentemente');

      const verificacao = await prisma.servico.findUnique({ 
        where: { id: servicoParaDeletar } 
      });
      expect(verificacao).toBeNull();
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-abc';

      const resposta = await request(app)
        .delete(`${BASE_URL}/${idInexistente}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Serviço não encontrado');
    });
  });

  describe('PATCH /:id/restaurar', () => {
    it('deve restaurar serviço deletado', async () => {
      const servicoDeletado = await prisma.servico.create({
        data: {
          nome: gerarNomeUnico(),
          ativo: false,
          deletadoEm: new Date(),
        },
      });

      const resposta = await request(app)
        .patch(`${BASE_URL}/${servicoDeletado.id}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(200);
      expect(resposta.body.message).toContain('restaurado com sucesso');
      expect(resposta.body.servico.ativo).toBe(true);

      const verificacao = await prisma.servico.findUnique({
        where: { id: servicoDeletado.id },
      });
      expect(verificacao?.deletadoEm).toBeNull();
      expect(verificacao?.ativo).toBe(true);
    });

    it('deve rejeitar restauração de serviço não deletado', async () => {
      const servicoAtivo = await criarServicoTeste();

      const resposta = await request(app)
        .patch(`${BASE_URL}/${servicoAtivo}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(400);
      expect(resposta.body.error).toContain('Serviço não está deletado');
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const idInexistente = 'id-inexistente-def';

      const resposta = await request(app)
        .patch(`${BASE_URL}/${idInexistente}/restaurar`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(resposta.status).toBe(404);
      expect(resposta.body.error).toContain('Serviço não encontrado');
    });
  });
});