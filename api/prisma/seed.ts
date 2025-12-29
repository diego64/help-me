import {
  PrismaClient,
  Regra,
  Setor,
  ChamadoStatus
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pkg;

// ========================================
// CORES PARA TERMINAL
// ========================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bright: '\x1b[1m',
  blue: '\x1b[34m',
};

const log = {
  success: (msg: string) => console.log(`${colors.green}${msg}${colors.reset}`),
  info: (msg: string) => console.log(`${colors.cyan}${msg}${colors.reset}`),
  warn: (msg: string) => console.log(`${colors.yellow}${msg}${colors.reset}`),
  error: (msg: string) => console.log(`${colors.red}${msg}${colors.reset}`),
  title: (msg: string) => console.log(`${colors.bright}${colors.blue}${msg}${colors.reset}`),
};

// ========================================
// CARREGAMENTO DO .ENV
// ========================================

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'api/.env'),
  '.env',
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error && process.env.DATABASE_URL) {
    log.success(`[.ENV] Carregado de: ${envPath}\n`);
    break;
  }
}

if (!process.env.DATABASE_URL) {
  log.error('[ERRO] DATABASE_URL não encontrada');
  process.exit(1);
}

// ========================================
// CLIENTE PRISMA
// ========================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

// ========================================
// TIPOS
// ========================================

interface DadosUsuario {
  nome: string;
  sobrenome: string;
  email: string;
  password: string;
  regra: Regra;
  setor?: Setor;
  telefone?: string;
  ramal?: string;
  avatarUrl?: string;
}

interface DadosServico {
  nome: string;
  descricao: string;
  ativo: boolean;
}

// ========================================
// FUNÇÃO PARA CRIAR USUÁRIO
// ========================================

async function criarUsuario(email: string, dados: DadosUsuario) {
  const hashed = await bcrypt.hash(dados.password, 10);

  return prisma.usuario.upsert({
    where: { email },
    update: {
      password: hashed,
      ativo: true,
      deletadoEm: null, // Remove soft delete se existir
    },
    create: {
      ...dados,
      password: hashed,
      ativo: true,
    },
  });
}

// ========================================
// FUNÇÃO PARA CRIAR EXPEDIENTE
// ========================================

async function criarExpediente(usuarioId: string, entrada: string, saida: string) {
  // Converter strings de horário para DateTime
  const entradaDate = new Date(`1970-01-01T${entrada}:00Z`);
  const saidaDate = new Date(`1970-01-01T${saida}:00Z`);

  // Buscar expediente existente
  const expedienteExistente = await prisma.expediente.findFirst({
    where: {
      usuarioId,
      deletadoEm: null,
    },
  });

  if (expedienteExistente) {
    return prisma.expediente.update({
      where: { id: expedienteExistente.id },
      data: {
        entrada: entradaDate,
        saida: saidaDate,
        ativo: true,
        deletadoEm: null,
      },
    });
  }

  return prisma.expediente.create({
    data: {
      usuarioId,
      entrada: entradaDate,
      saida: saidaDate,
      ativo: true,
    },
  });
}

// ========================================
// FUNÇÃO PRINCIPAL DE SEED
// ========================================

