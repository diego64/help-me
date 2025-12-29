import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pkg;

// ========================================
// CORES PARA TERMINAL
// ========================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Cores de texto
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Cores de fundo
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Funções auxiliares para colorir texto
const log = {
  success: (msg: string) => console.log(`${colors.green}${msg}${colors.reset}`),
  error: (msg: string) => console.error(`${colors.red}${msg}${colors.reset}`),
  warn: (msg: string) => console.warn(`${colors.yellow}${msg}${colors.reset}`),
  info: (msg: string) => console.log(`${colors.cyan}${msg}${colors.reset}`),
  title: (msg: string) => console.log(`${colors.bright}${colors.blue}${msg}${colors.reset}`),
  dim: (msg: string) => console.log(`${colors.dim}${msg}${colors.reset}`),
  normal: (msg: string) => console.log(msg),
};

// ========================================
// TIPOS
// ========================================

type ModeloTabela = {
  nome: string;
  modelo: keyof PrismaClient & string;
};

// ========================================
// CARREGAMENTO DO .ENV
// ========================================

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'api/.env'),
  '.env',
  '../.env',
  '../../.env',
];

let envCarregado = false;

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error && process.env.DATABASE_URL) {
    log.success(`[SUCESSO] Arquivo .env carregado de: ${envPath}`);
    envCarregado = true;
    break;
  }
}

if (!envCarregado) {
  log.warn('[AVISO] Não foi possível carregar o arquivo .env automaticamente');
  log.warn('        Tentando usar variáveis de ambiente do sistema...\n');
}

// ========================================
// VALIDAÇÃO DA DATABASE_URL
// ========================================

function validateDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    log.error('[ERRO] DATABASE_URL não está definida\n');
    log.normal('[INFO] Possíveis causas:');
    log.normal('       1. Arquivo .env não existe');
    log.normal('       2. Arquivo .env está em outro diretório');
    log.normal('       3. DATABASE_URL não está definida no .env\n');
    log.normal('[INFO] Locais verificados:');
    envPaths.forEach((p) => log.normal(`       - ${p}`));
    log.normal('\n[INFO] Solução:');
    log.normal('       Execute este script a partir do diretório raiz do projeto:');
    log.normal('       cd /caminho/do/projeto && pnpm tsx limparBase.ts\n');
    process.exit(1);
  }

  if (typeof databaseUrl !== 'string') {
    log.error(`[ERRO] DATABASE_URL não é uma string - Tipo encontrado: ${typeof databaseUrl}`);
    process.exit(1);
  }

  if (databaseUrl.trim() === '') {
    log.error('[ERRO] DATABASE_URL está vazia');
    process.exit(1);
  }

  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    log.error('[ERRO] DATABASE_URL deve começar com postgresql:// ou postgres://');
    log.normal(`       Valor atual: ${databaseUrl.substring(0, 20)}...`);
    process.exit(1);
  }

  log.success('[SUCESSO] DATABASE_URL validada');
  return databaseUrl;
}

// ========================================
// CRIAÇÃO DO CLIENTE PRISMA
// ========================================

function createPrismaClient(connectionString: string): PrismaClient {
  try {
    const pool = new Pool({
      connectionString,
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
    });

    const adapter = new PrismaPg(pool);

    const prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error', 'warn'],
    });

    log.success('[SUCESSO] Cliente Prisma criado com sucesso\n');
    return prisma;
  } catch (error) {
    log.error('[ERRO] Erro ao criar cliente Prisma:');
    console.error(error);
    throw error;
  }
}

// ========================================
// FUNÇÃO PARA LIMPAR O BANCO (COM SOFT DELETE)
// ========================================

async function limparBanco(prisma: PrismaClient, usarSoftDelete = false) {
  log.title('\n[LIMPEZA] Iniciando limpeza do banco de dados...');
  log.info(`[MODO] ${usarSoftDelete ? 'SOFT DELETE' : 'DELETE PERMANENTE'}\n`);

  try {
    let totalRegistros = 0;
    const agora = new Date();

    // Ordem de limpeza respeitando foreign keys
    const tabelas: ModeloTabela[] = [
      { nome: 'OrdemDeServico', modelo: 'ordemDeServico' },
      { nome: 'Chamado', modelo: 'chamado' },
      { nome: 'Expediente', modelo: 'expediente' },
      { nome: 'Servico', modelo: 'servico' },
      { nome: 'Usuario', modelo: 'usuario' },
    ];

    for (const { nome, modelo: modeloName } of tabelas) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelo = prisma[modeloName] as any;

        let resultado;

        if (usarSoftDelete) {
          // Soft delete - marca como deletado
          resultado = await modelo.updateMany({
            where: { deletadoEm: null },
            data: { deletadoEm: agora },
          });
        } else {
          // Hard delete - remove permanentemente
          resultado = await modelo.deleteMany({});
        }

        totalRegistros += resultado.count;

        if (resultado.count > 0) {
          const acao = usarSoftDelete ? 'marcados como deletados' : 'removidos';
          log.success(`[OK] ${nome.padEnd(20)} ${resultado.count} registros ${acao}`);
        } else {
          log.dim(`[--] ${nome.padEnd(20)} Nenhum registro encontrado`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        log.error(`[ERRO] ${nome.padEnd(20)} ${errorMessage}`);
      }
    }

    log.normal('\n' + '='.repeat(70));
    const acao = usarSoftDelete ? 'marcados' : 'removidos';
    log.info(`[TOTAL] ${totalRegistros} registros ${acao}`);
    log.normal('='.repeat(70));
    log.success('\n[CONCLUÍDO] Limpeza concluída com sucesso!\n');
  } catch (error) {
    log.error('[ERRO] Erro durante a limpeza:');
    console.error(error);
    throw error;
  }
}

