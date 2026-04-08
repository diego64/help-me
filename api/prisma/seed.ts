import { PrismaClient, Regra, Setor, NivelTecnico, ChamadoStatus, PrioridadeChamado } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import mongoose from 'mongoose';
import pkg from 'pg';

const { Pool } = pkg;

const col = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', red: '\x1b[31m', bright: '\x1b[1m', blue: '\x1b[34m',
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

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter, log: ['error', 'warn'] });

type TipoEvento =
  | 'CHAMADO_ABERTO' | 'CHAMADO_ATRIBUIDO' | 'CHAMADO_TRANSFERIDO'
  | 'CHAMADO_REABERTO' | 'PRIORIDADE_ALTERADA' | 'SLA_VENCENDO' | 'CHAMADO_ENCERRADO';

const NotificacaoSchema = new mongoose.Schema({
  destinatarioId:    { type: String, required: true, index: true },
  destinatarioEmail: { type: String, required: true },
  tipo:       { type: String, required: true, enum: ['CHAMADO_ABERTO','CHAMADO_ATRIBUIDO','CHAMADO_TRANSFERIDO','CHAMADO_REABERTO','PRIORIDADE_ALTERADA','SLA_VENCENDO','CHAMADO_ENCERRADO'] },
  titulo:     { type: String, required: true },
  mensagem:   { type: String, required: true },
  chamadoId:  { type: String, required: true, index: true },
  chamadoOS:  { type: String, required: true },
  dadosExtras:{ type: mongoose.Schema.Types.Mixed },
  lida:       { type: Boolean, default: false, index: true },
  lidaEm:     { type: Date },
  criadoEm:   { type: Date, default: Date.now, index: true },
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

const SLA_HORAS: Record<PrioridadeChamado, number> = { P1: 1, P2: 4, P3: 8, P4: 24, P5: 72 };

const IDS = {
  diego:    'cmn0t3cny0000iwn3k0lbekjz',
  marcos:   'cmn0t3co80001iwn3qd8xm8by',
  juliana:  'cmn0t3cod0002iwn3ba526fbl',
  carlos:   'cmn0t3coj0003iwn3gyhj2uaa',
  rafael:   'cmn0t3coo0004iwn3eyvn7ox5',
  patricia: 'cmn0t3cp10005iwn3vvn49vxw',
  ana:      'cmn0t3cpo0006iwn39qadl56k',
  bruno:    'cmn0t3cpw0007iwn38duvdmiy',
  fernanda: 'cmn0t3cqb0008iwn3hn2hrdl2',
  joao:     'cmn0ybz4k0004bhn3gd646eu7',
  murilo:   'cmn0yihvm0007bhn361fi27md',
};

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
  log.title('  SEED DA API PRINCIPAL — HELP ME API  ');
  log.title('========================================\n');

  await prisma.$connect();
  log.success('[SUCESSO] PostgreSQL conectado\n');

  await mongoose.connect(process.env.MONGO_INITDB_URI!);
  log.success('[SUCESSO] MongoDB conectado\n');

  log.warn('[WARN] Limpando banco de dados...\n');
  await Notificacao.deleteMany({});
  await AtualizacaoChamado.deleteMany({});
  await prisma.anexoChamado.deleteMany({});
  await prisma.comentarioChamado.deleteMany({});
  await prisma.transferenciaChamado.deleteMany({});
  await prisma.ordemDeServico.deleteMany({});
  await prisma.chamado.deleteMany({});
  await prisma.expediente.deleteMany({});
  await prisma.servico.deleteMany({});
  await prisma.usuario.deleteMany({});
  log.success('[SUCESSO] Bancos limpos\n');

  log.title('[1/6] CRIANDO USUÁRIOS...\n');

  const diego = await prisma.usuario.upsert({
    where:  { id: IDS.diego },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.diego, nome: 'Diego', sobrenome: 'Ferreira',
      email: 'diego.admin@helpme.com', regra: Regra.ADMIN, ativo: true,
      setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 99999-0001', ramal: '1000',
      avatarUrl: 'https://ui-avatars.com/api/?name=Diego+Ferreira&background=059669&color=fff',
    },
  });
  log.success(`[SUCESSO] ${diego.email} [ADMIN]`);

  const marcos = await prisma.usuario.upsert({
    where:  { id: IDS.marcos },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.marcos, nome: 'Marcos', sobrenome: 'Oliveira',
      email: 'marcos.admin@helpme.com', regra: Regra.ADMIN, ativo: true,
      setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 99999-0002', ramal: '1001',
      avatarUrl: 'https://ui-avatars.com/api/?name=Marcos+Oliveira&background=7C3AED&color=fff',
    },
  });
  log.success(`[SUCESSO] ${marcos.email} [ADMIN]`);

  const juliana = await prisma.usuario.upsert({
    where:  { id: IDS.juliana },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.juliana, nome: 'Juliana', sobrenome: 'Santos',
      email: 'juliana.admin@helpme.com', regra: Regra.ADMIN, ativo: true,
      setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 99999-0003', ramal: '1002',
      avatarUrl: 'https://ui-avatars.com/api/?name=Juliana+Santos&background=0D8ABC&color=fff',
    },
  });
  log.success(`[SUCESSO] ${juliana.email} [ADMIN]\n`);

  const carlos = await prisma.usuario.upsert({
    where:  { id: IDS.carlos },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.carlos, nome: 'Carlos', sobrenome: 'Mendes',
      email: 'carlos.tecnico@helpme.com', regra: Regra.TECNICO,
      nivel: NivelTecnico.N1, ativo: true,
      setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0001', ramal: '3001',
      avatarUrl: 'https://ui-avatars.com/api/?name=Carlos+Mendes&background=EA580C&color=fff',
    },
  });
  log.success(`[SUCESSO] ${carlos.email} [TECNICO N1]`);

  const rafael = await prisma.usuario.upsert({
    where:  { id: IDS.rafael },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.rafael, nome: 'Rafael', sobrenome: 'Lima',
      email: 'rafael.tecnico@helpme.com', regra: Regra.TECNICO,
      nivel: NivelTecnico.N2, ativo: true,
      setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0002', ramal: '3002',
      avatarUrl: 'https://ui-avatars.com/api/?name=Rafael+Lima&background=DB2777&color=fff',
    },
  });
  log.success(`[SUCESSO] ${rafael.email} [TECNICO N2]`);

  const patricia = await prisma.usuario.upsert({
    where:  { id: IDS.patricia },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.patricia, nome: 'Patricia', sobrenome: 'Costa',
      email: 'patricia.tecnico@helpme.com', regra: Regra.TECNICO,
      nivel: NivelTecnico.N3, ativo: true,
      setor: Setor.TECNOLOGIA_INFORMACAO, telefone: '(11) 98765-0003', ramal: '3003',
      avatarUrl: 'https://ui-avatars.com/api/?name=Patricia+Costa&background=2563EB&color=fff',
    },
  });
  log.success(`[SUCESSO] ${patricia.email} [TECNICO N3]\n`);

  const ana = await prisma.usuario.upsert({
    where:  { id: IDS.ana },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.ana, nome: 'Ana', sobrenome: 'Paula',
      email: 'ana.usuario@helpme.com', regra: Regra.USUARIO, ativo: true,
      setor: Setor.COMERCIAL, telefone: '(11) 97654-0001', ramal: '2001',
      avatarUrl: 'https://ui-avatars.com/api/?name=Ana+Paula&background=16A34A&color=fff',
    },
  });
  log.success(`[SUCESSO] ${ana.email} [USUARIO — COMERCIAL]`);

  const bruno = await prisma.usuario.upsert({
    where:  { id: IDS.bruno },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.bruno, nome: 'Bruno', sobrenome: 'Alves',
      email: 'bruno.usuario@helpme.com', regra: Regra.USUARIO, ativo: true,
      setor: Setor.FINANCEIRO, telefone: '(11) 97654-0002', ramal: '2002',
      avatarUrl: 'https://ui-avatars.com/api/?name=Bruno+Alves&background=DC2626&color=fff',
    },
  });
  log.success(`[SUCESSO] ${bruno.email} [USUARIO — FINANCEIRO]`);

  const fernanda = await prisma.usuario.upsert({
    where:  { id: IDS.fernanda },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.fernanda, nome: 'Fernanda', sobrenome: 'Rocha',
      email: 'fernanda.usuario@helpme.com', regra: Regra.USUARIO, ativo: true,
      setor: Setor.MARKETING, telefone: '(11) 97654-0003', ramal: '2003',
      avatarUrl: 'https://ui-avatars.com/api/?name=Fernanda+Rocha&background=9333EA&color=fff',
    },
  });
  log.success(`[SUCESSO] ${fernanda.email} [USUARIO — MARKETING]`);

  const joao = await prisma.usuario.upsert({
    where:  { id: IDS.joao },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.joao, nome: 'João', sobrenome: 'Silva',
      email: 'joao.silva@helpme.com', regra: Regra.USUARIO, ativo: true,
      setor: Setor.RECURSOS_HUMANOS, telefone: '(11) 97654-0004', ramal: '2004',
      avatarUrl: 'https://ui-avatars.com/api/?name=Joao+Silva&background=0891B2&color=fff',
    },
  });
  log.success(`[SUCESSO] ${joao.email} [USUARIO — RH]`);

  const murilo = await prisma.usuario.upsert({
    where:  { id: IDS.murilo },
    update: { ativo: true, deletadoEm: null },
    create: {
      id: IDS.murilo, nome: 'Murilo', sobrenome: 'Silva',
      email: 'murilo.silva@helpme.com', regra: Regra.USUARIO, ativo: true,
      setor: Setor.LOGISTICA, telefone: '(11) 97654-0005', ramal: '2005',
      avatarUrl: 'https://ui-avatars.com/api/?name=Murilo+Silva&background=B45309&color=fff',
    },
  });
  log.success(`[SUCESSO] ${murilo.email} [USUARIO — LOGISTICA]\n`);

  log.title('[2/6] CONFIGURANDO EXPEDIENTES...\n');

  async function criarExpediente(usuarioId: string, entrada: string, saida: string) {
    const entradaDate = new Date(`1970-01-01T${entrada}:00Z`);
    const saidaDate   = new Date(`1970-01-01T${saida}:00Z`);
    const existente   = await prisma.expediente.findFirst({ where: { usuarioId, deletadoEm: null } });
    if (existente) return prisma.expediente.update({ where: { id: existente.id }, data: { entrada: entradaDate, saida: saidaDate, ativo: true, deletadoEm: null } });
    return prisma.expediente.create({ data: { usuarioId, entrada: entradaDate, saida: saidaDate, ativo: true } });
  }

  await criarExpediente(carlos.id,   '08:00', '17:00');
  log.success(`[SUCESSO] ${carlos.nome}: 08:00–17:00`);
  await criarExpediente(rafael.id,   '08:00', '18:00');
  log.success(`[SUCESSO] ${rafael.nome}: 08:00–18:00`);
  await criarExpediente(patricia.id, '09:00', '18:00');
  log.success(`[SUCESSO] ${patricia.nome}: 09:00–18:00\n`);

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

  log.title('[4/6] CRIANDO CHAMADOS...\n');

  const historico: any[] = [];
  const notificacoes: any[] = [];

  const nDiego    = `${diego.nome} ${diego.sobrenome}`;
  const nJuliana  = `${juliana.nome} ${juliana.sobrenome}`;
  const nCarlos   = `${carlos.nome} ${carlos.sobrenome}`;
  const nRafael   = `${rafael.nome} ${rafael.sobrenome}`;
  const nPatricia = `${patricia.nome} ${patricia.sobrenome}`;
  const nAna      = `${ana.nome} ${ana.sobrenome}`;
  const nBruno    = `${bruno.nome} ${bruno.sobrenome}`;
  const nFernanda = `${fernanda.nome} ${fernanda.sobrenome}`;

  const cs = await prisma.$transaction(async (tx) => {

    const c01 = await tx.chamado.create({ data: {
      OS: 'INC0000001', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P3,
      usuarioId: ana.id, geradoEm: hrs(2), atualizadoEm: hrs(2),
      descricao: 'Impressora do setor comercial offline após atualização de driver.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c01.id, servicoId: S['Impressoras e Periféricos'] } });
    historico.push(hAbertura(c01.id, c01.descricao, ana.id, nAna, ana.email, hrs(2)));

    const c02 = await tx.chamado.create({ data: {
      OS: 'INC0000002', status: ChamadoStatus.ABERTO, prioridade: PrioridadeChamado.P4,
      usuarioId: fernanda.id, geradoEm: hrs(3), atualizadoEm: hrs(3),
      descricao: 'Solicitação de instalação do pacote Office 365 em novo notebook.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c02.id, servicoId: S['Instalação de Software'] } });
    historico.push(hAbertura(c02.id, c02.descricao, fernanda.id, nFernanda, fernanda.email, hrs(3)));
    log.success('[SUCESSO] ABERTOS: INC0000001–INC0000002');

    const c03 = await tx.chamado.create({ data: {
      OS: 'INC0000003', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P2,
      usuarioId: bruno.id, tecnicoId: patricia.id,
      geradoEm: hrs(2), atualizadoEm: hrs(1),
      descricao: 'Sistema ERP inacessível para todo o setor financeiro. Erro 503.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c03.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c03.id, autorId: patricia.id, visibilidadeInterna: true,
      comentario: 'Serviço de autenticação reiniciado. Verificando logs do servidor.' }});
    historico.push(hAbertura(c03.id, c03.descricao, bruno.id, nBruno, bruno.email, hrs(2)));
    historico.push(hStatus(c03.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', patricia.id, nPatricia, patricia.email, hrs(1)));

    const c04 = await tx.chamado.create({ data: {
      OS: 'INC0000004', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: ana.id, tecnicoId: carlos.id,
      geradoEm: hrs(4), atualizadoEm: hrs(3),
      descricao: 'VPN corporativa não conecta após atualização do cliente. Erro de certificado SSL.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c04.id, servicoId: S['VPN e Acesso Remoto'] } });
    await tx.comentarioChamado.create({ data: { chamadoId: c04.id, autorId: carlos.id, visibilidadeInterna: false,
      comentario: 'Certificado renovado no servidor. Testando reconexão com o usuário.' }});
    historico.push(hAbertura(c04.id, c04.descricao, ana.id, nAna, ana.email, hrs(4)));
    historico.push(hStatus(c04.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', carlos.id, nCarlos, carlos.email, hrs(3)));

    const c05 = await tx.chamado.create({ data: {
      OS: 'INC0000005', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P3,
      usuarioId: fernanda.id, tecnicoId: rafael.id,
      geradoEm: hrs(5), atualizadoEm: hrs(2),
      descricao: 'Backup noturno falhando há 3 dias. Logs indicam disco cheio no servidor.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c05.id, servicoId: S['Backup e Recuperação'] } });
    await tx.transferenciaChamado.create({ data: {
      chamadoId: c05.id, tecnicoAnteriorId: carlos.id, tecnicoNovoId: rafael.id,
      motivo: 'Problema de infraestrutura requer nível N2.', transferidoPor: diego.id, transferidoEm: hrs(3),
    }});
    historico.push(hAbertura(c05.id, c05.descricao, fernanda.id, nFernanda, fernanda.email, hrs(5)));
    historico.push(hStatus(c05.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', carlos.id, nCarlos, carlos.email, hrs(4)));
    historico.push(hTransferencia(c05.id, carlos.id, rafael.id, 'Requer N2.', diego.id, nDiego, diego.email, hrs(3)));

    const c06 = await tx.chamado.create({ data: {
      OS: 'INC0000006', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: bruno.id, tecnicoId: carlos.id,
      geradoEm: hrs(6), atualizadoEm: hrs(5),
      descricao: 'Mouse sem fio parou de funcionar. Bateria nova não resolve.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c06.id, servicoId: S['Impressoras e Periféricos'] } });
    historico.push(hAbertura(c06.id, c06.descricao, bruno.id, nBruno, bruno.email, hrs(6)));
    historico.push(hStatus(c06.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', carlos.id, nCarlos, carlos.email, hrs(5)));

    log.success('[SUCESSO] EM ATENDIMENTO: INC0000003–INC0000006');

    // ── ENCERRADOS ───────────────────────────────────────────────────────
    const gC07 = dias(4); const eC07 = new Date(gC07.getTime() + 2 * 3_600_000);
    const c07 = await tx.chamado.create({ data: {
      OS: 'INC0000007', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P2,
      usuarioId: ana.id, tecnicoId: rafael.id,
      descricao: 'Servidor de arquivos inacessível para usuários do financeiro.',
      descricaoEncerramento: 'Switch com porta com falha substituído. Acesso restaurado.',
      geradoEm: gC07, encerradoEm: eC07, atualizadoEm: eC07,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c07.id, servicoId: S['Suporte de Rede'] } });
    historico.push(hAbertura(c07.id, c07.descricao, ana.id, nAna, ana.email, gC07));
    historico.push(hStatus(c07.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', rafael.id, nRafael, rafael.email, new Date(gC07.getTime() + 30 * 60_000)));
    historico.push(hStatus(c07.id, 'EM_ATENDIMENTO', 'ENCERRADO', c07.descricaoEncerramento!, rafael.id, nRafael, rafael.email, eC07));

    const gC08 = dias(5); const eC08 = new Date(gC08.getTime() + 5 * 3_600_000);
    const c08 = await tx.chamado.create({ data: {
      OS: 'INC0000008', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P3,
      usuarioId: bruno.id, tecnicoId: carlos.id,
      descricao: 'Email corporativo parou de sincronizar no celular após redefinição de senha.',
      descricaoEncerramento: 'Conta reconfigurada no dispositivo com novo perfil IMAP.',
      geradoEm: gC08, encerradoEm: eC08, atualizadoEm: eC08,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c08.id, servicoId: S['Configuração de Email'] } });
    historico.push(hAbertura(c08.id, c08.descricao, bruno.id, nBruno, bruno.email, gC08));
    historico.push(hStatus(c08.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', carlos.id, nCarlos, carlos.email, new Date(gC08.getTime() + 60 * 60_000)));
    historico.push(hStatus(c08.id, 'EM_ATENDIMENTO', 'ENCERRADO', c08.descricaoEncerramento!, carlos.id, nCarlos, carlos.email, eC08));

    const gC09 = dias(3); const eC09 = new Date(gC09.getTime() + 8 * 3_600_000);
    const c09 = await tx.chamado.create({ data: {
      OS: 'INC0000009', status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
      usuarioId: fernanda.id, tecnicoId: patricia.id,
      descricao: 'Teclado físico com tecla Enter sem resposta após derramamento de líquido.',
      descricaoEncerramento: 'Teclado substituído por unidade reserva.',
      geradoEm: gC09, encerradoEm: eC09, atualizadoEm: eC09,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c09.id, servicoId: S['Manutenção de Hardware'] } });
    historico.push(hAbertura(c09.id, c09.descricao, fernanda.id, nFernanda, fernanda.email, gC09));
    historico.push(hStatus(c09.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', patricia.id, nPatricia, patricia.email, new Date(gC09.getTime() + 3_600_000)));
    historico.push(hStatus(c09.id, 'EM_ATENDIMENTO', 'ENCERRADO', c09.descricaoEncerramento!, patricia.id, nPatricia, patricia.email, eC09));

    log.success('[SUCESSO] ENCERRADOS: INC0000007–INC0000009');

    const gC10 = dias(14); const eC10 = new Date(gC10.getTime() + 36 * 3_600_000);
    const c10 = await tx.chamado.create({ data: {
      OS: 'INC0000010', status: ChamadoStatus.CANCELADO, prioridade: PrioridadeChamado.P4,
      usuarioId: ana.id,
      descricao: 'Solicitação de upgrade de memória RAM de 8GB para 16GB no desktop.',
      descricaoEncerramento: 'Solicitação cancelada — orçamento de hardware congelado.',
      encerradoEm: eC10, geradoEm: gC10, atualizadoEm: eC10,
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c10.id, servicoId: S['Manutenção de Hardware'] } });
    historico.push(hAbertura(c10.id, c10.descricao, ana.id, nAna, ana.email, gC10));
    historico.push(hStatus(c10.id, 'ABERTO', 'CANCELADO', c10.descricaoEncerramento!, diego.id, nDiego, diego.email, eC10));
    log.success('[SUCESSO] CANCELADO: INC0000010');

    const c11 = await tx.chamado.create({ data: {
      OS: 'INC0000011', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P1,
      usuarioId: fernanda.id, tecnicoId: patricia.id,
      prioridadeAlterada: dias(1), prioridadeAlteradaPor: juliana.id,
      descricao: 'Servidor de produção voltou a apresentar instabilidade. Sistema caindo a cada 2h.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c11.id, servicoId: S['Suporte de Rede'] } });
    await tx.comentarioChamado.createMany({ data: [
      { chamadoId: c11.id, autorId: juliana.id,  visibilidadeInterna: true,  comentario: 'Reescalonado P1 — queda recorrente. Possível problema de memória no servidor.' },
      { chamadoId: c11.id, autorId: fernanda.id, visibilidadeInterna: false, comentario: 'Sistema caiu novamente às 14h.' },
    ]});
    historico.push(hAbertura(c11.id, c11.descricao, fernanda.id, nFernanda, fernanda.email, dias(3)));
    historico.push(hStatus(c11.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', patricia.id, nPatricia, patricia.email, dias(3)));
    historico.push(hStatus(c11.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Servidor reiniciado e estável por 12h.', patricia.id, nPatricia, patricia.email, dias(2)));
    historico.push(hPrioridade(c11.id, 'P3', 'P1', juliana.id, nJuliana, juliana.email, dias(1)));
    historico.push(hReavertura(c11.id, 'Instabilidade voltou — reescalonado P1.', fernanda.id, nFernanda, fernanda.email, hrs(20)));

    const c12 = await tx.chamado.create({ data: {
      OS: 'INC0000012', status: ChamadoStatus.REABERTO, prioridade: PrioridadeChamado.P2,
      usuarioId: ana.id, tecnicoId: rafael.id,
      descricao: 'VPN cai após aproximadamente 10 minutos de conexão ativa.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c12.id, servicoId: S['VPN e Acesso Remoto'] } });
    historico.push(hAbertura(c12.id, c12.descricao, ana.id, nAna, ana.email, dias(5)));
    historico.push(hStatus(c12.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', rafael.id, nRafael, rafael.email, dias(5)));
    historico.push(hStatus(c12.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Timeout de sessão ajustado para 8h.', rafael.id, nRafael, rafael.email, dias(2)));
    historico.push(hReavertura(c12.id, 'VPN voltou a cair após ~10min.', ana.id, nAna, ana.email, hrs(36)));

    log.success('[SUCESSO] REABERTOS: INC0000011–INC0000012');

    const c13 = await tx.chamado.create({ data: {
      OS: 'INC0000013', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P1,
      usuarioId: fernanda.id, tecnicoId: patricia.id,
      geradoEm: hrs(3), atualizadoEm: hrs(1),
      descricao: 'Servidor de autenticação LDAP fora do ar. Ninguém consegue fazer login.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c13.id, servicoId: S['Suporte de Rede'] } });
    historico.push(hAbertura(c13.id, c13.descricao, fernanda.id, nFernanda, fernanda.email, hrs(3)));
    historico.push(hStatus(c13.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido com urgência.', patricia.id, nPatricia, patricia.email, hrs(2)));
    notificacoes.push({ destinatarioId: diego.id, destinatarioEmail: diego.email, tipo: 'SLA_VENCENDO' as TipoEvento, titulo: 'SLA VENCIDO — P1 crítico', mensagem: `Chamado INC0000013 (P1) com SLA vencido há 2 horas.`, chamadoId: c13.id, chamadoOS: 'INC0000013', lida: false, criadoEm: hrs(2), dadosExtras: { horasVencido: 2 } });

    const c14 = await tx.chamado.create({ data: {
      OS: 'INC0000014', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P2,
      usuarioId: bruno.id, tecnicoId: rafael.id,
      geradoEm: hrs(7), atualizadoEm: hrs(4),
      descricao: 'Sistema de NF-e retornando erro 999. Faturamento parado.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c14.id, servicoId: S['Suporte Técnico Geral'] } });
    historico.push(hAbertura(c14.id, c14.descricao, bruno.id, nBruno, bruno.email, hrs(7)));
    historico.push(hStatus(c14.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', rafael.id, nRafael, rafael.email, hrs(6)));
    notificacoes.push({ destinatarioId: marcos.id, destinatarioEmail: marcos.email, tipo: 'SLA_VENCENDO' as TipoEvento, titulo: 'SLA VENCIDO — P2', mensagem: `Chamado INC0000014 (P2) com SLA vencido. Faturamento parado.`, chamadoId: c14.id, chamadoOS: 'INC0000014', lida: false, criadoEm: hrs(3), dadosExtras: { horasVencido: 3 } });

    const c15 = await tx.chamado.create({ data: {
      OS: 'INC0000015', status: ChamadoStatus.EM_ATENDIMENTO, prioridade: PrioridadeChamado.P4,
      usuarioId: ana.id, tecnicoId: carlos.id,
      geradoEm: dias(2), atualizadoEm: dias(1),
      descricao: 'Fonte do desktop com ruído anormal. Computador desligando aleatoriamente.',
    }});
    await tx.ordemDeServico.create({ data: { chamadoId: c15.id, servicoId: S['Manutenção de Hardware'] } });
    historico.push(hAbertura(c15.id, c15.descricao, ana.id, nAna, ana.email, dias(2)));
    historico.push(hStatus(c15.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', carlos.id, nCarlos, carlos.email, dias(2)));

    log.success('[SUCESSO] VENCIDOS: INC0000013–INC0000015');

    return { c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15 };
  });

  log.title('[5/6] INSERINDO HISTÓRICO E NOTIFICAÇÕES (MongoDB)...\n');

  notificacoes.push(
    { destinatarioId: diego.id,    destinatarioEmail: diego.email,    tipo: 'CHAMADO_ABERTO'      as TipoEvento, titulo: 'Novo chamado P3 aberto',       mensagem: `O chamado INC0000001 foi aberto e aguarda atribuição.`,            chamadoId: cs.c01.id, chamadoOS: 'INC0000001', lida: false, criadoEm: hrs(2)  },
    { destinatarioId: patricia.id, destinatarioEmail: patricia.email, tipo: 'CHAMADO_ATRIBUIDO'   as TipoEvento, titulo: 'Chamado P2 atribuído a você',  mensagem: `O chamado INC0000003 foi atribuído a você.`,                       chamadoId: cs.c03.id, chamadoOS: 'INC0000003', lida: false, criadoEm: hrs(1)  },
    { destinatarioId: diego.id,    destinatarioEmail: diego.email,    tipo: 'CHAMADO_TRANSFERIDO' as TipoEvento, titulo: 'Transferência realizada',      mensagem: `O chamado INC0000005 foi transferido de Carlos para Rafael.`,      chamadoId: cs.c05.id, chamadoOS: 'INC0000005', lida: true,  lidaEm: hrs(2), criadoEm: hrs(3) },
    { destinatarioId: fernanda.id, destinatarioEmail: fernanda.email, tipo: 'CHAMADO_REABERTO'    as TipoEvento, titulo: 'Chamado reaberto — P1 crítico',mensagem: `Seu chamado INC0000011 foi reaberto e escalado para P1.`,           chamadoId: cs.c11.id, chamadoOS: 'INC0000011', lida: false, criadoEm: hrs(20) },
    { destinatarioId: ana.id,      destinatarioEmail: ana.email,      tipo: 'CHAMADO_ENCERRADO'   as TipoEvento, titulo: 'Chamado encerrado',            mensagem: `Seu chamado INC0000007 foi encerrado com sucesso.`,                chamadoId: cs.c07.id, chamadoOS: 'INC0000007', lida: true,  lidaEm: dias(2), criadoEm: new Date(dias(4).getTime() + 2 * 3_600_000) },
    { destinatarioId: juliana.id,  destinatarioEmail: juliana.email,  tipo: 'SLA_VENCENDO'        as TipoEvento, titulo: 'Múltiplos SLAs vencidos',     mensagem: `3 chamados com SLA vencido aguardam resolução.`,                chamadoId: cs.c13.id, chamadoOS: 'INC0000013', lida: false, criadoEm: hrs(1), dadosExtras: { totalVencidos: 3 } },
  );

  await AtualizacaoChamado.insertMany(historico);
  log.success(`[SUCESSO] ${historico.length} entradas de histórico inseridas`);

  await Notificacao.insertMany(notificacoes);
  log.success(`[SUCESSO] ${notificacoes.length} notificações inseridas\n`);

  log.title('[6/6] ESTATÍSTICAS FINAIS...\n');

  const [
    totalAdmins, totalTecnicos, totalUsuarios, totalServicos,
    totalChamados, totalTransferencias, totalComentarios,
    totalNotificacoes, totalHistorico,
  ] = await Promise.all([
    prisma.usuario.count({ where: { regra: Regra.ADMIN,   deletadoEm: null } }),
    prisma.usuario.count({ where: { regra: Regra.TECNICO, deletadoEm: null } }),
    prisma.usuario.count({ where: { regra: Regra.USUARIO, deletadoEm: null } }),
    prisma.servico.count({ where: { deletadoEm: null } }),
    prisma.chamado.count({ where: { deletadoEm: null } }),
    prisma.transferenciaChamado.count(),
    prisma.comentarioChamado.count({ where: { deletadoEm: null } }),
    Notificacao.countDocuments(),
    AtualizacaoChamado.countDocuments(),
  ]);

  log.title('\n╔══════════════════════════════════════╗');
  log.title('║    SEED CONCLUÍDO COM SUCESSO!       ║');
  log.title('╚══════════════════════════════════════╝\n');

  console.log('USUÁRIOS\n');
  console.log('── ADMINISTRADORES ──────────────────────');
  console.log(`  diego.admin@helpme.com      [ADMIN | TI]`);
  console.log(`  marcos.admin@helpme.com     [ADMIN | TI]`);
  console.log(`  juliana.admin@helpme.com    [ADMIN | TI]\n`);
  console.log('── TÉCNICOS ─────────────────────────────');
  console.log(`  carlos.tecnico@helpme.com   [N1 | 08:00–17:00]`);
  console.log(`  rafael.tecnico@helpme.com   [N2 | 08:00–18:00]`);
  console.log(`  patricia.tecnico@helpme.com [N3 | 09:00–18:00]\n`);
  console.log('── USUÁRIOS ─────────────────────────────');
  console.log(`  ana.usuario@helpme.com      [COMERCIAL]`);
  console.log(`  bruno.usuario@helpme.com    [FINANCEIRO]`);
  console.log(`  fernanda.usuario@helpme.com [MARKETING]`);
  console.log(`  joao.silva@helpme.com       [RH]`);
  console.log(`  murilo.silva@helpme.com     [LOGISTICA]\n`);

  console.log('ESTATÍSTICAS\n');
  console.log(`  Admins:         ${totalAdmins}`);
  console.log(`  Técnicos:       ${totalTecnicos}  (N1: Carlos | N2: Rafael | N3: Patricia)`);
  console.log(`  Usuários:       ${totalUsuarios}`);
  console.log(`  Serviços:       ${totalServicos}  (9 ativos, 1 inativo)`);
  console.log(`  Chamados:       ${totalChamados}  (INC0000001–INC0000015)`);
  console.log(`  Transferências: ${totalTransferencias}`);
  console.log(`  Comentários:    ${totalComentarios}`);
  console.log(`  Notificações:   ${totalNotificacoes}  (MongoDB)`);
  console.log(`  Histórico:      ${totalHistorico}  (MongoDB)\n`);
}

main()
  .catch((error) => {
    log.error('[ERROR] Seed falhou:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await mongoose.disconnect();
    log.success('[SUCESSO] Conexões encerradas\n');
  });