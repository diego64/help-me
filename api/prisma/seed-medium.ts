import { PrismaClient, Regra, Setor, ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import mongoose from 'mongoose';
import pkg from 'pg';
import { hashPassword } from '../src/shared/config/password';

const { Pool } = pkg;

const col = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  red:    '\x1b[31m',
  bright: '\x1b[1m',
  blue:   '\x1b[34m',
};

const log = {
  success: (msg: string) => console.log(`${col.green}${msg}${col.reset}`),
  info:    (msg: string) => console.log(`${col.cyan}${msg}${col.reset}`),
  warn:    (msg: string) => console.log(`${col.yellow}${msg}${col.reset}`),
  error:   (msg: string) => console.log(`${col.red}${msg}${col.reset}`),
  title:   (msg: string) => console.log(`${col.bright}${col.blue}${msg}${col.reset}`),
};

if (!process.env.DATABASE_URL) { log.error('[ERROR] DATABASE_URL não encontrada'); process.exit(1); }
if (!process.env.MONGO_INITDB_URI) { log.error('[ERROR] MONGO_INITDB_URI não encontrada'); process.exit(1); }

const pool    = new Pool({ connectionString: process.env.DATABASE_URL, max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10) });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter, log: ['error', 'warn'] });

type TipoEvento =
  | 'CHAMADO_ABERTO' | 'CHAMADO_ATRIBUIDO' | 'CHAMADO_TRANSFERIDO'
  | 'CHAMADO_REABERTO' | 'PRIORIDADE_ALTERADA' | 'SLA_VENCENDO' | 'CHAMADO_ENCERRADO';