// ========================================
// FUNÇÃO PARA LIMPAR SOFT DELETES ANTIGOS
// ========================================

async function limparSoftDeletesAntigos(prisma: PrismaClient, diasAtras = 30) {
  log.title(`\n[LIMPEZA] Removendo registros soft delete de mais de ${diasAtras} dias...\n`);

  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasAtras);

    let totalRemovidos = 0;

    const tabelas: ModeloTabela[] = [
      { nome: 'OrdemDeServico', modelo: 'ordemDeServico' },
      { nome: 'Chamado', modelo: 'chamado' },
      { nome: 'Expediente', modelo: 'expediente' },
      { nome: 'Servico', modelo: 'servico' },
      { nome: 'Usuario', modelo: 'usuario' },
    ];

    for (const { nome, modelo: modeloName } of tabelas) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelo = prisma[modeloName] as any;

        const resultado = await modelo.deleteMany({
          where: {
            deletadoEm: {
              lt: dataLimite,
              not: null,
            },
          },
        });

        totalRemovidos += resultado.count;

        if (resultado.count > 0) {
          log.success(`[OK] ${nome.padEnd(20)} ${resultado.count} registros antigos removidos`);
        } else {
          log.dim(`[--] ${nome.padEnd(20)} Nenhum registro antigo encontrado`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        log.error(`[ERRO] ${nome.padEnd(20)} ${errorMessage}`);
      }
    }

    log.normal('\n' + '='.repeat(70));
    log.info(`[TOTAL] ${totalRemovidos} registros antigos removidos`);
    log.normal('='.repeat(70) + '\n');
  } catch (error) {
    log.error('[ERRO] Erro ao limpar soft deletes antigos:');
    console.error(error);
    throw error;
  }
}

// ========================================
// FUNÇÃO PARA ESTATÍSTICAS DO BANCO
// ========================================

async function mostrarEstatisticas(prisma: PrismaClient) {
  log.title('\n[ESTATÍSTICAS] Estado Atual do Banco de Dados\n');
  log.normal('='.repeat(70));

  try {
    const stats = await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.count({ where: { deletadoEm: { not: null } } }),
      prisma.expediente.count(),
      prisma.servico.count(),
      prisma.chamado.count(),
      prisma.chamado.count({ where: { status: 'ABERTO' } }),
      prisma.chamado.count({ where: { status: 'EM_ATENDIMENTO' } }),
      prisma.chamado.count({ where: { status: 'ENCERRADO' } }),
      prisma.ordemDeServico.count(),
    ]);

    log.normal(`[Usuários]                ${stats[0].toString().padStart(6)} total (${stats[1]} deletados)`);
    log.normal(`[Expedientes]             ${stats[2].toString().padStart(6)} total`);
    log.normal(`[Serviços]                ${stats[3].toString().padStart(6)} total`);
    log.normal(`[Chamados]                ${stats[4].toString().padStart(6)} total`);
    log.normal(`  - Abertos:              ${stats[5].toString().padStart(6)}`);
    log.normal(`  - Em Atendimento:       ${stats[6].toString().padStart(6)}`);
    log.normal(`  - Encerrados:           ${stats[7].toString().padStart(6)}`);
    log.normal(`[Ordens de Serviço]       ${stats[8].toString().padStart(6)} total`);
    log.normal('='.repeat(70) + '\n');
  } catch (error) {
    log.error('[ERRO] Erro ao obter estatísticas:');
    console.error(error);
  }
}

// ========================================
// FUNÇÃO PARA PERGUNTAR CONFIRMAÇÃO
// ========================================

async function confirmarLimpeza(): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    log.warn('\n[ATENÇÃO] Esta ação vai limpar TODOS os dados do banco!');
    rl.question('          Digite "CONFIRMAR" para continuar: ', (resposta) => {
      rl.close();
      resolve(resposta.trim().toUpperCase() === 'CONFIRMAR');
    });
  });
}

// ========================================
// FUNÇÃO PRINCIPAL
// ========================================

