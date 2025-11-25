import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../../lib/prisma';
import mongoose from 'mongoose';
import app from '../../app';
import jwt from 'jsonwebtoken';

vi.setConfig({ testTimeout: 15000 });


const BASE_URL = '/chamado';

describe('E2E - Rotas de Chamados', () => {
    // ============================================================================
    // Dados de Teste & Configuração
    // ============================================================================
    
    let tokenAutenticacaoUsuario: string;
    let tokenAutenticacaoTecnico: string;
    let tokenAutenticacaoAdmin: string;
    let idUsuario: string;
    let idTecnico: string;
    let idAdmin: string;
    let idServico: string;
    let idChamado: string;

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

    const criarExpedienteTecnico = async (tecnicoId: string) => {
        return await prisma.expediente.create({
            data: {
                usuarioId: tecnicoId,
                entrada: '08:00',
                saida: '18:00',
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
        const secret = process.env.JWT_SECRET || 'testsecret';
        
        const tokenUsuario = jwt.sign(
            {
                id: usuarios.usuario.id,
                regra: 'USUARIO',
                nome: 'Usuario',
                email: 'usuario@test.com',
                type: 'access',
            },
            secret,
            {
                audience: 'helpme-client',
                issuer: 'helpme-api',
            }
        );

        const tokenTecnico = jwt.sign(
            {
                id: usuarios.tecnico.id,
                regra: 'TECNICO',
                nome: 'Tecnico',
                email: 'tecnico@test.com',
                type: 'access',
            },
            secret,
            {
                audience: 'helpme-client',
                issuer: 'helpme-api',
            }
        );

        const tokenAdmin = jwt.sign(
            {
                id: usuarios.admin.id,
                regra: 'ADMIN',
                nome: 'Admin',
                email: 'admin@test.com',
                type: 'access',
            },
            secret,
            {
                audience: 'helpme-client',
                issuer: 'helpme-api',
            }
        );

        return { tokenUsuario, tokenTecnico, tokenAdmin };
    };

    // ============================================================================
    // Hooks Globais
    // ============================================================================

    beforeAll(async () => {
        // Arrange: Conectar aos bancos de dados
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

        // Arrange: Criar expediente do técnico
        await criarExpedienteTecnico(idTecnico);

        // Arrange: Criar serviço de teste
        const servico = await criarServicoTeste();
        idServico = servico.id;

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
    // POST /abertura-chamado - Criação de Chamados
    // ============================================================================

    describe('POST /abertura-chamado', () => {
        it('Dado dados válidos de chamado, Quando usuário cria chamado, Então deve retornar chamado criado com número OS', async () => {
            // Arrange: Preparar payload do chamado
            const payloadChamado = {
                descricao: 'Problema com impressora',
                servico: 'Suporte Técnico',
            };

            // Act: Criar chamado
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadChamado);

            // Assert: Verificar criação do chamado
            expect(resposta.status).toBe(201);
            expect(resposta.body).toHaveProperty('id');
            expect(resposta.body).toHaveProperty('OS');
            expect(resposta.body.OS).toMatch(/^INC\d{4}$/);
            expect(resposta.body.descricao).toBe('Problema com impressora');
            expect(resposta.body.status).toBe('ABERTO');
            
            idChamado = resposta.body.id;
        });

        it('Dado descrição ausente, Quando usuário cria chamado, Então deve retornar erro 400', async () => {
            // Arrange: Preparar payload inválido sem descrição
            const payloadInvalido = {
                servico: 'Suporte Técnico',
            };

            // Act: Tentar criar chamado
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadInvalido);

            // Assert: Verificar erro de validação
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('descrição do chamado é obrigatória');
        });

        it('Dado descrição vazia, Quando usuário cria chamado, Então deve retornar erro 400', async () => {
            // Arrange: Preparar payload com descrição apenas com espaços
            const payloadInvalido = {
                descricao: '   ',
                servico: 'Suporte Técnico',
            };

            // Act: Tentar criar chamado
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadInvalido);

            // Assert: Verificar erro de validação
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('descrição do chamado é obrigatória');
        });

        it('Dado serviço ausente, Quando usuário cria chamado, Então deve retornar erro 400', async () => {
            // Arrange: Preparar payload sem serviço
            const payloadInvalido = {
                descricao: 'Teste',
            };

            // Act: Tentar criar chamado
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadInvalido);

            // Assert: Verificar erro de validação de serviço
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('pelo menos um serviço válido');
        });

        it('Dado serviço inexistente, Quando usuário cria chamado, Então deve retornar erro 400', async () => {
            // Arrange: Preparar payload com serviço que não existe
            const payloadInvalido = {
                descricao: 'Teste',
                servico: 'Serviço Inexistente',
            };

            // Act: Tentar criar chamado
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadInvalido);

            // Assert: Verificar erro de serviço não encontrado
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('não foram encontrados');
        });

        it('Dado array de serviços válidos, Quando usuário cria chamado, Então deve aceitar e criar chamado', async () => {
            // Arrange: Preparar payload com array de serviços
            const payloadComArray = {
                descricao: 'Múltiplos serviços',
                servico: ['Suporte Técnico'],
            };

            // Act: Criar chamado com array
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadComArray);

            // Assert: Verificar criação bem-sucedida
            expect(resposta.status).toBe(201);
            expect(resposta.body).toHaveProperty('servico');
        });

        it('Dado múltiplos chamados criados, Quando verificar números OS, Então devem ser sequenciais e incrementais', async () => {
            // Arrange: Preparar payloads para dois chamados
            const primeiroChamado = {
                descricao: 'Primeiro chamado',
                servico: 'Suporte Técnico',
            };
            const segundoChamado = {
                descricao: 'Segundo chamado',
                servico: 'Suporte Técnico',
            };

            // Act: Criar dois chamados sequencialmente
            const resposta1 = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(primeiroChamado);

            const resposta2 = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(segundoChamado);

            // Assert: Verificar incremento correto dos números OS
            expect(resposta1.status).toBe(201);
            expect(resposta2.status).toBe(201);

            const numeroOS1 = parseInt(resposta1.body.OS.replace('INC', ''), 10);
            const numeroOS2 = parseInt(resposta2.body.OS.replace('INC', ''), 10);
            expect(numeroOS2).toBeGreaterThan(numeroOS1);
        });
    });

    // ============================================================================
    // PATCH /:id/status - Atualização de Status
    // ============================================================================

    describe('PATCH /:id/status', () => {
        it('Dado técnico dentro do expediente, Quando assume chamado, Então deve atualizar status para EM_ATENDIMENTO', async () => {
            // Arrange: Configurar horário dentro do expediente
            vi.setSystemTime(new Date('2025-01-15T10:00:00'));
            const atualizacaoStatus = {
                status: 'EM_ATENDIMENTO',
            };

            // Act: Técnico assume o chamado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idChamado}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
                .send(atualizacaoStatus);

            // Assert: Verificar atribuição bem-sucedida
            expect(resposta.status).toBe(200);
            expect(resposta.body.status).toBe('EM_ATENDIMENTO');
            expect(resposta.body.tecnico).toBeDefined();
            expect(resposta.body.tecnico.nome).toBe('Tecnico');

            vi.useRealTimers();
        });

        it('Dado técnico fora do expediente, Quando tenta assumir chamado, Então deve rejeitar com erro 403', async () => {
            // Arrange: Criar novo chamado e configurar horário fora do expediente
            const novoChamado = await prisma.chamado.create({
                data: {
                    OS: 'INC9998',
                    descricao: 'Teste horário',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            vi.setSystemTime(new Date('2025-01-15T20:00:00'));
            const atualizacaoStatus = {
                status: 'EM_ATENDIMENTO',
            };

            // Act: Técnico tenta assumir fora do horário
            const resposta = await request(app)
                .patch(`${BASE_URL}/${novoChamado.id}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
                .send(atualizacaoStatus);

            // Assert: Verificar rejeição por horário
            expect(resposta.status).toBe(403);
            expect(resposta.body.error).toContain('horário de trabalho');

            vi.useRealTimers();
            await prisma.chamado.delete({ where: { id: novoChamado.id } });
        });

        it('Dado admin com descrição de encerramento, Quando encerra chamado, Então deve atualizar para ENCERRADO', async () => {
            // Arrange: Preparar payload de encerramento
            const encerramentoChamado = {
                status: 'ENCERRADO',
                descricaoEncerramento: 'Problema resolvido com sucesso',
            };

            // Act: Admin encerra o chamado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idChamado}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
                .send(encerramentoChamado);

            // Assert: Verificar encerramento completo
            expect(resposta.status).toBe(200);
            expect(resposta.body.status).toBe('ENCERRADO');
            expect(resposta.body.encerradoEm).toBeDefined();
            expect(resposta.body.ultimaAtualizacao).toBeDefined();
            expect(resposta.body.ultimaAtualizacao.tipo).toBe('STATUS');
        });

        it('Dado encerramento sem descrição, Quando admin tenta encerrar, Então deve rejeitar com erro 400', async () => {
            // Arrange: Criar chamado e preparar payload sem descrição
            const novoChamado = await prisma.chamado.create({
                data: {
                    OS: 'INC8887',
                    descricao: 'Teste',
                    usuarioId: idUsuario,
                    status: 'EM_ATENDIMENTO',
                    tecnicoId: idTecnico,
                },
            });

            const encerramentoSemDescricao = {
                status: 'ENCERRADO',
            };

            // Act: Tentar encerrar sem descrição
            const resposta = await request(app)
                .patch(`${BASE_URL}/${novoChamado.id}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
                .send(encerramentoSemDescricao);

            // Assert: Verificar erro de validação
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('descrição de encerramento é obrigatória');

            await prisma.chamado.delete({ where: { id: novoChamado.id } });
        });

        it('Dado técnico tentando cancelar, Quando muda status para CANCELADO, Então deve rejeitar com erro 403', async () => {
            // Arrange: Criar chamado aberto
            const novoChamado = await prisma.chamado.create({
                data: {
                    OS: 'INC7776',
                    descricao: 'Teste',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            const cancelamento = {
                status: 'CANCELADO',
            };

            // Act: Técnico tenta cancelar
            const resposta = await request(app)
                .patch(`${BASE_URL}/${novoChamado.id}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
                .send(cancelamento);

            // Assert: Verificar rejeição de permissão
            expect(resposta.status).toBe(403);
            expect(resposta.body.error).toContain('não podem cancelar');

            await prisma.chamado.delete({ where: { id: novoChamado.id } });
        });

        it('Dado status inválido, Quando tenta atualizar, Então deve rejeitar com erro 400', async () => {
            // Arrange: Preparar status inexistente
            const statusInvalido = {
                status: 'STATUS_INVALIDO',
            };

            // Act: Tentar atualizar com status inválido
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idChamado}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
                .send(statusInvalido);

            // Assert: Verificar erro de validação
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('Status inválido');
        });

        it('Dado chamado encerrado, Quando técnico tenta alterar, Então deve rejeitar com erro 403', async () => {
            // Arrange: Criar chamado já encerrado
            const chamadoEncerrado = await prisma.chamado.create({
                data: {
                    OS: 'INC6676',
                    descricao: 'Teste encerrado',
                    usuarioId: idUsuario,
                    status: 'ENCERRADO',
                    encerradoEm: new Date(),
                    descricaoEncerramento: 'Finalizado',
                },
            });

            const tentativaAlteracao = {
                status: 'EM_ATENDIMENTO',
            };

            // Act: Técnico tenta alterar chamado encerrado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${chamadoEncerrado.id}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
                .send(tentativaAlteracao);

            // Assert: Verificar rejeição
            expect(resposta.status).toBe(403);
            expect(resposta.body.error).toContain('encerrados não podem ser alterados por técnicos');

            await prisma.chamado.delete({ where: { id: chamadoEncerrado.id } });
        });

        it('Dado chamado cancelado, Quando tenta reabrir, Então deve rejeitar com erro 400', async () => {
            // Arrange: Criar chamado cancelado
            const chamadoCancelado = await prisma.chamado.create({
                data: {
                    OS: 'INC5565',
                    descricao: 'Teste cancelado',
                    usuarioId: idUsuario,
                    status: 'CANCELADO',
                    encerradoEm: new Date(),
                    descricaoEncerramento: 'Cancelado pelo usuário',
                },
            });

            const tentativaReabertura = {
                status: 'EM_ATENDIMENTO',
            };

            // Act: Tentar reabrir chamado cancelado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${chamadoCancelado.id}/status`)
                .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
                .send(tentativaReabertura);

            // Assert: Verificar rejeição
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('cancelados não podem ser reabertos');

            await prisma.chamado.delete({ where: { id: chamadoCancelado.id } });
        });
    });

    // ============================================================================
    // GET /:id/historico - Consulta de Histórico
    // ============================================================================

    describe('GET /:id/historico', () => {
        it('Dado chamado com histórico, Quando usuário consulta, Então deve retornar array de eventos', async () => {
            // Arrange: ID do chamado já existente
            
            // Act: Buscar histórico do chamado
            const resposta = await request(app)
                .get(`${BASE_URL}/${idChamado}/historico`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

            // Assert: Verificar estrutura do histórico
            expect(resposta.status).toBe(200);
            expect(Array.isArray(resposta.body)).toBe(true);
            
            if (resposta.body.length > 0) {
                const primeiroEvento = resposta.body[0];
                expect(primeiroEvento).toHaveProperty('tipo');
                expect(primeiroEvento).toHaveProperty('dataHora');
                expect(primeiroEvento).toHaveProperty('autorId');
            }
        });

        it('Dado qualquer usuário autenticado, Quando consulta histórico, Então deve permitir acesso', async () => {
            // Arrange: Usar técnico para consultar histórico
            
            // Act: Técnico acessa histórico
            const resposta = await request(app)
                .get(`${BASE_URL}/${idChamado}/historico`)
                .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

            // Assert: Verificar acesso permitido
            expect(resposta.status).toBe(200);
        });
    });

    // ============================================================================
    // PATCH /:id/reabrir-chamado - Reabertura de Chamados
    // ============================================================================

    describe('PATCH /:id/reabrir-chamado', () => {
        let idChamadoEncerrado: string;

        beforeEach(async () => {
            // Arrange: Criar chamado encerrado para cada teste
            const chamadoEncerrado = await prisma.chamado.create({
                data: {
                    OS: `INC${Date.now()}${Math.floor(Math.random() * 1000)}`,
                    descricao: 'Chamado para reabrir',
                    usuarioId: idUsuario,
                    status: 'ENCERRADO',
                    encerradoEm: new Date(),
                    descricaoEncerramento: 'Finalizado',
                    tecnicoId: idTecnico,
                },
            });
            idChamadoEncerrado = chamadoEncerrado.id;
        });

        it('Dado usuário dono do chamado dentro de 48h, Quando reabre chamado, Então deve atualizar para REABERTO', async () => {
            // Arrange: Preparar payload de reabertura
            const payloadReabertura = {
                atualizacaoDescricao: 'Problema voltou a acontecer',
            };

            // Act: Reabrir chamado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadReabertura);

            // Assert: Verificar reabertura bem-sucedida
            expect(resposta.status).toBe(200);
            expect(resposta.body.status).toBe('REABERTO');
            expect(resposta.body.encerradoEm).toBeNull();
            expect(resposta.body.ultimaAtualizacao).toBeDefined();
            expect(resposta.body.ultimaAtualizacao.tipo).toBe('REABERTURA');
        });

        it('Dado reabertura sem descrição, Quando usuário reabre, Então deve aceitar e processar', async () => {
            // Arrange: Payload vazio
            const payloadVazio = {};

            // Act: Reabrir sem descrição adicional
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadVazio);

            // Assert: Verificar reabertura aceita
            expect(resposta.status).toBe(200);
            expect(resposta.body.status).toBe('REABERTO');
        });

        it('Dado usuário não dono do chamado, Quando tenta reabrir, Então deve rejeitar com erro 403', async () => {
            // Arrange: Payload de reabertura
            const payloadReabertura = {};

            // Act: Técnico tenta reabrir chamado de outro usuário
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`)
                .send(payloadReabertura);

            // Assert: Verificar negação de acesso
            expect(resposta.status).toBe(403);
            expect(resposta.body.error).toBe('Acesso negado.');
        });

        it('Dado chamado encerrado há mais de 48h, Quando tenta reabrir, Então deve rejeitar com erro 400', async () => {
            // Arrange: Atualizar data de encerramento para mais de 48h atrás
            await prisma.chamado.update({
                where: { id: idChamadoEncerrado },
                data: {
                    encerradoEm: new Date(Date.now() - 50 * 60 * 60 * 1000),
                },
            });

            const payloadReabertura = {};

            // Act: Tentar reabrir chamado expirado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idChamadoEncerrado}/reabrir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadReabertura);

            // Assert: Verificar rejeição por prazo excedido
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('48 horas');
        });

        it('Dado chamado não encerrado, Quando tenta reabrir, Então deve rejeitar com erro 400', async () => {
            // Arrange: Criar chamado ainda aberto
            const chamadoAberto = await prisma.chamado.create({
                data: {
                    OS: 'INC5554',
                    descricao: 'Aberto',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            const payloadReabertura = {};

            // Act: Tentar reabrir chamado que não está encerrado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${chamadoAberto.id}/reabrir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadReabertura);

            // Assert: Verificar rejeição
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('Somente chamados encerrados');

            await prisma.chamado.delete({ where: { id: chamadoAberto.id } });
        });

        it('Dado ID inexistente, Quando tenta reabrir, Então deve retornar erro 404', async () => {
            // Arrange: ID que não existe no banco
            const idInexistente = 'id-inexistente';
            const payloadReabertura = {};

            // Act: Tentar reabrir chamado inexistente
            const resposta = await request(app)
                .patch(`${BASE_URL}/${idInexistente}/reabrir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadReabertura);

            // Assert: Verificar erro 404
            expect(resposta.status).toBe(404);
            
            if (resposta.body.error) {
                expect(resposta.body.error).toContain('não encontrado');
            }
        });
    });

    // ============================================================================
    // PATCH /:id/cancelar-chamado - Cancelamento de Chamados
    // ============================================================================

    describe('PATCH /:id/cancelar-chamado', () => {
        it('Dado usuário dono do chamado, Quando cancela com justificativa, Então deve atualizar para CANCELADO', async () => {
            // Arrange: Criar chamado e preparar payload
            const chamado = await prisma.chamado.create({
                data: {
                    OS: `INC${Date.now().toString().slice(-4)}`,
                    descricao: 'Chamado para cancelar',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            const payloadCancelamento = {
                descricaoEncerramento: 'Não precisa mais',
            };

            // Act: Cancelar chamado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${chamado.id}/cancelar-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadCancelamento);

            // Assert: Verificar cancelamento bem-sucedido
            expect(resposta.status).toBe(200);
            expect(resposta.body.message).toContain('cancelado com sucesso');
            expect(resposta.body.chamado.status).toBe('CANCELADO');
            expect(resposta.body.chamado.encerradoEm).toBeDefined();
        });

        it('Dado admin, Quando cancela qualquer chamado, Então deve permitir cancelamento', async () => {
            // Arrange: Criar chamado de outro usuário
            const chamado = await prisma.chamado.create({
                data: {
                    OS: `INC${Date.now()}${Math.floor(Math.random() * 1000)}`,
                    descricao: 'Chamado para admin cancelar',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            const payloadCancelamento = {
                descricaoEncerramento: 'Cancelado por admin',
            };

            // Act: Admin cancela chamado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${chamado.id}/cancelar-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`)
                .send(payloadCancelamento);

            // Assert: Verificar cancelamento autorizado
            expect(resposta.status).toBe(200);
            expect(resposta.body.chamado.status).toBe('CANCELADO');
        });

        it('Dado cancelamento sem justificativa, Quando usuário cancela, Então deve rejeitar com erro 400', async () => {
            // Arrange: Criar chamado sem payload de justificativa
            const chamado = await prisma.chamado.create({
                data: {
                    OS: `INC${(Date.now() + 2).toString().slice(-4)}`,
                    descricao: 'Teste sem justificativa',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            const payloadVazio = {};

            // Act: Tentar cancelar sem justificativa
            const resposta = await request(app)
                .patch(`${BASE_URL}/${chamado.id}/cancelar-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadVazio);

            // Assert: Verificar erro de validação
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('justificativa do cancelamento');

            await prisma.chamado.delete({ where: { id: chamado.id } });
        });

        it('Dado chamado de outro usuário, Quando usuário comum tenta cancelar, Então deve rejeitar com erro 403', async () => {
            // Arrange: Criar chamado do admin
            const outroChamado = await prisma.chamado.create({
                data: {
                    OS: 'INC3332',
                    descricao: 'Chamado de outro',
                    usuarioId: idAdmin,
                    status: 'ABERTO',
                },
            });

            const payloadCancelamento = {
                descricaoEncerramento: 'Teste',
            };

            // Act: Usuário tenta cancelar chamado de outro
            const resposta = await request(app)
                .patch(`${BASE_URL}/${outroChamado.id}/cancelar-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadCancelamento);

            // Assert: Verificar negação de permissão
            expect(resposta.status).toBe(403);
            expect(resposta.body.error).toContain('não tem permissão');

            await prisma.chamado.delete({ where: { id: outroChamado.id } });
        });

        it('Dado chamado já encerrado, Quando tenta cancelar, Então deve rejeitar com erro 400', async () => {
            // Arrange: Criar chamado encerrado
            const chamadoEncerrado = await prisma.chamado.create({
                data: {
                    OS: `INC${Date.now()}${Math.floor(Math.random() * 1000)}`,
                    descricao: 'Teste encerrado',
                    usuarioId: idUsuario,
                    status: 'ENCERRADO',
                    encerradoEm: new Date(),
                    descricaoEncerramento: 'Resolvido',
                },
            });

            const payloadCancelamento = {
                descricaoEncerramento: 'Tentando cancelar',
            };

            // Act: Tentar cancelar chamado encerrado
            const resposta = await request(app)
                .patch(`${BASE_URL}/${chamadoEncerrado.id}/cancelar-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`)
                .send(payloadCancelamento);

            // Assert: Verificar rejeição
            expect(resposta.status).toBe(400);
            expect(resposta.body.error).toContain('cancelar um chamado encerrado');

            await prisma.chamado.delete({ where: { id: chamadoEncerrado.id } });
        });
    });

    // ============================================================================
    // DELETE /:id/excluir-chamado - Exclusão de Chamados
    // ============================================================================

    describe('DELETE /:id/excluir-chamado', () => {
        it('Dado admin autenticado, Quando exclui chamado, Então deve deletar com sucesso', async () => {
            // Arrange: Criar chamado para exclusão
            const chamado = await prisma.chamado.create({
                data: {
                    OS: 'INC2221',
                    descricao: 'Para excluir',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            // Act: Admin exclui chamado
            const resposta = await request(app)
                .delete(`${BASE_URL}/${chamado.id}/excluir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

            // Assert: Verificar exclusão bem-sucedida
            expect(resposta.status).toBe(200);
            expect(resposta.body.message).toContain('deletado com sucesso');
            expect(resposta.body.chamado.Os).toBe('INC2221');
        });

        it('Dado técnico autenticado, Quando tenta excluir chamado, Então deve rejeitar com erro 403', async () => {
            // Arrange: Criar chamado
            const chamado = await prisma.chamado.create({
                data: {
                    OS: 'INC1110',
                    descricao: 'Para tentar excluir',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            // Act: Técnico tenta excluir
            const resposta = await request(app)
                .delete(`${BASE_URL}/${chamado.id}/excluir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoTecnico}`);

            // Assert: Verificar negação de permissão
            expect(resposta.status).toBe(403);

            await prisma.chamado.delete({ where: { id: chamado.id } });
        });

        it('Dado usuário comum autenticado, Quando tenta excluir chamado, Então deve rejeitar com erro 403', async () => {
            // Arrange: Criar chamado
            const chamado = await prisma.chamado.create({
                data: {
                    OS: `INC${Date.now()}${Math.floor(Math.random() * 1000)}`,
                    descricao: 'Para tentar excluir',
                    usuarioId: idUsuario,
                    status: 'ABERTO',
                },
            });

            // Act: Usuário tenta excluir
            const resposta = await request(app)
                .delete(`${BASE_URL}/${chamado.id}/excluir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoUsuario}`);

            // Assert: Verificar negação de permissão
            expect(resposta.status).toBe(403);

            await prisma.chamado.delete({ where: { id: chamado.id } });
        });

        it('Dado ID inexistente, Quando admin tenta excluir, Então deve retornar erro 404', async () => {
            // Arrange: ID que não existe
            const idInexistente = 'id-inexistente';

            // Act: Tentar excluir chamado inexistente
            const resposta = await request(app)
                .delete(`${BASE_URL}/${idInexistente}/excluir-chamado`)
                .set('Authorization', `Bearer ${tokenAutenticacaoAdmin}`);

            // Assert: Verificar erro 404
            expect(resposta.status).toBe(404);
            
            if (resposta.body.error) {
                expect(resposta.body.error).toContain('não encontrado');
            }
        });
    });

    // ============================================================================
    // Testes de Autenticação e Segurança
    // ============================================================================

    describe('Autenticação e Segurança', () => {
        it('Dado requisição sem token, Quando tenta criar chamado, Então deve rejeitar com erro 401', async () => {
            // Arrange: Preparar payload de chamado
            const payloadChamado = {
                descricao: 'Teste',
                servico: 'Suporte Técnico',
            };

            // Act: Fazer requisição sem autenticação
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .send(payloadChamado);

            // Assert: Verificar rejeição por falta de autenticação
            expect(resposta.status).toBe(401);
        });

        it('Dado token inválido, Quando tenta criar chamado, Então deve rejeitar com erro 401', async () => {
            // Arrange: Preparar payload e token inválido
            const payloadChamado = {
                descricao: 'Teste',
                servico: 'Suporte Técnico',
            };
            const tokenInvalido = 'Bearer token-invalido';

            // Act: Fazer requisição com token malformado
            const resposta = await request(app)
                .post(`${BASE_URL}/abertura-chamado`)
                .set('Authorization', tokenInvalido)
                .send(payloadChamado);

            // Assert: Verificar rejeição por token inválido
            expect(resposta.status).toBe(401);
        });
    });
});