async function main() {
  log.title('\n========================================');
  log.title('  SEED DO BANCO DE DADOS - POSTGRESQL   ');
  log.title('========================================\n');

  try {
    // Conectar ao banco
    log.info('[CONEXÃO] Conectando ao banco de dados...');
    await prisma.$connect();
    log.success('[CONEXÃO] Conectado com sucesso\n');

    // ========================================
    // CRIAÇÃO DE USUÁRIOS
    // ========================================
    log.title('[1/4] CRIANDO USUÁRIOS...\n');

    const admin = await criarUsuario('admin@helpme.com', {
      nome: 'Admin',
      sobrenome: 'Sistema',
      email: 'admin@helpme.com',
      password: 'Admin123!',
      regra: Regra.ADMIN,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0001',
      ramal: '1000',
    });
    log.success(`[OK] Admin criado: ${admin.email}`);

    const usuario = await criarUsuario('user@helpme.com', {
      nome: 'Usuario',
      sobrenome: 'Teste',
      email: 'user@helpme.com',
      password: 'User123!',
      regra: Regra.USUARIO,
      setor: Setor.COMERCIAL,
      telefone: '(11) 99999-0002',
      ramal: '2000',
    });
    log.success(`[OK] Usuário criado: ${usuario.email}`);

    const tecnico = await criarUsuario('tecnico@helpme.com', {
      nome: 'Tecnico',
      sobrenome: 'Suporte',
      email: 'tecnico@helpme.com',
      password: 'Tecnico123!',
      regra: Regra.TECNICO,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0003',
      ramal: '3000',
    });
    log.success(`[OK] Técnico criado: ${tecnico.email}\n`);

    // ========================================
    // CRIAÇÃO DE EXPEDIENTE
    // ========================================
    log.title('[2/4] CONFIGURANDO EXPEDIENTE...\n');

    const expediente = await criarExpediente(tecnico.id, '08:00', '17:00');
    log.success(`[OK] Expediente configurado: 08:00 - 17:00\n`);

    // ========================================
    // CRIAÇÃO DE SERVIÇOS
    // ========================================
    log.title('[3/4] CRIANDO SERVIÇOS...\n');

    const servicosData: DadosServico[] = [
      {
        nome: 'Serviço Teste K6',
        descricao: 'Serviço para testes automatizados K6',
        ativo: true,
      },
      {
        nome: 'Instalação de Software',
        descricao: 'Instalação e configuração de softwares corporativos',
        ativo: true,
      },
      {
        nome: 'Manutenção de Hardware',
        descricao: 'Reparo e manutenção de equipamentos',
        ativo: true,
      },
      {
        nome: 'Suporte de Rede',
        descricao: 'Configuração e troubleshooting de rede',
        ativo: true,
      },
      {
        nome: 'Backup e Recuperação',
        descricao: 'Serviços de backup e recuperação de dados',
        ativo: false,
      },
    ];

    for (const dados of servicosData) {
      const servico = await prisma.servico.upsert({
        where: { nome: dados.nome },
        update: {
          descricao: dados.descricao,
          ativo: dados.ativo,
          deletadoEm: null,
        },
        create: dados,
      });

      const status = servico.ativo ? 'ativo' : 'inativo';
      log.success(`[OK] Serviço: ${servico.nome} (${status})`);
    }

    log.info('');

    // ========================================
    // CRIAÇÃO DE CHAMADOS
    // ========================================
    log.title('[4/4] CRIANDO CHAMADOS...\n');

    const servicoTeste = await prisma.servico.findUnique({
      where: { nome: 'Serviço Teste K6' },
    });

    if (!servicoTeste) {
      log.warn('[AVISO] Serviço Teste K6 não encontrado, pulando criação de chamados\n');
      return;
    }

    // Verificar se chamados já existem
    const chamadosExistentes = await prisma.chamado.findMany({
      where: {
        OS: { in: ['INC0001', 'INC0002', 'INC0003'] },
      },
    });

    if (chamadosExistentes.length > 0) {
      log.info(`[INFO] Chamados já existem (${chamadosExistentes.length}), pulando criação\n`);
    } else {
      // Criar chamados em transação
      const chamados = await prisma.$transaction(async (tx) => {
        // CHAMADO 1: ABERTO
        const c1 = await tx.chamado.create({
          data: {
            OS: 'INC0001',
            descricao: 'Computador não liga - Necessário verificar fonte de alimentação',
            status: ChamadoStatus.ABERTO,
            usuarioId: usuario.id,
          },
        });

        await tx.ordemDeServico.create({
          data: {
            chamadoId: c1.id,
            servicoId: servicoTeste.id,
          },
        });

        // CHAMADO 2: EM ATENDIMENTO
        const c2 = await tx.chamado.create({
          data: {
            OS: 'INC0002',
            descricao: 'Internet lenta - Verificar configurações de rede',
            status: ChamadoStatus.EM_ATENDIMENTO,
            usuarioId: usuario.id,
            tecnicoId: tecnico.id,
          },
        });

        await tx.ordemDeServico.create({
          data: {
            chamadoId: c2.id,
            servicoId: servicoTeste.id,
          },
        });

        // CHAMADO 3: ENCERRADO
        const c3 = await tx.chamado.create({
          data: {
            OS: 'INC0003',
            descricao: 'Instalação do Microsoft Office',
            descricaoEncerramento: 'Microsoft Office instalado e configurado com sucesso',
            status: ChamadoStatus.ENCERRADO,
            encerradoEm: new Date(),
            usuarioId: usuario.id,
            tecnicoId: tecnico.id,
          },
        });

        await tx.ordemDeServico.create({
          data: {
            chamadoId: c3.id,
            servicoId: servicoTeste.id,
          },
        });

        return [c1, c2, c3];
      });

      const osNumbers = chamados.map((c) => c.OS).join(', ');
      log.success(`[OK] Chamados criados: ${osNumbers}\n`);
    }

    // ========================================
    // RESUMO FINAL
    // ========================================
    log.title('========================================');
    log.title('  SEED CONCLUÍDO COM SUCESSO!          ');
    log.title('========================================\n');

    log.success('CREDENCIAIS CRIADAS:\n');
    console.log('Admin:');
    console.log(`  Email:    admin@helpme.com`);
    console.log(`  Senha:    Admin123!`);
    console.log(`  Regra:    ADMIN\n`);

    console.log('Usuário:');
    console.log(`  Email:    user@helpme.com`);
    console.log(`  Senha:    User123!`);
    console.log(`  Regra:    USUARIO\n`);

    console.log('Técnico:');
    console.log(`  Email:    tecnico@helpme.com`);
    console.log(`  Senha:    Tecnico123!`);
    console.log(`  Regra:    TECNICO`);
    console.log(`  Horário:  08:00 - 17:00\n`);

    // Estatísticas
    const stats = await Promise.all([
      prisma.usuario.count({ where: { deletadoEm: null } }),
      prisma.servico.count({ where: { deletadoEm: null } }),
      prisma.chamado.count({ where: { deletadoEm: null } }),
      prisma.expediente.count({ where: { deletadoEm: null } }),
    ]);

    log.info('ESTATÍSTICAS:');
    console.log(`  Usuários:    ${stats[0]}`);
    console.log(`  Serviços:    ${stats[1]}`);
    console.log(`  Chamados:    ${stats[2]}`);
    console.log(`  Expedientes: ${stats[3]}\n`);
  } catch (error) {
    log.error('\n[ERRO] Erro durante o seed:');
    console.error(error);
    throw error;
  }
}

// ========================================
// EXECUÇÃO
// ========================================

main()
  .catch((error) => {
    log.error('[ERRO FATAL] Seed falhou:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    log.info('[DESCONECTANDO] Fechando conexão com banco de dados...');
    await prisma.$disconnect();
    log.success('[DESCONECTADO] Conexão encerrada\n');
  });