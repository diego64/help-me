import { PrismaClient, Regra, Setor, ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import mongoose from 'mongoose';
import pkg from 'pg';
import { hashPassword } from '../src/shared/config/password';

const { Pool } = pkg;

const colors = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  bright: '\x1b[1m',
  blue:   '\x1b[34m',
};

const log = {
  success: (msg: string) => console.log(`${colors.green}${msg}${colors.reset}`),
  info:    (msg: string) => console.log(`${colors.cyan}${msg}${colors.reset}`),
  warn:    (msg: string) => console.log(`${colors.yellow}${msg}${colors.reset}`),
  error:   (msg: string) => console.log(`${colors.red}${msg}${colors.reset}`),
  title:   (msg: string) => console.log(`${colors.bright}${colors.blue}${msg}${colors.reset}`),
};

if (!process.env.DATABASE_URL) {
  log.error('[ERROR] DATABASE_URL não encontrada');
  process.exit(1);
}

if (!process.env.MONGO_INITDB_URI) {
  log.error('[ERROR] MONGO_INITDB_URI não encontrada');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] });

type TipoEvento =
  | 'CHAMADO_ABERTO'
  | 'CHAMADO_ATRIBUIDO'
  | 'CHAMADO_TRANSFERIDO'
  | 'CHAMADO_REABERTO'
  | 'PRIORIDADE_ALTERADA'
  | 'SLA_VENCENDO'
  | 'CHAMADO_ENCERRADO';

const NotificacaoSchema = new mongoose.Schema({
  destinatarioId:    { type: String, required: true, index: true },
  destinatarioEmail: { type: String, required: true },
  tipo:              { type: String, required: true, enum: [
    'CHAMADO_ABERTO', 'CHAMADO_ATRIBUIDO', 'CHAMADO_TRANSFERIDO',
    'CHAMADO_REABERTO', 'PRIORIDADE_ALTERADA', 'SLA_VENCENDO', 'CHAMADO_ENCERRADO',
  ]},
  titulo:      { type: String, required: true },
  mensagem:    { type: String, required: true },
  chamadoId:   { type: String, required: true, index: true },
  chamadoOS:   { type: String, required: true },
  dadosExtras: { type: mongoose.Schema.Types.Mixed },
  lida:        { type: Boolean, default: false, index: true },
  lidaEm:      { type: Date },
  criadoEm:    { type: Date, default: Date.now, index: true },
});

NotificacaoSchema.index({ destinatarioId: 1, lida: 1, criadoEm: -1 });

const Notificacao = mongoose.model('notificacoes', NotificacaoSchema);

interface DadosUsuario {
  nome:      string;
  sobrenome: string;
  email:     string;
  password:  string;
  regra:     Regra;
  nivel?:    NivelTecnico;
  setor?:    Setor;
  telefone?: string;
  ramal?:    string;
  avatarUrl?: string;
}

interface DadosServico {
  nome:      string;
  descricao: string;
  ativo:     boolean;
}

async function criarUsuario(email: string, dados: DadosUsuario) {
  const hashed = hashPassword(dados.password);
  return prisma.usuario.upsert({
    where: { email },
    update: { password: hashed, nivel: dados.nivel ?? null, ativo: true, deletadoEm: null },
    create: { ...dados, password: hashed, ativo: true },
  });
}

async function criarExpediente(usuarioId: string, entrada: string, saida: string) {
  const entradaDate = new Date(`1970-01-01T${entrada}:00Z`);
  const saidaDate   = new Date(`1970-01-01T${saida}:00Z`);

  const existente = await prisma.expediente.findFirst({ where: { usuarioId, deletadoEm: null } });

  if (existente) {
    return prisma.expediente.update({
      where: { id: existente.id },
      data: { entrada: entradaDate, saida: saidaDate, ativo: true, deletadoEm: null },
    });
  }

  return prisma.expediente.create({
    data: { usuarioId, entrada: entradaDate, saida: saidaDate, ativo: true },
  });
}

function horasAtras(horas: number): Date {
  return new Date(Date.now() - horas * 60 * 60 * 1000);
}