const NotificacaoSchema = new mongoose.Schema({
  destinatarioId:    { type: String, required: true, index: true },
  destinatarioEmail: { type: String, required: true },
  tipo:              { type: String, required: true, enum: ['CHAMADO_ABERTO','CHAMADO_ATRIBUIDO','CHAMADO_TRANSFERIDO','CHAMADO_REABERTO','PRIORIDADE_ALTERADA','SLA_VENCENDO','CHAMADO_ENCERRADO'] },
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

const AtualizacaoChamadoSchema = new mongoose.Schema({
  chamadoId:  { type: String, required: true, index: true },
  dataHora:   { type: Date, default: Date.now },
  tipo:       { type: String, required: true },
  de:         { type: String },
  para:       { type: String },
  descricao:  { type: String },
  autorId:    { type: String },
  autorNome:  { type: String },
  autorEmail: { type: String },
});
AtualizacaoChamadoSchema.index({ chamadoId: 1, dataHora: -1 });
const AtualizacaoChamado = mongoose.model('atualizacoes_chamado', AtualizacaoChamadoSchema);

const minutosAtras = (m: number) => new Date(Date.now() - m * 60 * 1000);
const horasAtras   = (h: number) => new Date(Date.now() - h * 3_600_000);
const diasAtras    = (d: number) => new Date(Date.now() - d * 86_400_000);

// Retorna número inteiro aleatório no intervalo [min, max]
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

interface DadosUsuario {
  nome: string; sobrenome: string; email: string; password: string;
  regra: Regra; nivel?: NivelTecnico; setor?: Setor;
  telefone?: string; ramal?: string; avatarUrl?: string;
}

async function criarUsuario(email: string, dados: DadosUsuario) {
  const hashed = hashPassword(dados.password);
  return prisma.usuario.upsert({
    where:  { email },
    update: { password: hashed, nivel: dados.nivel ?? null, ativo: true, deletadoEm: null },
    create: { ...dados, password: hashed, ativo: true },
  });
}

async function criarExpediente(usuarioId: string, entrada: string, saida: string) {
  const entradaDate = new Date(`1970-01-01T${entrada}:00Z`);
  const saidaDate   = new Date(`1970-01-01T${saida}:00Z`);
  const existente   = await prisma.expediente.findFirst({ where: { usuarioId, deletadoEm: null } });
  if (existente) {
    return prisma.expediente.update({ where: { id: existente.id }, data: { entrada: entradaDate, saida: saidaDate, ativo: true, deletadoEm: null } });
  }
  return prisma.expediente.create({ data: { usuarioId, entrada: entradaDate, saida: saidaDate, ativo: true } });
}

const slaHoras: Record<PrioridadeChamado, number> = { P1: 1, P2: 4, P3: 8, P4: 24, P5: 72 };

async function criarSLA(chamadoId: string, prioridade: PrioridadeChamado, iniciadoEm: Date, encerradoEm?: Date | null) {
  const prazoEm    = new Date(iniciadoEm.getTime() + slaHoras[prioridade] * 3_600_000);
  const vencido    = prazoEm < new Date() && !encerradoEm;
  const cumpridoEm = encerradoEm && encerradoEm <= prazoEm ? encerradoEm : null;
  const slaClient  = (prisma as any).sLA ?? (prisma as any).sla ?? (prisma as any).Sla;
  if (!slaClient) return null;
  return slaClient.upsert({
    where:  { chamadoId },
    update: { prioridade, iniciadoEm, prazoEm, vencido, cumpridoEm },
    create: { chamadoId, prioridade, iniciadoEm, prazoEm, vencido, cumpridoEm },
  }).catch(() => null);
}

async function main() {
  log.title('\n╔══════════════════════════════════════════╗');
  log.title('║  SEED MÉDIO — HELP ME API                  ║');
  log.title('╚════════════════════════════════════════════╝\n');

  log.info('[INFO] Conectando ao PostgreSQL...');
  await prisma.$connect();
  log.success('[SUCESSO] PostgreSQL conectado\n');

  log.info('[INFO] Conectando ao MongoDB...');
  await mongoose.connect(process.env.MONGO_INITDB_URI!);
  log.success('[SUCESSO] MongoDB conectado\n');

  log.warn('[WARN] Limpando banco de dados...\n');
  await Notificacao.deleteMany({});
  await AtualizacaoChamado.deleteMany({});
  log.info('[INFO] MongoDB limpo');

  await (
    (prisma as any).sLA ?? (prisma as any).sla ?? (prisma as any).Sla ?? { deleteMany: async () => {} }
  ).deleteMany({}).catch(() => {});
  await prisma.anexoChamado.deleteMany({});
  await prisma.comentarioChamado.deleteMany({});
  await prisma.transferenciaChamado.deleteMany({});
  await prisma.ordemDeServico.deleteMany({});
  await prisma.chamado.deleteMany({});
  await prisma.expediente.deleteMany({});
  await prisma.servico.deleteMany({});
  await prisma.usuario.deleteMany({});
  log.success('[SUCESSO] PostgreSQL limpo\n');

  log.title('[1/8] CRIANDO USUÁRIOS...\n');

  const admin = await criarUsuario('admin@helpme.com', {
    nome: 'Admin', sobrenome: 'Sistema', email: 'admin@helpme.com',
    password: 'Admin123!', regra: Regra.ADMIN, setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0001', ramal: '1000',
    avatarUrl: 'https://ui-avatars.com/api/?name=Admin+Sistema&background=0D8ABC&color=fff',
  });
  log.success(`[SUCESSO] ${admin.email} [ADMIN]`);

  const superAdmin = await criarUsuario('superadmin@helpme.com', {
    nome: 'Super', sobrenome: 'Admin', email: 'superadmin@helpme.com',
    password: 'Super123!', regra: Regra.ADMIN, setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0002', ramal: '1001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Super+Admin&background=7C3AED&color=fff',
  });
  log.success(`[SUCESSO] ${superAdmin.email} [ADMIN]`);

  const adminTI = await criarUsuario('diego.ferreira@helpme.com', {
    nome: 'Diego', sobrenome: 'Ferreira', email: 'diego.ferreira@helpme.com',
    password: 'Diego123!', regra: Regra.ADMIN, setor: Setor.TECNOLOGIA_INFORMACAO,
    telefone: '(11) 99999-0003', ramal: '1002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Diego+Ferreira&background=059669&color=fff',
  });
  log.success(`[SUCESSO] ${adminTI.email} [ADMIN]\n`);

  // Técnicos — 5 técnicos para distribuir carga realista
  const tecnico1 = await criarUsuario('tecnico@helpme.com', {
    nome: 'Carlos', sobrenome: 'Silva', email: 'tecnico@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N1,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0001', ramal: '3001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Carlos+Silva&background=EA580C&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico1.email} [N1]`);

  const tecnico2 = await criarUsuario('ana.santos@helpme.com', {
    nome: 'Ana', sobrenome: 'Santos', email: 'ana.santos@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N2,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0002', ramal: '3002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Ana+Santos&background=DB2777&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico2.email} [N2]`);

  const tecnico3 = await criarUsuario('roberto.ferreira@helpme.com', {
    nome: 'Roberto', sobrenome: 'Ferreira', email: 'roberto.ferreira@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N3,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0003', ramal: '3003',
    avatarUrl: 'https://ui-avatars.com/api/?name=Roberto+Ferreira&background=2563EB&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico3.email} [N3]`);

  const tecnico4 = await criarUsuario('lucas.mendes@helpme.com', {
    nome: 'Lucas', sobrenome: 'Mendes', email: 'lucas.mendes@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N1,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0004', ramal: '3004',
    avatarUrl: 'https://ui-avatars.com/api/?name=Lucas+Mendes&background=0891B2&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico4.email} [N1]`);

  const tecnico5 = await criarUsuario('camila.rocha@helpme.com', {
    nome: 'Camila', sobrenome: 'Rocha', email: 'camila.rocha@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N2,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0005', ramal: '3005',
    avatarUrl: 'https://ui-avatars.com/api/?name=Camila+Rocha&background=7C3AED&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico5.email} [N2]\n`);

  // Usuários — 8 usuários de setores variados
  const usuario1 = await criarUsuario('user@helpme.com', {
    nome: 'João', sobrenome: 'Oliveira', email: 'user@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.COMERCIAL,
    telefone: '(11) 97654-0001', ramal: '2001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Joao+Oliveira&background=16A34A&color=fff',
  });
  log.success(`[SUCESSO] ${usuario1.email} [COMERCIAL]`);

  const usuario2 = await criarUsuario('maria.costa@helpme.com', {
    nome: 'Maria', sobrenome: 'Costa', email: 'maria.costa@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.FINANCEIRO,
    telefone: '(11) 97654-0002', ramal: '2002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Maria+Costa&background=DC2626&color=fff',
  });
  log.success(`[SUCESSO] ${usuario2.email} [FINANCEIRO]`);

  const usuario3 = await criarUsuario('pedro.lima@helpme.com', {
    nome: 'Pedro', sobrenome: 'Lima', email: 'pedro.lima@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.MARKETING,
    telefone: '(11) 97654-0003', ramal: '2003',
    avatarUrl: 'https://ui-avatars.com/api/?name=Pedro+Lima&background=9333EA&color=fff',
  });
  log.success(`[SUCESSO] ${usuario3.email} [MARKETING]`);

  const usuario4 = await criarUsuario('fernanda.alves@helpme.com', {
    nome: 'Fernanda', sobrenome: 'Alves', email: 'fernanda.alves@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.RECURSOS_HUMANOS,
    telefone: '(11) 97654-0004', ramal: '2004',
    avatarUrl: 'https://ui-avatars.com/api/?name=Fernanda+Alves&background=F59E0B&color=fff',
  });
  log.success(`[SUCESSO] ${usuario4.email} [RH]`);

  const usuario5 = await criarUsuario('rafael.souza@helpme.com', {
    nome: 'Rafael', sobrenome: 'Souza', email: 'rafael.souza@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.OPERACIONAL,
    telefone: '(11) 97654-0005', ramal: '2005',
    avatarUrl: 'https://ui-avatars.com/api/?name=Rafael+Souza&background=0D8ABC&color=fff',
  });
  log.success(`[SUCESSO] ${usuario5.email} [OPERACIONAL]`);

  const usuario6 = await criarUsuario('juliana.pires@helpme.com', {
    nome: 'Juliana', sobrenome: 'Pires', email: 'juliana.pires@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.JURIDICO,
    telefone: '(11) 97654-0006', ramal: '2006',
    avatarUrl: 'https://ui-avatars.com/api/?name=Juliana+Pires&background=BE185D&color=fff',
  });
  log.success(`[SUCESSO] ${usuario6.email} [JURIDICO]`);

  const usuario7 = await criarUsuario('marcos.nunes@helpme.com', {
    nome: 'Marcos', sobrenome: 'Nunes', email: 'marcos.nunes@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.DIRETORIA,
    telefone: '(11) 97654-0007', ramal: '2007',
    avatarUrl: 'https://ui-avatars.com/api/?name=Marcos+Nunes&background=1D4ED8&color=fff',
  });
  log.success(`[SUCESSO] ${usuario7.email} [DIRETORIA]`);

  const usuario8 = await criarUsuario('patricia.gomes@helpme.com', {
    nome: 'Patricia', sobrenome: 'Gomes', email: 'patricia.gomes@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.COMERCIAL,
    telefone: '(11) 97654-0008', ramal: '2008',
    avatarUrl: 'https://ui-avatars.com/api/?name=Patricia+Gomes&background=059669&color=fff',
  });
  log.success(`[SUCESSO] ${usuario8.email} [COMERCIAL]\n`);

  const todosUsuarios  = [usuario1, usuario2, usuario3, usuario4, usuario5, usuario6, usuario7, usuario8];
  const todosTecnicos  = [tecnico1, tecnico2, tecnico3, tecnico4, tecnico5];
  const tecnicosN1N3   = [tecnico1, tecnico4];           // podem atender P4/P5
  const tecnicosN2N3   = [tecnico2, tecnico3, tecnico5]; // podem atender P2/P3

  log.title('[2/8] CONFIGURANDO EXPEDIENTES...\n');

  const expedientes = [
    { t: tecnico1, entrada: '08:00', saida: '17:00' },
    { t: tecnico2, entrada: '08:00', saida: '18:00' },
    { t: tecnico3, entrada: '09:00', saida: '18:00' },
    { t: tecnico4, entrada: '07:00', saida: '16:00' },
    { t: tecnico5, entrada: '10:00', saida: '19:00' },
  ];

  for (const e of expedientes) {
    await criarExpediente(e.t.id, e.entrada, e.saida);
    log.success(`[SUCESSO] ${e.t.nome}: ${e.entrada}–${e.saida}`);
  }
  log.info('');

  log.title('[3/8] CRIANDO SERVIÇOS...\n');

  const servicosData = [
    { nome: 'Suporte Técnico Geral',     descricao: 'Suporte técnico para problemas gerais de TI',           ativo: true  },
    { nome: 'Instalação de Software',    descricao: 'Instalação e configuração de softwares corporativos',    ativo: true  },
    { nome: 'Manutenção de Hardware',    descricao: 'Reparo e manutenção de equipamentos de informática',     ativo: true  },
    { nome: 'Suporte de Rede',           descricao: 'Configuração e troubleshooting de rede e conectividade', ativo: true  },
    { nome: 'Backup e Recuperação',      descricao: 'Serviços de backup e recuperação de dados',              ativo: true  },
    { nome: 'Configuração de Email',     descricao: 'Configuração de contas de email e clientes de email',    ativo: true  },
    { nome: 'Acesso e Permissões',       descricao: 'Gerenciamento de acessos e permissões de usuários',      ativo: true  },
    { nome: 'Impressoras e Periféricos', descricao: 'Suporte para impressoras, scanners e periféricos',       ativo: true  },
    { nome: 'VPN e Acesso Remoto',       descricao: 'Configuração de VPN e ferramentas de acesso remoto',     ativo: true  },
    { nome: 'Serviço Teste K6',          descricao: 'Serviço para testes automatizados e performance',        ativo: false },
  ] as const;

  const S: Record<string, string> = {};
  for (const dados of servicosData) {
    const s = await prisma.servico.upsert({
      where:  { nome: dados.nome },
      update: { descricao: dados.descricao, ativo: dados.ativo, deletadoEm: null },
      create: { ...dados },
    });
    S[s.nome] = s.id;
    log.success(`[SUCESSO] ${s.nome}`);
  }

  const servicosAtivos = Object.entries(S)
    .filter(([nome]) => nome !== 'Serviço Teste K6')
    .map(([, id]) => id);

  log.info('');

  log.title('[4/8] CRIANDO CHAMADOS ÂNCORAS (INC0001–INC0020)...\n');

  const ancora = await prisma.$transaction(async (tx) => {

    // INC0001 — ABERTO, P4, sem técnico (listagem/busca)
    const c01 = await tx.chamado.create({ data: {
      OS: 'INC0001', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id,
      descricao: 'Computador não liga após atualização do Windows. Tentei reiniciar várias vezes.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c01.id, servicoId: S['Suporte Técnico Geral'] } });
    await tx.comentarioChamado.create({ data: {
      chamadoId: c01.id, autorId: usuario1.id, visibilidadeInterna: false,
      comentario: 'Verifiquei a fonte de alimentação e parece estar ok.',
    }});

    // INC0002 — EM_ATENDIMENTO, P3, técnico N1 (comentário interno + público)
    const c02 = await tx.chamado.create({ data: {
      OS: 'INC0002', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      descricao: 'Internet muito lenta no setor financeiro. Sistema ERP inacessível.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c02.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c02.id, autorId: tecnico1.id, visibilidadeInterna: true,  comentario: 'Loop identificado no switch do 2º andar — corrigindo.' },
      { chamadoId: c02.id, autorId: usuario2.id, visibilidadeInterna: false, comentario: 'Todos do financeiro estão afetados, é urgente!' },
    ]});

    // INC0003 — ENCERRADO há 1h (< 48h) → permite reabertura
    const c03 = await tx.chamado.create({ data: {
      OS: 'INC0003', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      descricao: 'Microsoft Office não abre após atualização automática do Windows.',
      descricaoEncerramento: 'Office reparado via painel de controle. Funcionando.',
      encerradoEm: horasAtras(1), geradoEm: horasAtras(5), atualizadoEm: horasAtras(1),
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c03.id, servicoId: S['Instalação de Software'] } });

    // INC0004 — EM_ATENDIMENTO, P3, transferência N1 → N3
    const c04 = await tx.chamado.create({ data: {
      OS: 'INC0004', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario6.id, tecnicoId: tecnico3.id,
      descricao: 'Impressora do setor jurídico não imprime. Já reiniciei duas vezes.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c04.id, servicoId: S['Impressoras e Periféricos'] } });
    await tx.transferenciaChamado.create({ data: {
      chamadoId: c04.id, tecnicoAnteriorId: tecnico1.id, tecnicoNovoId: tecnico3.id,
      motivo: 'Problema requer nível N3 — driver de rede corrompido na impressora.',
      transferidoPor: admin.id, transferidoEm: horasAtras(2),
    }});
    await tx.comentarioChamado.create({ data: {
      chamadoId: c04.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Reinstalando servidor de impressão. Driver corrompido após update.',
    }});

    // INC0005 — ENCERRADO há 3 dias (> 48h) → rejeita reabertura
    const c05 = await tx.chamado.create({ data: {
      OS: 'INC0005', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P5,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      descricao: 'Email não sincroniza no celular após troca de senha corporativa.',
      descricaoEncerramento: 'Conta reconfigurada no dispositivo. Sincronização ok.',
      encerradoEm: diasAtras(3), geradoEm: diasAtras(4), atualizadoEm: diasAtras(3),
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c05.id, servicoId: S['Configuração de Email'] } });

    // INC0006 — ABERTO, P1 (escalado pelo adminTI) — SLA < 1h
    const c06 = await tx.chamado.create({ data: {
      OS: 'INC0006', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P1,
      usuarioId: usuario7.id,
      prioridadeAlterada: minutosAtras(30), prioridadeAlteradaPor: adminTI.id,
      descricao: 'Servidor de produção fora do ar. Sistema completamente indisponível.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c06.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c06.id, autorId: adminTI.id,  visibilidadeInterna: true,  comentario: 'Escalado para P1 — impacto total no negócio.' },
      { chamadoId: c06.id, autorId: usuario7.id, visibilidadeInterna: false, comentario: 'Nenhum usuário acessa o sistema desde as 09:15.' },
    ]});

    // INC0007 — REABERTO, P2, duas transferências
    const c07 = await tx.chamado.create({ data: {
      OS: 'INC0007', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      descricao: 'VPN não conecta após mudança de senha. Erro de certificado.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c07.id, servicoId: S['VPN e Acesso Remoto'] } });
    await tx.transferenciaChamado.createMany({ data: [
      { chamadoId: c07.id, tecnicoAnteriorId: tecnico2.id, tecnicoNovoId: tecnico1.id, motivo: 'Redistribuição de carga de trabalho entre técnicos.', transferidoPor: admin.id, transferidoEm: diasAtras(2) },
      { chamadoId: c07.id, tecnicoAnteriorId: tecnico1.id, tecnicoNovoId: tecnico2.id, motivo: 'Problema requer N2 — configuração de certificado SSL.', transferidoPor: adminTI.id, transferidoEm: diasAtras(1) },
    ]});
    await tx.comentarioChamado.create({ data: {
      chamadoId: c07.id, autorId: usuario1.id, visibilidadeInterna: false,
      comentario: 'VPN caiu novamente após ~10 minutos de conexão.',
    }});

    // INC0008 — ENCERRADO, P5, dois serviços
    const c08 = await tx.chamado.create({ data: {
      OS: 'INC0008', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P5,
      usuarioId: usuario2.id, tecnicoId: tecnico4.id,
      descricao: 'Mouse e teclado sem fio pararam de funcionar.',
      descricaoEncerramento: 'Pilhas substituídas. Funcionando normalmente.',
      encerradoEm: diasAtras(3), geradoEm: diasAtras(4), atualizadoEm: diasAtras(3),
    }});
    await tx.ordemDeServico.createMany({ data: [
      { chamadoId: c08.id, servicoId: S['Impressoras e Periféricos'] },
      { chamadoId: c08.id, servicoId: S['Suporte Técnico Geral'] },
    ]});

    // INC0009 — CANCELADO, P4
    const c09 = await tx.chamado.create({ data: {
      OS: 'INC0009', status: ChamadoStatus.CANCELADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id,
      descricao: 'Solicitação de novo monitor 4K para home office.',
      descricaoEncerramento: 'Orçamento de hardware congelado no trimestre.',
      encerradoEm: diasAtras(5), geradoEm: diasAtras(6), atualizadoEm: diasAtras(5),
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c09.id, servicoId: S['Manutenção de Hardware'] } });
    await tx.comentarioChamado.create({ data: {
      chamadoId: c09.id, autorId: admin.id, visibilidadeInterna: false,
      comentario: 'Orçamento congelado. Reavaliar em Jan/2026.',
    }});

    // INC0010 — EM_ATENDIMENTO, P2, com anexo
    const c10 = await tx.chamado.create({ data: {
      OS: 'INC0010', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario1.id, tecnicoId: tecnico3.id,
      descricao: 'Sistema de backup falhou consecutivamente na última semana.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c10.id, servicoId: S['Backup e Recuperação'] } });
    await tx.anexoChamado.create({ data: {
      chamadoId: c10.id, autorId: usuario1.id,
      nomeArquivo: `INC0010/backup-error-${Date.now()}.log`, nomeOriginal: 'backup-error.log',
      mimetype: 'text/plain', tamanho: 4096,
      bucketMinio: 'helpme-attachments', objetoMinio: `chamados/${c10.id}/backup-error.log`,
    }});
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c10.id, autorId: tecnico3.id, visibilidadeInterna: true,  comentario: 'Disco com 98% de uso. Arquivando logs antigos.' },
      { chamadoId: c10.id, autorId: usuario1.id, visibilidadeInterna: false, comentario: 'Backup de ontem também falhou. Dados críticos em risco.' },
    ]});

    // INC0011 — PAI hierarquia A (tem filho INC0012)
    const c11 = await tx.chamado.create({ data: {
      OS: 'INC0011', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario3.id, tecnicoId: tecnico3.id,
      descricao: 'Falha generalizada de rede no 3º andar afetando múltiplos setores.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c11.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.create({ data: {
      chamadoId: c11.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Switch principal com porta danificada. Substituição em andamento.',
    }});

    // INC0012 — FILHO de INC0011 (auto-encerrado ao vincular)
    const vinculoEmC12 = minutosAtras(30);
    const c12 = await tx.chamado.create({ data: {
      OS: 'INC0012', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, chamadoPaiId: c11.id,
      descricao: 'Sem internet no setor de RH — mesmo prédio que o INC0011.',
      descricaoEncerramento: 'Chamado vinculado ao chamado INC0011',
      vinculadoEm: vinculoEmC12, vinculadoPor: adminTI.id,
      encerradoEm: vinculoEmC12, geradoEm: horasAtras(3), atualizadoEm: vinculoEmC12,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c12.id, servicoId: S['Suporte de Rede'] } });

    // INC0013 — PAI hierarquia B (tem filho INC0014)
    const c13 = await tx.chamado.create({ data: {
      OS: 'INC0013', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario4.id,
      descricao: 'Falha de acesso ao sistema de RH afetando todo o departamento.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c13.id, servicoId: S['Acesso e Permissões'] } });

    // INC0014 — FILHO de INC0013
    const vinculoEmC14 = minutosAtras(10);
    const c14 = await tx.chamado.create({ data: {
      OS: 'INC0014', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario4.id, chamadoPaiId: c13.id,
      descricao: 'Usuário maria.costa sem acesso ao módulo de folha de pagamento.',
      descricaoEncerramento: 'Chamado vinculado ao chamado INC0013',
      vinculadoEm: vinculoEmC14, vinculadoPor: admin.id,
      encerradoEm: vinculoEmC14, geradoEm: horasAtras(1), atualizadoEm: vinculoEmC14,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c14.id, servicoId: S['Acesso e Permissões'] } });

    // INC0015 — isolado para testes de deleção soft/hard
    const c15 = await tx.chamado.create({ data: {
      OS: 'INC0015', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id,
      descricao: 'Solicitação de instalação de certificado digital para assinatura eletrônica.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c15.id, servicoId: S['Acesso e Permissões'] } });

    // INC0016 — ABERTO, P2, múltiplos serviços, para filtros
    const c16 = await tx.chamado.create({ data: {
      OS: 'INC0016', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario5.id,
      descricao: 'Falha no sistema de controle de acesso físico e no cadastro de funcionários.',
    }});
    await tx.ordemDeServico.createMany({ data: [
      { chamadoId: c16.id, servicoId: S['Acesso e Permissões'] },
      { chamadoId: c16.id, servicoId: S['Suporte Técnico Geral'] },
    ]});

    // INC0017 — EM_ATENDIMENTO, P3, técnico N2, com transferência admin→técnico
    const c17 = await tx.chamado.create({ data: {
      OS: 'INC0017', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario8.id, tecnicoId: tecnico5.id,
      descricao: 'Scanner do setor comercial não reconhecido após reinstalação do Windows.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c17.id, servicoId: S['Impressoras e Periféricos'] } });
    await tx.transferenciaChamado.create({ data: {
      chamadoId: c17.id, tecnicoAnteriorId: tecnico4.id, tecnicoNovoId: tecnico5.id,
      motivo: 'Lucas Mendes em folga — redirecionado para Camila Rocha.',
      transferidoPor: admin.id, transferidoEm: horasAtras(3),
    }});

    // INC0018 — ENCERRADO, P3, N2, com SLA cumprido no prazo
    const geradoC18 = diasAtras(2);
    const encerradoC18 = new Date(geradoC18.getTime() + 6 * 3_600_000); // 6h < prazo P3 (8h)
    const c18 = await tx.chamado.create({ data: {
      OS: 'INC0018', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario6.id, tecnicoId: tecnico2.id,
      descricao: 'Acesso ao servidor de arquivos bloqueado após expiração de senha.',
      descricaoEncerramento: 'Senha redefinida e permissões restauradas. Acesso normalizado.',
      encerradoEm: encerradoC18, geradoEm: geradoC18, atualizadoEm: encerradoC18,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c18.id, servicoId: S['Acesso e Permissões'] } });

    // INC0019 — ENCERRADO, P2, com SLA vencido (encerrado tarde)
    const geradoC19 = diasAtras(5);
    const encerradoC19 = new Date(geradoC19.getTime() + 10 * 3_600_000); // 10h > prazo P2 (4h)
    const c19 = await tx.chamado.create({ data: {
      OS: 'INC0019', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario7.id, tecnicoId: tecnico3.id,
      descricao: 'Banco de dados de relatórios lento. Consultas levando mais de 2 minutos.',
      descricaoEncerramento: 'Índices recriados e query plan otimizado. Performance normalizada.',
      encerradoEm: encerradoC19, geradoEm: geradoC19, atualizadoEm: encerradoC19,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c19.id, servicoId: S['Backup e Recuperação'] } });

    // INC0020 — PAI de árvore com 2 filhos (INC0020 → INC0021, INC0022 criados no lote bulk)
    const c20 = await tx.chamado.create({ data: {
      OS: 'INC0020', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario5.id, tecnicoId: tecnico3.id,
      descricao: 'Falha massiva de impressão afetando toda a empresa — spooler travado.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c20.id, servicoId: S['Impressoras e Periféricos'] } });
    await tx.comentarioChamado.create({ data: {
      chamadoId: c20.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Spooler reiniciado, sem efeito. Investigando driver de rede das impressoras.',
    }});

    return { c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20 };
  });

  log.success('[SUCESSO] Âncoras INC0001–INC0020 criadas\n');

  log.title('[5/8] GERANDO CHAMADOS BULK (INC0021–INC0102)...\n');

  // Tabelas de distribuição (soma = 100)
  const STATUS_POOL: ChamadoStatus[] = [
    ...Array(30).fill(ChamadoStatus.ABERTO),
    ...Array(20).fill(ChamadoStatus.EM_ATENDIMENTO),
    ...Array(30).fill(ChamadoStatus.ENCERRADO),
    ...Array(8).fill(ChamadoStatus.CANCELADO),
    ...Array(12).fill(ChamadoStatus.REABERTO),
  ];

  const PRIORIDADE_POOL: PrioridadeChamado[] = [
    ...Array(2).fill(PrioridadeChamado.P1),
    ...Array(10).fill(PrioridadeChamado.P2),
    ...Array(23).fill(PrioridadeChamado.P3),
    ...Array(50).fill(PrioridadeChamado.P4),
    ...Array(15).fill(PrioridadeChamado.P5),
  ];

  // Banco de descrições realistas por tipo de serviço
  const DESCRICOES: Record<string, string[]> = {
    'Suporte Técnico Geral':     [
      'Computador reiniciando sozinho diversas vezes ao dia sem aviso.',
      'Tela azul frequente — BSOD com erro de driver.',
      'Notebook superaquecendo e desligando durante uso.',
      'Sistema operacional lento após instalação de atualização.',
      'Computador não reconhece pen drive nem HD externo.',
      'Sem som no computador após atualização do Windows.',
      'Monitor não liga mesmo com computador funcionando.',
      'Teclado com teclas travando intermitentemente.',
    ],
    'Instalação de Software':    [
      'Preciso do AutoCAD instalado para projeto urgente.',
      'Adobe Acrobat não abre arquivos PDF após reinstalação.',
      'Microsoft Project necessário para gerenciar cronograma.',
      'Antivírus corporativo expirado — necessário renovar licença.',
      'Preciso do pacote Office atualizado para apresentação.',
      'Software de contabilidade não instala — erro de .NET.',
    ],
    'Manutenção de Hardware':    [
      'HD com barulho estranho e lentidão ao abrir arquivos.',
      'Fonte do computador com cheiro de queimado.',
      'Notebook com bateria não carregando mais.',
      'Memória RAM insuficiente — sistema travando ao multitarefa.',
      'DVD/CD drive não lê mídias.',
    ],
    'Suporte de Rede':           [
      'Wi-Fi caindo a cada 15 minutos no setor.',
      'Não consigo acessar a pasta compartilhada do servidor.',
      'Velocidade de rede muito baixa ao acessar arquivos.',
      'IP duplicado causando conflito na rede.',
      'VoIP com qualidade péssima — chamadas caindo.',
      'Firewall bloqueando acesso a sistema externo homologado.',
    ],
    'Backup e Recuperação':      [
      'Arquivo importante deletado acidentalmente — preciso recuperar.',
      'Job de backup noturno falhando há 3 dias.',
      'Backup em nuvem não sincroniza desde a semana passada.',
      'Preciso restaurar versão anterior de planilha financeira.',
    ],
    'Configuração de Email':     [
      'Email corporativo não chega no celular após troca de senha.',
      'Outlook travando ao abrir mensagens com anexo grande.',
      'Assinatura de email sumiu após atualização do Office.',
      'Caixa de entrada com mais de 50k emails — necessário arquivar.',
      'Erro de certificado SSL ao enviar emails externos.',
    ],
    'Acesso e Permissões':       [
      'Não consigo acessar sistema após retorno de férias.',
      'Novo colaborador sem acesso aos sistemas no primeiro dia.',
      'Senha expirada e não consigo redefinir pelo portal.',
      'Acesso ao drive compartilhado negado sem motivo aparente.',
      'Usuário precisa de permissão de leitura em pasta restrita.',
      'Colaborador transferido de setor sem acesso ao novo sistema.',
    ],
    'Impressoras e Periféricos': [
      'Impressora imprimindo páginas em branco.',
      'Impressora offline mesmo conectada na rede.',
      'Scanner não é reconhecido após reinstalação do Windows.',
      'Impressora com atolamento frequente de papel.',
      'Toner acabando — pedido de substituição urgente.',
    ],
    'VPN e Acesso Remoto':       [
      'VPN não conecta em home office após atualização.',
      'Acesso remoto via RDP com latência alta.',
      'VPN conecta mas não acessa sistemas internos.',
      'Token de autenticação VPN não funciona no celular novo.',
    ],
  };

  const MOTIVOS_ENCERRAMENTO = [
    'Problema identificado e resolvido com sucesso pelo técnico.',
    'Driver atualizado e sistema reiniciado. Funcionando normalmente.',
    'Configuração revertida para versão anterior. Estável.',
    'Hardware substituído. Usuário confirmou funcionamento.',
    'Permissões restauradas após sincronização com AD.',
    'Firmware atualizado. Problema não recorre.',
    'Cache limpo e serviço reiniciado. Operacional.',
    'Senha redefinida e sessão restabelecida com sucesso.',
    'Cabo de rede substituído. Conectividade normalizada.',
    'Reinstalação completa realizada. Sistema estável.',
  ];

  const MOTIVOS_CANCELAMENTO = [
    'Usuário resolveu o problema por conta própria.',
    'Equipamento substituído por novo — problema irrelevante.',
    'Colaborador desligado da empresa antes da resolução.',
    'Necessidade cancelada após revisão de processo interno.',
    'Problema resolvido por outro canal de suporte.',
  ];

  const MOTIVOS_TRANSFERENCIA = [
    'Técnico responsável em férias — redirecionado.',
    'Problema requer expertise de nível superior.',
    'Redistribuição de carga entre técnicos do turno.',
    'Técnico original sem disponibilidade para o prazo de SLA.',
    'Chamado requer N3 após diagnóstico inicial.',
  ];

  const servicosKeys = Object.keys(S).filter(k => k !== 'Serviço Teste K6');

  // Filho de INC0020 — criados no bulk mas referenciados como filhos do âncora c20
  let paiC20Registrado = false;

  const TOTAL_BULK = 82; // INC0021 até INC0102
  let criados = 0;
  const bulkHistorico: any[] = [];
  const bulkNotificacoes: any[] = [];

  for (let i = 0; i < TOTAL_BULK; i++) {
    const num       = String(21 + i).padStart(4, '0');
    const OS        = `INC${num}`;
    const status    = pick(STATUS_POOL);
    const prioridade = pick(PRIORIDADE_POOL);
    const usuario   = pick(todosUsuarios);
    const servicoKey = pick(servicosKeys);
    const servicoId  = S[servicoKey];
    const descricoes = DESCRICOES[servicoKey] ?? ['Problema técnico genérico reportado pelo usuário.'];
    const descricao  = pick(descricoes);

    // Datas coerentes com o status
    const diasCriado  = randInt(1, 60);
    const geradoEm    = diasAtras(diasCriado);
    let atualizadoEm  = geradoEm;
    let encerradoEm: Date | null = null;
    let tecnicoId: string | null = null;
    let descricaoEncerramento: string | null = null;
    let chamadoPaiId: string | null = null;
    let vinculadoEm: Date | null = null;
    let vinculadoPor: string | null = null;

    // Atribuir técnico conforme prioridade
    if (status !== ChamadoStatus.ABERTO && status !== ChamadoStatus.CANCELADO) {
      if (prioridade === PrioridadeChamado.P1 || prioridade === PrioridadeChamado.P2 || prioridade === PrioridadeChamado.P3) {
        tecnicoId = pick([...tecnicosN2N3]).id;
      } else {
        tecnicoId = pick(todosTecnicos).id;
      }
    }

    if (status === ChamadoStatus.ENCERRADO || status === ChamadoStatus.CANCELADO) {
      const horasResolvido = randInt(1, diasCriado * 20);
      encerradoEm  = new Date(geradoEm.getTime() + horasResolvido * 3_600_000);
      atualizadoEm = encerradoEm;
      descricaoEncerramento = status === ChamadoStatus.CANCELADO
        ? pick(MOTIVOS_CANCELAMENTO)
        : pick(MOTIVOS_ENCERRAMENTO);
      if (status === ChamadoStatus.CANCELADO) tecnicoId = null;
    }

    if (status === ChamadoStatus.REABERTO) {
      atualizadoEm = horasAtras(randInt(1, 24));
    }

    // Primeiros 2 bulk abertos viram filhos de INC0020
    if (!paiC20Registrado && status === ChamadoStatus.ENCERRADO && i < 10) {
      chamadoPaiId = ancora.c20.id;
      vinculadoEm  = encerradoEm ?? new Date();
      vinculadoPor = admin.id;
      descricaoEncerramento = `Chamado vinculado ao chamado INC0020`;
      paiC20Registrado = true;
    }

    const chamado = await prisma.chamado.create({
      data: {
        OS, status, prioridade, descricao, usuarioId: usuario.id,
        tecnicoId, descricaoEncerramento, encerradoEm,
        chamadoPaiId, vinculadoEm, vinculadoPor,
        geradoEm, atualizadoEm,
      },
    });
    await prisma.ordemDeServico.create({ data: { chamadoId: chamado.id, servicoId } });

    // Comentário público em ~60% dos chamados
    if (randInt(1, 10) <= 6) {
      const comentariosPublicos = [
        'Verificado o problema no local. Ainda sem solução definitiva.',
        'Usuário confirmou que o problema persiste após reinicialização.',
        'Aguardando peça de reposição para concluir o atendimento.',
        'Problema intermitente — difícil reproduzir de forma consistente.',
        'Solicitei log de erro ao usuário para análise.',
      ];
      await prisma.comentarioChamado.create({
        data: {
          chamadoId: chamado.id,
          autorId: tecnicoId ?? usuario.id,
          comentario: pick(comentariosPublicos),
          visibilidadeInterna: false,
        },
      });
    }

    // Comentário interno em ~30% dos chamados com técnico
    if (tecnicoId && randInt(1, 10) <= 3) {
      const comentariosInternos = [
        'Problema mais complexo do que aparenta. Escalando internamente.',
        'Histórico de falhas recorrentes neste equipamento.',
        'Usuário com histórico de problemas similares — verificar configuração base.',
        'Aguardando aprovação de custo para substituição de hardware.',
      ];
      await prisma.comentarioChamado.create({
        data: {
          chamadoId: chamado.id,
          autorId: tecnicoId,
          comentario: pick(comentariosInternos),
          visibilidadeInterna: true,
        },
      });
    }

    // Transferência em ~15% dos chamados EM_ATENDIMENTO ou REABERTO
    if (
      (status === ChamadoStatus.EM_ATENDIMENTO || status === ChamadoStatus.REABERTO)
      && tecnicoId
      && randInt(1, 10) <= 2
    ) {
      const tecnicoAnterior = pick(todosTecnicos.filter(t => t.id !== tecnicoId));
      await prisma.transferenciaChamado.create({
        data: {
          chamadoId: chamado.id,
          tecnicoAnteriorId: tecnicoAnterior.id,
          tecnicoNovoId: tecnicoId,
          motivo: pick(MOTIVOS_TRANSFERENCIA),
          transferidoPor: pick([admin.id, adminTI.id]),
          transferidoEm: new Date(geradoEm.getTime() + randInt(1, 6) * 3_600_000),
        },
      });
    }

    // Histórico de abertura (MongoDB)
    bulkHistorico.push({
      chamadoId: chamado.id,
      dataHora: geradoEm,
      tipo: 'ABERTURA',
      para: ChamadoStatus.ABERTO,
      descricao,
      autorId: usuario.id,
      autorNome: `${usuario.nome} ${usuario.sobrenome}`,
      autorEmail: usuario.email,
    });

    // Notificação para admin em P1/P2 (20% dos demais)
    if (prioridade === PrioridadeChamado.P1 || (prioridade === PrioridadeChamado.P2 && randInt(1, 5) === 1)) {
      bulkNotificacoes.push({
        destinatarioId: admin.id, destinatarioEmail: admin.email,
        tipo: 'CHAMADO_ABERTO' as TipoEvento,
        titulo: `Novo chamado ${prioridade} — ${OS}`,
        mensagem: `O chamado ${OS} foi aberto com prioridade ${prioridade}.`,
        chamadoId: chamado.id, chamadoOS: OS,
        lida: status === ChamadoStatus.ENCERRADO || status === ChamadoStatus.CANCELADO,
        criadoEm: geradoEm,
      });
    }

    // Notificação de SLA vencendo para técnico em P1/P2 abertos
    if (
      tecnicoId &&
      (status === ChamadoStatus.ABERTO || status === ChamadoStatus.EM_ATENDIMENTO || status === ChamadoStatus.REABERTO) &&
      (prioridade === PrioridadeChamado.P1 || prioridade === PrioridadeChamado.P2)
    ) {
      const prazo = new Date(geradoEm.getTime() + slaHoras[prioridade] * 3_600_000);
      if (prazo < new Date()) {
        bulkNotificacoes.push({
          destinatarioId: tecnicoId, destinatarioEmail: pick(todosTecnicos.filter(t => t.id === tecnicoId)).email,
          tipo: 'SLA_VENCENDO' as TipoEvento,
          titulo: `SLA vencido — ${OS}`,
          mensagem: `O chamado ${OS} (${prioridade}) está com SLA vencido.`,
          chamadoId: chamado.id, chamadoOS: OS,
          lida: false, criadoEm: prazo,
        });
      }
    }

    criados++;
    if (criados % 20 === 0) log.info(`  … ${criados}/${TOTAL_BULK} bulk criados`);
  }

  // Insere histórico e notificações bulk em lote
  if (bulkHistorico.length) await AtualizacaoChamado.insertMany(bulkHistorico);
  if (bulkNotificacoes.length) await Notificacao.insertMany(bulkNotificacoes);

  log.success(`[SUCESSO] ${TOTAL_BULK} chamados bulk criados (INC0021–INC0102)\n`);

  log.title('[6/8] CRIANDO REGISTROS DE SLA...\n');

  // Âncoras que precisam de SLA manual
  const slaAncoras = [
    { ch: ancora.c01, enc: null              },
    { ch: ancora.c02, enc: null              },
    { ch: ancora.c03, enc: ancora.c03.encerradoEm },
    { ch: ancora.c04, enc: null              },
    { ch: ancora.c05, enc: ancora.c05.encerradoEm },
    { ch: ancora.c06, enc: null              },
    { ch: ancora.c07, enc: null              },
    { ch: ancora.c08, enc: ancora.c08.encerradoEm },
    { ch: ancora.c09, enc: ancora.c09.encerradoEm },
    { ch: ancora.c10, enc: null              },
    { ch: ancora.c11, enc: null              },
    { ch: ancora.c12, enc: ancora.c12.encerradoEm },
    { ch: ancora.c13, enc: null              },
    { ch: ancora.c14, enc: ancora.c14.encerradoEm },
    { ch: ancora.c15, enc: null              },
    { ch: ancora.c16, enc: null              },
    { ch: ancora.c17, enc: null              },
    { ch: ancora.c18, enc: ancora.c18.encerradoEm },
    { ch: ancora.c19, enc: ancora.c19.encerradoEm },
    { ch: ancora.c20, enc: null              },
  ];

  let slaOk = 0;
  for (const e of slaAncoras) {
    const r = await criarSLA(e.ch.id, e.ch.prioridade, e.ch.geradoEm, e.enc);
    if (r) slaOk++;
  }
  log.success(`[SUCESSO] ${slaOk} registros de SLA das âncoras criados\n`);

  log.title('[7/8] CRIANDO HISTÓRICO E NOTIFICAÇÕES DAS ÂNCORAS (MongoDB)...\n');

  await AtualizacaoChamado.insertMany([
    // INC0001
    { chamadoId: ancora.c01.id, dataHora: ancora.c01.geradoEm, tipo: 'ABERTURA', para: 'ABERTO', descricao: ancora.c01.descricao, autorId: usuario1.id, autorNome: `${usuario1.nome} ${usuario1.sobrenome}`, autorEmail: usuario1.email },
    // INC0002
    { chamadoId: ancora.c02.id, dataHora: ancora.c02.geradoEm, tipo: 'ABERTURA', para: 'ABERTO', descricao: ancora.c02.descricao, autorId: usuario2.id, autorNome: `${usuario2.nome} ${usuario2.sobrenome}`, autorEmail: usuario2.email },
    { chamadoId: ancora.c02.id, dataHora: horasAtras(4),        tipo: 'STATUS',   de: 'ABERTO', para: 'EM_ATENDIMENTO', descricao: 'Chamado assumido pelo técnico', autorId: tecnico1.id, autorNome: `${tecnico1.nome} ${tecnico1.sobrenome}`, autorEmail: tecnico1.email },
    // INC0003 — encerrado (< 48h)
    { chamadoId: ancora.c03.id, dataHora: horasAtras(5), tipo: 'ABERTURA', para: 'ABERTO', descricao: ancora.c03.descricao, autorId: usuario1.id, autorNome: `${usuario1.nome} ${usuario1.sobrenome}`, autorEmail: usuario1.email },
    { chamadoId: ancora.c03.id, dataHora: ancora.c03.encerradoEm, tipo: 'STATUS', de: 'ABERTO', para: 'ENCERRADO', descricao: ancora.c03.descricaoEncerramento, autorId: tecnico2.id, autorNome: `${tecnico2.nome} ${tecnico2.sobrenome}`, autorEmail: tecnico2.email },
    // INC0004 — transferência
    { chamadoId: ancora.c04.id, dataHora: ancora.c04.geradoEm, tipo: 'ABERTURA', para: 'ABERTO', descricao: ancora.c04.descricao, autorId: usuario6.id, autorNome: `${usuario6.nome} ${usuario6.sobrenome}`, autorEmail: usuario6.email },
    { chamadoId: ancora.c04.id, dataHora: horasAtras(2), tipo: 'TRANSFERENCIA', de: tecnico1.id, para: tecnico3.id, descricao: 'Problema requer nível N3.', autorId: admin.id, autorNome: `${admin.nome} ${admin.sobrenome}`, autorEmail: admin.email },
    // INC0006 — escalada de prioridade
    { chamadoId: ancora.c06.id, dataHora: ancora.c06.geradoEm, tipo: 'ABERTURA', para: 'ABERTO', descricao: ancora.c06.descricao, autorId: usuario7.id, autorNome: `${usuario7.nome} ${usuario7.sobrenome}`, autorEmail: usuario7.email },
    { chamadoId: ancora.c06.id, dataHora: minutosAtras(30), tipo: 'PRIORIDADE', de: 'P3', para: 'P1', descricao: 'Escalado para P1 — impacto total no negócio.', autorId: adminTI.id, autorNome: `${adminTI.nome} ${adminTI.sobrenome}`, autorEmail: adminTI.email },
    // INC0007 — duas transferências + reabertura
    { chamadoId: ancora.c07.id, dataHora: diasAtras(3), tipo: 'ABERTURA', para: 'ABERTO', descricao: ancora.c07.descricao, autorId: usuario1.id, autorNome: `${usuario1.nome} ${usuario1.sobrenome}`, autorEmail: usuario1.email },
    { chamadoId: ancora.c07.id, dataHora: diasAtras(2), tipo: 'TRANSFERENCIA', de: tecnico2.id, para: tecnico1.id, descricao: 'Redistribuição de carga.', autorId: admin.id, autorNome: `${admin.nome} ${admin.sobrenome}`, autorEmail: admin.email },
    { chamadoId: ancora.c07.id, dataHora: diasAtras(1), tipo: 'TRANSFERENCIA', de: tecnico1.id, para: tecnico2.id, descricao: 'Requer N2 — certificado SSL.', autorId: adminTI.id, autorNome: `${adminTI.nome} ${adminTI.sobrenome}`, autorEmail: adminTI.email },
    { chamadoId: ancora.c07.id, dataHora: horasAtras(12), tipo: 'REABERTURA', de: 'ENCERRADO', para: 'REABERTO', descricao: 'VPN caiu novamente após resolução.', autorId: usuario1.id, autorNome: `${usuario1.nome} ${usuario1.sobrenome}`, autorEmail: usuario1.email },
    // INC0012 — vinculado
    { chamadoId: ancora.c12.id, dataHora: horasAtras(3), tipo: 'ABERTURA', para: 'ABERTO', descricao: ancora.c12.descricao, autorId: usuario2.id, autorNome: `${usuario2.nome} ${usuario2.sobrenome}`, autorEmail: usuario2.email },
    { chamadoId: ancora.c12.id, dataHora: ancora.c12.encerradoEm, tipo: 'STATUS', de: 'ABERTO', para: 'ENCERRADO', descricao: 'Chamado vinculado ao INC0011', autorId: adminTI.id, autorNome: `${adminTI.nome} ${adminTI.sobrenome}`, autorEmail: adminTI.email },
  ]);

  await Notificacao.insertMany([
    { destinatarioId: tecnico1.id,  destinatarioEmail: tecnico1.email,  tipo: 'CHAMADO_ATRIBUIDO',  titulo: 'Novo chamado atribuído',        mensagem: `Chamado ${ancora.c02.OS} atribuído a você.`,                chamadoId: ancora.c02.id, chamadoOS: ancora.c02.OS, lida: true,  lidaEm: horasAtras(3), criadoEm: horasAtras(4) },
    { destinatarioId: tecnico3.id,  destinatarioEmail: tecnico3.email,  tipo: 'CHAMADO_TRANSFERIDO',titulo: 'Chamado transferido para você', mensagem: `Chamado ${ancora.c04.OS} transferido para você.`,             chamadoId: ancora.c04.id, chamadoOS: ancora.c04.OS, lida: false, criadoEm: horasAtras(2), dadosExtras: { motivo: 'Requer N3' } },
    { destinatarioId: tecnico3.id,  destinatarioEmail: tecnico3.email,  tipo: 'PRIORIDADE_ALTERADA',titulo: 'Prioridade alterada para P1',  mensagem: `Chamado ${ancora.c06.OS} escalado para P1.`,                  chamadoId: ancora.c06.id, chamadoOS: ancora.c06.OS, lida: false, criadoEm: minutosAtras(30), dadosExtras: { prioridadeNova: 'P1' } },
    { destinatarioId: tecnico1.id,  destinatarioEmail: tecnico1.email,  tipo: 'SLA_VENCENDO',       titulo: 'SLA próximo do vencimento',    mensagem: `Chamado ${ancora.c02.OS} vence em menos de 1 hora.`,          chamadoId: ancora.c02.id, chamadoOS: ancora.c02.OS, lida: false, criadoEm: minutosAtras(15) },
    { destinatarioId: usuario1.id,  destinatarioEmail: usuario1.email,  tipo: 'CHAMADO_ENCERRADO',  titulo: 'Seu chamado foi encerrado',    mensagem: `Chamado ${ancora.c03.OS} encerrado pelo técnico.`,             chamadoId: ancora.c03.id, chamadoOS: ancora.c03.OS, lida: true,  lidaEm: horasAtras(1), criadoEm: horasAtras(1) },
    { destinatarioId: admin.id,     destinatarioEmail: admin.email,     tipo: 'CHAMADO_ABERTO',     titulo: 'Novo chamado aberto',          mensagem: `Chamado ${ancora.c01.OS} aguarda atribuição.`,                  chamadoId: ancora.c01.id, chamadoOS: ancora.c01.OS, lida: false, criadoEm: ancora.c01.geradoEm },
    { destinatarioId: tecnico2.id,  destinatarioEmail: tecnico2.email,  tipo: 'CHAMADO_REABERTO',   titulo: 'Chamado reaberto',             mensagem: `Chamado ${ancora.c07.OS} reaberto pelo usuário.`,              chamadoId: ancora.c07.id, chamadoOS: ancora.c07.OS, lida: false, criadoEm: horasAtras(12) },
    { destinatarioId: tecnico3.id,  destinatarioEmail: tecnico3.email,  tipo: 'SLA_VENCENDO',       titulo: 'SLA crítico — Backup',         mensagem: `Chamado ${ancora.c10.OS} (P2) próximo do vencimento do SLA.`,  chamadoId: ancora.c10.id, chamadoOS: ancora.c10.OS, lida: false, criadoEm: minutosAtras(30), dadosExtras: { minutosRestantes: 45 } },
    { destinatarioId: admin.id,     destinatarioEmail: admin.email,     tipo: 'CHAMADO_ABERTO',     titulo: 'Chamado crítico P1',           mensagem: `Chamado ${ancora.c06.OS} aberto com P1 — servidor fora do ar.`, chamadoId: ancora.c06.id, chamadoOS: ancora.c06.OS, lida: false, criadoEm: ancora.c06.geradoEm },
    { destinatarioId: usuario2.id,  destinatarioEmail: usuario2.email,  tipo: 'CHAMADO_ENCERRADO',  titulo: 'Chamado encerrado automaticamente', mensagem: `Chamado ${ancora.c12.OS} vinculado ao ${ancora.c11.OS}.`, chamadoId: ancora.c12.id, chamadoOS: ancora.c12.OS, lida: false, criadoEm: ancora.c12.vinculadoEm ?? new Date(), dadosExtras: { chamadoPaiOS: ancora.c11.OS } },
  ]);

  log.success('[SUCESSO] Histórico e notificações das âncoras inseridos\n');

  log.title('[8/8] ESTATÍSTICAS FINAIS...\n');

  const [
    nAdmins, nTecnicos, nUsuarios, nServicos, nChamados,
    nTransf, nComent, nAnexos, nNotif, nHistorico,
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
    AtualizacaoChamado.countDocuments(),
  ]);

  // Contagem por status
  const porStatus = await Promise.all(
    Object.values(ChamadoStatus).map(async (s) => ({
      s, n: await prisma.chamado.count({ where: { status: s, deletadoEm: null } }),
    }))
  );

  log.title('\n╔══════════════════════════════════════════╗');
  log.title('║       SEED CONCLUÍDO COM SUCESSO!        ║');
  log.title('╚══════════════════════════════════════════╝\n');

  console.log('CREDENCIAIS\n');
  console.log('── ADMINS ───────────────────────────────────────────');
  console.log('  admin@helpme.com              → Admin123!');
  console.log('  superadmin@helpme.com         → Super123!');
  console.log('  diego.ferreira@helpme.com     → Diego123!\n');
  console.log('── TÉCNICOS ─────────────────────────────────────────');
  console.log('  tecnico@helpme.com            → Tecnico123! [N1 | 08:00–17:00]');
  console.log('  ana.santos@helpme.com         → Tecnico123! [N2 | 08:00–18:00]');
  console.log('  roberto.ferreira@helpme.com   → Tecnico123! [N3 | 09:00–18:00]');
  console.log('  lucas.mendes@helpme.com       → Tecnico123! [N1 | 07:00–16:00]');
  console.log('  camila.rocha@helpme.com       → Tecnico123! [N2 | 10:00–19:00]\n');
  console.log('── USUÁRIOS ─────────────────────────────────────────');
  console.log('  user@helpme.com               → User123! [COMERCIAL]');
  console.log('  maria.costa@helpme.com        → User123! [FINANCEIRO]');
  console.log('  pedro.lima@helpme.com         → User123! [MARKETING]');
  console.log('  fernanda.alves@helpme.com     → User123! [RH]');
  console.log('  rafael.souza@helpme.com       → User123! [OPERACIONAL]');
  console.log('  juliana.pires@helpme.com      → User123! [JURIDICO]');
  console.log('  marcos.nunes@helpme.com       → User123! [DIRETORIA]');
  console.log('  patricia.gomes@helpme.com     → User123! [COMERCIAL]\n');

  console.log('ESTATÍSTICAS\n');
  console.log(`  Admins:         ${nAdmins}`);
  console.log(`  Técnicos:       ${nTecnicos}  (2× N1 | 2× N2 | 1× N3)`);
  console.log(`  Usuários:       ${nUsuarios}  (6 setores)`);
  console.log(`  Serviços:       ${nServicos}  (9 ativos, 1 inativo)`);
  console.log(`  Chamados:       ${nChamados}  (INC0001–INC0102)`);
  porStatus.forEach(({ s, n }) => console.log(`    ${s.padEnd(16)} ${n}`));
  console.log(`  SLA registros:  ${slaOk}  (âncoras)`);
  console.log(`  Transferências: ${nTransf}`);
  console.log(`  Comentários:    ${nComent}`);
  console.log(`  Anexos:         ${nAnexos}`);
  console.log(`  Notificações:   ${nNotif}  (MongoDB)`);
  console.log(`  Histórico:      ${nHistorico}  (MongoDB)\n`);
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