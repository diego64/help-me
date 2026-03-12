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

const DESCRICOES_ABERTO = [
  'Impressora do setor offline após atualização de driver.',
  'Solicitação de instalação de software no notebook.',
  'Monitor com flickering intermitente.',
  'Mouse sem resposta após atualização do sistema.',
  'Teclado com teclas travando aleatoriamente.',
  'Computador não liga após queda de energia.',
  'Webcam não detectada no gerenciador de dispositivos.',
  'Fone USB sem áudio após atualização do Windows.',
  'Cabo de rede com mau contato intermitente.',
  'Solicitação de nova conta de e-mail corporativo.',
  'Configuração de segundo monitor solicitada.',
  'Acesso ao sistema bloqueado por política de grupo.',
  'Solicitação de impressora de rede no departamento.',
  'Notebook com bateria não carregando.',
  'Software legado incompatível com novo SO.',
  'Solicitação de aumento de cota de disco no servidor.',
  'VPN não conecta no novo notebook corporativo.',
  'Pendrive criptografado não reconhecido.',
  'Certificado digital expirado na máquina do usuário.',
  'Solicitação de instalação de leitor de código de barras.',
  'Scanner Fujitsu com erro ao digitalizar.',
  'Outlook não abre após atualização do pacote Office.',
];

const DESCRICOES_EM_ATENDIMENTO = [
  'Sistema ERP inacessível para o setor financeiro.',
  'VPN corporativa caindo após 10 minutos de uso.',
  'Backup noturno falhando há dias consecutivos.',
  'Servidor de arquivos lento com alta latência.',
  'Acesso ao banco de dados bloqueado por firewall.',
  'Impressora fiscal com erro ao emitir cupom.',
  'Servidor de email com fila de entrega travada.',
  'HD externo não reconhecido após queda.',
  'Driver de rede desapareceu após formatação.',
  'Certificado SSL do servidor web expirado.',
  'Ponto eletrônico offline — funcionários sem registrar.',
  'NF-e retornando erro 999 ao emitir nota fiscal.',
  'Acesso RDP com latência de 3 segundos.',
  'Teams não permite compartilhamento de tela.',
  'Servidor DHCP não atribuindo IPs no segundo andar.',
  'Antivírus consumindo 100% de CPU em loop.',
  'Banco de dados com espaço em disco crítico.',
  'Proxy bloqueando acesso ao sistema de CRM.',
  'Switch com porta com defeito afetando vários usuários.',
  'Servidor de impressão offline após atualização.',
  'Fonte do servidor de arquivos com ruído anormal.',
  'RAID em degradação — disco com falha detectado.',
  'Sistema de ponto com integração quebrada.',
  'Acesso SSH ao servidor de produção negado.',
  'Roteador principal reiniciando sozinho a cada hora.',
];

const DESCRICOES_ENCERRADO = [
  'Servidor de arquivos inacessível — switch com porta defeituosa substituído.',
  'Email corporativo reconfigurado com novo perfil IMAP.',
  'Impressora fiscal — driver ECF reinstalado.',
  'Acesso ao AD desbloqueado — política de senha ajustada.',
  'Teclado físico substituído por unidade reserva.',
  'Monitor substituído por reserva disponível no almoxarifado.',
  'Cabo carregador com fio partido substituído.',
  'Pen drive com defeito descartado — novo fornecido.',
  'Atalhos da área de trabalho restaurados — perfil recriado.',
  'Queda de rede — cabo de backbone danificado substituído.',
  'Usuário criado no AD, emails configurados.',
  'Cache do Outlook limpo — estável.',
  'Driver WIA corrompido reinstalado.',
  'Memória RAM com defeito substituída.',
  'Atualização do firmware do roteador resolveu instabilidade.',
  'Permissão de pasta corrigida no servidor de arquivos.',
  'IP fixo configurado para impressora de rede.',
  'Certificado digital A1 renovado com sucesso.',
  'Script legado com credenciais antigas desativado.',
  'Upgrade de memória realizado — desempenho normalizado.',
  'Configuração de VPN atualizada — conexão estável.',
  'Driver de vídeo reinstalado — segundo monitor funcionando.',
  'Política de GPO ajustada — acesso restaurado.',
  'Solicitação de novo estagiário atendida — acessos liberados.',
  'Disco cheio — logs arquivados, espaço liberado.',
  'Switch substituído — rede normalizada no andar.',
  'Backup configurado com nova política de retenção.',
  'Perfil do Outlook recriado — emails sincronizando.',
  'BIOS atualizado — problema de inicialização resolvido.',
  'Compartilhamento de pasta recriado com permissões corretas.',
];