async function main() {
  let prisma: PrismaClient | null = null;

  try {
    log.title('\n========================================');
    log.title('  SCRIPT DE LIMPEZA DO BANCO DE DADOS  ');
    log.title('========================================\n');

    const cwd = process.cwd();
    const ambiente = process.env.NODE_ENV || 'development';
    
    log.normal(`[INFO] Diretório de trabalho: ${cwd}`);
    log.normal(`[INFO] Ambiente: ${ambiente}`);
    log.normal('');

    const databaseUrl = validateDatabaseUrl();

    prisma = createPrismaClient(databaseUrl);

    log.info('[CONEXÃO] Testando conexão com o banco de dados...');
    await prisma.$connect();
    log.success('[CONEXÃO] Conexão estabelecida com sucesso\n');

    // Mostrar estatísticas antes da limpeza
    await mostrarEstatisticas(prisma);

    // Pedir confirmação (pode ser desabilitado com flag --force)
    const forceFlag = process.argv.includes('--force');
    const softDeleteFlag = process.argv.includes('--soft');
    const cleanOldFlag = process.argv.includes('--clean-old');

    if (!forceFlag) {
      const confirmado = await confirmarLimpeza();
      if (!confirmado) {
        log.warn('\n[CANCELADO] Operação cancelada pelo usuário\n');
        process.exit(0);
      }
    }

    // Executar limpeza apropriada
    if (cleanOldFlag) {
      const diasArg = process.argv.find((arg) => arg.startsWith('--days='));
      const dias = parseInt(diasArg?.split('=')[1] || '30', 10);
      await limparSoftDeletesAntigos(prisma, dias);
    } else {
      await limparBanco(prisma, softDeleteFlag);
    }

    // Mostrar estatísticas depois da limpeza
    await mostrarEstatisticas(prisma);

    log.success('[SUCESSO] Script executado com sucesso!\n');
    log.info('[PRÓXIMO PASSO] Execute o seed com "pnpm run seed"\n');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    log.error('\n[ERRO] Erro na execução do script:');
    log.normal(`       ${errorMessage}\n`);

    // Dicas de solução de problemas
    if (errorMessage.includes('SASL') || errorMessage.includes('password')) {
      log.warn('[DICA] Problemas de senha:');
      log.normal('       1. Verifique se a senha no .env não tem aspas ao redor');
      log.normal('       2. Se a senha tiver caracteres especiais (@, #, $, etc.), use URL encoding');
      log.normal('       3. Exemplos de URL encoding:');
      log.normal('          @ → %40, # → %23, $ → %24');
      log.normal('          Senha: p@ss#123 → p%40ss%23123\n');
    }

    if (errorMessage.includes('ECONNREFUSED')) {
      log.warn('[DICA] Não foi possível conectar ao banco:');
      log.normal('       1. Verifique se o PostgreSQL está rodando');
      log.normal('       2. Confirme host e porta no DATABASE_URL');
      log.normal('       3. Verifique se o firewall permite a conexão\n');
    }

    if (errorMessage.includes('authentication failed')) {
      log.warn('[DICA] Falha de autenticação:');
      log.normal('       1. Verifique se o usuário existe no PostgreSQL');
      log.normal('       2. Confirme se a senha está correta');
      log.normal('       3. Verifique as permissões do usuário\n');
    }

    if (errorMessage.includes('does not exist')) {
      log.warn('[DICA] Tabela não existe:');
      log.normal('       1. Execute as migrations: pnpm prisma migrate deploy');
      log.normal('       2. Ou gere o banco do zero: pnpm prisma migrate dev\n');
    }

    process.exit(1);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
      log.info('[DESCONECTADO] Conexão com banco de dados encerrada\n');
    }
  }
}

// ========================================
// AJUDA / DOCUMENTAÇÃO
// ========================================

function mostrarAjuda() {
  log.title('\n========================================');
  log.title('  LIMPEZA DA BASE DE DADOS POSTGRESQL  ');
  log.title('========================================\n');

  log.normal('USO:');
  log.normal('  pnpm tsx limparBase.ts [opções]\n');

  log.info('OPÇÕES:');
  log.normal('  --force        Pula a confirmação (cuidado!)');
  log.normal('  --soft         Usa soft delete ao invés de deletar permanentemente');
  log.normal('  --clean-old    Remove apenas soft deletes antigos');
  log.normal('  --days=N       Define quantos dias para --clean-old (padrão: 30)');
  log.normal('  --help         Mostra esta ajuda\n');

  log.info('EXEMPLOS:');
  log.normal('  # Limpeza normal com confirmação');
  log.normal('  pnpm tsx limparBase.ts\n');

  log.normal('  # Limpeza forçada (sem confirmação)');
  log.normal('  pnpm tsx limparBase.ts --force\n');

  log.normal('  # Soft delete (marca como deletado)');
  log.normal('  pnpm tsx limparBase.ts --soft\n');

  log.normal('  # Limpar soft deletes de mais de 60 dias');
  log.normal('  pnpm tsx limparBase.ts --clean-old --days=60\n');

  log.warn('OBSERVAÇÕES:');
  log.normal('  - Sempre faça backup antes de limpar produção');
  log.normal('  - Use --soft em produção para evitar perda de dados');
  log.normal('  - O script respeita a ordem de foreign keys');
  log.normal('  - Soft deletes podem ser restaurados manualmente\n');
}

// ========================================
// EXECUÇÃO
// ========================================

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  mostrarAjuda();
  process.exit(0);
}

main().catch((error) => {
  log.error('[ERRO FATAL] Erro não tratado:');
  console.error(error);
  process.exit(1);
});