function diasAtras(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

async function main() {
  log.title('\n========================================');
  log.title('  SEED DO BANCO DE DADOS - HELP ME API  ');
  log.title('========================================\n');

  log.info('[INFO] Conectando ao PostgreSQL...');
  await prisma.$connect();
  log.success('[SUCESSO] PostgreSQL conectado\n');

  log.info('[INFO] Conectando ao MongoDB...');
  await mongoose.connect(process.env.MONGO_INITDB_URI!);
  log.success('[SUCESSO] MongoDB conectado\n');

  log.warn('[WARN] Limpando banco de dados...\n');

  await Notificacao.deleteMany({});
  log.info('[INFO] Notificações removidas');

  await prisma.anexoChamado.deleteMany({});
  log.info('[INFO] Anexos removidos');

  await prisma.comentarioChamado.deleteMany({});
  log.info('[INFO] Comentários removidos');

  await prisma.transferenciaChamado.deleteMany({});
  log.info('[INFO] Transferências removidas');

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

  log.success('[SUCESSO] Banco limpo!\n');

  log.title('[1/7] CRIANDO ADMINISTRADORES...\n');

  const admin = await criarUsuario('admin@helpme.com', {
    nome: 'Admin', sobrenome: 'Sistema', email: 'admin@helpme.com',
    password: 'Admin123!', regra: Regra.ADMIN, setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0001', ramal: '1000',
    avatarUrl: 'https://ui-avatars.com/api/?name=Admin+Sistema&background=0D8ABC&color=fff',
  });
  log.success(`[SUCESSO] ${admin.nome} ${admin.sobrenome} - ${admin.email}`);

  const superAdmin = await criarUsuario('superadmin@helpme.com', {
    nome: 'Super', sobrenome: 'Admin', email: 'superadmin@helpme.com',
    password: 'Super123!', regra: Regra.ADMIN, setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0002', ramal: '1001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Super+Admin&background=7C3AED&color=fff',
  });
  log.success(`[SUCESSO] ${superAdmin.nome} ${superAdmin.sobrenome} - ${superAdmin.email}`);

  const adminTI = await criarUsuario('diego.ferreira@helpme.com', {
    nome: 'Diego', sobrenome: 'Ferreira', email: 'diego.ferreira@helpme.com',
    password: 'Diego123!', regra: Regra.ADMIN, setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0003', ramal: '1002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Diego+Ferreira&background=059669&color=fff',
  });
  log.success(`[SUCESSO] ${adminTI.nome} ${adminTI.sobrenome} - ${adminTI.email}\n`);

  log.title('[2/7] CRIANDO TÉCNICOS...\n');

  const tecnico1 = await criarUsuario('tecnico@helpme.com', {
    nome: 'Carlos', sobrenome: 'Silva', email: 'tecnico@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N1,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0001', ramal: '3001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Carlos+Silva&background=EA580C&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico1.nome} ${tecnico1.sobrenome} - ${tecnico1.email} [N1]`);

  const tecnico2 = await criarUsuario('ana.santos@helpme.com', {
    nome: 'Ana', sobrenome: 'Santos', email: 'ana.santos@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N2,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0002', ramal: '3002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Ana+Santos&background=DB2777&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico2.nome} ${tecnico2.sobrenome} - ${tecnico2.email} [N2]`);

  const tecnico3 = await criarUsuario('roberto.ferreira@helpme.com', {
    nome: 'Roberto', sobrenome: 'Ferreira', email: 'roberto.ferreira@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N3,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0003', ramal: '3003',
    avatarUrl: 'https://ui-avatars.com/api/?name=Roberto+Ferreira&background=2563EB&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico3.nome} ${tecnico3.sobrenome} - ${tecnico3.email} [N3]\n`);

  log.title('[3/7] CRIANDO USUÁRIOS...\n');

  const usuario1 = await criarUsuario('user@helpme.com', {
    nome: 'João', sobrenome: 'Oliveira', email: 'user@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.COMERCIAL,
    telefone: '(11) 97654-0001', ramal: '2001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Joao+Oliveira&background=16A34A&color=fff',
  });
  log.success(`[SUCESSO] ${usuario1.nome} ${usuario1.sobrenome} - ${usuario1.email}`);

  const usuario2 = await criarUsuario('maria.costa@helpme.com', {
    nome: 'Maria', sobrenome: 'Costa', email: 'maria.costa@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.FINANCEIRO,
    telefone: '(11) 97654-0002', ramal: '2002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Maria+Costa&background=DC2626&color=fff',
  });
  log.success(`[SUCESSO] ${usuario2.nome} ${usuario2.sobrenome} - ${usuario2.email}`);

  const usuario3 = await criarUsuario('pedro.lima@helpme.com', {
    nome: 'Pedro', sobrenome: 'Lima', email: 'pedro.lima@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.MARKETING,
    telefone: '(11) 97654-0003', ramal: '2003',
    avatarUrl: 'https://ui-avatars.com/api/?name=Pedro+Lima&background=9333EA&color=fff',
  });
  log.success(`[SUCESSO] ${usuario3.nome} ${usuario3.sobrenome} - ${usuario3.email}\n`);

  log.title('[4/7] CONFIGURANDO EXPEDIENTES...\n');

  await criarExpediente(tecnico1.id, '08:00', '17:00');
  log.success(`[SUCESSO] ${tecnico1.nome} ${tecnico1.sobrenome}: 08:00 - 17:00`);

  await criarExpediente(tecnico2.id, '08:00', '18:00');
  log.success(`[SUCESSO] ${tecnico2.nome} ${tecnico2.sobrenome}: 08:00 - 18:00`);

  await criarExpediente(tecnico3.id, '09:00', '18:00');
  log.success(`[SUCESSO] ${tecnico3.nome} ${tecnico3.sobrenome}: 09:00 - 18:00\n`);

  log.title('[5/7] CRIANDO SERVIÇOS...\n');

  const servicosData: DadosServico[] = [
    { nome: 'Suporte Técnico Geral',    descricao: 'Suporte técnico para problemas gerais de TI',           ativo: true  },
    { nome: 'Instalação de Software',   descricao: 'Instalação e configuração de softwares corporativos',    ativo: true  },
    { nome: 'Manutenção de Hardware',   descricao: 'Reparo e manutenção de equipamentos de informática',     ativo: true  },
    { nome: 'Suporte de Rede',          descricao: 'Configuração e troubleshooting de rede e conectividade', ativo: true  },
    { nome: 'Backup e Recuperação',     descricao: 'Serviços de backup e recuperação de dados',              ativo: true  },
    { nome: 'Configuração de Email',    descricao: 'Configuração de contas de email e clientes de email',    ativo: true  },
    { nome: 'Acesso e Permissões',      descricao: 'Gerenciamento de acessos e permissões de usuários',      ativo: true  },
    { nome: 'Impressoras e Periféricos',descricao: 'Suporte para impressoras, scanners e periféricos',       ativo: true  },
    { nome: 'VPN e Acesso Remoto',      descricao: 'Configuração de VPN e ferramentas de acesso remoto',     ativo: true  },
    { nome: 'Serviço Teste K6',         descricao: 'Serviço para testes automatizados e performance',        ativo: false },
  ];

  const servicosCriados: Record<string, string> = {};

  for (const dados of servicosData) {
    const servico = await prisma.servico.upsert({
      where:  { nome: dados.nome },
      update: { descricao: dados.descricao, ativo: dados.ativo, deletadoEm: null },
      create: dados,
    });
    servicosCriados[dados.nome] = servico.id;
    log.success(`[SUCESSO] Serviço: ${servico.nome} (${servico.ativo ? 'ativo' : 'inativo'})`);
  }

  log.title('\n[6/7] CRIANDO CHAMADOS E DADOS RELACIONADOS...\n');

  const chamados = await prisma.$transaction(async (tx) => {

    // ── INC0001 — ABERTO, P4, sem técnico ──
    const c1 = await tx.chamado.create({
      data: {
        OS: 'INC0001',
        descricao: 'Computador não liga após atualização do Windows. Tentei reiniciar várias vezes mas não funciona.',
        status: ChamadoStatus.ABERTO,
        prioridade: PrioridadeChamado.P4,
        usuarioId: usuario1.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c1.id, servicoId: servicosCriados['Suporte Técnico Geral'] } });

    await tx.comentarioChamado.create({
      data: {
        chamadoId:          c1.id,
        autorId:            usuario1.id,
        comentario:         'Tentei também verificar a fonte de alimentação mas parece estar ok.',
        visibilidadeInterna: false,
      },
    });

    // ── INC0002 — EM_ATENDIMENTO, P3, com técnico N1 ──
    const c2 = await tx.chamado.create({
      data: {
        OS: 'INC0002',
        descricao: 'Internet muito lenta no setor financeiro. Não consigo acessar o sistema ERP.',
        status: ChamadoStatus.EM_ATENDIMENTO,
        prioridade: PrioridadeChamado.P3,
        usuarioId: usuario2.id,
        tecnicoId: tecnico1.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c2.id, servicoId: servicosCriados['Suporte de Rede'] } });

    await tx.comentarioChamado.createMany({
      data: [
        {
          chamadoId:          c2.id,
          autorId:            tecnico1.id,
          comentario:         'Verificando configuração do switch do andar. Identificado possível loop.',
          visibilidadeInterna: true,
        },
        {
          chamadoId:          c2.id,
          autorId:            usuario2.id,
          comentario:         'O problema está afetando todos do financeiro, é urgente!',
          visibilidadeInterna: false,
        },
      ],
    });

    // ── INC0003 — ENCERRADO, P2, com técnico N2 ──
    const c3 = await tx.chamado.create({
      data: {
        OS: 'INC0003',
        descricao: 'Preciso do Microsoft Office instalado urgente para apresentação.',
        descricaoEncerramento: 'Microsoft Office 365 instalado e configurado com sucesso.',
        status: ChamadoStatus.ENCERRADO,
        prioridade: PrioridadeChamado.P2,
        encerradoEm: horasAtras(2),
        usuarioId: usuario3.id,
        tecnicoId: tecnico2.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c3.id, servicoId: servicosCriados['Instalação de Software'] } });

    await tx.comentarioChamado.create({
      data: {
        chamadoId:          c3.id,
        autorId:            tecnico2.id,
        comentario:         'Office instalado e ativado. Usuário testou e confirmou funcionamento.',
        visibilidadeInterna: false,
      },
    });

    // ── INC0004 — EM_ATENDIMENTO, P3, com técnico N3, com transferência ──
    const c4 = await tx.chamado.create({
      data: {
        OS: 'INC0004',
        descricao: 'Impressora não está funcionando. Já tentei reiniciar mas continua sem imprimir.',
        status: ChamadoStatus.EM_ATENDIMENTO,
        prioridade: PrioridadeChamado.P3,
        usuarioId: usuario1.id,
        tecnicoId: tecnico3.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c4.id, servicoId: servicosCriados['Impressoras e Periféricos'] } });

    // Transferência: Carlos (N1) → Roberto (N3)
    await tx.transferenciaChamado.create({
      data: {
        chamadoId:         c4.id,
        tecnicoAnteriorId: tecnico1.id,
        tecnicoNovoId:     tecnico3.id,
        motivo:            'Problema requer nível N3 — possível falha no driver de rede da impressora.',
        transferidoPor:    admin.id,
        transferidoEm:     horasAtras(1),
      },
    });

    await tx.comentarioChamado.create({
      data: {
        chamadoId:          c4.id,
        autorId:            tecnico3.id,
        comentario:         'Analisando driver da impressora. Será necessário reinstalar o servidor de impressão.',
        visibilidadeInterna: true,
      },
    });

    // ── INC0005 — ENCERRADO, P4 ──
    const c5 = await tx.chamado.create({
      data: {
        OS: 'INC0005',
        descricao: 'Email não sincroniza no celular. Preciso urgente para trabalho remoto.',
        descricaoEncerramento: 'Reconfigurado conta de email no dispositivo. Sincronização funcionando.',
        status: ChamadoStatus.ENCERRADO,
        prioridade: PrioridadeChamado.P4,
        encerradoEm: diasAtras(1),
        usuarioId: usuario2.id,
        tecnicoId: tecnico1.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c5.id, servicoId: servicosCriados['Configuração de Email'] } });

    // ── INC0006 — ABERTO, P1 (crítico), prioridade alterada pelo admin ──
    const c6 = await tx.chamado.create({
      data: {
        OS: 'INC0006',
        descricao: 'Servidor de produção fora do ar. Sistema completamente indisponível para todos os usuários.',
        status: ChamadoStatus.ABERTO,
        prioridade: PrioridadeChamado.P1,
        prioridadeAlterada:    new Date(),
        prioridadeAlteradaPor: adminTI.id,
        usuarioId: usuario3.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c6.id, servicoId: servicosCriados['Suporte de Rede'] } });

    await tx.comentarioChamado.createMany({
      data: [
        {
          chamadoId:          c6.id,
          autorId:            adminTI.id,
          comentario:         'Escalado para P1 — impacto total no negócio. Todos os técnicos disponíveis devem atuar.',
          visibilidadeInterna: true,
        },
        {
          chamadoId:          c6.id,
          autorId:            usuario3.id,
          comentario:         'Nenhum usuário consegue acessar o sistema desde as 09:15.',
          visibilidadeInterna: false,
        },
      ],
    });

    // ── INC0007 — REABERTO, P2, com transferência ──
    const c7 = await tx.chamado.create({
      data: {
        OS: 'INC0007',
        descricao: 'VPN não conecta após mudança de senha corporativa.',
        status: ChamadoStatus.REABERTO,
        prioridade: PrioridadeChamado.P2,
        usuarioId: usuario1.id,
        tecnicoId: tecnico2.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c7.id, servicoId: servicosCriados['VPN e Acesso Remoto'] } });

    // Transferência: Ana (N2) → Carlos (N1) → Ana (N2)
    await tx.transferenciaChamado.createMany({
      data: [
        {
          chamadoId:         c7.id,
          tecnicoAnteriorId: tecnico2.id,
          tecnicoNovoId:     tecnico1.id,
          motivo:            'Redistribuição de carga de trabalho.',
          transferidoPor:    admin.id,
          transferidoEm:     diasAtras(2),
        },
        {
          chamadoId:         c7.id,
          tecnicoAnteriorId: tecnico1.id,
          tecnicoNovoId:     tecnico2.id,
          motivo:            'Problema requer nível N2 — configuração de certificado SSL na VPN.',
          transferidoPor:    adminTI.id,
          transferidoEm:     diasAtras(1),
        },
      ],
    });

    await tx.comentarioChamado.create({
      data: {
        chamadoId:          c7.id,
        autorId:            usuario1.id,
        comentario:         'O problema voltou após aparente solução. A VPN cai após ~10 minutos de conexão.',
        visibilidadeInterna: false,
      },
    });

    // ── INC0008 — ENCERRADO, P5, múltiplos serviços ──
    const c8 = await tx.chamado.create({
      data: {
        OS: 'INC0008',
        descricao: 'Mouse e teclado sem fio pararam de funcionar.',
        descricaoEncerramento: 'Substituídas as pilhas de ambos os dispositivos. Funcionando normalmente.',
        status: ChamadoStatus.ENCERRADO,
        prioridade: PrioridadeChamado.P5,
        encerradoEm: diasAtras(3),
        usuarioId: usuario2.id,
        tecnicoId: tecnico1.id,
      },
    });
    await tx.ordemDeServico.createMany({
      data: [
        { chamadoId: c8.id, servicoId: servicosCriados['Impressoras e Periféricos'] },
        { chamadoId: c8.id, servicoId: servicosCriados['Suporte Técnico Geral'] },
      ],
    });

    // ── INC0009 — CANCELADO, P4 ──
    const c9 = await tx.chamado.create({
      data: {
        OS: 'INC0009',
        descricao: 'Solicitação de novo monitor para home office.',
        status: ChamadoStatus.CANCELADO,
        prioridade: PrioridadeChamado.P4,
        usuarioId: usuario3.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c9.id, servicoId: servicosCriados['Manutenção de Hardware'] } });

    await tx.comentarioChamado.create({
      data: {
        chamadoId:          c9.id,
        autorId:            admin.id,
        comentario:         'Solicitação cancelada — orçamento de hardware congelado no trimestre.',
        visibilidadeInterna: false,
      },
    });

    // ── INC0010 — EM_ATENDIMENTO, P2, com anexo simulado ──
    const c10 = await tx.chamado.create({
      data: {
        OS: 'INC0010',
        descricao: 'Sistema de backup falhou na última semana. Relatório de erro em anexo.',
        status: ChamadoStatus.EM_ATENDIMENTO,
        prioridade: PrioridadeChamado.P2,
        usuarioId: usuario1.id,
        tecnicoId: tecnico3.id,
      },
    });
    await tx.ordemDeServico.create({ data: { chamadoId: c10.id, servicoId: servicosCriados['Backup e Recuperação'] } });

    // Anexo simulado (arquivo de log de erro)
    await tx.anexoChamado.create({
      data: {
        chamadoId:   c10.id,
        autorId:     usuario1.id,
        nomeArquivo: `backup-error-${Date.now()}.log`,
        nomeOriginal: 'backup-error.log',
        mimetype:    'text/plain',
        tamanho:     4096,
        bucketMinio: 'helpme-attachments',
        objetoMinio: `chamados/${c10.id}/backup-error.log`,
      },
    });

    await tx.comentarioChamado.create({
      data: {
        chamadoId:          c10.id,
        autorId:            tecnico3.id,
        comentario:         'Log analisado — falha no job de backup por espaço insuficiente em disco. Liberando espaço.',
        visibilidadeInterna: true,
      },
    });

    return [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10];
  });

  log.success(`[SUCESSO] Chamados criados: ${chamados.map((c) => c.OS).join(', ')}\n`);

  log.title('[7/7] CRIANDO NOTIFICAÇÕES NO MONGODB...\n');

  const [c1, c2, c3, c4, c6, c7, c10] = [
    chamados[0], chamados[1], chamados[2], chamados[3],
    chamados[5], chamados[6], chamados[9],
  ];

  const notificacoes = [
    // Abertura de chamado
    {
      destinatarioId:    tecnico1.id,
      destinatarioEmail: tecnico1.email,
      tipo:              'CHAMADO_ATRIBUIDO' as TipoEvento,
      titulo:            'Novo chamado atribuído',
      mensagem:          `O chamado ${c2.OS} foi atribuído a você.`,
      chamadoId:         c2.id,
      chamadoOS:         c2.OS,
      lida:              true,
      lidaEm:            horasAtras(3),
      criadoEm:          horasAtras(4),
    },
    // Transferência recebida
    {
      destinatarioId:    tecnico3.id,
      destinatarioEmail: tecnico3.email,
      tipo:              'CHAMADO_TRANSFERIDO' as TipoEvento,
      titulo:            'Chamado transferido para você',
      mensagem:          `O chamado ${c4.OS} foi transferido para você.`,
      chamadoId:         c4.id,
      chamadoOS:         c4.OS,
      dadosExtras:       { tecnicoAnterior: tecnico1.nome, motivo: 'Problema requer nível N3' },
      lida:              false,
      criadoEm:          horasAtras(1),
    },
    // Prioridade alterada
    {
      destinatarioId:    tecnico3.id,
      destinatarioEmail: tecnico3.email,
      tipo:              'PRIORIDADE_ALTERADA' as TipoEvento,
      titulo:            'Prioridade alterada para P1',
      mensagem:          `A prioridade do chamado ${c6.OS} foi elevada para P1 — CRÍTICO.`,
      chamadoId:         c6.id,
      chamadoOS:         c6.OS,
      dadosExtras:       { prioridadeAnterior: 'P3', prioridadeNova: 'P1', alteradoPor: adminTI.email },
      lida:              false,
      criadoEm:          new Date(),
    },
    // SLA vencendo
    {
      destinatarioId:    tecnico1.id,
      destinatarioEmail: tecnico1.email,
      tipo:              'SLA_VENCENDO' as TipoEvento,
      titulo:            'SLA próximo do vencimento',
      mensagem:          `O chamado ${c2.OS} vence em menos de 1 hora.`,
      chamadoId:         c2.id,
      chamadoOS:         c2.OS,
      lida:              false,
      criadoEm:          new Date(),
    },
    // Chamado encerrado — notificação para o usuário
    {
      destinatarioId:    usuario3.id,
      destinatarioEmail: usuario3.email,
      tipo:              'CHAMADO_ENCERRADO' as TipoEvento,
      titulo:            'Seu chamado foi encerrado',
      mensagem:          `O chamado ${c3.OS} foi encerrado pelo técnico.`,
      chamadoId:         c3.id,
      chamadoOS:         c3.OS,
      lida:              true,
      lidaEm:            horasAtras(1),
      criadoEm:          horasAtras(2),
    },
    // Chamado aberto — notificação para admin
    {
      destinatarioId:    admin.id,
      destinatarioEmail: admin.email,
      tipo:              'CHAMADO_ABERTO' as TipoEvento,
      titulo:            'Novo chamado aberto',
      mensagem:          `O chamado ${c1.OS} foi aberto e aguarda atribuição.`,
      chamadoId:         c1.id,
      chamadoOS:         c1.OS,
      lida:              false,
      criadoEm:          new Date(),
    },
    // Chamado reaberto
    {
      destinatarioId:    tecnico2.id,
      destinatarioEmail: tecnico2.email,
      tipo:              'CHAMADO_REABERTO' as TipoEvento,
      titulo:            'Chamado reaberto',
      mensagem:          `O chamado ${c7.OS} foi reaberto pelo usuário.`,
      chamadoId:         c7.id,
      chamadoOS:         c7.OS,
      lida:              false,
      criadoEm:          diasAtras(1),
    },
    // Backup crítico — SLA vencendo para N3
    {
      destinatarioId:    tecnico3.id,
      destinatarioEmail: tecnico3.email,
      tipo:              'SLA_VENCENDO' as TipoEvento,
      titulo:            'SLA crítico — Backup',
      mensagem:          `O chamado ${c10.OS} (P2) está próximo do vencimento do SLA.`,
      chamadoId:         c10.id,
      chamadoOS:         c10.OS,
      dadosExtras:       { minutosRestantes: 45 },
      lida:              false,
      criadoEm:          new Date(),
    },
  ];

  await Notificacao.insertMany(notificacoes);
  log.success(`[SUCESSO] ${notificacoes.length} notificações criadas no MongoDB\n`);

  log.title('\n========================================');
  log.title('  SEED CONCLUÍDO COM SUCESSO!          ');
  log.title('========================================\n');

  log.success('CREDENCIAIS:\n');
  console.log('═══════════════════════════════════════');
  console.log('ADMINISTRADORES:');
  console.log('═══════════════════════════════════════\n');
  console.log('  admin@helpme.com         → Admin123!');
  console.log('  superadmin@helpme.com    → Super123!');
  console.log('  diego.ferreira@helpme.com → Diego123!\n');
  console.log('═══════════════════════════════════════');
  console.log('TÉCNICOS:');
  console.log('═══════════════════════════════════════\n');
  console.log('  tecnico@helpme.com         → Tecnico123! [N1 | 08:00-17:00]');
  console.log('  ana.santos@helpme.com      → Tecnico123! [N2 | 08:00-18:00]');
  console.log('  roberto.ferreira@helpme.com → Tecnico123! [N3 | 09:00-18:00]\n');
  console.log('═══════════════════════════════════════');
  console.log('USUÁRIOS:');
  console.log('═══════════════════════════════════════\n');
  console.log('  user@helpme.com         → User123! [COMERCIAL]');
  console.log('  maria.costa@helpme.com  → User123! [FINANCEIRO]');
  console.log('  pedro.lima@helpme.com   → User123! [MARKETING]\n');

  const [
    totalAdmins, totalTecnicos, totalUsuarios,
    totalServicos, totalChamados, totalTransferencias,
    totalComentarios, totalAnexos, totalNotificacoes,
  ] = await Promise.all([
    prisma.usuario.count({ where: { regra: Regra.ADMIN,   deletadoEm: null } }),
    prisma.usuario.count({ where: { regra: Regra.TECNICO, deletadoEm: null } }),
    prisma.usuario.count({ where: { regra: Regra.USUARIO, deletadoEm: null } }),
    prisma.servico.count({ where: { deletadoEm: null } }),
    prisma.chamado.count({ where: { deletadoEm: null } }),
    prisma.transferenciaChamado.count(),
    prisma.comentarioChamado.count({ where: { deletadoEm: null } }),
    prisma.anexoChamado.count({ where: { deletadoEm: null } }),
    Notificacao.countDocuments(),
  ]);

  console.log('═══════════════════════════════════════');
  log.info('ESTATÍSTICAS:');
  console.log('═══════════════════════════════════════');
  console.log(`  Admins:         ${totalAdmins}`);
  console.log(`  Técnicos:       ${totalTecnicos} (N1: Carlos, N2: Ana, N3: Roberto)`);
  console.log(`  Usuários:       ${totalUsuarios}`);
  console.log(`  Serviços:       ${totalServicos}`);
  console.log(`  Chamados:       ${totalChamados} (P1:1, P2:3, P3:2, P4:3, P5:1)`);
  console.log(`  Transferências: ${totalTransferencias}`);
  console.log(`  Comentários:    ${totalComentarios}`);
  console.log(`  Anexos:         ${totalAnexos}`);
  console.log(`  Notificações:   ${totalNotificacoes}`);
  console.log('═══════════════════════════════════════\n');
}

main()
  .catch((error) => {
    log.error('[ERROR] Seed falhou:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    log.info('[INFO] Encerrando conexões...');
    await prisma.$disconnect();
    await mongoose.disconnect();
    log.success('[SUCESSO] Conexões encerradas\n');
  });