/**
 * Utilitários de banco de dados para os testes E2E.
 * Responsável por limpar, popular e desconectar todos os bancos
 * (PostgreSQL via Prisma, MongoDB via Mongoose, Redis) entre cada teste.
 *
 * IMPORTANTE: Este arquivo depende que o Mongoose já esteja conectado
 * antes de ser usado. A conexão é estabelecida no test.environment.ts
 * via beforeAll, que roda antes de qualquer beforeEach.
 */

import mongoose from 'mongoose';
import { prisma } from '@infrastructure/database/prisma/client';
import { redisClient } from '@infrastructure/database/redis/client';
import { hashPassword } from '@shared/config/password';
import type { Usuario, Regra } from '@prisma/client';

/**
 * Remove todos os registros do PostgreSQL respeitando a ordem de dependências
 * entre tabelas (filhos antes dos pais) para evitar erros de FK.
 */
export async function cleanPostgreSQL(): Promise<void> {
  try {
    // Dependentes de chamado
    await prisma.comentarioChamado.deleteMany({});
    await prisma.transferenciaChamado.deleteMany({});
    await prisma.ordemDeServico.deleteMany({});

    await prisma.chamado.deleteMany({});

    // Dependentes de usuario
    await prisma.servico.deleteMany({});
    await prisma.expediente.deleteMany({});

    await prisma.usuario.deleteMany({});

    console.log('[INFO]: PostgreSQL limpo com sucesso');
  } catch (error: any) {
    console.error('[INFO]: Erro ao limpar PostgreSQL:', error.message);
    throw error;
  }
}

/**
 * Remove todos os documentos de todas as collections do MongoDB.
 * Usa a conexão do Mongoose (estabelecida no test.environment.ts),
 * evitando uma segunda conexão via MongoClient nativo.
 *
 * Falhas aqui não quebram os testes — apenas logam o erro — pois o
 * MongoDB é opcional para a maioria das suítes.
 */
export async function cleanMongoDB(): Promise<void> {
  try {
    const db = mongoose.connection.db;

    if (!db) {
      // Mongoose ainda não conectou — pode acontecer se o beforeAll não terminou
      console.warn('[INFO]: MongoDB ainda não conectado, pulando limpeza');
      return;
    }

    const collections = await db.listCollections().toArray();

    await Promise.all(
      collections.map(c => mongoose.connection.collection(c.name).deleteMany({}))
    );

    console.log('[INFO]: MongoDB limpo com sucesso');
  } catch (error: any) {
    console.error('[INFO]: Erro ao limpar MongoDB:', error.message);
    // Não relança o erro para não interromper os testes que não dependem do MongoDB
  }
}

/**
 * Limpa todos os dados do banco Redis de teste via FLUSHDB.
 * Afeta apenas o database selecionado na conexão, não os demais.
 */
export async function cleanRedis(): Promise<void> {
  try {
    await redisClient.flushDb();
    console.log('[INFO]: Redis limpo com sucesso');
  } catch (error: any) {
    console.error('[INFO]: Erro ao limpar Redis:', error.message);
    throw error;
  }
}

/**
 * Executa a limpeza completa de todos os bancos em paralelo.
 * Chamado no beforeEach do test.environment.ts para garantir
 * isolamento entre testes.
 */
export async function cleanDatabase(): Promise<void> {
  await Promise.all([
    cleanPostgreSQL(),
    cleanMongoDB(),
    cleanRedis(),
  ]);
}

interface CreateTestUserParams {
  nome?: string;
  sobrenome?: string;
  email: string;
  password: string;
  regra?: Regra;
  setor?: 'ADMINISTRACAO' | 'ALMOXARIFADO' | 'CALL_CENTER' | 'COMERCIAL' | 'DEPARTAMENTO_PESSOAL' | 'FINANCEIRO' | 'JURIDICO' | 'LOGISTICA' | 'MARKETING' | 'QUALIDADE' | 'RECURSOS_HUMANOS' | 'TECNOLOGIA_INFORMACAO' | null;
  telefone?: string | null;
  ramal?: string | null;
  ativo?: boolean;
}

/**
 * Cria um único usuário de teste no PostgreSQL com a senha já hasheada.
 * Valores omitidos recebem defaults seguros para testes.
 */
export async function createTestUser(params: CreateTestUserParams): Promise<Usuario> {
  const hashedPassword = await hashPassword(params.password);

  return await prisma.usuario.create({
    data: {
      nome: params.nome || 'Usuário',
      sobrenome: params.sobrenome || 'Teste',
      email: params.email,
      password: hashedPassword,
      regra: params.regra || 'USUARIO',
      setor: params.setor || null,
      telefone: params.telefone || null,
      ramal: params.ramal || null,
      ativo: params.ativo !== undefined ? params.ativo : true,
    },
  });
}

