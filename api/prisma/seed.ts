import { PrismaClient, Regra, Setor, ChamadoStatus, NivelTecnico, PrioridadeChamado } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import mongoose from 'mongoose';
import pkg from 'pg';
import { hashPassword } from '../src/shared/config/password';

const { Pool } = pkg;

const col = {
  reset:  '\x1b[0m', green:  '\x1b[32m', yellow: '\x1b[33m',
  cyan:   '\x1b[36m', red:   '\x1b[31m', bright: '\x1b[1m', blue: '\x1b[34m',
};
const log = {
  success: (m: string) => console.log(`${col.green}${m}${col.reset}`),
  info:    (m: string) => console.log(`${col.cyan}${m}${col.reset}`),
  warn:    (m: string) => console.log(`${col.yellow}${m}${col.reset}`),
  error:   (m: string) => console.log(`${col.red}${m}${col.reset}`),
  title:   (m: string) => console.log(`${col.bright}${col.blue}${m}${col.reset}`),
};

if (!process.env.DATABASE_URL)     { log.error('[ERROR] DATABASE_URL não encontrada');     process.exit(1); }
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
  tipo: { type: String, required: true, enum: ['CHAMADO_ABERTO','CHAMADO_ATRIBUIDO','CHAMADO_TRANSFERIDO','CHAMADO_REABERTO','PRIORIDADE_ALTERADA','SLA_VENCENDO','CHAMADO_ENCERRADO'] },
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

const min  = (m: number) => new Date(Date.now() - m * 60_000);
const hrs  = (h: number) => new Date(Date.now() - h * 3_600_000);
const dias = (d: number) => new Date(Date.now() - d * 86_400_000);

// Prazo SLA por prioridade (horas)
const SLA_HORAS: Record<PrioridadeChamado, number> = { P1: 1, P2: 4, P3: 8, P4: 24, P5: 72 };

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
  if (existente) return prisma.expediente.update({ where: { id: existente.id }, data: { entrada: entradaDate, saida: saidaDate, ativo: true, deletadoEm: null } });
  return prisma.expediente.create({ data: { usuarioId, entrada: entradaDate, saida: saidaDate, ativo: true } });
}

function hAbertura(chamadoId: string, descricao: string, autorId: string, autorNome: string, autorEmail: string, dataHora: Date) {
  return { chamadoId, dataHora, tipo: 'ABERTURA', para: 'ABERTO', descricao, autorId, autorNome, autorEmail };
}
function hStatus(chamadoId: string, de: string, para: string, descricao: string, autorId: string, autorNome: string, autorEmail: string, dataHora: Date) {
  return { chamadoId, dataHora, tipo: 'STATUS', de, para, descricao, autorId, autorNome, autorEmail };
}
function hTransferencia(chamadoId: string, deId: string, paraId: string, motivo: string, autorId: string, autorNome: string, autorEmail: string, dataHora: Date) {
  return { chamadoId, dataHora, tipo: 'TRANSFERENCIA', de: deId, para: paraId, descricao: motivo, autorId, autorNome, autorEmail };
}
function hPrioridade(chamadoId: string, de: string, para: string, autorId: string, autorNome: string, autorEmail: string, dataHora: Date) {
  return { chamadoId, dataHora, tipo: 'PRIORIDADE', de, para, descricao: `Prioridade alterada de ${de} para ${para}`, autorId, autorNome, autorEmail };
}
function hReavertura(chamadoId: string, motivo: string, autorId: string, autorNome: string, autorEmail: string, dataHora: Date) {
  return { chamadoId, dataHora, tipo: 'REABERTURA', de: 'ENCERRADO', para: 'REABERTO', descricao: motivo, autorId, autorNome, autorEmail };
}

