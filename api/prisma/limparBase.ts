import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pkg;

// ============================================================================  
// CARREGAMENTO DO .ENV
// ============================================================================

const envPaths = [
  '.env',
  '../.env',
  '../../.env',
  path.resolve(process.cwd(), '.env'),
];

let envCarregado = false;

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error && process.env.DATABASE_URL) {
    console.log(`✅ Arquivo .env carregado de: ${envPath}`);
    envCarregado = true;
    break;
  }
}

if (!envCarregado) {
  console.error('⚠️  Não foi possível carregar o arquivo .env automaticamente');
  console.error('   Tentando usar variáveis de ambiente do sistema...\n');
}

// ============================================================================  
// VALIDAÇÃO DA DATABASE_URL
// ============================================================================

function validateDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL não está definida');
    console.error('\n💡 Possíveis causas:');
    console.error('   1. Arquivo .env não existe');
    console.error('   2. Arquivo .env está em outro diretório');
    console.error('   3. DATABASE_URL não está definida no .env');
    console.error('\n📝 Locais verificados:');
    envPaths.forEach(p => console.error(`   - ${p}`));
    console.error('\n🔧 Solução:');
    console.error('   Execute este script a partir do diretório raiz do projeto:');
    console.error('   cd /caminho/do/projeto && pnpx ts-node limparBase.ts');
    process.exit(1);
  }
  
  if (typeof databaseUrl !== 'string') {
    console.error('❌ DATABASE_URL não é uma string');
    console.error('   Tipo encontrado:', typeof databaseUrl);
    process.exit(1);
  }
  
  if (databaseUrl.trim() === '') {
    console.error('❌ DATABASE_URL está vazia');
    process.exit(1);
  }
  
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    console.error('❌ DATABASE_URL deve começar com postgresql:// ou postgres://');
    console.error('   Valor atual:', databaseUrl.substring(0, 20) + '...');
    process.exit(1);
  }
  
  console.log('✅ DATABASE_URL validada');
  return databaseUrl;
}

// ============================================================================  
// CRIAÇÃO DO CLIENTE PRISMA
// ============================================================================

function createPrismaClient(connectionString: string): PrismaClient {
  try {
    const pool = new Pool({
      connectionString,
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
    });

    const adapter = new PrismaPg(pool);

    const prisma = new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
    
    console.log('✅ Cliente Prisma criado com sucesso');
    return prisma;
    
  } catch (error) {
    console.error('❌ Erro ao criar cliente Prisma:', error);
    throw error;
  }
}

// ============================================================================  
// FUNÇÃO PARA LIMPAR O BANCO
// ============================================================================

async function limparBanco(prisma: PrismaClient) {
  console.log('\n🗑️  Iniciando limpeza do banco de dados...\n');

  try {
    let totalRegistros = 0;

    try {
      const resultado1 = await prisma.ordemDeServico.deleteMany({});
      totalRegistros += resultado1.count;
      console.log(`✅ OrdemDeServico: ${resultado1.count} registros removidos`);
    } catch (error: any) {
      console.error(`❌ Erro ao limpar OrdemDeServico:`, error.message);
    }

    try {
      const resultado2 = await prisma.chamado.deleteMany({});
      totalRegistros += resultado2.count;
      console.log(`✅ Chamado: ${resultado2.count} registros removidos`);
    } catch (error: any) {
      console.error(`❌ Erro ao limpar Chamado:`, error.message);
    }

    try {
      const resultado3 = await prisma.expediente.deleteMany({});
      totalRegistros += resultado3.count;
      console.log(`✅ Expediente: ${resultado3.count} registros removidos`);
    } catch (error: any) {
      console.error(`❌ Erro ao limpar Expediente:`, error.message);
    }

    try {
      const resultado4 = await prisma.servico.deleteMany({});
      totalRegistros += resultado4.count;
      console.log(`✅ Servico: ${resultado4.count} registros removidos`);
    } catch (error: any) {
      console.error(`❌ Erro ao limpar Servico:`, error.message);
    }

    try {
      const resultado5 = await prisma.usuario.deleteMany({});
      totalRegistros += resultado5.count;
      console.log(`✅ Usuario: ${resultado5.count} registros removidos`);
    } catch (error: any) {
      console.error(`❌ Erro ao limpar Usuario:`, error.message);
    }

    console.log('\n📊 Resumo da limpeza:');
    console.log(`   Total de registros removidos: ${totalRegistros}`);
    console.log('\n✅ Limpeza concluída com sucesso!\n');
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
    throw error;
  }
}

// ============================================================================  
// FUNÇÃO PARA RESETAR SEQUÊNCIAS (OPCIONAL)
// ============================================================================

async function resetarSequencias(prisma: PrismaClient) {
  console.log('🔄 Resetando sequências do banco...\n');
  
  try {
    console.log('ℹ️  Schema usa CUID - não há sequências para resetar\n');
  } catch (error: any) {
    console.error('⚠️  Erro ao resetar sequências:', error.message);
  }
}

// ============================================================================  
// FUNÇÃO PRINCIPAL
// ============================================================================

async function main() {
  let prisma: PrismaClient | null = null;
  
  try {
    console.log('🚀 Iniciando script de limpeza do banco de dados\n');
    console.log('📂 Diretório de trabalho:', process.cwd());
    console.log('');
    
    const databaseUrl = validateDatabaseUrl();
    
    prisma = createPrismaClient(databaseUrl);
    
    console.log('🔌 Testando conexão com o banco de dados...');
    await prisma.$connect();
    console.log('✅ Conexão estabelecida com sucesso\n');
    
    await limparBanco(prisma);
    
    await resetarSequencias(prisma);
    
    console.log('🎉 Script executado com sucesso!\n');
    console.log('💡 Próximo passo: Execute o seed com "pnpm run seed"\n');
    
  } catch (error: any) {
    console.error('\n❌ Erro na execução do script:', error.message);
    
    if (error.message.includes('SASL') || error.message.includes('password')) {
      console.log('\n💡 Dicas para resolver problemas de senha:');
      console.log('   1. Verifique se a senha no .env não tem aspas ao redor');
      console.log('   2. Se a senha tiver caracteres especiais (@, #, $, etc.), use URL encoding');
      console.log('   3. Execute: pnpx ts-node diagnose-db.ts para diagnóstico completo');
      console.log('\n   Exemplos de URL encoding:');
      console.log('   @ → %40');
      console.log('   # → %23');
      console.log('   $ → %24');
      console.log('   Senha: p@ss#123 → p%40ss%23123');
    }
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Não foi possível conectar ao banco:');
      console.log('   1. Verifique se o PostgreSQL está rodando');
      console.log('   2. Confirme host e porta no DATABASE_URL');
      console.log('   3. Verifique se o firewall permite a conexão');
    }
    
    if (error.message.includes('authentication failed')) {
      console.log('\n💡 Falha de autenticação:');
      console.log('   1. Verifique se o usuário existe no PostgreSQL');
      console.log('   2. Confirme se a senha está correta');
      console.log('   3. Verifique as permissões do usuário');
    }
    
    if (error.message.includes('does not exist')) {
      console.log('\n💡 Tabela não existe:');
      console.log('   1. Execute as migrations: pnpm prisma migrate deploy');
      console.log('   2. Ou gere o banco do zero: pnpm prisma migrate dev');
    }
    
    process.exit(1);
    
  } finally {
    if (prisma) {
      await prisma.$disconnect();
      console.log('👋 Desconectado do banco de dados\n');
    }
  }
}

// ============================================================================  
// EXECUÇÃO
// ============================================================================

main()
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });