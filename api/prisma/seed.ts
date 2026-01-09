import {
  PrismaClient,
  Regra,
  Setor,
  ChamadoStatus
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import { hashPassword } from '../src/utils/password';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pkg;

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
  log.error('[ERROR] DATABASE_URL não encontrada');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

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

async function criarUsuario(email: string, dados: DadosUsuario) {
  const hashed = hashPassword(dados.password);

  return prisma.usuario.upsert({
    where: { email },
    update: {
      password: hashed,
      ativo: true,
      deletadoEm: null,
    },
    create: {
      ...dados,
      password: hashed,
      ativo: true,
    },
  });
}


async function criarExpediente(usuarioId: string, entrada: string, saida: string) {
  const entradaDate = new Date(`1970-01-01T${entrada}:00Z`);
  const saidaDate = new Date(`1970-01-01T${saida}:00Z`);

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

async function main() {
  log.title('\n========================================');
  log.title('  SEED DO BANCO DE DADOS - HELP ME API  ');
  log.title('========================================\n');

  try {
    log.info('[INFO] Conectando ao banco de dados...');
    await prisma.$connect();
    log.success('[SUCESSO] Conectado com sucesso\n');

    log.warn('[WARN] Limpando banco de dados...\n');

    await prisma.ordemDeServico.deleteMany({});
    log.info('[INFO] Ordens de serviço removidas');

    await prisma.chamado.deleteMany({});
    log.info('[INFO] Chamados removidos');

    await prisma.expediente.deleteMany({});
    log.info('[INFO] Expedientes removidos');

    await prisma.servico.deleteMany({});
    log.info('[INFO] Serviços removidos');

    await prisma.usuario.deleteMany({});
    log.info('[INFO] Usuários removidos\n');

    log.success('[SUCESSO] Banco limpo com sucesso!\n');

    log.title('[1/5] CRIANDO ADMINISTRADORES...\n');

    const admin = await criarUsuario('admin@helpme.com', {
      nome: 'Admin',
      sobrenome: 'Sistema',
      email: 'admin@helpme.com',
      password: 'Admin123!',
      regra: Regra.ADMIN,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0001',
      ramal: '1000',
      avatarUrl: 'https://ui-avatars.com/api/?name=Admin+Sistema&background=0D8ABC&color=fff',
    });
    log.success(`[SUCESSO] ${admin.nome} ${admin.sobrenome} - ${admin.email}`);

    const superAdmin = await criarUsuario('superadmin@helpme.com', {
      nome: 'Super',
      sobrenome: 'Admin',
      email: 'superadmin@helpme.com',
      password: 'Super123!',
      regra: Regra.ADMIN,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0002',
      ramal: '1001',
      avatarUrl: 'https://ui-avatars.com/api/?name=Super+Admin&background=7C3AED&color=fff',
    });
    log.success(`[SUCESSO] ${superAdmin.nome} ${superAdmin.sobrenome} - ${superAdmin.email}`);

    const adminTI = await criarUsuario('diego.ferreira@helpme.com', {
      nome: 'Diego',
      sobrenome: 'Ferreira',
      email: 'diego.ferreira@helpme.com',
      password: 'Diego123!',
      regra: Regra.ADMIN,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0003',
      ramal: '1002',
      avatarUrl: 'https://ui-avatars.com/api/?name=Diego+Ferreira&background=059669&color=fff',
    });
    log.success(`[SUCESSO] ${adminTI.nome} ${adminTI.sobrenome} - ${adminTI.email}\n`);

    log.title('[2/5] CRIANDO TÉCNICOS...\n');

    const tecnico1 = await criarUsuario('tecnico@helpme.com', {
      nome: 'Carlos',
      sobrenome: 'Silva',
      email: 'tecnico@helpme.com',
      password: 'Tecnico123!',
      regra: Regra.TECNICO,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 98765-0001',
      ramal: '3001',
      avatarUrl: 'https://ui-avatars.com/api/?name=Carlos+Silva&background=EA580C&color=fff',
    });
    log.success(`[SUCESSO] ${tecnico1.nome} ${tecnico1.sobrenome} - ${tecnico1.email}`);

    const tecnico2 = await criarUsuario('ana.santos@helpme.com', {
      nome: 'Ana',
      sobrenome: 'Santos',
      email: 'ana.santos@helpme.com',
      password: 'Tecnico123!',
      regra: Regra.TECNICO,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 98765-0002',
      ramal: '3002',
      avatarUrl: 'https://ui-avatars.com/api/?name=Ana+Santos&background=DB2777&color=fff',
    });
    log.success(`[SUCESSO] ${tecnico2.nome} ${tecnico2.sobrenome} - ${tecnico2.email}`);

    const tecnico3 = await criarUsuario('roberto.ferreira@helpme.com', {
      nome: 'Roberto',
      sobrenome: 'Ferreira',
      email: 'roberto.ferreira@helpme.com',
      password: 'Tecnico123!',
      regra: Regra.TECNICO,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 98765-0003',
      ramal: '3003',
      avatarUrl: 'https://ui-avatars.com/api/?name=Roberto+Ferreira&background=2563EB&color=fff',
    });
    log.success(`[SUCESSO] ${tecnico3.nome} ${tecnico3.sobrenome} - ${tecnico3.email}\n`);

    log.title('[3/5] CRIANDO USUÁRIOS...\n');

    const usuario = await criarUsuario('user@helpme.com', {
      nome: 'João',
      sobrenome: 'Oliveira',
      email: 'user@helpme.com',
      password: 'User123!',
      regra: Regra.USUARIO,
      setor: Setor.COMERCIAL,
      telefone: '(11) 97654-0001',
      ramal: '2001',
      avatarUrl: 'https://ui-avatars.com/api/?name=Joao+Oliveira&background=16A34A&color=fff',
    });
    log.success(`[SUCESSO] ${usuario.nome} ${usuario.sobrenome} - ${usuario.email}`);

    const usuario2 = await criarUsuario('maria.costa@helpme.com', {
      nome: 'Maria',
      sobrenome: 'Costa',
      email: 'maria.costa@helpme.com',
      password: 'User123!',
      regra: Regra.USUARIO,
      setor: Setor.FINANCEIRO,
      telefone: '(11) 97654-0002',
      ramal: '2002',
      avatarUrl: 'https://ui-avatars.com/api/?name=Maria+Costa&background=DC2626&color=fff',
    });
    log.success(`[SUCESSO] ${usuario2.nome} ${usuario2.sobrenome} - ${usuario2.email}`);

    const usuario3 = await criarUsuario('pedro.lima@helpme.com', {
      nome: 'Pedro',
      sobrenome: 'Lima',
      email: 'pedro.lima@helpme.com',
      password: 'User123!',
      regra: Regra.USUARIO,
      setor: Setor.MARKETING,
      telefone: '(11) 97654-0003',
      ramal: '2003',
      avatarUrl: 'https://ui-avatars.com/api/?name=Pedro+Lima&background=9333EA&color=fff',
    });
    log.success(`[SUCESSO] ${usuario3.nome} ${usuario3.sobrenome} - ${usuario3.email}\n`);

    log.title('[4/5] CONFIGURANDO EXPEDIENTES...\n');

    await criarExpediente(tecnico1.id, '08:00', '17:00');
    log.success(`[SUCESSO] ${tecnico1.nome} ${tecnico1.sobrenome}: 08:00 - 17:00`);

    await criarExpediente(tecnico2.id, '08:00', '18:00');
    log.success(`[SUCESSO] ${tecnico2.nome} ${tecnico2.sobrenome}: 08:00 - 18:00`);

    await criarExpediente(tecnico3.id, '09:00', '18:00');
    log.success(`[SUCESSO] ${tecnico3.nome} ${tecnico3.sobrenome}: 09:00 - 18:00\n`);

    log.title('[5/5] CRIANDO SERVIÇOS...\n');

    const servicosData: DadosServico[] = [
      { nome: 'Suporte Técnico Geral', descricao: 'Suporte técnico para problemas gerais de TI', ativo: true },
      { nome: 'Instalação de Software', descricao: 'Instalação e configuração de softwares corporativos', ativo: true },
      { nome: 'Manutenção de Hardware', descricao: 'Reparo e manutenção de equipamentos de informática', ativo: true },
      { nome: 'Suporte de Rede', descricao: 'Configuração e troubleshooting de rede e conectividade', ativo: true },
      { nome: 'Backup e Recuperação', descricao: 'Serviços de backup e recuperação de dados', ativo: true },
      { nome: 'Configuração de Email', descricao: 'Configuração de contas de email e clientes de email', ativo: true },
      { nome: 'Acesso e Permissões', descricao: 'Gerenciamento de acessos e permissões de usuários', ativo: true },
      { nome: 'Impressoras e Periféricos', descricao: 'Suporte para impressoras, scanners e periféricos', ativo: true },
      { nome: 'VPN e Acesso Remoto', descricao: 'Configuração de VPN e ferramentas de acesso remoto', ativo: true },
      { nome: 'Serviço Teste K6', descricao: 'Serviço para testes automatizados e performance', ativo: false },
    ];

    for (const dados of servicosData) {
      const servico = await prisma.servico.upsert({
        where: { nome: dados.nome },
        update: { descricao: dados.descricao, ativo: dados.ativo, deletadoEm: null },
        create: dados,
      });
      log.success(`[SUCESSO] Serviço: ${servico.nome} (${servico.ativo ? 'ativo' : 'inativo'})`);
    }

    log.info('');
    log.title('\n[BONUS] CRIANDO CHAMADOS DE EXEMPLO...\n');

    const servicoSuporte = await prisma.servico.findFirst({ where: { nome: 'Suporte Técnico Geral' } });
    const servicoInstalacao = await prisma.servico.findFirst({ where: { nome: 'Instalação de Software' } });
    const servicoRede = await prisma.servico.findFirst({ where: { nome: 'Suporte de Rede' } });

    if (!servicoSuporte || !servicoInstalacao || !servicoRede) {
      log.warn('[WARN] Alguns serviços não encontrados, pulando criação de chamados\n');
    } else {
      const chamadosExistentes = await prisma.chamado.findMany({
        where: { OS: { in: ['INC0001', 'INC0002', 'INC0003', 'INC0004', 'INC0005'] } },
      });

      if (chamadosExistentes.length > 0) {
        log.info(`[INFO] Chamados já existem (${chamadosExistentes.length}), pulando criação\n`);
      } else {
        const chamados = await prisma.$transaction(async (tx) => {
          const c1 = await tx.chamado.create({
            data: {
              OS: 'INC0001',
              descricao: 'Computador não liga após atualização do Windows. Tentei reiniciar várias vezes mas não funciona.',
              status: ChamadoStatus.ABERTO,
              usuarioId: usuario.id,
            },
          });
          await tx.ordemDeServico.create({ data: { chamadoId: c1.id, servicoId: servicoSuporte.id } });

          const c2 = await tx.chamado.create({
            data: {
              OS: 'INC0002',
              descricao: 'Internet muito lenta no setor financeiro. Não consigo acessar o sistema ERP.',
              status: ChamadoStatus.EM_ATENDIMENTO,
              usuarioId: usuario2.id,
              tecnicoId: tecnico1.id,
            },
          });
          await tx.ordemDeServico.create({ data: { chamadoId: c2.id, servicoId: servicoRede.id } });

          const c3 = await tx.chamado.create({
            data: {
              OS: 'INC0003',
              descricao: 'Preciso do Microsoft Office instalado urgente para apresentação.',
              descricaoEncerramento: 'Microsoft Office 365 instalado e configurado. Usuário testou e confirmou funcionamento.',
              status: ChamadoStatus.ENCERRADO,
              encerradoEm: new Date(Date.now() - 2 * 60 * 60 * 1000),
              usuarioId: usuario3.id,
              tecnicoId: tecnico2.id,
            },
          });
          await tx.ordemDeServico.create({ data: { chamadoId: c3.id, servicoId: servicoInstalacao.id } });

          const c4 = await tx.chamado.create({
            data: {
              OS: 'INC0004',
              descricao: 'Impressora não está funcionando. Já tentei reiniciar mas continua sem imprimir.',
              status: ChamadoStatus.EM_ATENDIMENTO,
              usuarioId: usuario.id,
              tecnicoId: tecnico3.id,
            },
          });
          await tx.ordemDeServico.create({ data: { chamadoId: c4.id, servicoId: servicoSuporte.id } });

          const c5 = await tx.chamado.create({
            data: {
              OS: 'INC0005',
              descricao: 'Email não sincroniza no celular. Preciso urgente para trabalho remoto.',
              descricaoEncerramento: 'Reconfigurado contas de email no dispositivo móvel. Sincronização funcionando corretamente.',
              status: ChamadoStatus.ENCERRADO,
              encerradoEm: new Date(Date.now() - 24 * 60 * 60 * 1000),
              usuarioId: usuario2.id,
              tecnicoId: tecnico1.id,
            },
          });
          await tx.ordemDeServico.create({ data: { chamadoId: c5.id, servicoId: servicoSuporte.id } });

          return [c1, c2, c3, c4, c5];
        });

        log.success(`[SUCESSO] Chamados criados: ${chamados.map((c) => c.OS).join(', ')}\n`);
      }
    }

    log.title('\n========================================');
    log.title('  SEED CONCLUÍDO COM SUCESSO!          ');
    log.title('========================================\n');

    log.success('CREDENCIAIS CRIADAS:\n');
    
    console.log('═══════════════════════════════════════');
    console.log('ADMINISTRADORES:');
    console.log('═══════════════════════════════════════\n');
    console.log('1. Admin Sistema\n   Email:    admin@helpme.com\n   Senha:    Admin123!\n   Setor:    TECNOLOGIA_INFORMACAO\n');
    console.log('2. Super Admin\n   Email:    superadmin@helpme.com\n   Senha:    Super123!\n   Setor:    TECNOLOGIA_INFORMACAO\n');
    console.log('3. Diego Ferreira\n   Email:    diego.ferreira@helpme.com\n   Senha:    Diego123!\n   Setor:    TECNOLOGIA_INFORMACAO\n');

    console.log('═══════════════════════════════════════');
    console.log('TÉCNICOS:');
    console.log('═══════════════════════════════════════\n');
    console.log('1. Carlos Silva\n   Email:    tecnico@helpme.com\n   Senha:    Tecnico123!\n   Horário:  08:00 - 17:00\n');
    console.log('2. Ana Santos\n   Email:    ana.santos@helpme.com\n   Senha:    Tecnico123!\n   Horário:  08:00 - 18:00\n');
    console.log('3. Roberto Ferreira\n   Email:    roberto.ferreira@helpme.com\n   Senha:    Tecnico123!\n   Horário:  09:00 - 18:00\n');

    console.log('═══════════════════════════════════════');
    console.log('USUÁRIOS:');
    console.log('═══════════════════════════════════════\n');
    console.log('1. João Oliveira\n   Email:    user@helpme.com\n   Senha:    User123!\n   Setor:    COMERCIAL\n');
    console.log('2. Maria Costa\n   Email:    maria.costa@helpme.com\n   Senha:    User123!\n   Setor:    FINANCEIRO\n');
    console.log('3. Pedro Lima\n   Email:    pedro.lima@helpme.com\n   Senha:    User123!\n   Setor:    MARKETING\n');

    const stats = await Promise.all([
      prisma.usuario.count({ where: { deletadoEm: null, regra: Regra.ADMIN } }),
      prisma.usuario.count({ where: { deletadoEm: null, regra: Regra.TECNICO } }),
      prisma.usuario.count({ where: { deletadoEm: null, regra: Regra.USUARIO } }),
      prisma.servico.count({ where: { deletadoEm: null } }),
      prisma.chamado.count({ where: { deletadoEm: null } }),
      prisma.expediente.count({ where: { deletadoEm: null } }),
    ]);

    console.log('═══════════════════════════════════════');
    log.info('ESTATÍSTICAS:');
    console.log('═══════════════════════════════════════');
    console.log(`  Admins:      ${stats[0]}`);
    console.log(`  Técnicos:    ${stats[1]}`);
    console.log(`  Usuários:    ${stats[2]}`);
    console.log(`  Serviços:    ${stats[3]}`);
    console.log(`  Chamados:    ${stats[4]}`);
    console.log(`  Expedientes: ${stats[5]}`);
    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    log.error('\n[ERROR] Erro durante o seed:');
    console.error(error);
    throw error;
  }
}

main()
  .catch((error) => {
    log.error('[ERROR] Seed falhou:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    log.info('[INFO] Fechando conexão com banco de dados...');
    await prisma.$disconnect();
    log.success('[SUCESSO] Conexão encerrada\n');
  });