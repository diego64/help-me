import { prisma } from '@infrastructure/database/prisma/client';
import { redisClient } from '@infrastructure/database/redis/client';
import { hashPassword } from '@shared/config/password';
import type { Usuario, Regra } from '@prisma/client';
import { MongoClient } from 'mongodb';

let mongoClientInstance: MongoClient | null = null;

async function getMongoClient(): Promise<MongoClient> {
  try {
    if (mongoClientInstance) {
      // Testa se conexão ainda está ativa
      await mongoClientInstance.db().admin().ping();
      return mongoClientInstance;
    }
  } catch (error) {
    // Conexão caiu, criar nova
    mongoClientInstance = null;
  }

  const mongoUri = process.env.MONGO_INITDB_URI || 'mongodb://teste:senha@localhost:27018/helpme_mongo_teste?authSource=admin';
  mongoClientInstance = new MongoClient(mongoUri);
  await mongoClientInstance.connect();
  console.log('[INFO]: MongoDB conectado com sucesso');
  
  return mongoClientInstance;
}

export async function cleanPostgreSQL(): Promise<void> {
  try {
    await prisma.comentarioChamado.deleteMany({});
    await prisma.transferenciaChamado.deleteMany({});
    await prisma.ordemDeServico.deleteMany({});
    
    await prisma.chamado.deleteMany({});
    
    await prisma.servico.deleteMany({});
    await prisma.expediente.deleteMany({});
    
    await prisma.usuario.deleteMany({});
    
    console.log('[INFO]: PostgreSQL limpo com sucesso');
  } catch (error: any) {
    console.error('[INFO]: Erro ao limpar PostgreSQL:', error.message);
    throw error;
  }
}

export async function cleanMongoDB(): Promise<void> {
  try {
    const client = await getMongoClient();
    const db = client.db(process.env.MONGO_INITDB_DATABASE || 'helpme_mongo_teste');
    
    const collections = await db.listCollections().toArray();
    
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
    
    console.log('[INFO]: MongoDB limpo com sucesso');
  } catch (error: any) {
    // NÃO quebra os testes se MongoDB falhar - apenas loga
    console.error('[INFO]: Erro ao limpar MongoDB:', error.message);
    // Não joga erro para não quebrar os testes
  }
}

export async function cleanRedis(): Promise<void> {
  try {
    await redisClient.flushDb();
    console.log('[INFO]: Redis limpo com sucesso');
  } catch (error: any) {
    console.error('[INFO]: Erro ao limpar Redis:', error.message);
    throw error;
  }
}

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

export async function seedBasicData(): Promise<void> {
  await seedBasicUsers();
  await seedBasicServices();
  await seedBasicExpediente();
}

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

export async function disconnectDatabases(): Promise<void> {
  await Promise.all([
    prisma.$disconnect(),
    mongoClientInstance?.close().catch(() => {}), // Ignora erro se já estiver fechado
    redisClient.quit(),
  ]);
}