async function main() {
  log.title('\n========================================');
  log.title('  SEED DO BANCO DE DADOS — HELP ME API  ');
  log.title('========================================\n');

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
  await prisma.anexoChamado.deleteMany({});
  await prisma.comentarioChamado.deleteMany({});
  await prisma.transferenciaChamado.deleteMany({});
  await prisma.ordemDeServico.deleteMany({});
  await prisma.chamado.deleteMany({});
  await prisma.expediente.deleteMany({});
  await prisma.servico.deleteMany({});
  await prisma.usuario.deleteMany({});
  log.success('[SUCESSO] PostgreSQL limpo\n');

  log.title('[1/6] CRIANDO USUÁRIOS...\n');

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

  const tecnico1 = await criarUsuario('tecnico@helpme.com', {
    nome: 'Carlos', sobrenome: 'Silva', email: 'tecnico@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N1,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0001', ramal: '3001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Carlos+Silva&background=EA580C&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico1.email} [TECNICO N1]`);

  const tecnico2 = await criarUsuario('ana.santos@helpme.com', {
    nome: 'Ana', sobrenome: 'Santos', email: 'ana.santos@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N2,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0002', ramal: '3002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Ana+Santos&background=DB2777&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico2.email} [TECNICO N2]`);

  const tecnico3 = await criarUsuario('roberto.ferreira@helpme.com', {
    nome: 'Roberto', sobrenome: 'Ferreira', email: 'roberto.ferreira@helpme.com',
    password: 'Tecnico123!', regra: Regra.TECNICO, nivel: NivelTecnico.N3,
    setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0003', ramal: '3003',
    avatarUrl: 'https://ui-avatars.com/api/?name=Roberto+Ferreira&background=2563EB&color=fff',
  });
  log.success(`[SUCESSO] ${tecnico3.email} [TECNICO N3]\n`);

  const usuario1 = await criarUsuario('user@helpme.com', {
    nome: 'João', sobrenome: 'Oliveira', email: 'user@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.COMERCIAL,
    telefone: '(11) 97654-0001', ramal: '2001',
    avatarUrl: 'https://ui-avatars.com/api/?name=Joao+Oliveira&background=16A34A&color=fff',
  });
  log.success(`[SUCESSO] ${usuario1.email} [USUARIO — COMERCIAL]`);

  const usuario2 = await criarUsuario('maria.costa@helpme.com', {
    nome: 'Maria', sobrenome: 'Costa', email: 'maria.costa@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.FINANCEIRO,
    telefone: '(11) 97654-0002', ramal: '2002',
    avatarUrl: 'https://ui-avatars.com/api/?name=Maria+Costa&background=DC2626&color=fff',
  });
  log.success(`[SUCESSO] ${usuario2.email} [USUARIO — FINANCEIRO]`);

  const usuario3 = await criarUsuario('pedro.lima@helpme.com', {
    nome: 'Pedro', sobrenome: 'Lima', email: 'pedro.lima@helpme.com',
    password: 'User123!', regra: Regra.USUARIO, setor: Setor.MARKETING,
    telefone: '(11) 97654-0003', ramal: '2003',
    avatarUrl: 'https://ui-avatars.com/api/?name=Pedro+Lima&background=9333EA&color=fff',
  });
  log.success(`[SUCESSO] ${usuario3.email} [USUARIO — MARKETING]\n`);

  log.title('[2/6] CONFIGURANDO EXPEDIENTES...\n');
  await criarExpediente(tecnico1.id, '08:00', '17:00');
  log.success(`[SUCESSO] ${tecnico1.nome}: 08:00–17:00`);
  await criarExpediente(tecnico2.id, '08:00', '18:00');
  log.success(`[SUCESSO] ${tecnico2.nome}: 08:00–18:00`);
  await criarExpediente(tecnico3.id, '09:00', '18:00');
  log.success(`[SUCESSO] ${tecnico3.nome}: 09:00–18:00\n`);

  log.title('[3/6] CRIANDO SERVIÇOS...\n');
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
    log.success(`[SUCESSO] ${s.nome} (${s.ativo ? 'ativo' : 'inativo'})`);
  }
  log.info('');

  //  Total: 45 chamados — INC0001 a INC0045
  //
  //  Por status:
  //    ABERTO          2   (INC0001–INC0002)
  //    EM_ATENDIMENTO  10  (INC0003–INC0012)
  //    ENCERRADO       12  (INC0013–INC0024)  ← dentro do prazo SLA (margem verde)
  //    CANCELADO        1  (INC0025)
  //    REABERTO        10  (INC0026–INC0035)
  //    VENCIDO         10  (INC0036–INC0045)  ← EM_ATENDIMENTO com geradoEm muito antigo,
  //                                             prazo SLA já ultrapassado
  //
  //  Por prioridade (45 chamados totais):
  //    P1  4%  →  2
  //    P2 11%  →  5
  //    P3 24%  → 11
  //    P4 46%  → 21
  //    P5 15%  →  6
  //
  //  Distribuição por grupo:
  //  ┌──────────────────┬────┬────┬────┬────┬────┐
  //  │ Status           │ P1 │ P2 │ P3 │ P4 │ P5 │
  //  ├──────────────────┼────┼────┼────┼────┼────┤
  //  │ ABERTO (2)       │  0 │  0 │  1 │  1 │  0 │
  //  │ EM_ATEND. (10)   │  0 │  1 │  2 │  5 │  2 │
  //  │ ENCERRADO (12)   │  0 │  1 │  3 │  6 │  2 │
  //  │ CANCELADO (1)    │  0 │  0 │  0 │  1 │  0 │
  //  │ REABERTO (10)    │  1 │  2 │  3 │  4 │  0 │
  //  │ VENCIDO (10)     │  1 │  1 │  2 │  4 │  2 │
  //  └──────────────────┴────┴────┴────┴────┴────┘
  //  Total               2    5   11   21    6  = 45

  log.title('[4/6] CRIANDO CHAMADOS...\n');

  const historico: any[] = [];
  const notificacoes: any[] = [];

  // Atalhos para nomes completos
  const nA  = `${admin.nome} ${admin.sobrenome}`;
  const nTI = `${adminTI.nome} ${adminTI.sobrenome}`;
  const nT1 = `${tecnico1.nome} ${tecnico1.sobrenome}`;
  const nT2 = `${tecnico2.nome} ${tecnico2.sobrenome}`;
  const nT3 = `${tecnico3.nome} ${tecnico3.sobrenome}`;
  const nU1 = `${usuario1.nome} ${usuario1.sobrenome}`;
  const nU2 = `${usuario2.nome} ${usuario2.sobrenome}`;
  const nU3 = `${usuario3.nome} ${usuario3.sobrenome}`;

  const cs = await prisma.$transaction(async (tx) => {

    // INC0001 — ABERTO P3 — criado há 2h (prazo P3 = 8h → 6h restantes)
    const c01 = await tx.chamado.create({ data: {
      OS: 'INC0001', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario1.id, geradoEm: hrs(2), atualizadoEm: hrs(2),
      descricao: 'Impressora do setor comercial offline após atualização de driver. Todos os documentos estão na fila.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c01.id, servicoId: S['Impressoras e Periféricos'] } });
    historico.push(hAbertura(c01.id, c01.descricao, usuario1.id, nU1, usuario1.email, hrs(2)));

    // INC0002 — ABERTO P4 — criado há 3h (prazo P4 = 24h → 21h restantes)
    const c02 = await tx.chamado.create({ data: {
      OS: 'INC0002', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id, geradoEm: hrs(3), atualizadoEm: hrs(3),
      descricao: 'Solicitação de instalação do pacote Office 365 em novo notebook do setor de marketing.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c02.id, servicoId: S['Instalação de Software'] } });
    historico.push(hAbertura(c02.id, c02.descricao, usuario3.id, nU3, usuario3.email, hrs(3)));

    log.success('[SUCESSO] ABERTOS: INC0001–INC0002');

    // INC0003 — EM_ATENDIMENTO P2 — criado há 2h (prazo P2 = 4h → 2h restantes)
    const c03 = await tx.chamado.create({ data: {
      OS: 'INC0003', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario2.id, tecnicoId: tecnico3.id,
      geradoEm: hrs(2), atualizadoEm: hrs(1),
      descricao: 'Sistema ERP inacessível para todo o setor financeiro. Erro 503 ao tentar autenticar.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c03.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c03.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Serviço de autenticação reiniciado. Verificando logs do servidor de aplicação.' }});
    historico.push(hAbertura(c03.id, c03.descricao, usuario2.id, nU2, usuario2.email, hrs(2)));
    historico.push(hStatus(c03.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Roberto.', tecnico3.id, nT3, tecnico3.email, hrs(1)));

    // INC0004 — EM_ATENDIMENTO P3 — criado há 4h (prazo P3 = 8h → 4h restantes)
    const c04 = await tx.chamado.create({ data: {
      OS: 'INC0004', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario1.id, tecnicoId: tecnico1.id,
      geradoEm: hrs(4), atualizadoEm: hrs(3),
      descricao: 'VPN corporativa não conecta após atualização do cliente. Erro de certificado SSL.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c04.id, servicoId: S['VPN e Acesso Remoto'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c04.id, autorId: tecnico1.id, visibilidadeInterna: false,
      comentario: 'Certificado renovado no servidor. Testando reconexão com o usuário.' }});
    historico.push(hAbertura(c04.id, c04.descricao, usuario1.id, nU1, usuario1.email, hrs(4)));
    historico.push(hStatus(c04.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Carlos.', tecnico1.id, nT1, tecnico1.email, hrs(3)));

    // INC0005 — EM_ATENDIMENTO P3 — criado há 5h, com transferência N1→N2
    const c05 = await tx.chamado.create({ data: {
      OS: 'INC0005', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario3.id, tecnicoId: tecnico2.id,
      geradoEm: hrs(5), atualizadoEm: hrs(2),
      descricao: 'Backup noturno falhando há 3 dias consecutivos. Logs indicam disco cheio no servidor.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c05.id, servicoId: S['Backup e Recuperação'] } });
    await tx.transferenciaChamado.create({ data: {
      chamadoId: c05.id, tecnicoAnteriorId: tecnico1.id, tecnicoNovoId: tecnico2.id,
      motivo: 'Problema de infraestrutura requer nível N2 para acesso ao servidor.', transferidoPor: admin.id, transferidoEm: hrs(3),
    }});
    await tx.comentarioChamado.create({ data: { chamadoId: c05.id, autorId: tecnico2.id, visibilidadeInterna: true,
      comentario: 'Disco com 97% de uso. Arquivando logs de 90 dias para liberar espaço.' }});
    historico.push(hAbertura(c05.id, c05.descricao, usuario3.id, nU3, usuario3.email, hrs(5)));
    historico.push(hStatus(c05.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Carlos.', tecnico1.id, nT1, tecnico1.email, hrs(4)));
    historico.push(hTransferencia(c05.id, tecnico1.id, tecnico2.id, 'Requer N2 para acesso ao servidor.', admin.id, nA, admin.email, hrs(3)));

    // INC0006 — EM_ATENDIMENTO P4 — criado há 6h (prazo P4 = 24h → 18h restantes)
    const c06 = await tx.chamado.create({ data: {
      OS: 'INC0006', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      geradoEm: hrs(6), atualizadoEm: hrs(5),
      descricao: 'Mouse sem fio parou de funcionar. Bateria nova não resolve o problema.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c06.id, servicoId: S['Impressoras e Periféricos'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c06.id, autorId: tecnico1.id, visibilidadeInterna: false,
      comentario: 'Receptor USB com defeito. Novo receptor sendo providenciado.' }});
    historico.push(hAbertura(c06.id, c06.descricao, usuario2.id, nU2, usuario2.email, hrs(6)));
    historico.push(hStatus(c06.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Carlos.', tecnico1.id, nT1, tecnico1.email, hrs(5)));

    // INC0007 — EM_ATENDIMENTO P4 — criado há 8h
    const c07 = await tx.chamado.create({ data: {
      OS: 'INC0007', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      geradoEm: hrs(8), atualizadoEm: hrs(6),
      descricao: 'Outlook travando ao abrir emails com anexos maiores que 5MB.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c07.id, servicoId: S['Configuração de Email'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c07.id, autorId: tecnico2.id, visibilidadeInterna: false,
      comentario: 'PST corrompida identificada. Executando reparação com scanpst.' }});
    historico.push(hAbertura(c07.id, c07.descricao, usuario1.id, nU1, usuario1.email, hrs(8)));
    historico.push(hStatus(c07.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Ana.', tecnico2.id, nT2, tecnico2.email, hrs(6)));

    // INC0008 — EM_ATENDIMENTO P4 — criado há 10h, com comentário interno e público
    const c08 = await tx.chamado.create({ data: {
      OS: 'INC0008', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id, tecnicoId: tecnico1.id,
      geradoEm: hrs(10), atualizadoEm: hrs(7),
      descricao: 'Computador apresentando lentidão extrema ao abrir qualquer aplicativo.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c08.id, servicoId: S['Suporte Técnico Geral'] } });
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c08.id, autorId: tecnico1.id, visibilidadeInterna: true,  comentario: 'HDD com setores defeituosos detectados no S.M.A.R.T. Aguardando HD novo.' },
      { chamadoId: c08.id, autorId: usuario3.id, visibilidadeInterna: false, comentario: 'O computador demora 15 minutos para abrir o Excel. Trabalho parado.' },
    ]});
    historico.push(hAbertura(c08.id, c08.descricao, usuario3.id, nU3, usuario3.email, hrs(10)));
    historico.push(hStatus(c08.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Carlos.', tecnico1.id, nT1, tecnico1.email, hrs(7)));

    // INC0009 — EM_ATENDIMENTO P4 — criado há 12h, com anexo de log
    const c09 = await tx.chamado.create({ data: {
      OS: 'INC0009', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, tecnicoId: tecnico3.id,
      geradoEm: hrs(12), atualizadoEm: hrs(9),
      descricao: 'Scanner não reconhecido após reinstalação do Windows 11. Log de erro em anexo.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c09.id, servicoId: S['Impressoras e Periféricos'] } });
    await tx.anexoChamado.create({ data: {
      chamadoId: c09.id, autorId: usuario2.id,
      nomeArquivo: `INC0009/device-error-${Date.now()}.log`, nomeOriginal: 'device-error.log',
      mimetype: 'text/plain', tamanho: 2048,
      bucketMinio: 'helpme-attachments', objetoMinio: `chamados/${c09.id}/device-error.log`,
    }});
    await tx.comentarioChamado.create({ data: { chamadoId: c09.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Driver WIA corrompido. Baixando driver específico do fabricante.' }});
    historico.push(hAbertura(c09.id, c09.descricao, usuario2.id, nU2, usuario2.email, hrs(12)));
    historico.push(hStatus(c09.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Roberto.', tecnico3.id, nT3, tecnico3.email, hrs(9)));

    // INC0010 — EM_ATENDIMENTO P4 — criado há 15h
    const c10 = await tx.chamado.create({ data: {
      OS: 'INC0010', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      geradoEm: hrs(15), atualizadoEm: hrs(12),
      descricao: 'Fone USB não reconhecido após atualização do Windows. Áudio intermitente.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c10.id, servicoId: S['Suporte Técnico Geral'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c10.id, autorId: tecnico2.id, visibilidadeInterna: false,
      comentario: 'Driver de áudio reinstalado. Aguardando confirmação do usuário.' }});
    historico.push(hAbertura(c10.id, c10.descricao, usuario1.id, nU1, usuario1.email, hrs(15)));
    historico.push(hStatus(c10.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Ana.', tecnico2.id, nT2, tecnico2.email, hrs(12)));

    // INC0011 — EM_ATENDIMENTO P5 — criado há 2 dias (prazo P5 = 72h → 24h restantes)
    const c11 = await tx.chamado.create({ data: {
      OS: 'INC0011', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P5,
      usuarioId: usuario3.id, tecnicoId: tecnico1.id,
      geradoEm: dias(2), atualizadoEm: dias(1),
      descricao: 'Solicitação de mapeamento de nova impressora de rede para o setor de marketing.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c11.id, servicoId: S['Impressoras e Periféricos'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c11.id, autorId: tecnico1.id, visibilidadeInterna: false,
      comentario: 'IP da impressora configurado. Mapeando nos computadores do setor.' }});
    historico.push(hAbertura(c11.id, c11.descricao, usuario3.id, nU3, usuario3.email, dias(2)));
    historico.push(hStatus(c11.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Carlos.', tecnico1.id, nT1, tecnico1.email, dias(2)));

    // INC0012 — EM_ATENDIMENTO P5 — criado há 2 dias e 12h
    const c12 = await tx.chamado.create({ data: {
      OS: 'INC0012', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P5,
      usuarioId: usuario2.id, tecnicoId: tecnico3.id,
      geradoEm: hrs(60), atualizadoEm: hrs(48),
      descricao: 'Requisição de novo perfil de acesso para colaborador promovido ao nível gerencial.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c12.id, servicoId: S['Acesso e Permissões'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c12.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Aguardando aprovação do gestor de TI para liberação dos acessos gerenciais.' }});
    historico.push(hAbertura(c12.id, c12.descricao, usuario2.id, nU2, usuario2.email, hrs(60)));
    historico.push(hStatus(c12.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido pelo técnico Roberto.', tecnico3.id, nT3, tecnico3.email, hrs(48)));

    log.success('[SUCESSO] EM ATENDIMENTO: INC0003–INC0012');

    // INC0013 — ENCERRADO P2 — criado há 4 dias, encerrado em 2h (prazo 4h → cumprido)
    const gC13 = dias(4);
    const eC13 = new Date(gC13.getTime() + 2 * 3_600_000);
    const c13 = await tx.chamado.create({ data: {
      OS: 'INC0013', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      descricao: 'Servidor de arquivos inacessível para usuários do financeiro desde 07h.',
      descricaoEncerramento: 'Switch com porta com falha substituído. Acesso restaurado em 2h.',
      geradoEm: gC13, encerradoEm: eC13, atualizadoEm: eC13,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c13.id, servicoId: S['Suporte de Rede'] } });
    historico.push(hAbertura(c13.id, c13.descricao, usuario1.id, nU1, usuario1.email, gC13));
    historico.push(hStatus(c13.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, new Date(gC13.getTime() + 30 * 60_000)));
    historico.push(hStatus(c13.id, 'EM_ATENDIMENTO', 'ENCERRADO', c13.descricaoEncerramento!, tecnico2.id, nT2, tecnico2.email, eC13));

    // INC0014 — ENCERRADO P3 — criado há 5 dias, encerrado em 5h (prazo 8h → cumprido)
    const gC14 = dias(5);
    const eC14 = new Date(gC14.getTime() + 5 * 3_600_000);
    const c14 = await tx.chamado.create({ data: {
      OS: 'INC0014', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      descricao: 'Email corporativo parou de sincronizar no celular após redefinição de senha.',
      descricaoEncerramento: 'Conta reconfigurada no dispositivo com novo perfil IMAP. Funcionando.',
      geradoEm: gC14, encerradoEm: eC14, atualizadoEm: eC14,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c14.id, servicoId: S['Configuração de Email'] } });
    historico.push(hAbertura(c14.id, c14.descricao, usuario2.id, nU2, usuario2.email, gC14));
    historico.push(hStatus(c14.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, new Date(gC14.getTime() + 60 * 60_000)));
    historico.push(hStatus(c14.id, 'EM_ATENDIMENTO', 'ENCERRADO', c14.descricaoEncerramento!, tecnico1.id, nT1, tecnico1.email, eC14));

    // INC0015 — ENCERRADO P3 — criado há 7 dias, encerrado em 6h
    const gC15 = dias(7);
    const eC15 = new Date(gC15.getTime() + 6 * 3_600_000);
    const c15 = await tx.chamado.create({ data: {
      OS: 'INC0015', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario3.id, tecnicoId: tecnico3.id,
      descricao: 'Impressora fiscal apresentando erro E04 ao tentar emitir cupom fiscal.',
      descricaoEncerramento: 'Driver ECF reinstalado e memória fiscal verificada. Operação normalizada.',
      geradoEm: gC15, encerradoEm: eC15, atualizadoEm: eC15,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c15.id, servicoId: S['Impressoras e Periféricos'] } });
    historico.push(hAbertura(c15.id, c15.descricao, usuario3.id, nU3, usuario3.email, gC15));
    historico.push(hStatus(c15.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, new Date(gC15.getTime() + 90 * 60_000)));
    historico.push(hStatus(c15.id, 'EM_ATENDIMENTO', 'ENCERRADO', c15.descricaoEncerramento!, tecnico3.id, nT3, tecnico3.email, eC15));

    // INC0016 — ENCERRADO P3 — criado há 10 dias, encerrado em 7h, com transferência
    const gC16 = dias(10);
    const eC16 = new Date(gC16.getTime() + 7 * 3_600_000);
    const c16 = await tx.chamado.create({ data: {
      OS: 'INC0016', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      descricao: 'Acesso ao sistema de RH bloqueado após expiração de senha sem aviso prévio.',
      descricaoEncerramento: 'Senha redefinida via Active Directory. Política de aviso configurada.',
      geradoEm: gC16, encerradoEm: eC16, atualizadoEm: eC16,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c16.id, servicoId: S['Acesso e Permissões'] } });
    await tx.transferenciaChamado.create({ data: {
      chamadoId: c16.id, tecnicoAnteriorId: tecnico1.id, tecnicoNovoId: tecnico2.id,
      motivo: 'Acesso ao AD requer nível N2.', transferidoPor: admin.id,
      transferidoEm: new Date(gC16.getTime() + 2 * 3_600_000),
    }});
    historico.push(hAbertura(c16.id, c16.descricao, usuario1.id, nU1, usuario1.email, gC16));
    historico.push(hStatus(c16.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, new Date(gC16.getTime() + 60 * 60_000)));
    historico.push(hTransferencia(c16.id, tecnico1.id, tecnico2.id, 'Requer N2.', admin.id, nA, admin.email, new Date(gC16.getTime() + 2 * 3_600_000)));
    historico.push(hStatus(c16.id, 'EM_ATENDIMENTO', 'ENCERRADO', c16.descricaoEncerramento!, tecnico2.id, nT2, tecnico2.email, eC16));

    // INC0017 — ENCERRADO P4 — criado há 3 dias, encerrado em 8h (prazo 24h → cumprido)
    const gC17 = dias(3);
    const eC17 = new Date(gC17.getTime() + 8 * 3_600_000);
    const c17 = await tx.chamado.create({ data: {
      OS: 'INC0017', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      descricao: 'Teclado físico com tecla Enter sem resposta após derramamento de líquido.',
      descricaoEncerramento: 'Teclado substituído por unidade reserva. Usuário satisfeito.',
      geradoEm: gC17, encerradoEm: eC17, atualizadoEm: eC17,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c17.id, servicoId: S['Manutenção de Hardware'] } });
    historico.push(hAbertura(c17.id, c17.descricao, usuario2.id, nU2, usuario2.email, gC17));
    historico.push(hStatus(c17.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, new Date(gC17.getTime() + 3_600_000)));
    historico.push(hStatus(c17.id, 'EM_ATENDIMENTO', 'ENCERRADO', c17.descricaoEncerramento!, tecnico1.id, nT1, tecnico1.email, eC17));

    // INC0018 — ENCERRADO P4 — criado há 6 dias, encerrado em 10h
    const gC18 = dias(6);
    const eC18 = new Date(gC18.getTime() + 10 * 3_600_000);
    const c18 = await tx.chamado.create({ data: {
      OS: 'INC0018', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id, tecnicoId: tecnico2.id,
      descricao: 'Monitor com linhas horizontais após queda. Imagem distorcida no canto inferior.',
      descricaoEncerramento: 'Monitor substituído por reserva disponível no almoxarifado.',
      geradoEm: gC18, encerradoEm: eC18, atualizadoEm: eC18,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c18.id, servicoId: S['Manutenção de Hardware'] } });
    historico.push(hAbertura(c18.id, c18.descricao, usuario3.id, nU3, usuario3.email, gC18));
    historico.push(hStatus(c18.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, new Date(gC18.getTime() + 3_600_000)));
    historico.push(hStatus(c18.id, 'EM_ATENDIMENTO', 'ENCERRADO', c18.descricaoEncerramento!, tecnico2.id, nT2, tecnico2.email, eC18));

    // INC0019 — ENCERRADO P4 — criado há 8 dias, encerrado em 12h
    const gC19 = dias(8);
    const eC19 = new Date(gC19.getTime() + 12 * 3_600_000);
    const c19 = await tx.chamado.create({ data: {
      OS: 'INC0019', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico3.id,
      descricao: 'Notebook não carrega bateria mesmo com cabo original. LED de carga apagado.',
      descricaoEncerramento: 'Cabo carregador com fio partido substituído. Carregamento normalizado.',
      geradoEm: gC19, encerradoEm: eC19, atualizadoEm: eC19,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c19.id, servicoId: S['Manutenção de Hardware'] } });
    historico.push(hAbertura(c19.id, c19.descricao, usuario1.id, nU1, usuario1.email, gC19));
    historico.push(hStatus(c19.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, new Date(gC19.getTime() + 2 * 3_600_000)));
    historico.push(hStatus(c19.id, 'EM_ATENDIMENTO', 'ENCERRADO', c19.descricaoEncerramento!, tecnico3.id, nT3, tecnico3.email, eC19));

    // INC0020 — ENCERRADO P4 — criado há 12 dias, encerrado em 14h
    const gC20 = dias(12);
    const eC20 = new Date(gC20.getTime() + 14 * 3_600_000);
    const c20 = await tx.chamado.create({ data: {
      OS: 'INC0020', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      descricao: 'Pen drive corporativo não reconhecido em nenhum computador do setor.',
      descricaoEncerramento: 'Pen drive com defeito físico descartado. Novo dispositivo fornecido.',
      geradoEm: gC20, encerradoEm: eC20, atualizadoEm: eC20,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c20.id, servicoId: S['Suporte Técnico Geral'] } });
    historico.push(hAbertura(c20.id, c20.descricao, usuario2.id, nU2, usuario2.email, gC20));
    historico.push(hStatus(c20.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, new Date(gC20.getTime() + 3_600_000)));
    historico.push(hStatus(c20.id, 'EM_ATENDIMENTO', 'ENCERRADO', c20.descricaoEncerramento!, tecnico1.id, nT1, tecnico1.email, eC20));

    // INC0021 — ENCERRADO P4 — criado há 15 dias, encerrado em 18h
    const gC21 = dias(15);
    const eC21 = new Date(gC21.getTime() + 18 * 3_600_000);
    const c21 = await tx.chamado.create({ data: {
      OS: 'INC0021', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id, tecnicoId: tecnico2.id,
      descricao: 'Atalhos da área de trabalho desapareceram após logon em perfil temporário.',
      descricaoEncerramento: 'Perfil de usuário corrompido recriado. Atalhos e configurações restaurados.',
      geradoEm: gC21, encerradoEm: eC21, atualizadoEm: eC21,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c21.id, servicoId: S['Suporte Técnico Geral'] } });
    historico.push(hAbertura(c21.id, c21.descricao, usuario3.id, nU3, usuario3.email, gC21));
    historico.push(hStatus(c21.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, new Date(gC21.getTime() + 2 * 3_600_000)));
    historico.push(hStatus(c21.id, 'EM_ATENDIMENTO', 'ENCERRADO', c21.descricaoEncerramento!, tecnico2.id, nT2, tecnico2.email, eC21));

    // INC0022 — ENCERRADO P4 — criado há 20 dias, encerrado em 20h, hierarquia PAI (c23 é filho)
    const gC22 = dias(20);
    const eC22 = new Date(gC22.getTime() + 20 * 3_600_000);
    const c22 = await tx.chamado.create({ data: {
      OS: 'INC0022', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico3.id,
      descricao: 'Queda geral de rede no 2º andar afetando comercial e marketing.',
      descricaoEncerramento: 'Cabo de backbone danificado substituído. Rede normalizada.',
      geradoEm: gC22, encerradoEm: eC22, atualizadoEm: eC22,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c22.id, servicoId: S['Suporte de Rede'] } });
    historico.push(hAbertura(c22.id, c22.descricao, usuario1.id, nU1, usuario1.email, gC22));
    historico.push(hStatus(c22.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, new Date(gC22.getTime() + 3_600_000)));
    historico.push(hStatus(c22.id, 'EM_ATENDIMENTO', 'ENCERRADO', c22.descricaoEncerramento!, tecnico3.id, nT3, tecnico3.email, eC22));

    // INC0023 — ENCERRADO P4 — FILHO de INC0022 (vinculado, auto-encerrado)
    const vinculoC23 = new Date(gC22.getTime() + 4 * 3_600_000);
    const c23 = await tx.chamado.create({ data: {
      OS: 'INC0023', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, chamadoPaiId: c22.id,
      descricao: 'Sem internet no setor de marketing — mesmo andar que o INC0022.',
      descricaoEncerramento: 'Chamado vinculado ao chamado INC0022',
      vinculadoEm: vinculoC23, vinculadoPor: admin.id,
      encerradoEm: vinculoC23, geradoEm: new Date(gC22.getTime() + 30 * 60_000), atualizadoEm: vinculoC23,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c23.id, servicoId: S['Suporte de Rede'] } });
    historico.push(hAbertura(c23.id, c23.descricao, usuario2.id, nU2, usuario2.email, new Date(gC22.getTime() + 30 * 60_000)));
    historico.push(hStatus(c23.id, 'ABERTO', 'ENCERRADO', 'Chamado vinculado ao INC0022.', admin.id, nA, admin.email, vinculoC23));

    // INC0024 — ENCERRADO P5 — criado há 25 dias, encerrado em 48h (prazo 72h → cumprido)
    const gC24 = dias(25);
    const eC24 = new Date(gC24.getTime() + 48 * 3_600_000);
    const c24 = await tx.chamado.create({ data: {
      OS: 'INC0024', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P5,
      usuarioId: usuario3.id, tecnicoId: tecnico1.id,
      descricao: 'Solicitação de criação de usuário e configuração de acesso para novo estagiário.',
      descricaoEncerramento: 'Usuário criado no AD, emails configurados e acessos liberados conforme perfil.',
      geradoEm: gC24, encerradoEm: eC24, atualizadoEm: eC24,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c24.id, servicoId: S['Acesso e Permissões'] } });
    historico.push(hAbertura(c24.id, c24.descricao, usuario3.id, nU3, usuario3.email, gC24));
    historico.push(hStatus(c24.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, new Date(gC24.getTime() + 5 * 3_600_000)));
    historico.push(hStatus(c24.id, 'EM_ATENDIMENTO', 'ENCERRADO', c24.descricaoEncerramento!, tecnico1.id, nT1, tecnico1.email, eC24));

    log.success('[SUCESSO] ENCERRADOS: INC0013–INC0024');

    const gC25 = dias(14);
    const eC25 = new Date(gC25.getTime() + 36 * 3_600_000);
    const c25 = await tx.chamado.create({ data: {
      OS: 'INC0025', status: ChamadoStatus.CANCELADO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id,
      descricao: 'Solicitação de upgrade de memória RAM de 8GB para 16GB no desktop.',
      descricaoEncerramento: 'Solicitação cancelada — orçamento de hardware congelado no trimestre atual.',
      encerradoEm: eC25, geradoEm: gC25, atualizadoEm: eC25,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c25.id, servicoId: S['Manutenção de Hardware'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c25.id, autorId: admin.id, visibilidadeInterna: false,
      comentario: 'Orçamento de TI congelado até próximo trimestre. Reavaliar em Jan/2026.' }});
    historico.push(hAbertura(c25.id, c25.descricao, usuario1.id, nU1, usuario1.email, gC25));
    historico.push(hStatus(c25.id, 'ABERTO', 'CANCELADO', c25.descricaoEncerramento!, admin.id, nA, admin.email, eC25));

    log.success('[SUCESSO] CANCELADO: INC0025');

    // INC0026 — REABERTO P1 — escalado, problema crítico que voltou
    const c26 = await tx.chamado.create({ data: {
      OS: 'INC0026', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P1,
      usuarioId: usuario3.id, tecnicoId: tecnico3.id,
      prioridadeAlterada: dias(1), prioridadeAlteradaPor: adminTI.id,
      descricao: 'Servidor de produção voltou a apresentar instabilidade. Sistema caindo a cada 2h.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c26.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c26.id, autorId: adminTI.id,  visibilidadeInterna: true,  comentario: 'Reescalonado P1 — queda recorrente. Possível problema de memória no servidor.' },
      { chamadoId: c26.id, autorId: usuario3.id, visibilidadeInterna: false, comentario: 'Sistema caiu novamente às 14h. Usuários não conseguem acessar nada.' },
    ]});
    historico.push(hAbertura(c26.id, c26.descricao, usuario3.id, nU3, usuario3.email, dias(3)));
    historico.push(hStatus(c26.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, dias(3)));
    historico.push(hStatus(c26.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Servidor reiniciado e estável por 12h.', tecnico3.id, nT3, tecnico3.email, dias(2)));
    historico.push(hPrioridade(c26.id, 'P3', 'P1', adminTI.id, nTI, adminTI.email, dias(1)));
    historico.push(hReavertura(c26.id, 'Instabilidade voltou — reescalonado P1.', usuario3.id, nU3, usuario3.email, hrs(20)));

    // INC0027 — REABERTO P2 — VPN reincidente
    const c27 = await tx.chamado.create({ data: {
      OS: 'INC0027', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      descricao: 'VPN cai após aproximadamente 10 minutos de conexão ativa. Problema voltou.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c27.id, servicoId: S['VPN e Acesso Remoto'] } });
    await tx.transferenciaChamado.createMany({ data: [
      { chamadoId: c27.id, tecnicoAnteriorId: tecnico1.id, tecnicoNovoId: tecnico2.id, motivo: 'Requer N2 — configuração de certificado SSL reincidente.', transferidoPor: admin.id, transferidoEm: dias(2) },
    ]});
    await tx.comentarioChamado.create({ data: { chamadoId: c27.id, autorId: usuario1.id, visibilidadeInterna: false,
      comentario: 'VPN caiu novamente 10 minutos após reconexão. Trabalho remoto inviável.' }});
    historico.push(hAbertura(c27.id, c27.descricao, usuario1.id, nU1, usuario1.email, dias(5)));
    historico.push(hStatus(c27.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, dias(5)));
    historico.push(hTransferencia(c27.id, tecnico1.id, tecnico2.id, 'Requer N2.', admin.id, nA, admin.email, dias(2)));
    historico.push(hStatus(c27.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Timeout de sessão ajustado para 8h.', tecnico2.id, nT2, tecnico2.email, dias(2)));
    historico.push(hReavertura(c27.id, 'VPN voltou a cair após ~10min.', usuario1.id, nU1, usuario1.email, hrs(36)));

    // INC0028 — REABERTO P2 — backup reincidente
    const c28 = await tx.chamado.create({ data: {
      OS: 'INC0028', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario2.id, tecnicoId: tecnico3.id,
      descricao: 'Job de backup voltou a falhar após resolução. Erro diferente do original.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c28.id, servicoId: S['Backup e Recuperação'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c28.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Novo erro aponta para problema de permissão na pasta de destino. Verificando ACL.' }});
    historico.push(hAbertura(c28.id, c28.descricao, usuario2.id, nU2, usuario2.email, dias(6)));
    historico.push(hStatus(c28.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, dias(6)));
    historico.push(hStatus(c28.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Espaço em disco liberado. Backup executado com sucesso.', tecnico3.id, nT3, tecnico3.email, dias(4)));
    historico.push(hReavertura(c28.id, 'Backup falhou novamente com erro diferente.', usuario2.id, nU2, usuario2.email, hrs(30)));

    // INC0029 — REABERTO P3 — acesso ao sistema reincidente
    const c29 = await tx.chamado.create({ data: {
      OS: 'INC0029', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario1.id, tecnicoId: tecnico1.id,
      descricao: 'Acesso ao ERP bloqueado novamente após 2 dias da liberação.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c29.id, servicoId: S['Acesso e Permissões'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c29.id, autorId: tecnico1.id, visibilidadeInterna: true,
      comentario: 'Política de grupo sobrescrevendo permissões a cada GPO refresh. Criando exceção.' }});
    historico.push(hAbertura(c29.id, c29.descricao, usuario1.id, nU1, usuario1.email, dias(8)));
    historico.push(hStatus(c29.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, dias(8)));
    historico.push(hStatus(c29.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Permissões corrigidas no AD.', tecnico1.id, nT1, tecnico1.email, dias(7)));
    historico.push(hReavertura(c29.id, 'Acesso bloqueado novamente após 2 dias.', usuario1.id, nU1, usuario1.email, hrs(20)));

    // INC0030 — REABERTO P3 — rede reincidente
    const c30 = await tx.chamado.create({ data: {
      OS: 'INC0030', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario3.id, tecnicoId: tecnico2.id,
      descricao: 'Lentidão de rede voltou no setor financeiro após 3 dias da resolução.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c30.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c30.id, autorId: tecnico2.id, visibilidadeInterna: false,
      comentario: 'Segundo switch com problema identificado — o original apenas mascarava o real.' }});
    historico.push(hAbertura(c30.id, c30.descricao, usuario3.id, nU3, usuario3.email, dias(10)));
    historico.push(hStatus(c30.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, dias(10)));
    historico.push(hStatus(c30.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Loop de rede corrigido.', tecnico2.id, nT2, tecnico2.email, dias(9)));
    historico.push(hReavertura(c30.id, 'Lentidão voltou 3 dias depois.', usuario3.id, nU3, usuario3.email, hrs(15)));

    // INC0031 — REABERTO P3 — email reincidente
    const c31 = await tx.chamado.create({ data: {
      OS: 'INC0031', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      descricao: 'Outlook travando novamente ao abrir emails com anexos. Problema persistente.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c31.id, servicoId: S['Configuração de Email'] } });
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c31.id, autorId: tecnico1.id, visibilidadeInterna: true, comentario: 'Cache do Outlook corrompido novamente. Considerando migração para OWA.' },
      { chamadoId: c31.id, autorId: usuario2.id, visibilidadeInterna: false, comentario: 'É o terceiro chamado sobre o mesmo problema. Precisa de solução definitiva.' },
    ]});
    historico.push(hAbertura(c31.id, c31.descricao, usuario2.id, nU2, usuario2.email, dias(12)));
    historico.push(hStatus(c31.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, dias(12)));
    historico.push(hStatus(c31.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Cache do Outlook limpo. Estável.', tecnico1.id, nT1, tecnico1.email, dias(11)));
    historico.push(hReavertura(c31.id, 'Outlook voltou a travar. Problema persistente.', usuario2.id, nU2, usuario2.email, hrs(10)));

    // INC0032 — REABERTO P4 — driver reincidente
    const c32 = await tx.chamado.create({ data: {
      OS: 'INC0032', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico3.id,
      descricao: 'Impressora voltou a ficar offline após reinício do computador.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c32.id, servicoId: S['Impressoras e Periféricos'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c32.id, autorId: tecnico3.id, visibilidadeInterna: false,
      comentario: 'Driver não persistindo após reinício. Verificando serviço de spooler.' }});
    historico.push(hAbertura(c32.id, c32.descricao, usuario1.id, nU1, usuario1.email, dias(4)));
    historico.push(hStatus(c32.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, dias(4)));
    historico.push(hStatus(c32.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Driver reinstalado. Impressora online.', tecnico3.id, nT3, tecnico3.email, dias(3)));
    historico.push(hReavertura(c32.id, 'Impressora offline novamente após reinício.', usuario1.id, nU1, usuario1.email, hrs(28)));

    // INC0033 — REABERTO P4 — lentidão reincidente
    const c33 = await tx.chamado.create({ data: {
      OS: 'INC0033', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id, tecnicoId: tecnico2.id,
      descricao: 'Computador voltou a ficar lento. Problema reaparece periodicamente.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c33.id, servicoId: S['Suporte Técnico Geral'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c33.id, autorId: tecnico2.id, visibilidadeInterna: true,
      comentario: 'Malware identificado no scan. Máquina comprometida — limpeza em andamento.' }});
    historico.push(hAbertura(c33.id, c33.descricao, usuario3.id, nU3, usuario3.email, dias(6)));
    historico.push(hStatus(c33.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, dias(6)));
    historico.push(hStatus(c33.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Limpeza de disco e desfragmentação realizadas.', tecnico2.id, nT2, tecnico2.email, dias(5)));
    historico.push(hReavertura(c33.id, 'Lentidão voltou — possível causa diferente.', usuario3.id, nU3, usuario3.email, hrs(18)));

    // INC0034 — REABERTO P4 — senha reincidente
    const c34 = await tx.chamado.create({ data: {
      OS: 'INC0034', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, tecnicoId: tecnico1.id,
      descricao: 'Conta bloqueada novamente sem tentativas de login incorretas aparentes.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c34.id, servicoId: S['Acesso e Permissões'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c34.id, autorId: tecnico1.id, visibilidadeInterna: true,
      comentario: 'Script legado com credenciais antigas causando tentativas de login falhas. Desabilitando.' }});
    historico.push(hAbertura(c34.id, c34.descricao, usuario2.id, nU2, usuario2.email, dias(9)));
    historico.push(hStatus(c34.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, dias(9)));
    historico.push(hStatus(c34.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Conta desbloqueada e senha redefinida.', tecnico1.id, nT1, tecnico1.email, dias(8)));
    historico.push(hReavertura(c34.id, 'Conta bloqueada novamente sem motivo aparente.', usuario2.id, nU2, usuario2.email, hrs(12)));

    // INC0035 — REABERTO P4 — hardware reincidente
    const c35 = await tx.chamado.create({ data: {
      OS: 'INC0035', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico2.id,
      descricao: 'Segundo monitor desconecta sozinho após alguns minutos de uso.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c35.id, servicoId: S['Manutenção de Hardware'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c35.id, autorId: tecnico2.id, visibilidadeInterna: false,
      comentario: 'Cabo HDMI substituído não resolveu. Verificando placa de vídeo.' }});
    historico.push(hAbertura(c35.id, c35.descricao, usuario1.id, nU1, usuario1.email, dias(7)));
    historico.push(hStatus(c35.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, dias(7)));
    historico.push(hStatus(c35.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Cabo HDMI defeituoso substituído.', tecnico2.id, nT2, tecnico2.email, dias(6)));
    historico.push(hReavertura(c35.id, 'Monitor desconecta novamente — cabo não era o problema.', usuario1.id, nU1, usuario1.email, hrs(22)));

    log.success('[SUCESSO] REABERTOS: INC0026–INC0035');

    // INC0036 — VENCIDO P1 — aberto há 3h (prazo 1h → vencido há 2h)
    const c36 = await tx.chamado.create({ data: {
      OS: 'INC0036', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P1,
      usuarioId: usuario3.id, tecnicoId: tecnico3.id,
      geradoEm: hrs(3), atualizadoEm: hrs(1),
      descricao: 'Servidor de autenticação LDAP fora do ar. Ninguém consegue fazer login nos sistemas.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c36.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c36.id, autorId: tecnico3.id, visibilidadeInterna: true,  comentario: 'LDAP com corrupção no banco de usuários. Restaurando último snapshot.' },
      { chamadoId: c36.id, autorId: usuario3.id, visibilidadeInterna: false, comentario: 'Toda empresa parada. Nem o sistema de ponto está funcionando.' },
    ]});
    historico.push(hAbertura(c36.id, c36.descricao, usuario3.id, nU3, usuario3.email, hrs(3)));
    historico.push(hStatus(c36.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido com urgência.', tecnico3.id, nT3, tecnico3.email, hrs(2)));
    notificacoes.push({ destinatarioId: adminTI.id, destinatarioEmail: adminTI.email, tipo: 'SLA_VENCENDO' as TipoEvento, titulo: 'SLA VENCIDO — P1 crítico', mensagem: `Chamado INC0036 (P1) com SLA vencido há 2 horas.`, chamadoId: c36.id, chamadoOS: 'INC0036', lida: false, criadoEm: hrs(2), dadosExtras: { horasVencido: 2 } });

    // INC0037 — VENCIDO P2 — aberto há 7h (prazo 4h → vencido há 3h)
    const c37 = await tx.chamado.create({ data: {
      OS: 'INC0037', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P2,
      usuarioId: usuario2.id, tecnicoId: tecnico2.id,
      geradoEm: hrs(7), atualizadoEm: hrs(4),
      descricao: 'Sistema de NF-e retornando erro 999 ao tentar emitir nota fiscal. Faturamento parado.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c37.id, servicoId: S['Suporte Técnico Geral'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c37.id, autorId: tecnico2.id, visibilidadeInterna: true,
      comentario: 'Certificado digital A1 expirado. Aguardando novo certificado da contabilidade.' }});
    historico.push(hAbertura(c37.id, c37.descricao, usuario2.id, nU2, usuario2.email, hrs(7)));
    historico.push(hStatus(c37.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, hrs(6)));
    notificacoes.push({ destinatarioId: admin.id, destinatarioEmail: admin.email, tipo: 'SLA_VENCENDO' as TipoEvento, titulo: 'SLA VENCIDO — P2', mensagem: `Chamado INC0037 (P2) com SLA vencido. Faturamento parado.`, chamadoId: c37.id, chamadoOS: 'INC0037', lida: false, criadoEm: hrs(3), dadosExtras: { horasVencido: 3 } });

    // INC0038 — VENCIDO P3 — aberto há 14h (prazo 8h → vencido há 6h)
    const c38 = await tx.chamado.create({ data: {
      OS: 'INC0038', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario1.id, tecnicoId: tecnico1.id,
      geradoEm: hrs(14), atualizadoEm: hrs(8),
      descricao: 'Acesso remoto via RDP com latência de 3 segundos. Trabalho em home office inviável.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c38.id, servicoId: S['VPN e Acesso Remoto'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c38.id, autorId: tecnico1.id, visibilidadeInterna: false,
      comentario: 'Saturação de banda no link principal detectada. Aguardando janela de manutenção.' }});
    historico.push(hAbertura(c38.id, c38.descricao, usuario1.id, nU1, usuario1.email, hrs(14)));
    historico.push(hStatus(c38.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, hrs(12)));

    // INC0039 — VENCIDO P3 — aberto há 18h (prazo 8h → vencido há 10h)
    const c39 = await tx.chamado.create({ data: {
      OS: 'INC0039', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: usuario3.id, tecnicoId: tecnico3.id,
      geradoEm: hrs(18), atualizadoEm: hrs(10),
      descricao: 'Compartilhamento de tela no Teams não funciona em nenhuma reunião.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c39.id, servicoId: S['Instalação de Software'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c39.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Política de DLP bloqueando o Teams. Solicitando exceção ao gestor de segurança.' }});
    historico.push(hAbertura(c39.id, c39.descricao, usuario3.id, nU3, usuario3.email, hrs(18)));
    historico.push(hStatus(c39.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, hrs(15)));

    // INC0040 — VENCIDO P4 — aberto há 2 dias e 6h (prazo 24h → vencido há 6h)
    const c40 = await tx.chamado.create({ data: {
      OS: 'INC0040', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, tecnicoId: tecnico2.id,
      geradoEm: hrs(30), atualizadoEm: hrs(18),
      descricao: 'Webcam não funciona em videoconferências após atualização do Windows.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c40.id, servicoId: S['Suporte Técnico Geral'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c40.id, autorId: tecnico2.id, visibilidadeInterna: false,
      comentario: 'Driver desatualizado. Baixando versão compatível com o Windows 11 23H2.' }});
    historico.push(hAbertura(c40.id, c40.descricao, usuario2.id, nU2, usuario2.email, hrs(30)));
    historico.push(hStatus(c40.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico2.id, nT2, tecnico2.email, hrs(25)));

    // INC0041 — VENCIDO P4 — aberto há 2 dias (prazo 24h → vencido há 24h)
    const c41 = await tx.chamado.create({ data: {
      OS: 'INC0041', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario1.id, tecnicoId: tecnico1.id,
      geradoEm: dias(2), atualizadoEm: dias(1),
      descricao: 'Fonte do desktop com ruído anormal. Computador desligando aleatoriamente.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c41.id, servicoId: S['Manutenção de Hardware'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c41.id, autorId: tecnico1.id, visibilidadeInterna: true,
      comentario: 'Fonte com defeito confirmado. Aguardando peça no estoque — previsão 3 dias.' }});
    historico.push(hAbertura(c41.id, c41.descricao, usuario1.id, nU1, usuario1.email, dias(2)));
    historico.push(hStatus(c41.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, dias(2)));

    // INC0042 — VENCIDO P4 — aberto há 3 dias (prazo 24h → vencido há 2 dias)
    const c42 = await tx.chamado.create({ data: {
      OS: 'INC0042', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario3.id, tecnicoId: tecnico3.id,
      geradoEm: dias(3), atualizadoEm: dias(2),
      descricao: 'Certificado digital A3 via token USB não reconhecido no sistema.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c42.id, servicoId: S['Acesso e Permissões'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c42.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Driver SafeSign incompatível com Windows 11. Aguardando versão atualizada do fabricante.' }});
    historico.push(hAbertura(c42.id, c42.descricao, usuario3.id, nU3, usuario3.email, dias(3)));
    historico.push(hStatus(c42.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, dias(3)));

    // INC0043 — VENCIDO P4 — aberto há 4 dias (prazo 24h → vencido há 3 dias), com transferência
    const c43 = await tx.chamado.create({ data: {
      OS: 'INC0043', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: usuario2.id, tecnicoId: tecnico2.id,
      geradoEm: dias(4), atualizadoEm: dias(2),
      descricao: 'HD externo de 2TB não reconhecido após formatação acidental pelo usuário.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c43.id, servicoId: S['Backup e Recuperação'] } });
    await tx.transferenciaChamado.create({ data: {
      chamadoId: c43.id, tecnicoAnteriorId: tecnico1.id, tecnicoNovoId: tecnico2.id,
      motivo: 'Recuperação de dados requer ferramentas especializadas de N2.', transferidoPor: admin.id, transferidoEm: dias(3),
    }});
    await tx.comentarioChamado.create({ data: { chamadoId: c43.id, autorId: tecnico2.id, visibilidadeInterna: true,
      comentario: 'Usando TestDisk para reconstruir tabela de partição. Processo lento — 200GB escaneados.' }});
    historico.push(hAbertura(c43.id, c43.descricao, usuario2.id, nU2, usuario2.email, dias(4)));
    historico.push(hStatus(c43.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, dias(4)));
    historico.push(hTransferencia(c43.id, tecnico1.id, tecnico2.id, 'Requer N2.', admin.id, nA, admin.email, dias(3)));

    // INC0044 — VENCIDO P5 — aberto há 5 dias (prazo 72h → vencido há 2 dias)
    const c44 = await tx.chamado.create({ data: {
      OS: 'INC0044', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P5,
      usuarioId: usuario1.id, tecnicoId: tecnico1.id,
      geradoEm: dias(5), atualizadoEm: dias(3),
      descricao: 'Solicitação de troca de gabinete de desktop com tampa danificada.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c44.id, servicoId: S['Manutenção de Hardware'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c44.id, autorId: tecnico1.id, visibilidadeInterna: false,
      comentario: 'Gabinete reserva em falta no estoque. Solicitação de compra aberta — prazo 7 dias.' }});
    historico.push(hAbertura(c44.id, c44.descricao, usuario1.id, nU1, usuario1.email, dias(5)));
    historico.push(hStatus(c44.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico1.id, nT1, tecnico1.email, dias(5)));

    // INC0045 — VENCIDO P5 — aberto há 6 dias (prazo 72h → vencido há 3 dias)
    const c45 = await tx.chamado.create({ data: {
      OS: 'INC0045', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P5,
      usuarioId: usuario3.id, tecnicoId: tecnico3.id,
      geradoEm: dias(6), atualizadoEm: dias(4),
      descricao: 'Solicitação de instalação de fonte de dados ODBC para relatórios do Excel.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c45.id, servicoId: S['Instalação de Software'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c45.id, autorId: tecnico3.id, visibilidadeInterna: true,
      comentario: 'Driver ODBC para SQL Server 2019 instalado. Testando conexão com string de conexão correta.' }});
    historico.push(hAbertura(c45.id, c45.descricao, usuario3.id, nU3, usuario3.email, dias(6)));
    historico.push(hStatus(c45.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', tecnico3.id, nT3, tecnico3.email, dias(6)));

    log.success('[SUCESSO] VENCIDOS: INC0036–INC0045');

    return { c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12,
             c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23, c24,
             c25, c26, c27, c28, c29, c30, c31, c32, c33, c34, c35,
             c36, c37, c38, c39, c40, c41, c42, c43, c44, c45 };
  });

  log.title('[5/6] INSERINDO HISTÓRICO E NOTIFICAÇÕES (MongoDB)...\n');

  // Notificações fixas das âncoras
  notificacoes.push(
    { destinatarioId: admin.id,     destinatarioEmail: admin.email,     tipo: 'CHAMADO_ABERTO'      as TipoEvento, titulo: 'Novo chamado P3 aberto',         mensagem: `O chamado INC0001 foi aberto e aguarda atribuição.`,                     chamadoId: cs.c01.id, chamadoOS: 'INC0001', lida: false, criadoEm: hrs(2)         },
    { destinatarioId: admin.id,     destinatarioEmail: admin.email,     tipo: 'CHAMADO_ABERTO'      as TipoEvento, titulo: 'Novo chamado P4 aberto',         mensagem: `O chamado INC0002 foi aberto e aguarda atribuição.`,                     chamadoId: cs.c02.id, chamadoOS: 'INC0002', lida: false, criadoEm: hrs(3)         },
    { destinatarioId: tecnico3.id,  destinatarioEmail: tecnico3.email,  tipo: 'CHAMADO_ATRIBUIDO'   as TipoEvento, titulo: 'Chamado P2 atribuído',           mensagem: `O chamado INC0003 foi atribuído a você.`,                                chamadoId: cs.c03.id, chamadoOS: 'INC0003', lida: false, criadoEm: hrs(1)         },
    { destinatarioId: admin.id,     destinatarioEmail: admin.email,     tipo: 'CHAMADO_TRANSFERIDO' as TipoEvento, titulo: 'Transferência realizada',        mensagem: `O chamado INC0005 foi transferido de Carlos para Ana.`,                  chamadoId: cs.c05.id, chamadoOS: 'INC0005', lida: true,  lidaEm: hrs(2), criadoEm: hrs(3) },
    { destinatarioId: usuario3.id,  destinatarioEmail: usuario3.email,  tipo: 'CHAMADO_REABERTO'    as TipoEvento, titulo: 'Chamado reaberto — P1 crítico',  mensagem: `Seu chamado INC0026 foi reaberto e escalado para P1.`,                  chamadoId: cs.c26.id, chamadoOS: 'INC0026', lida: false, criadoEm: hrs(20)        },
    { destinatarioId: tecnico2.id,  destinatarioEmail: tecnico2.email,  tipo: 'CHAMADO_REABERTO'    as TipoEvento, titulo: 'Chamado reaberto',               mensagem: `O chamado INC0027 foi reaberto pelo usuário.`,                           chamadoId: cs.c27.id, chamadoOS: 'INC0027', lida: false, criadoEm: hrs(36)        },
    { destinatarioId: usuario1.id,  destinatarioEmail: usuario1.email,  tipo: 'CHAMADO_ENCERRADO'   as TipoEvento, titulo: 'Chamado encerrado',              mensagem: `Seu chamado INC0017 foi encerrado com sucesso.`,                        chamadoId: cs.c17.id, chamadoOS: 'INC0017', lida: true,  lidaEm: dias(2), criadoEm: new Date(dias(3).getTime() + 8 * 3_600_000) },
    { destinatarioId: adminTI.id,   destinatarioEmail: adminTI.email,   tipo: 'SLA_VENCENDO'        as TipoEvento, titulo: 'Atenção: múltiplos SLAs vencidos', mensagem: `10 chamados com SLA vencido aguardam resolução.`,                     chamadoId: cs.c36.id, chamadoOS: 'INC0036', lida: false, criadoEm: hrs(1), dadosExtras: { totalVencidos: 10 } },
    { destinatarioId: usuario2.id,  destinatarioEmail: usuario2.email,  tipo: 'CHAMADO_ENCERRADO'   as TipoEvento, titulo: 'Chamado vinculado e encerrado',  mensagem: `O chamado INC0023 foi vinculado ao INC0022 e encerrado.`,               chamadoId: cs.c23.id, chamadoOS: 'INC0023', lida: false, criadoEm: dias(20), dadosExtras: { chamadoPaiOS: 'INC0022' } },
    { destinatarioId: tecnico1.id,  destinatarioEmail: tecnico1.email,  tipo: 'PRIORIDADE_ALTERADA' as TipoEvento, titulo: 'Chamado escalado para P1',       mensagem: `O chamado INC0026 foi escalado para P1 por Diego Ferreira.`,            chamadoId: cs.c26.id, chamadoOS: 'INC0026', lida: false, criadoEm: dias(1), dadosExtras: { prioridadeNova: 'P1', alteradoPor: adminTI.email } },
  );

  await AtualizacaoChamado.insertMany(historico);
  log.success(`[SUCESSO] ${historico.length} entradas de histórico inseridas`);

  await Notificacao.insertMany(notificacoes);
  log.success(`[SUCESSO] ${notificacoes.length} notificações inseridas\n`);

  log.title('[6/6] ESTATÍSTICAS FINAIS...\n');

  const [
    totalAdmins, totalTecnicos, totalUsuarios, totalServicos,
    totalChamados, totalTransferencias, totalComentarios, totalAnexos,
    totalNotificacoes, totalHistorico,
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

  const porStatus = await Promise.all(
    Object.values(ChamadoStatus).map(async (s) => ({
      s, n: await prisma.chamado.count({ where: { status: s, deletadoEm: null } }),
    }))
  );

  // Vencidos = EM_ATENDIMENTO com geradoEm antes do prazo
  const agora = Date.now();
  const todosEm = await prisma.chamado.findMany({ where: { status: ChamadoStatus.EM_ATENDIMENTO, deletadoEm: null }, select: { prioridade: true, geradoEm: true } });
  const vencidos = todosEm.filter(c => {
    const prazoMs = SLA_HORAS[c.prioridade] * 3_600_000;
    return c.geradoEm.getTime() + prazoMs < agora;
  }).length;

  log.title('\n╔══════════════════════════════════════╗');
  log.title('║    SEED CONCLUÍDO COM SUCESSO!       ║');
  log.title('╚══════════════════════════════════════╝\n');

  console.log('CREDENCIAIS\n');
  console.log('── ADMINISTRADORES ──────────────────────');
  console.log('  admin@helpme.com              → Admin123!');
  console.log('  superadmin@helpme.com         → Super123!');
  console.log('  diego.ferreira@helpme.com     → Diego123!\n');
  console.log('── TÉCNICOS ─────────────────────────────');
  console.log('  tecnico@helpme.com            → Tecnico123! [N1 | 08:00–17:00]');
  console.log('  ana.santos@helpme.com         → Tecnico123! [N2 | 08:00–18:00]');
  console.log('  roberto.ferreira@helpme.com   → Tecnico123! [N3 | 09:00–18:00]\n');
  console.log('── USUÁRIOS ─────────────────────────────');
  console.log('  user@helpme.com               → User123! [COMERCIAL]');
  console.log('  maria.costa@helpme.com        → User123! [FINANCEIRO]');
  console.log('  pedro.lima@helpme.com         → User123! [MARKETING]\n');

  console.log('ESTATÍSTICAS\n');
  console.log(`  Admins:          ${totalAdmins}`);
  console.log(`  Técnicos:        ${totalTecnicos}  (N1: Carlos | N2: Ana | N3: Roberto)`);
  console.log(`  Usuários:        ${totalUsuarios}`);
  console.log(`  Serviços:        ${totalServicos}  (9 ativos, 1 inativo)`);
  console.log(`  Chamados:        ${totalChamados}  (INC0001–INC0045)`);
  porStatus.forEach(({ s, n }) => {
    const extra = s === ChamadoStatus.EM_ATENDIMENTO ? `  (${vencidos} vencidos SLA)` : '';
    console.log(`    ${s.padEnd(17)} ${n}${extra}`);
  });
  console.log(`  Prioridades:     P1:2  P2:5  P3:11  P4:21  P5:6`);
  console.log(`  ├─ Hierarquia:   INC0022 ← INC0023`);
  console.log(`  ├─ Reabertos:    INC0026–INC0035 (10)`);
  console.log(`  └─ Vencidos SLA: INC0036–INC0045 (${vencidos} ativos)`);
  console.log(`  Transferências:  ${totalTransferencias}`);
  console.log(`  Comentários:     ${totalComentarios}`);
  console.log(`  Anexos:          ${totalAnexos}`);
  console.log(`  Notificações:    ${totalNotificacoes}  (MongoDB)`);
  console.log(`  Histórico:       ${totalHistorico}  (MongoDB)\n`);
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