const DESCRICOES_CANCELADO = [
  'Solicitação de upgrade de RAM cancelada — orçamento congelado.',
  'Pedido de notebook novo cancelado — equipamento reaproveitado.',
  'Solicitação de novo monitor cancelada — unidade reserva localizada.',
  'Pedido de licença adicional cancelado — licença remanejada.',
  'Solicitação de impressora cancelada — setor reorganizado.',
  'Upgrade de HD cancelado — SSD sendo providenciado pelo financeiro.',
  'Pedido de headset cancelado — estoque encontrado.',
  'Solicitação de dock station cancelada — usuário em home office.',
  'Pedido de KVM cancelado — departamento fechado.',
  'Solicitação de cabo HDMI extra cancelada — item localizado.',
  'Pedido de expansão de disco cancelado — dados migrados.',
];

const DESCRICOES_REABERTO = [
  'VPN voltou a cair após 10 minutos da resolução.',
  'Backup voltou a falhar com erro diferente.',
  'Acesso ao ERP bloqueado novamente após 2 dias.',
  'Lentidão de rede voltou no setor financeiro.',
  'Outlook travando novamente ao abrir emails com anexos.',
  'Impressora voltou a ficar offline após reinício.',
  'Computador volta a ficar lento periodicamente.',
  'Conta bloqueada novamente sem tentativas incorretas.',
  'Segundo monitor desconecta sozinho após uso.',
  'Servidor voltou a apresentar instabilidade intermitente.',
  'Acesso ao sistema de RH bloqueado novamente.',
  'Certificado SSL voltou a expirar — renovação automática não funcionou.',
  'Driver de impressora removido após atualização do Windows.',
  'VPN com timeout reduzido após atualização do servidor.',
  'Permissão de pasta removida após refresh de GPO.',
  'Ponto eletrônico offline novamente após reinício.',
  'Antivírus voltou a travar em loop de scan.',
  'Latência de RDP voltou após expansão do link.',
  'HD externo voltou a falhar no reconhecimento.',
  'Email com bounce intermitente voltou a ocorrer.',
  'Scanner descalibrado após atualização de driver.',
  'Backup incremental falhando novamente às 03h.',
];

const DESCRICOES_VENCIDO = [
  'Servidor LDAP fora do ar — logins impossibilitados.',
  'NF-e com erro 999 — certificado digital A1 expirado.',
  'Acesso RDP com latência extrema — trabalho inviável.',
  'Teams bloqueado por política DLP.',
  'Webcam não funciona em videoconferências.',
  'Fonte do desktop com ruído — desligamentos aleatórios.',
  'Certificado A3 por token USB não reconhecido.',
  'HD externo de 2TB não reconhecido após formatação.',
  'Gabinete de desktop com tampa danificada.',
  'Driver ODBC para SQL Server não instalado.',
  'Servidor web com certificado SSL expirado há 2 dias.',
  'RAID em degradação — IO com latência alta.',
  'Servidor de email com fila de 300 mensagens travada.',
  'Backup full não executado há 5 dias.',
  'Switch de core com porta trunk com defeito.',
  'Ponto eletrônico sem comunicação com servidor.',
  'Sistema de CRM inacessível por erro de banco.',
  'VPN com autenticação quebrada para filial.',
  'Servidor de impressão offline — 80 usuários afetados.',
  'Firewall com regra incorreta bloqueando ERP.',
  'Roteador principal com logs de erro críticos.',
  'Licença do servidor de banco de dados expirada.',
];

const SERVICOS_LISTA = [
  'Suporte Técnico Geral', 'Instalação de Software', 'Manutenção de Hardware',
  'Suporte de Rede', 'Backup e Recuperação', 'Configuração de Email',
  'Acesso e Permissões', 'Impressoras e Periféricos', 'VPN e Acesso Remoto',
];

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length];
}

