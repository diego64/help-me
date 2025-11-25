import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { prisma } from '../../lib/prisma';
import mongoose from 'mongoose';
import app from '../../app';
import jwt from 'jsonwebtoken';

vi.setConfig({ testTimeout: 15000 });

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

/**
 * Função para limpar o banco de dados na ordem correta
 * respeitando as dependências de chave estrangeira
 */
async function limparBancoDados() {
  try {
    // IMPORTANTE: Deletar na ordem inversa das dependências
    // 1. Primeiro, tabelas que dependem de outras
    await prisma.expediente.deleteMany({});
    
    // 2. Depois, tabelas intermediárias ou com poucas dependências
    await prisma.servico.deleteMany({});
    
    // 3. Por último, tabelas base (como Usuario)
    await prisma.usuario.deleteMany({});
    
    console.log('✓ Banco de dados limpo com sucesso');
  } catch (error) {
    console.error('❌ Erro ao limpar banco de dados:', error);
    throw error;
  }
}

describe('E2E - Rotas de Serviços', () => {
  let tokenAdmin: string;
  let idAdmin: string;
  let idServico: string;

  beforeAll(async () => {
    try {
      // Conectar ao MongoDB
      const uriMongo = process.env.MONGO_INITDB_URI || 'mongodb://teste:senha@localhost:27017/helpme-mongo-teste?authSource=admin';
      await mongoose.connect(uriMongo);

      // Limpar dados de teste na ordem correta
      await limparBancoDados();

      // Criar usuário administrador
      const usuarioAdmin = await prisma.usuario.create({
        data: {
          nome: 'Admin',
          sobrenome: 'Teste',
          email: 'admin@teste.com',
          password: 'hashedpassword',
          regra: 'ADMIN',
        },
      });
      idAdmin = usuarioAdmin.id;

      // Gerar token usando helper
      tokenAdmin = gerarTokenAcesso(idAdmin, 'ADMIN');
      
      console.log('✓ Setup completo - Token e usuário criados');
    } catch (error) {
      console.error('❌ Erro no beforeAll:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      // Limpar na ordem correta
      await limparBancoDados();
      
      // Desconectar
      await mongoose.disconnect();
      await prisma.$disconnect();
      
      console.log('✓ Cleanup completo');
    } catch (error) {
      console.error('❌ Erro no afterAll:', error);
      // Garantir desconexão mesmo com erro
      await mongoose.disconnect().catch(() => {});
      await prisma.$disconnect().catch(() => {});
    }
  });

  // Helper para criar serviço de teste quando necessário
  async function criarServicoTeste(): Promise<string> {
    const servico = await prisma.servico.create({
      data: {
        nome: 'Serviço de Teste E2E',
        descricao: 'Descrição do serviço de teste',
        ativo: true,
      },
    });
    return servico.id;
  }

  // ========================================
  // SEÇÃO: Criação de Serviços
  // ========================================
  
  describe('Dado um usuário administrador autenticado', () => {
    describe('Quando enviar POST /servico com dados válidos', () => {
      it('Então deve criar o serviço com sucesso', async () => {
        // Arrange - Preparar dados do novo serviço
        const dadosNovoServico = { 
          nome: 'Serviço Teste', 
          descricao: 'Descrição do serviço teste' 
        };

        // Act - Executar requisição de criação
        const resposta = await request(app)
          .post('/servico')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send(dadosNovoServico);

        // Assert - Validar resultado
        expect(resposta.status).toBe(201);
        expect(resposta.body).toHaveProperty('id');
        expect(resposta.body.nome).toBe(dadosNovoServico.nome);
        expect(resposta.body.descricao).toBe(dadosNovoServico.descricao);
        expect(resposta.body.ativo).toBe(true);

        // Armazenar ID para próximos testes
        idServico = resposta.body.id;
      });
    });

    describe('Quando enviar POST /servico sem o campo nome', () => {
      it('Então deve rejeitar a criação com erro 400', async () => {
        // Arrange - Preparar dados inválidos
        const dadosInvalidos = { descricao: 'Serviço sem nome' };

        // Act - Executar requisição
        const resposta = await request(app)
          .post('/servico')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send(dadosInvalidos);

        // Assert - Validar erro
        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toContain('nome do serviço é obrigatório');
      });
    });

    describe('Quando enviar POST /servico com nome duplicado', () => {
      it('Então deve rejeitar a criação com erro 409', async () => {
        // Arrange - Usar nome já existente
        const dadosDuplicados = { nome: 'Serviço Teste' };

        // Act - Executar requisição
        const resposta = await request(app)
          .post('/servico')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send(dadosDuplicados);

        // Assert - Validar erro de conflito
        expect(resposta.status).toBe(409);
        expect(resposta.body.error).toContain('Já existe um serviço com esse nome');
      });
    });
  });

  // ========================================
  // SEÇÃO: Listagem de Serviços
  // ========================================
  
  describe('Dado um usuário autenticado', () => {
    describe('Quando enviar GET /servico sem parâmetros', () => {
      it('Então deve listar apenas serviços ativos', async () => {
        // Act - Executar requisição de listagem
        const resposta = await request(app)
          .get('/servico')
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar listagem
        expect(resposta.status).toBe(200);
        expect(Array.isArray(resposta.body)).toBe(true);
        expect(resposta.body.length).toBeGreaterThan(0);
        
        resposta.body.forEach((servico: any) => {
          expect(servico.ativo).toBe(true);
        });
      });
    });

    describe('Quando enviar GET /servico?incluirInativos=true', () => {
      it('Então deve listar todos os serviços incluindo inativos', async () => {
        // Arrange - Garantir que temos um serviço e desativá-lo
        if (!idServico) {
          idServico = await criarServicoTeste();
        }
        
        await prisma.servico.update({
          where: { id: idServico },
          data: { ativo: false },
        });

        // Act - Executar requisição com parâmetro
        const resposta = await request(app)
          .get('/servico?incluirInativos=true')
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar que há serviços inativos na lista
        expect(resposta.status).toBe(200);
        expect(Array.isArray(resposta.body)).toBe(true);
        
        const temServicoInativo = resposta.body.some((servico: any) => !servico.ativo);
        expect(temServicoInativo).toBe(true);
      });
    });
  });

  // ========================================
  // SEÇÃO: Busca de Serviço por ID
  // ========================================
  
  describe('Dado um usuário autenticado', () => {
    describe('Quando enviar GET /servico/:id com ID válido', () => {
      it('Então deve retornar o serviço específico', async () => {
        // Arrange - Garantir que temos um serviço
        if (!idServico) {
          idServico = await criarServicoTeste();
        }

        // Act - Executar busca por ID
        const resposta = await request(app)
          .get(`/servico/${idServico}`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar dados do serviço
        expect(resposta.status).toBe(200);
        expect(resposta.body).toHaveProperty('id');
        expect(resposta.body.id).toBe(idServico);
        expect(resposta.body).toHaveProperty('nome');
        expect(resposta.body).toHaveProperty('descricao');
      });
    });

    describe('Quando enviar GET /servico/:id com ID inexistente', () => {
      it('Então deve retornar erro 404', async () => {
        // Arrange - Preparar ID inexistente
        const idInexistente = 'id-que-nao-existe';

        // Act - Executar busca
        const resposta = await request(app)
          .get(`/servico/${idInexistente}`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar erro
        expect(resposta.status).toBe(404);
        expect(resposta.body.error).toContain('Serviço não encontrado');
      });
    });
  });

  // ========================================
  // SEÇÃO: Atualização de Serviços
  // ========================================
  
  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar PUT /servico/:id com dados válidos', () => {
      it('Então deve atualizar o serviço com sucesso', async () => {
        // Arrange - Garantir que temos um serviço e preparar dados
        if (!idServico) {
          idServico = await criarServicoTeste();
        }
        
        const dadosAtualizacao = { 
          nome: 'Serviço Modificado', 
          descricao: 'Descrição Atualizada' 
        };

        // Act - Executar atualização
        const resposta = await request(app)
          .put(`/servico/${idServico}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send(dadosAtualizacao);

        // Assert - Validar atualização
        expect(resposta.status).toBe(200);
        expect(resposta.body.nome).toBe(dadosAtualizacao.nome);
        expect(resposta.body.descricao).toBe(dadosAtualizacao.descricao);
        expect(resposta.body.id).toBe(idServico);
      });
    });

    describe('Quando enviar PUT /servico/:id com ID inexistente', () => {
      it('Então deve retornar erro 404', async () => {
        // Arrange - Preparar ID inexistente e dados
        const idInexistente = 'id-que-nao-existe';
        const dados = { nome: 'Teste' };

        // Act - Executar atualização
        const resposta = await request(app)
          .put(`/servico/${idInexistente}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send(dados);

        // Assert - Validar erro
        expect(resposta.status).toBe(404);
        expect(resposta.body.error).toContain('Serviço não encontrado');
      });
    });
  });

  // ========================================
  // SEÇÃO: Desativação de Serviços
  // ========================================
  
  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar DELETE /servico/:id/desativar para serviço ativo', () => {
      it('Então deve desativar o serviço com sucesso', async () => {
        // Arrange - Garantir que temos um serviço ativo
        if (!idServico) {
          idServico = await criarServicoTeste();
        }
        
        await prisma.servico.update({
          where: { id: idServico },
          data: { ativo: true },
        });

        // Act - Executar desativação
        const resposta = await request(app)
          .delete(`/servico/${idServico}/desativar`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar desativação
        expect(resposta.status).toBe(200);
        expect(resposta.body.message).toContain('desativado com sucesso');

        // Verificar no banco de dados
        const servicoDesativado = await prisma.servico.findUnique({ 
          where: { id: idServico } 
        });
        expect(servicoDesativado).not.toBeNull();
        expect(servicoDesativado?.ativo).toBe(false);
      });
    });

    describe('Quando enviar DELETE /servico/:id/desativar para serviço já inativo', () => {
      it('Então deve retornar erro 400', async () => {
        // Act - Tentar desativar novamente
        const resposta = await request(app)
          .delete(`/servico/${idServico}/desativar`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar erro
        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toContain('já está desativado');
      });
    });

    describe('Quando enviar DELETE /servico/:id/desativar com ID inexistente', () => {
      it('Então deve retornar erro 404', async () => {
        // Arrange - Preparar ID inexistente
        const idInexistente = 'id-que-nao-existe';

        // Act - Executar desativação
        const resposta = await request(app)
          .delete(`/servico/${idInexistente}/desativar`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar erro
        expect(resposta.status).toBe(404);
        expect(resposta.body.error).toContain('Serviço não encontrado');
      });
    });
  });

  // ========================================
  // SEÇÃO: Reativação de Serviços
  // ========================================
  
  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar PATCH /servico/:id/reativar para serviço inativo', () => {
      it('Então deve reativar o serviço com sucesso', async () => {
        // Act - Executar reativação
        const resposta = await request(app)
          .patch(`/servico/${idServico}/reativar`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar reativação
        expect(resposta.status).toBe(200);
        expect(resposta.body.message).toContain('reativado com sucesso');
        expect(resposta.body.servico).toHaveProperty('ativo');
        expect(resposta.body.servico.ativo).toBe(true);
      });
    });

    describe('Quando enviar PATCH /servico/:id/reativar para serviço já ativo', () => {
      it('Então deve retornar erro 400', async () => {
        // Act - Tentar reativar novamente
        const resposta = await request(app)
          .patch(`/servico/${idServico}/reativar`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar erro
        expect(resposta.status).toBe(400);
        expect(resposta.body.error).toContain('já está ativo');
      });
    });

    describe('Quando enviar PATCH /servico/:id/reativar com ID inexistente', () => {
      it('Então deve retornar erro 404', async () => {
        // Arrange - Preparar ID inexistente
        const idInexistente = 'id-que-nao-existe';

        // Act - Executar reativação
        const resposta = await request(app)
          .patch(`/servico/${idInexistente}/reativar`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar erro
        expect(resposta.status).toBe(404);
        expect(resposta.body.error).toContain('Serviço não encontrado');
      });
    });
  });

  // ========================================
  // SEÇÃO: Exclusão Permanente de Serviços
  // ========================================
  
  describe('Dado um administrador autenticado', () => {
    describe('Quando enviar DELETE /servico/:id/excluir para serviço existente', () => {
      it('Então deve remover o serviço permanentemente', async () => {
        // Arrange - Garantir que temos um serviço para excluir
        if (!idServico) {
          idServico = await criarServicoTeste();
        }
        
        const servicoExistente = await prisma.servico.findUnique({ 
          where: { id: idServico } 
        });
        
        if (!servicoExistente) {
          idServico = await criarServicoTeste();
        }

        // Act - Executar exclusão permanente
        const resposta = await request(app)
          .delete(`/servico/${idServico}/excluir`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar exclusão
        expect(resposta.status).toBe(200);
        expect(resposta.body.message).toContain('removido permanentemente');

        // Verificar que serviço não existe mais no banco
        const servicoExcluido = await prisma.servico.findUnique({ 
          where: { id: idServico } 
        });
        expect(servicoExcluido).toBeNull();
        
        // Resetar ID para próximos testes
        idServico = '';
      });
    });

    describe('Quando enviar DELETE /servico/:id/excluir com ID inexistente', () => {
      it('Então deve retornar erro 404', async () => {
        // Arrange - Preparar ID inexistente
        const idInexistente = 'id-que-nao-existe';

        // Act - Executar exclusão
        const resposta = await request(app)
          .delete(`/servico/${idInexistente}/excluir`)
          .set('Authorization', `Bearer ${tokenAdmin}`);

        // Assert - Validar erro
        expect(resposta.status).toBe(404);
        expect(resposta.body.error).toContain('Serviço não encontrado');
      });
    });
  });
});