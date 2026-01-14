import {
  PrismaClient,
  Regra,
  Setor,
  ChamadoStatus
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import { hashPassword } from '../src/utils/password';
import { createClient as createRedisClient } from 'redis';
import { MongoClient } from 'mongodb';
import { InfluxDB, Point } from '@influxdata/influxdb-client';

const { Pool } = pkg;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

const log = {
  success: (msg: string) => console.log(`${colors.green}${msg}${colors.reset}`),
  info: (msg: string) => console.log(`${colors.cyan}${msg}${colors.reset}`),
  warn: (msg: string) => console.log(`${colors.yellow}${msg}${colors.reset}`),
  error: (msg: string) => console.log(`${colors.red}${msg}${colors.reset}`),
  title: (msg: string) => console.log(`${colors.bright}${colors.blue}${msg}${colors.reset}`),
  progress: (msg: string) => console.log(`${colors.magenta}${msg}${colors.reset}`),
  normal: (msg: string) => console.log(msg),
};

if (!process.env.DATABASE_URL) {
  log.error('[ERRO] DATABASE_URL não encontrada');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

// Redis Client
const redisClient = createRedisClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
});

// MongoDB Client
const mongoClient = new MongoClient(process.env.MONGO_INITDB_URI || '');

// InfluxDB Client
const influxDB = new InfluxDB({
  url: `http://localhost:${process.env.INFLUX_PORT || 8086}`,
  token: process.env.INFLUX_ADMIN_TOKEN || '',
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
}

interface DadosServico {
  nome: string;
  descricao: string;
  ativo: boolean;
}

interface ChamadoBatch {
  chamadoData: any;
  servicoId: string;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(array: T[]): T {
  return array[randomInt(0, array.length - 1)];
}

/**
 * Gera data de forma inteligente com distribuição não uniforme:
 * - 40% nos últimos 7 dias
 * - 35% entre 8-30 dias atrás
 * - 25% entre 31-90 dias atrás
 */
function gerarDataInteligente(index: number, total: number): Date {
  const agora = new Date();
  const percentual = index / total;
  
  let diasAtras: number;
  
  if (percentual < 0.40) {
    // 40% nos últimos 7 dias
    diasAtras = Math.random() * 7;
  } else if (percentual < 0.75) {
    // 35% entre 8-30 dias
    diasAtras = 8 + Math.random() * 22;
  } else {
    // 25% entre 31-90 dias
    diasAtras = 31 + Math.random() * 59;
  }
  
  const msAtras = diasAtras * 24 * 60 * 60 * 1000;
  let data = new Date(agora.getTime() - msAtras);
  
  if (data.getTime() > agora.getTime() - 5 * 60 * 1000) {
    data = new Date(agora.getTime() - 5 * 60 * 1000);
  }
  
  return data;
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
    where: { usuarioId, deletadoEm: null },
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

const problemas = [
  'Computador não liga',
  'Internet lenta',
  'Email não está funcionando',
  'Impressora travada',
  'Senha expirada',
  'Sistema não responde',
  'Erro ao acessar sistema',
  'Telefone sem sinal',
  'Mouse não funciona',
  'Teclado com teclas travadas',
  'Monitor sem imagem',
  'Aplicativo travando',
  'Erro de acesso negado',
  'Backup não realizado',
  'VPN não conecta',
  'Arquivo corrompido',
  'Espaço em disco cheio',
  'Software precisa atualização',
  'Configuração de email',
  'Instalação de programa',
  'Problema com antivírus',
  'Rede sem internet',
  'Erro no banco de dados',
  'Licença de software expirada',
  'Periférico USB não reconhecido',
  'Problema com drivers',
  'Sistema operacional lento',
  'Falha no login',
  'Câmera não funciona',
  'Áudio sem som',
  'Projetor sem sinal',
  'Scanner não digitaliza',
  'Problema com certificado digital',
  'Erro ao imprimir',
  'Notebook superaquecendo',
  'Bateria não carrega',
  'Configuração de rede',
  'Problema com Teams/Zoom',
  'Transferência de arquivos falhou',
  'Acesso remoto não funciona',
];

const descricoes = [
  'Equipamento apresentando falha desde hoje pela manhã',
  'Problema intermitente ao longo do dia',
  'Erro ocorreu após última atualização',
  'Não consigo trabalhar devido ao problema',
  'Urgente! Preciso resolver o quanto antes',
  'Problema começou ontem à tarde',
  'Equipamento está inoperante',
  'Tentei reiniciar mas não resolveu',
  'Mensagem de erro aparece constantemente',
  'Performance muito abaixo do esperado',
  'Já tentei várias soluções sem sucesso',
  'Problema afetando toda a equipe',
  'Sistema crítico fora do ar',
  'Impossível realizar minhas atividades',
  'Problema recorrente que precisa solução definitiva',
  'Equipamento apresenta lentidão extrema',
  'Erro crítico no sistema',
  'Necessito suporte técnico especializado',
  'Problema detectado no início do expediente',
  'Falha intermitente dificulta o trabalho',
];

const resolucoes = [
  'Problema resolvido após reinicialização do sistema',
  'Configuração ajustada com sucesso',
  'Software atualizado e testado',
  'Hardware substituído e funcionando normalmente',
  'Usuário orientado sobre procedimento correto',
  'Permissões de acesso ajustadas',
  'Serviço reiniciado e normalizado',
  'Driver atualizado com sucesso',
  'Cabo substituído, equipamento funcionando',
  'Senha redefinida e acesso liberado',
  'Backup realizado e verificado',
  'Limpeza de arquivos temporários resolveu o problema',
  'Antivírus atualizado e sistema verificado',
  'Conexão de rede reconfigurada',
  'Aplicativo reinstalado corretamente',
  'Problema era configuração incorreta',
  'Memória RAM adicionada, sistema mais rápido',
  'Disco rígido substituído por SSD',
  'Licença renovada e ativada',
  'Problema resolvido remotamente',
];

async function popularRedis(chamados: any[], usuarios: any[], tecnicos: any[], servicos: any[]) {
  log.title('\n[REDIS] Populando cache Redis...\n');
  
  try {
    await redisClient.connect();
    
    // Limpar dados antigos
    await redisClient.flushDb();
    
    // Estatísticas gerais
    await redisClient.set('stats:chamados:total', chamados.length.toString());
    await redisClient.set('stats:usuarios:total', usuarios.length.toString());
    await redisClient.set('stats:tecnicos:total', tecnicos.length.toString());
    await redisClient.set('stats:servicos:total', servicos.length.toString());
    
    // Contadores por status
    const statusCounts: Record<string, number> = chamados.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [status, count] of Object.entries(statusCounts)) {
      await redisClient.set(`stats:chamados:status:${status}`, count.toString());
    }
    
    // Chamados por período
    const agora = new Date();
    const ultimas24h = chamados.filter(c => 
      new Date(c.geradoEm).getTime() > agora.getTime() - 24 * 60 * 60 * 1000
    ).length;
    const ultimos7dias = chamados.filter(c =>
      new Date(c.geradoEm).getTime() > agora.getTime() - 7 * 24 * 60 * 60 * 1000
    ).length;
    const ultimos30dias = chamados.filter(c =>
      new Date(c.geradoEm).getTime() > agora.getTime() - 30 * 24 * 60 * 60 * 1000
    ).length;
    
    await redisClient.set('stats:chamados:periodo:24h', ultimas24h.toString());
    await redisClient.set('stats:chamados:periodo:7dias', ultimos7dias.toString());
    await redisClient.set('stats:chamados:periodo:30dias', ultimos30dias.toString());
    
    // SLA e tempo médio
    const chamadosEncerrados = chamados.filter(c => c.encerradoEm);
    const dentroSLA = chamadosEncerrados.filter(c => {
      const tempo = (new Date(c.encerradoEm).getTime() - new Date(c.geradoEm).getTime()) / (1000 * 60 * 60);
      return tempo <= 24;
    }).length;
    
    const percentualSLA = chamadosEncerrados.length > 0 
      ? ((dentroSLA / chamadosEncerrados.length) * 100).toFixed(2)
      : '0';
    await redisClient.set('stats:sla:percentual', percentualSLA);
    
    const tempoMedio = chamadosEncerrados.length > 0
      ? (chamadosEncerrados.reduce((acc, c) => {
          const tempo = (new Date(c.encerradoEm).getTime() - new Date(c.geradoEm).getTime()) / (1000 * 60 * 60);
          return acc + tempo;
        }, 0) / chamadosEncerrados.length).toFixed(2)
      : '0';
    
    await redisClient.set('stats:tempo:medio:resolucao', tempoMedio);
    
    log.success('[REDIS] Cache populado com sucesso!\n');
    
  } catch (error) {
    log.error('[REDIS] Erro ao popular cache:');
    console.error(error);
  } finally {
    await redisClient.disconnect();
  }
}

async function popularMongoDB(chamados: any[]) {
  log.title('[MONGODB] Populando histórico de chamados...\n');
  
  try {
    await mongoClient.connect();
    const db = mongoClient.db(process.env.MONGO_INITDB_DATABASE || 'helpme-mongo');
    const collection = db.collection('historico_chamados');
    
    // Limpar coleção
    await collection.deleteMany({});
    
    // Inserir histórico apenas de chamados encerrados e cancelados
    const chamadosHistorico = chamados
      .filter(c => c.status === ChamadoStatus.ENCERRADO || c.status === ChamadoStatus.CANCELADO)
      .map(c => ({
        chamadoId: c.id,
        OS: c.OS,
        descricao: c.descricao,
        status: c.status,
        usuarioId: c.usuarioId,
        tecnicoId: c.tecnicoId,
        geradoEm: c.geradoEm,
        atualizadoEm: c.atualizadoEm,
        encerradoEm: c.encerradoEm,
        descricaoEncerramento: c.descricaoEncerramento,
        criadoEm: new Date(),
      }));
    
    if (chamadosHistorico.length > 0) {
      await collection.insertMany(chamadosHistorico);
      log.success(`[MONGODB] ${chamadosHistorico.length} registros de histórico inseridos!\n`);
    }
    
  } catch (error) {
    log.error('[MONGODB] Erro ao popular histórico:');
    console.error(error);
  } finally {
    await mongoClient.close();
  }
}

async function popularInfluxDB(chamados: any[]) {
  log.title('[INFLUXDB] Populando métricas...\n');
  
  try {
    const writeApi = influxDB.getWriteApi(
      process.env.INFLUX_ORG || 'org',
      process.env.INFLUX_BUCKET || 'helpme_bucket'
    );
    
    // Agrupar chamados por dia
    const chamadosPorDia: Record<string, any> = chamados.reduce((acc, c) => {
      const dia = new Date(c.geradoEm).toISOString().split('T')[0];
      if (!acc[dia]) {
        acc[dia] = {
          ABERTO: 0,
          EM_ATENDIMENTO: 0,
          ENCERRADO: 0,
          CANCELADO: 0,
          REABERTO: 0,
          total: 0,
        };
      }
      acc[dia][c.status]++;
      acc[dia].total++;
      return acc;
    }, {} as Record<string, any>);
    
    // Escrever pontos no InfluxDB
    for (const [dia, stats] of Object.entries(chamadosPorDia)) {
      const timestamp = new Date(dia);
      
      const point = new Point('chamados')
        .timestamp(timestamp)
        .intField('ABERTO', stats.ABERTO)
        .intField('EM_ATENDIMENTO', stats.EM_ATENDIMENTO)
        .intField('ENCERRADO', stats.ENCERRADO)
        .intField('CANCELADO', stats.CANCELADO)
        .intField('REABERTO', stats.REABERTO)
        .intField('total', stats.total);
      
      writeApi.writePoint(point);
    }
    
    await writeApi.close();
    log.success('[INFLUXDB] Métricas gravadas com sucesso!\n');
    
  } catch (error) {
    log.error('[INFLUXDB] Erro ao popular métricas:');
    console.error(error);
  }
}

async function main() {
  const TOTAL_CHAMADOS = 15000;
  const BATCH_SIZE = 100;
  
  log.title('\n' + '='.repeat(80));
  log.title('  BIG SEED - TODOS OS BANCOS DE DADOS');
  log.title('='.repeat(80) + '\n');

  try {
    log.info('[CONEXÃO] Conectando ao PostgreSQL...');
    await prisma.$connect();
    log.success('[CONEXÃO] Conectado com sucesso\n');

    log.warn('[LIMPEZA] Limpando base de dados PostgreSQL...\n');
    
    await prisma.ordemDeServico.deleteMany({});
    log.success('  [OK] Ordens de serviço removidas');
    
    await prisma.chamado.deleteMany({});
    log.success('  [OK] Chamados removidos');
    
    await prisma.expediente.deleteMany({});
    log.success('  [OK] Expedientes removidos');
    
    await prisma.servico.deleteMany({});
    log.success('  [OK] Serviços removidos');
    
    await prisma.usuario.deleteMany({});
    log.success('  [OK] Usuários removidos\n');

    log.title('[1/6] CRIANDO ADMIN...\n');
    
    const adminUser = await criarUsuario('admin@helpme.com', {
      nome: 'Admin',
      sobrenome: 'Sistema',
      email: 'admin@helpme.com',
      password: 'Admin123!',
      regra: Regra.ADMIN,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 99999-0001',
      ramal: '1000',
    });

    log.success(`  [OK] Admin: ${adminUser.email}\n`);

    log.title('[2/6] CRIANDO 10 TÉCNICOS...\n');
    
    const tecnicosData = [
      { nome: 'Paulo', sobrenome: 'Cunha', email: 'paulo.cunha@helpme.com', telefone: '(11) 98765-0001', ramal: '3001' },
      { nome: 'Ana', sobrenome: 'Santos', email: 'ana.santos@helpme.com', telefone: '(11) 98765-0002', ramal: '3002' },
      { nome: 'Roberto', sobrenome: 'Ferreira', email: 'roberto.ferreira@helpme.com', telefone: '(11) 98765-0003', ramal: '3003' },
      { nome: 'Juliana', sobrenome: 'Alves', email: 'juliana.alves@helpme.com', telefone: '(11) 98765-0004', ramal: '3004' },
      { nome: 'Fernando', sobrenome: 'Souza', email: 'fernando.souza@helpme.com', telefone: '(11) 98765-0005', ramal: '3005' },
      { nome: 'Patricia', sobrenome: 'Costa', email: 'patricia.costa@helpme.com', telefone: '(11) 98765-0006', ramal: '3006' },
      { nome: 'Marcos', sobrenome: 'Lima', email: 'marcos.lima@helpme.com', telefone: '(11) 98765-0007', ramal: '3007' },
      { nome: 'Luciana', sobrenome: 'Martins', email: 'luciana.martins@helpme.com', telefone: '(11) 98765-0008', ramal: '3008' },
      { nome: 'Rafael', sobrenome: 'Rodrigues', email: 'rafael.rodrigues@helpme.com', telefone: '(11) 98765-0009', ramal: '3009' },
      { nome: 'Daniela', sobrenome: 'Oliveira', email: 'daniela.oliveira@helpme.com', telefone: '(11) 98765-0010', ramal: '3010' },
    ];

    const tecnicos = [];
    for (const dados of tecnicosData) {
      const tecnico = await criarUsuario(dados.email, {
        ...dados,
        password: 'Tecnico123!',
        regra: Regra.TECNICO,
        setor: Setor.TECNOLOGIA_INFORMACAO,
      });
      tecnicos.push(tecnico);
      
      await criarExpediente(tecnico.id, '08:00', '18:00');
      
      log.success(`  [OK] ${tecnico.nome} ${tecnico.sobrenome} (08:00-18:00)`);
    }
    log.info('');

    log.title('[3/6] CRIANDO 20 USUÁRIOS...\n');
    
    const usuariosData = [
      { nome: 'João', sobrenome: 'Oliveira', setor: Setor.ADMINISTRACAO, ramal: '2001' },
      { nome: 'Maria', sobrenome: 'Costa', setor: Setor.ALMOXARIFADO, ramal: '2002' },
      { nome: 'Pedro', sobrenome: 'Lima', setor: Setor.CALL_CENTER, ramal: '2003' },
      { nome: 'Paula', sobrenome: 'Martins', setor: Setor.COMERCIAL, ramal: '2004' },
      { nome: 'Ricardo', sobrenome: 'Rocha', setor: Setor.DEPARTAMENTO_PESSOAL, ramal: '2005' },
      { nome: 'Fernanda', sobrenome: 'Mendes', setor: Setor.FINANCEIRO, ramal: '2006' },
      { nome: 'Lucas', sobrenome: 'Barbosa', setor: Setor.JURIDICO, ramal: '2007' },
      { nome: 'Camila', sobrenome: 'Ribeiro', setor: Setor.LOGISTICA, ramal: '2008' },
      { nome: 'Bruno', sobrenome: 'Cardoso', setor: Setor.MARKETING, ramal: '2009' },
      { nome: 'Aline', sobrenome: 'Pereira', setor: Setor.QUALIDADE, ramal: '2010' },
      { nome: 'Rodrigo', sobrenome: 'Dias', setor: Setor.RECURSOS_HUMANOS, ramal: '2011' },
      { nome: 'Beatriz', sobrenome: 'Araújo', setor: Setor.TECNOLOGIA_INFORMACAO, ramal: '2012' },
      { nome: 'Gabriel', sobrenome: 'Santos', setor: Setor.COMERCIAL, ramal: '2013' },
      { nome: 'Larissa', sobrenome: 'Ferreira', setor: Setor.MARKETING, ramal: '2014' },
      { nome: 'Thiago', sobrenome: 'Almeida', setor: Setor.FINANCEIRO, ramal: '2015' },
      { nome: 'Renata', sobrenome: 'Souza', setor: Setor.RECURSOS_HUMANOS, ramal: '2016' },
      { nome: 'Diego', sobrenome: 'Gomes', setor: Setor.TECNOLOGIA_INFORMACAO, ramal: '2017' },
      { nome: 'Vanessa', sobrenome: 'Machado', setor: Setor.ADMINISTRACAO, ramal: '2018' },
      { nome: 'Gustavo', sobrenome: 'Cunha', setor: Setor.LOGISTICA, ramal: '2019' },
      { nome: 'Tatiana', sobrenome: 'Ramos', setor: Setor.QUALIDADE, ramal: '2020' },
    ];

    const usuarios = [];
    for (const dados of usuariosData) {
      const emailBase = `${dados.nome.toLowerCase()}.${dados.sobrenome.toLowerCase()}`;
      const email = `${emailBase}@helpme.com`;
      
      const usuario = await criarUsuario(email, {
        ...dados,
        email,
        password: 'User123!',
        regra: Regra.USUARIO,
        telefone: `(11) 97654-${dados.ramal}`,
      });
      usuarios.push(usuario);
      log.success(`  [OK] ${usuario.nome} ${usuario.sobrenome} (${dados.setor})`);
    }
    log.info('');

    log.title('[4/6] CRIANDO SERVIÇOS...\n');
    
    const servicosData: DadosServico[] = [
      { nome: 'Suporte Técnico Geral', descricao: 'Suporte técnico para problemas gerais', ativo: true },
      { nome: 'Instalação de Software', descricao: 'Instalação e configuração de softwares', ativo: true },
      { nome: 'Manutenção de Hardware', descricao: 'Reparo e manutenção de equipamentos', ativo: true },
      { nome: 'Suporte de Rede', descricao: 'Configuração e troubleshooting de rede', ativo: true },
      { nome: 'Backup e Recuperação', descricao: 'Serviços de backup e recuperação de dados', ativo: true },
      { nome: 'Configuração de Email', descricao: 'Configuração de contas de email', ativo: true },
      { nome: 'Acesso e Permissões', descricao: 'Gerenciamento de acessos e permissões', ativo: true },
      { nome: 'Impressoras e Periféricos', descricao: 'Suporte para impressoras e periféricos', ativo: true },
      { nome: 'VPN e Acesso Remoto', descricao: 'Configuração de VPN e acesso remoto', ativo: true },
      { nome: 'Treinamento de Usuário', descricao: 'Treinamento em sistemas e ferramentas', ativo: true },
    ];

    const servicos = [];
    for (const dados of servicosData) {
      const servico = await prisma.servico.upsert({
        where: { nome: dados.nome },
        update: { descricao: dados.descricao, ativo: dados.ativo, deletadoEm: null },
        create: dados,
      });
      servicos.push(servico);
      log.success(`  [OK] ${servico.nome}`);
    }
    log.info('');

    log.title(`[5/6] CRIANDO ${TOTAL_CHAMADOS.toLocaleString()} CHAMADOS...\n`);

    // NOVA DISTRIBUIÇÃO: 25% ABERTO, 30% EM_ATENDIMENTO, 30% ENCERRADO, 10% CANCELADO, 5% REABERTO
    const distribuicaoStatus = [
      ...Array(3750).fill(ChamadoStatus.ABERTO),           // 25% - 3.750 chamados
      ...Array(4500).fill(ChamadoStatus.EM_ATENDIMENTO),  // 30% - 4.500 chamados
      ...Array(4500).fill(ChamadoStatus.ENCERRADO),       // 30% - 4.500 chamados
      ...Array(1500).fill(ChamadoStatus.CANCELADO),       // 10% - 1.500 chamados
      ...Array(750).fill(ChamadoStatus.REABERTO),         // 5% - 750 chamados
    ];

    let chamadosCriados = 0;
    const totalBatches = Math.ceil(TOTAL_CHAMADOS / BATCH_SIZE);
    const tempoInicio = Date.now();
    const todosChamados = [];

    for (let batch = 0; batch < totalBatches; batch++) {
      const chamadosNesteBatch = Math.min(BATCH_SIZE, TOTAL_CHAMADOS - chamadosCriados);
      const chamadosBatch: ChamadoBatch[] = [];

      for (let i = 0; i < chamadosNesteBatch; i++) {
        const numero = chamadosCriados + 1;
        const OS = `INC${numero.toString().padStart(6, '0')}`;
        
        const usuario = randomElement(usuarios);
        const status = distribuicaoStatus[chamadosCriados];
        const servico = randomElement(servicos);
        const problema = randomElement(problemas);
        const descricao = `${problema}. ${randomElement(descricoes)}`;
        
        const geradoEm = gerarDataInteligente(chamadosCriados, TOTAL_CHAMADOS);
        
        const chamadoData: any = {
          OS,
          descricao,
          status,
          usuarioId: usuario.id,
          geradoEm,
        };

        if (status !== ChamadoStatus.ABERTO) {
          const tecnico = randomElement(tecnicos);
          chamadoData.tecnicoId = tecnico.id;
          
          const horasAtendimento = randomInt(1, 48);
          const atualizadoEm = new Date(geradoEm.getTime() + horasAtendimento * 60 * 60 * 1000);
          chamadoData.atualizadoEm = atualizadoEm > new Date() 
            ? new Date(Date.now() - 30 * 60 * 1000) 
            : atualizadoEm;
        }

        if (status === ChamadoStatus.ENCERRADO || status === ChamadoStatus.CANCELADO) {
          const horasResolucao = randomInt(1, 72);
          const encerradoEm = new Date(geradoEm.getTime() + horasResolucao * 60 * 60 * 1000);
          chamadoData.encerradoEm = encerradoEm > new Date()
            ? new Date(Date.now() - 15 * 60 * 1000)
            : encerradoEm;
          
          chamadoData.descricaoEncerramento = status === ChamadoStatus.ENCERRADO
            ? randomElement(resolucoes)
            : 'Chamado cancelado a pedido do usuário';
        }

        chamadosBatch.push({ chamadoData, servicoId: servico.id });
        chamadosCriados++;
      }

      const chamadosInseridos = await prisma.$transaction(async (tx) => {
        const results = [];
        for (const { chamadoData, servicoId } of chamadosBatch) {
          const chamado = await tx.chamado.create({ data: chamadoData });
          await tx.ordemDeServico.create({
            data: { chamadoId: chamado.id, servicoId },
          });
          results.push(chamado);
        }
        return results;
      });

      todosChamados.push(...chamadosInseridos);

      const progresso = ((chamadosCriados / TOTAL_CHAMADOS) * 100).toFixed(1);
      const barraProgresso = '█'.repeat(Math.floor(parseFloat(progresso) / 2));
      const espacos = '░'.repeat(50 - barraProgresso.length);
      const tempoDecorrido = Math.floor((Date.now() - tempoInicio) / 1000);
      const chamadosPorSeg = (chamadosCriados / tempoDecorrido).toFixed(0);
      
      log.progress(`  [${barraProgresso}${espacos}] ${chamadosCriados.toLocaleString()}/${TOTAL_CHAMADOS.toLocaleString()} (${progresso}%) | ${chamadosPorSeg} c/s`);
    }

    log.success(`\n  [CONCLUÍDO] ${TOTAL_CHAMADOS.toLocaleString()} chamados criados!\n`);

    log.title('[6/6] POPULANDO OUTROS BANCOS DE DADOS...\n');

    // Popular Redis
    await popularRedis(todosChamados, usuarios, tecnicos, servicos);

    // Popular MongoDB
    await popularMongoDB(todosChamados);

    // Popular InfluxDB
    await popularInfluxDB(todosChamados);

    log.title('[ESTATÍSTICAS FINAIS]\n');

    const stats = await prisma.chamado.groupBy({
      by: ['status'],
      _count: true,
    });

    const agora = new Date();
    const ultimos7Dias = await prisma.chamado.count({
      where: { geradoEm: { gte: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000) } }
    });
    const ultimos30Dias = await prisma.chamado.count({
      where: { geradoEm: { gte: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000) } }
    });

    log.normal('  DISTRIBUIÇÃO POR STATUS:');
    for (const stat of stats) {
      const percentual = ((stat._count / TOTAL_CHAMADOS) * 100).toFixed(2);
      log.normal(`    ${stat.status.padEnd(20)} ${stat._count.toString().padStart(6)} (${percentual.padStart(5)}%)`);
    }

    log.normal('\n  DISTRIBUIÇÃO TEMPORAL:');
    log.normal(`    Últimos 7 dias:   ${ultimos7Dias.toString().padStart(6)} (${((ultimos7Dias/TOTAL_CHAMADOS)*100).toFixed(1)}%)`);
    log.normal(`    Últimos 30 dias:  ${ultimos30Dias.toString().padStart(6)} (${((ultimos30Dias/TOTAL_CHAMADOS)*100).toFixed(1)}%)`);

    log.title('\n' + '='.repeat(80));
    log.title('  SEED CONCLUÍDO COM SUCESSO - TODOS OS BANCOS!');
    log.title('='.repeat(80) + '\n');

    log.success('RESUMO:\n');
    log.normal(`  - ${1} Admin`);
    log.normal(`  - ${tecnicos.length} Técnicos`);
    log.normal(`  - ${usuarios.length} Usuários`);
    log.normal(`  - ${servicos.length} Serviços`);
    log.normal(`  - ${TOTAL_CHAMADOS.toLocaleString()} Chamados`);
    log.normal(`  - Redis: Populado`);
    log.normal(`  - MongoDB: Populado`);
    log.normal(`  - InfluxDB: Populado\n`);

    log.info('CREDENCIAIS:\n');
    log.normal('  Admin:    admin@helpme.com          | Admin123!');
    log.normal('  Técnico:  paulo.cunha@helpme.com    | Tecnico123!');
    log.normal('  Usuário:  joao.oliveira@helpme.com  | User123!\n');

    const tempoTotal = Math.floor((Date.now() - tempoInicio) / 1000);
    const minutos = Math.floor(tempoTotal / 60);
    const segundos = tempoTotal % 60;
    log.success(`TEMPO TOTAL: ${minutos}m ${segundos}s\n`);

  } catch (error) {
    log.error('\n[ERRO] Erro durante o seed:');
    console.error(error);
    throw error;
  }
}

main()
  .catch((error) => {
    log.error('[ERRO FATAL] Seed falhou:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    log.info('\n[DESCONECTANDO] Fechando conexão...');
    await prisma.$disconnect();
    log.success('[DESCONECTADO] Concluído\n');
  });