async function main() {
  log.title('\n========================================');
  log.title('  SEED DO BANCO DE DADOS — HELP ME API  ');
  log.title('  ESCALA: 500 CHAMADOS                  ');
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

  //  Total: 500 chamados — INC0001 a INC0500
  //
  //  Distribuição por status (proporcional ao seed original de 45):
  //    ABERTO           22   (4.4%)
  //    EM_ATENDIMENTO  111  (22.2%)
  //    ENCERRADO       133  (26.6%)
  //    CANCELADO        11   (2.2%)
  //    REABERTO        111  (22.2%)
  //    VENCIDO         112  (22.4%)  ← EM_ATENDIMENTO com SLA ultrapassado
  //
  //  Distribuição por prioridade:
  //    P1  22   (4.4%)
  //    P2  56  (11.2%)
  //    P3 122  (24.4%)
  //    P4 233  (46.6%)
  //    P5  67  (13.4%)
  //
  //  Âncoras fixas (mantidas do seed original):
  //    INC0001 — ABERTO P3
  //    INC0002 — ABERTO P4
  //    INC0022 — ENCERRADO P4 (PAI)
  //    INC0023 — ENCERRADO P4 (FILHO de INC0022, vinculado)
  //    INC0026 — REABERTO P1 escalado
  //    INC0036 — VENCIDO P1 crítico

  log.title('[4/6] CRIANDO CHAMADOS...\n');

  // Atalhos para nomes completos
  const nA  = `${admin.nome} ${admin.sobrenome}`;
  const nTI = `${adminTI.nome} ${adminTI.sobrenome}`;
  const nT1 = `${tecnico1.nome} ${tecnico1.sobrenome}`;
  const nT2 = `${tecnico2.nome} ${tecnico2.sobrenome}`;
  const nT3 = `${tecnico3.nome} ${tecnico3.sobrenome}`;
  const nU1 = `${usuario1.nome} ${usuario1.sobrenome}`;
  const nU2 = `${usuario2.nome} ${usuario2.sobrenome}`;
  const nU3 = `${usuario3.nome} ${usuario3.sobrenome}`;

  const tecnicos  = [tecnico1, tecnico2, tecnico3];
  const nomesT    = [nT1, nT2, nT3];
  const usuarios  = [usuario1, usuario2, usuario3];
  const nomesU    = [nU1, nU2, nU3];

  const historico: any[] = [];
  const notificacoes: any[] = [];

  // Grupos gerados programaticamente com distribuição de prioridade interna:
  //
  //   ABERTO (22):
  //     P1: 1  P2: 2  P3: 5  P4:10  P5: 4
  //   EM_ATENDIMENTO (111):
  //     P1: 5  P2:12  P3:27  P4:52  P5:15
  //   ENCERRADO (133):
  //     P1: 6  P2:15  P3:33  P4:62  P5:17
  //   CANCELADO (11):
  //     P1: 0  P2: 1  P3: 3  P4: 5  P5: 2
  //   REABERTO (111):
  //     P1: 5  P2:12  P3:27  P4:52  P5:15
  //   VENCIDO (112):
  //     P1: 5  P2:12  P3:27  P4:52  P5:16

  // Gerador de sequência de prioridades para um grupo
  function gerarSequenciaPrioridades(dist: Record<string, number>): PrioridadeChamado[] {
    const seq: PrioridadeChamado[] = [];
    for (const [p, n] of Object.entries(dist)) {
      for (let i = 0; i < n; i++) seq.push(p as PrioridadeChamado);
    }
    // Embaralhar deterministicamente (intercalar ao invés de aleatório)
    const resultado: PrioridadeChamado[] = [];
    const total = seq.length;
    for (let i = 0; i < total; i++) {
      // Distribui os grupos intercalados: P1,P2,P3... round-robin proporcional
      const idx = (i * 7 + 3) % total; // salto primo para boa distribuição
      resultado.push(seq[idx]);
    }
    return resultado;
  }

  // Gerador sequencial determinístico usando um cursor numérico
  let cursor = 0; // INC0001
  let chamadoPai: any = null; // para hierarquia INC0022/INC0023

  function nextOS(): string {
    cursor++;
    return `INC${String(cursor).padStart(4, '0')}`;
  }

  log.info('[INFO] Criando ABERTOS (22)...');

  const distAberto = { P1: 1, P2: 2, P3: 5, P4: 10, P5: 4 };
  const seqAberto  = gerarSequenciaPrioridades(distAberto);

  const chamadosAbertos: any[] = [];
  for (let i = 0; i < 22; i++) {
    const OS    = nextOS();
    const prio  = seqAberto[i];
    const u     = usuarios[i % 3];
    const nU    = nomesU[i % 3];
    const desc  = pick(DESCRICOES_ABERTO, i);
    const serv  = pick(SERVICOS_LISTA, i);
    const gerado = hrs(2 + i * 1.5); // Distribuído de 2h a ~35h atrás

    const c = await prisma.chamado.create({ data: {
      OS, status: ChamadoStatus.ABERTO, prioridade: prio as PrioridadeChamado,
      usuarioId: u.id, geradoEm: gerado, atualizadoEm: gerado,
      descricao: desc,
    }});
    await prisma.ordemDeServico.create({ data: { chamadoId: c.id, servicoId: S[serv] } });
    historico.push(hAbertura(c.id, desc, u.id, nU, u.email, gerado));
    chamadosAbertos.push(c);
  }
  log.success(`[SUCESSO] ABERTOS: INC0001–INC${String(cursor).padStart(4, '0')}`);

  log.info('[INFO] Criando EM ATENDIMENTO (111)...');

  const distEM = { P1: 5, P2: 12, P3: 27, P4: 52, P5: 15 };
  const seqEM  = gerarSequenciaPrioridades(distEM);

  const inicioEM = cursor + 1;
  for (let i = 0; i < 111; i++) {
    const OS   = nextOS();
    const prio = seqEM[i];
    const u    = usuarios[i % 3];
    const nU   = nomesU[i % 3];
    const t    = tecnicos[i % 3];
    const nT   = nomesT[i % 3];
    const desc = pick(DESCRICOES_EM_ATENDIMENTO, i);
    const serv = pick(SERVICOS_LISTA, i + 2);
    // Distribuir criação ao longo de 30 dias, dentro do prazo SLA
    const slaHoras = SLA_HORAS[prio as PrioridadeChamado];
    const gerado   = hrs(Math.max(0.5, slaHoras * 0.5 + i * 0.2));
    const assumido = new Date(gerado.getTime() + 30 * 60_000);

    const c = await prisma.chamado.create({ data: {
      OS, status: ChamadoStatus.EM_ATENDIMENTO, prioridade: prio as PrioridadeChamado,
      usuarioId: u.id, tecnicoId: t.id,
      geradoEm: gerado, atualizadoEm: assumido,
      descricao: desc,
    }});
    await prisma.ordemDeServico.create({ data: { chamadoId: c.id, servicoId: S[serv] } });

    // 1 em cada 5 tem transferência
    if (i % 5 === 4) {
      const tAnt = tecnicos[(i + 1) % 3];
      await prisma.transferenciaChamado.create({ data: {
        chamadoId: c.id, tecnicoAnteriorId: tAnt.id, tecnicoNovoId: t.id,
        motivo: 'Requer nível superior para resolução.', transferidoPor: admin.id,
        transferidoEm: new Date(gerado.getTime() + 60 * 60_000),
      }});
      historico.push(hTransferencia(c.id, tAnt.id, t.id, 'Requer nível superior.', admin.id, nA, admin.email, new Date(gerado.getTime() + 60 * 60_000)));
    }

    historico.push(hAbertura(c.id, desc, u.id, nU, u.email, gerado));
    historico.push(hStatus(c.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', t.id, nT, t.email, assumido));
  }
  log.success(`[SUCESSO] EM ATENDIMENTO: INC${String(inicioEM).padStart(4,'0')}–INC${String(cursor).padStart(4,'0')}`);

  log.info('[INFO] Criando ENCERRADOS (133)...');

  const distENC = { P1: 6, P2: 15, P3: 33, P4: 62, P5: 17 };
  const seqENC  = gerarSequenciaPrioridades(distENC);

  const inicioENC = cursor + 1;
  // INC0022/INC0023 — âncoras de hierarquia — serão os últimos encerrados
  for (let i = 0; i < 131; i++) { // 131 + 2 âncoras = 133
    const OS   = nextOS();
    const prio = seqENC[i];
    const u    = usuarios[i % 3];
    const nU   = nomesU[i % 3];
    const t    = tecnicos[i % 3];
    const nT   = nomesT[i % 3];
    const desc = pick(DESCRICOES_ENCERRADO, i);
    const serv = pick(SERVICOS_LISTA, i + 1);
    const gerado = dias(1 + i * 0.22); // distribuído ao longo de ~29 dias
    const slaHoras = SLA_HORAS[prio as PrioridadeChamado];
    const tempResol = Math.min(slaHoras * 0.8, 20); // sempre dentro do SLA
    const encerrado = new Date(gerado.getTime() + tempResol * 3_600_000);
    const descEnc   = `Problema resolvido: ${desc.substring(0, 60)}`;

    const c = await prisma.chamado.create({ data: {
      OS, status: ChamadoStatus.ENCERRADO, prioridade: prio as PrioridadeChamado,
      usuarioId: u.id, tecnicoId: t.id,
      descricao: desc, descricaoEncerramento: descEnc,
      geradoEm: gerado, encerradoEm: encerrado, atualizadoEm: encerrado,
    }});
    await prisma.ordemDeServico.create({ data: { chamadoId: c.id, servicoId: S[serv] } });

    // 1 em cada 8 tem transferência
    if (i % 8 === 7) {
      const tAnt = tecnicos[(i + 2) % 3];
      await prisma.transferenciaChamado.create({ data: {
        chamadoId: c.id, tecnicoAnteriorId: tAnt.id, tecnicoNovoId: t.id,
        motivo: 'Escalado para nível superior.', transferidoPor: admin.id,
        transferidoEm: new Date(gerado.getTime() + 40 * 60_000),
      }});
      historico.push(hTransferencia(c.id, tAnt.id, t.id, 'Escalado.', admin.id, nA, admin.email, new Date(gerado.getTime() + 40 * 60_000)));
    }

    historico.push(hAbertura(c.id, desc, u.id, nU, u.email, gerado));
    historico.push(hStatus(c.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', t.id, nT, t.email, new Date(gerado.getTime() + 20 * 60_000)));
    historico.push(hStatus(c.id, 'EM_ATENDIMENTO', 'ENCERRADO', descEnc, t.id, nT, t.email, encerrado));
  }

  // Âncora PAI (INC0022-equivalente no novo range)
  const osAnchorPai = nextOS();
  const gPai        = dias(20);
  const ePai        = new Date(gPai.getTime() + 20 * 3_600_000);
  chamadoPai = await prisma.chamado.create({ data: {
    OS: osAnchorPai, status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
    usuarioId: usuario1.id, tecnicoId: tecnico3.id,
    descricao: 'Queda geral de rede no 2º andar afetando comercial e marketing.',
    descricaoEncerramento: 'Cabo de backbone danificado substituído. Rede normalizada.',
    geradoEm: gPai, encerradoEm: ePai, atualizadoEm: ePai,
  }});
  await prisma.ordemDeServico.create({ data: { chamadoId: chamadoPai.id, servicoId: S['Suporte de Rede'] } });
  historico.push(hAbertura(chamadoPai.id, chamadoPai.descricao, usuario1.id, nU1, usuario1.email, gPai));
  historico.push(hStatus(chamadoPai.id, 'ABERTO', 'EM_ATENDIMENTO', 'Assumido.', tecnico3.id, nT3, tecnico3.email, new Date(gPai.getTime() + 3_600_000)));
  historico.push(hStatus(chamadoPai.id, 'EM_ATENDIMENTO', 'ENCERRADO', chamadoPai.descricaoEncerramento!, tecnico3.id, nT3, tecnico3.email, ePai));

  // Âncora FILHO
  const osAnchorFilho = nextOS();
  const vFilho        = new Date(gPai.getTime() + 4 * 3_600_000);
  const chamadoFilho  = await prisma.chamado.create({ data: {
    OS: osAnchorFilho, status: ChamadoStatus.ENCERRADO, prioridade: PrioridadeChamado.P4,
    usuarioId: usuario2.id, chamadoPaiId: chamadoPai.id,
    descricao: 'Sem internet no setor de marketing — mesmo andar.',
    descricaoEncerramento: `Chamado vinculado ao chamado ${osAnchorPai}`,
    vinculadoEm: vFilho, vinculadoPor: admin.id,
    encerradoEm: vFilho, geradoEm: new Date(gPai.getTime() + 30 * 60_000), atualizadoEm: vFilho,
  }});
  await prisma.ordemDeServico.create({ data: { chamadoId: chamadoFilho.id, servicoId: S['Suporte de Rede'] } });
  historico.push(hAbertura(chamadoFilho.id, chamadoFilho.descricao, usuario2.id, nU2, usuario2.email, new Date(gPai.getTime() + 30 * 60_000)));
  historico.push(hStatus(chamadoFilho.id, 'ABERTO', 'ENCERRADO', `Vinculado ao ${osAnchorPai}.`, admin.id, nA, admin.email, vFilho));

  log.success(`[SUCESSO] ENCERRADOS: INC${String(inicioENC).padStart(4,'0')}–INC${String(cursor).padStart(4,'0')} (hierarquia: ${osAnchorPai}←${osAnchorFilho})`);

  log.info('[INFO] Criando CANCELADOS (11)...');

  const distCAN = { P2: 1, P3: 3, P4: 5, P5: 2 };
  const seqCAN  = gerarSequenciaPrioridades(distCAN);

  const inicioCAN = cursor + 1;
  for (let i = 0; i < 11; i++) {
    const OS   = nextOS();
    const prio = seqCAN[i];
    const u    = usuarios[i % 3];
    const nU   = nomesU[i % 3];
    const desc = pick(DESCRICOES_CANCELADO, i);
    const serv = pick(SERVICOS_LISTA, i + 3);
    const gerado   = dias(5 + i * 3);
    const encerrado = new Date(gerado.getTime() + 36 * 3_600_000);

    const c = await prisma.chamado.create({ data: {
      OS, status: ChamadoStatus.CANCELADO, prioridade: prio as PrioridadeChamado,
      usuarioId: u.id,
      descricao: desc, descricaoEncerramento: desc,
      encerradoEm: encerrado, geradoEm: gerado, atualizadoEm: encerrado,
    }});
    await prisma.ordemDeServico.create({ data: { chamadoId: c.id, servicoId: S[serv] } });
    historico.push(hAbertura(c.id, desc, u.id, nU, u.email, gerado));
    historico.push(hStatus(c.id, 'ABERTO', 'CANCELADO', desc, admin.id, nA, admin.email, encerrado));
  }
  log.success(`[SUCESSO] CANCELADOS: INC${String(inicioCAN).padStart(4,'0')}–INC${String(cursor).padStart(4,'0')}`);

  log.info('[INFO] Criando REABERTOS (111)...');

  const distREA = { P1: 5, P2: 12, P3: 27, P4: 52, P5: 15 };
  const seqREA  = gerarSequenciaPrioridades(distREA);

  const inicioREA = cursor + 1;
  for (let i = 0; i < 111; i++) {
    const OS   = nextOS();
    const prio = seqREA[i];
    const u    = usuarios[i % 3];
    const nU   = nomesU[i % 3];
    const t    = tecnicos[i % 3];
    const nT   = nomesT[i % 3];
    const desc  = pick(DESCRICOES_REABERTO, i);
    const serv  = pick(SERVICOS_LISTA, i + 4);
    const gerado     = dias(3 + i * 0.25);
    const encerrado1 = new Date(gerado.getTime() + 24 * 3_600_000);
    const reaberto   = new Date(encerrado1.getTime() + 12 * 3_600_000); // dentro de 48h

    // P1 (primeiros 5): com escalada de prioridade
    const prioOrigem = i < 5 ? 'P3' : prio;
    const c = await prisma.chamado.create({ data: {
      OS, status: ChamadoStatus.REABERTO, prioridade: prio as PrioridadeChamado,
      usuarioId: u.id, tecnicoId: t.id,
      descricao: desc,
      ...(i < 5 ? { prioridadeAlterada: dias(1), prioridadeAlteradaPor: adminTI.id } : {}),
    }});
    await prisma.ordemDeServico.create({ data: { chamadoId: c.id, servicoId: S[serv] } });

    // 1 em cada 6: transferência antes da reabertura
    if (i % 6 === 5) {
      const tAnt = tecnicos[(i + 1) % 3];
      await prisma.transferenciaChamado.create({ data: {
        chamadoId: c.id, tecnicoAnteriorId: tAnt.id, tecnicoNovoId: t.id,
        motivo: 'Reincidência requer técnico diferente.', transferidoPor: admin.id,
        transferidoEm: new Date(gerado.getTime() + 2 * 3_600_000),
      }});
      historico.push(hTransferencia(c.id, tAnt.id, t.id, 'Reincidência.', admin.id, nA, admin.email, new Date(gerado.getTime() + 2 * 3_600_000)));
    }

    historico.push(hAbertura(c.id, desc, u.id, nU, u.email, gerado));
    historico.push(hStatus(c.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', t.id, nT, t.email, new Date(gerado.getTime() + 30 * 60_000)));
    historico.push(hStatus(c.id, 'EM_ATENDIMENTO', 'ENCERRADO', 'Resolvido — problema aparentemente resolvido.', t.id, nT, t.email, encerrado1));
    if (i < 5) historico.push(hPrioridade(c.id, prioOrigem, prio, adminTI.id, nTI, adminTI.email, dias(1)));
    historico.push(hReavertura(c.id, `${desc} Problema voltou.`, u.id, nU, u.email, reaberto));
  }
  // Âncora REABERTO P1 escalado (correspondente ao INC0026 original)
  const osAnchorREA = `INC${String(inicioREA).padStart(4,'0')}`; // primeiro do grupo = P1
  log.success(`[SUCESSO] REABERTOS: INC${String(inicioREA).padStart(4,'0')}–INC${String(cursor).padStart(4,'0')}`);

  log.info('[INFO] Criando VENCIDOS (112)...');

  const distVEN = { P1: 5, P2: 12, P3: 27, P4: 52, P5: 16 };
  const seqVEN  = gerarSequenciaPrioridades(distVEN);

  const inicioVEN = cursor + 1;
  for (let i = 0; i < 112; i++) {
    const OS   = nextOS();
    const prio = seqVEN[i];
    const u    = usuarios[i % 3];
    const nU   = nomesU[i % 3];
    const t    = tecnicos[i % 3];
    const nT   = nomesT[i % 3];
    const desc = pick(DESCRICOES_VENCIDO, i);
    const serv = pick(SERVICOS_LISTA, i + 5);
    // geradoEm suficientemente antigo para vencer o SLA
    const slaHoras = SLA_HORAS[prio as PrioridadeChamado];
    const extraHoras = slaHoras + 1 + i * 0.5; // sempre vencido
    const gerado   = hrs(extraHoras);
    const assumido = new Date(gerado.getTime() + 20 * 60_000);

    const c = await prisma.chamado.create({ data: {
      OS, status: ChamadoStatus.EM_ATENDIMENTO, prioridade: prio as PrioridadeChamado,
      usuarioId: u.id, tecnicoId: t.id,
      geradoEm: gerado, atualizadoEm: assumido,
      descricao: desc,
    }});
    await prisma.ordemDeServico.create({ data: { chamadoId: c.id, servicoId: S[serv] } });

    historico.push(hAbertura(c.id, desc, u.id, nU, u.email, gerado));
    historico.push(hStatus(c.id, 'ABERTO', 'EM_ATENDIMENTO', 'Chamado assumido.', t.id, nT, t.email, assumido));

    // Notificação SLA_VENCENDO para P1 e P2
    if (prio === 'P1' || prio === 'P2') {
      notificacoes.push({
        destinatarioId: adminTI.id, destinatarioEmail: adminTI.email,
        tipo: 'SLA_VENCENDO' as TipoEvento,
        titulo: `SLA VENCIDO — ${prio} crítico`,
        mensagem: `Chamado ${OS} (${prio}) com SLA vencido.`,
        chamadoId: c.id, chamadoOS: OS, lida: false,
        criadoEm: new Date(gerado.getTime() + slaHoras * 3_600_000),
        dadosExtras: { horasVencido: Math.round(extraHoras - slaHoras) },
      });
    }
  }
  log.success(`[SUCESSO] VENCIDOS: INC${String(inicioVEN).padStart(4,'0')}–INC${String(cursor).padStart(4,'0')}`);

  log.title('[5/6] INSERINDO HISTÓRICO E NOTIFICAÇÕES (MongoDB)...\n');

  // Notificações fixas de âncoras
  notificacoes.push(
    { destinatarioId: admin.id,    destinatarioEmail: admin.email,    tipo: 'CHAMADO_ABERTO'      as TipoEvento, titulo: 'Novo chamado aberto',         mensagem: 'O chamado INC0001 foi aberto e aguarda atribuição.',        chamadoId: chamadosAbertos[0].id, chamadoOS: 'INC0001', lida: false, criadoEm: hrs(2)  },
    { destinatarioId: admin.id,    destinatarioEmail: admin.email,    tipo: 'CHAMADO_ABERTO'      as TipoEvento, titulo: 'Novo chamado aberto',         mensagem: 'O chamado INC0002 foi aberto e aguarda atribuição.',        chamadoId: chamadosAbertos[1].id, chamadoOS: 'INC0002', lida: false, criadoEm: hrs(4)  },
    { destinatarioId: adminTI.id,  destinatarioEmail: adminTI.email,  tipo: 'SLA_VENCENDO'        as TipoEvento, titulo: 'Múltiplos SLAs vencidos',     mensagem: '112 chamados com SLA vencido aguardam resolução.',          chamadoId: chamadosAbertos[0].id, chamadoOS: 'INC0001', lida: false, criadoEm: hrs(1), dadosExtras: { totalVencidos: 112 } },
    { destinatarioId: usuario2.id, destinatarioEmail: usuario2.email, tipo: 'CHAMADO_ENCERRADO'   as TipoEvento, titulo: 'Chamado vinculado e encerrado', mensagem: `Chamado vinculado ao ${osAnchorPai} e encerrado.`,         chamadoId: chamadoFilho.id,       chamadoOS: osAnchorFilho, lida: false, criadoEm: dias(20), dadosExtras: { chamadoPaiOS: osAnchorPai } },
    { destinatarioId: tecnico1.id, destinatarioEmail: tecnico1.email, tipo: 'PRIORIDADE_ALTERADA' as TipoEvento, titulo: 'Chamado escalado para P1',     mensagem: `Chamado ${osAnchorREA} escalado para P1 por Diego Ferreira.`, chamadoId: chamadosAbertos[0].id, chamadoOS: osAnchorREA, lida: false, criadoEm: dias(1), dadosExtras: { prioridadeNova: 'P1', alteradoPor: adminTI.email } },
  );

  // Inserir em batches de 500 para performance
  const BATCH = 500;
  for (let i = 0; i < historico.length; i += BATCH) {
    await AtualizacaoChamado.insertMany(historico.slice(i, i + BATCH));
  }
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

  const agora    = Date.now();
  const todosEm  = await prisma.chamado.findMany({ where: { status: ChamadoStatus.EM_ATENDIMENTO, deletadoEm: null }, select: { prioridade: true, geradoEm: true } });
  const vencidos = todosEm.filter(c => {
    const prazoMs = SLA_HORAS[c.prioridade] * 3_600_000;
    return c.geradoEm.getTime() + prazoMs < agora;
  }).length;

  const porPrio = await Promise.all(
    (['P1','P2','P3','P4','P5'] as PrioridadeChamado[]).map(async (p) => ({
      p, n: await prisma.chamado.count({ where: { prioridade: p, deletadoEm: null } }),
    }))
  );

  log.title('\n╔══════════════════════════════════════╗');
  log.title('║    SEED CONCLUÍDO COM SUCESSO!       ║');
  log.title('║    500 CHAMADOS GERADOS              ║');
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
  console.log(`  Chamados:        ${totalChamados}  (INC0001–INC${String(totalChamados).padStart(4,'0')})`);
  porStatus.forEach(({ s, n }) => {
    const extra = s === ChamadoStatus.EM_ATENDIMENTO ? `  (${vencidos} vencidos SLA)` : '';
    console.log(`    ${s.padEnd(17)} ${n}${extra}`);
  });
  console.log(`  Prioridades:`);
  porPrio.forEach(({ p, n }) => console.log(`    ${p}: ${n}  (${(n/totalChamados*100).toFixed(1)}%)`));
  console.log(`  ├─ Hierarquia:   ${osAnchorPai} ← ${osAnchorFilho}`);
  console.log(`  ├─ Reaberto P1:  ${osAnchorREA} (escalado)`);
  console.log(`  └─ Vencidos SLA: ${vencidos} (INC${String(inicioVEN).padStart(4,'0')}–INC${String(cursor).padStart(4,'0')})`);
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