/**
 * Cria os três usuários base usados em praticamente toda suíte E2E:
 * admin, técnico e usuário comum. Credenciais lidas do .env.test,
 * com fallback para valores padrão de desenvolvimento.
 */
export async function seedBasicUsers(): Promise<{
  admin: Usuario;
  tecnico: Usuario;
  usuario: Usuario;
}> {
  const [admin, tecnico, usuario] = await Promise.all([
    createTestUser({
      nome: 'Admin',
      sobrenome: 'Sistema',
      email: process.env.ADMIN_EMAIL || 'admin@helpme.com',
      password: process.env.ADMIN_PASSWORD || 'Admin123!',
      regra: 'ADMIN',
      setor: 'TECNOLOGIA_INFORMACAO',
    }),
    createTestUser({
      nome: 'Técnico',
      sobrenome: 'Suporte',
      email: process.env.TECNICO_EMAIL || 'tecnico@helpme.com',
      password: process.env.TECNICO_PASSWORD || 'Tecnico123!',
      regra: 'TECNICO',
      setor: 'TECNOLOGIA_INFORMACAO',
    }),
    createTestUser({
      nome: 'Usuário',
      sobrenome: 'Comum',
      email: process.env.USER_EMAIL || 'user@helpme.com',
      password: process.env.USER_PASSWORD || 'User123!',
      regra: 'USUARIO',
      setor: 'ADMINISTRACAO',
    }),
  ]);

  return { admin, tecnico, usuario };
}

/**
 * Popula a tabela de serviços com dados mínimos para os testes de chamados.
 * Os nomes aqui precisam bater com os usados nos testes que criam chamados
 * (ex: `servicoNome` obtido via `prisma.servico.findFirst()`).
 */
export async function seedBasicServices(): Promise<void> {
  await prisma.servico.createMany({
    data: [
      {
        nome: 'Suporte de TI',
        descricao: 'Problemas relacionados a hardware e software',
        ativo: true,
      },
      {
        nome: 'Manutenção',
        descricao: 'Serviços de manutenção predial',
        ativo: true,
      },
      {
        nome: 'RH',
        descricao: 'Questões de recursos humanos',
        ativo: true,
      },
    ],
  });
}

/**
 * Cria um expediente ativo para o primeiro técnico encontrado.
 * Necessário para testes que validam regras de atendimento por expediente.
 */
export async function seedBasicExpediente(): Promise<void> {
  const tecnicos = await prisma.usuario.findMany({
    where: { regra: 'TECNICO' },
    take: 1,
  });

  if (tecnicos.length > 0) {
    await prisma.expediente.create({
      data: {
        usuarioId: tecnicos[0].id,
        entrada: new Date('2024-01-01T08:00:00Z'),
        saida: new Date('2024-01-01T18:00:00Z'),
        ativo: true,
      },
    });
  }
}

/**
 * Executa todos os seeds básicos em sequência.
 * Chamado no beforeEach após cleanDatabase para garantir estado inicial
 * consistente em cada teste.
 */
export async function seedBasicData(): Promise<void> {
  await seedBasicUsers();
  await seedBasicServices();
  await seedBasicExpediente();
}

/**
 * Retorna contagens atuais das principais entidades do PostgreSQL.
 * Útil para assertions que verificam efeitos colaterais no banco.
 */
export async function getDatabaseCounts(): Promise<{
  usuarios: number;
  servicos: number;
  chamados: number;
  expedientes: number;
}> {
  const [usuarios, servicos, chamados, expedientes] = await Promise.all([
    prisma.usuario.count(),
    prisma.servico.count(),
    prisma.chamado.count(),
    prisma.expediente.count(),
  ]);

  return { usuarios, servicos, chamados, expedientes };
}

/**
 * Estabelece a conexão do Mongoose no processo dos testes.
 * Precisa ser chamada no beforeAll do test.environment.ts.
 *
 * O globalSetup já conecta o mongoose, mas essa conexão não sobrevive
 * para o processo dos testes — ela precisa ser refeita aqui.
 */
export async function connectMongoDB(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_INITDB_URI_TESTE!, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    console.log('[INFO]: Mongoose conectado no processo dos testes');
  }
}

/**
 * Encerra todas as conexões de banco de dados.
 * Deve ser chamado no afterAll global (teardown) para evitar que o processo
 * do Vitest fique pendurado aguardando conexões abertas.
 */
export async function disconnectDatabases(): Promise<void> {
  await Promise.all([
    prisma.$disconnect(),
    mongoose.disconnect(),
    redisClient.quit(),
  ]);
}