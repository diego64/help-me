import { PrismaClient, Regra, Setor, ChamadoStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { Kafka, Producer, Admin, logLevel } from 'kafkajs';
import { createClient } from 'redis';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  }),
  log: ['query', 'error', 'warn'],
});

// ============================================================================  
// CONFIGURAÇÃO REDIS
// ============================================================================

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

const redisClient = createClient({
  url: `redis://${redisHost}:${redisPort}`
});

const TTL_CURTO = 300;         // 5 minutos
const TTL_MEDIO = 1800;        // 30 minutos
const TTL_LONGO = 3600;        // 1 hora
const TTL_MUITO_LONGO = 86400; // 24 horas

// ============================================================================  
// CONFIGURAÇÃO KAFKA
// ============================================================================

const kafka = new Kafka({
  clientId: 'helpdesk-seed',
  brokers: [process.env.KAFKA_BROKER_URL || 'localhost:9092'],
  logLevel: logLevel.INFO,
});

const producer: Producer = kafka.producer();
const admin: Admin = kafka.admin();

const TOPICS = {
  CHAMADO_CRIADO: 'chamado.criado',
  CHAMADO_ATUALIZADO: 'chamado.atualizado',
  CHAMADO_ATRIBUIDO: 'chamado.atribuido',
  CHAMADO_ENCERRADO: 'chamado.encerrado',
  CHAMADO_REABERTO: 'chamado.reaberto',
  CHAMADO_CANCELADO: 'chamado.cancelado',
  NOTIFICACAO_EMAIL: 'notificacao.email',
  NOTIFICACAO_PUSH: 'notificacao.push',
  AUDITORIA: 'auditoria.log',
};

// ============================================================================  
// SCHEMA MONGODB - CHAMADO ATUALIZACAO
// ============================================================================

const chamadoAtualizacaoSchema = new mongoose.Schema({
  chamadoId: { type: String, required: true },
  dataHora: { type: Date, default: Date.now },
  tipo: { type: String, required: true },
  de: String,
  para: String,
  descricao: String,
  autorId: { type: String, required: true },
  autorNome: String,
  autorEmail: String
});

const ChamadoAtualizacao = mongoose.model('ChamadoAtualizacao', chamadoAtualizacaoSchema);

// ============================================================================  
// CONEXAO MONGODB
// ============================================================================

async function connectMongo() {
  try {
    if (process.env.MONGO_INITDB_URI) {
      await mongoose.connect(process.env.MONGO_INITDB_URI);
      const dbName = process.env.MONGO_INITDB_DATABASE || 'helpme-mongo';
      console.log(`[MONGODB] Conectado ao banco: ${dbName}\n`);
      return;
    }
    
    const username = process.env.MONGO_INITDB_ROOT_USERNAME || 'administrador';
    const password = process.env.MONGO_INITDB_ROOT_PASSWORD || '1qaz2wsx3edc';
    const port = process.env.MONGO_PORT || '27017';
    const dbName = process.env.MONGO_INITDB_DATABASE || 'helpme-mongo';
    
    const mongoUri = `mongodb://${username}:${password}@localhost:${port}/${dbName}?authSource=admin`;
    
    await mongoose.connect(mongoUri);
    console.log(`[MONGODB] Conectado ao banco: ${dbName}\n`);
    
  } catch (error) {
    console.error('[MONGODB] Erro ao conectar:', error);
    throw error;
  }
}

async function disconnectMongo() {
  await mongoose.disconnect();
  console.log('[MONGODB] Conexão encerrada');
}

// ============================================================================  
// CONEXÃO REDIS
// ============================================================================

let redisHabilitado = true;

async function conectarRedis() {
  try {
    console.log('[REDIS] Conectando...\n');
    await redisClient.connect();
    console.log('[REDIS] Conectado com sucesso!\n');
  } catch (error) {
    console.warn('[REDIS] Aviso: Não foi possível conectar ao Redis. Seed continuará sem cache.');
    console.warn('[REDIS] Para habilitar Redis, certifique-se que REDIS_HOST está configurado.\n');
    redisHabilitado = false;
  }
}

async function desconectarRedis() {
  if (redisHabilitado) {
    try {
      await redisClient.quit();
      console.log('[REDIS] Conexão encerrada');
    } catch (error) {
      // Silenciar erro de desconexão
    }
  }
}

// ============================================================================  
// CONEXÃO KAFKA
// ============================================================================

async function conectarKafka() {
  try {
    console.log('[KAFKA] Conectando producer...\n');
    await producer.connect();
    console.log('[KAFKA] Producer conectado com sucesso!\n');
  } catch (error) {
    console.warn('[KAFKA] Aviso: Não foi possível conectar ao Kafka. Seed continuará sem eventos Kafka.');
    console.warn('[KAFKA] Para habilitar Kafka, certifique-se que KAFKA_BROKER_URL está configurado.\n');
  }
}

async function desconectarKafka() {
  try {
    await producer.disconnect();
    console.log('[KAFKA] Producer desconectado');
  } catch (error) {
    // Silenciar erro de desconexão
  }
}

// ============================================================================  
// CRIAR TÓPICOS KAFKA
// ============================================================================

async function criarTopicosKafka() {
  try {
    await admin.connect();
    
    const topicosExistentes = await admin.listTopics();
    const topicosParaCriar = Object.values(TOPICS).filter(
      topic => !topicosExistentes.includes(topic)
    );

    if (topicosParaCriar.length === 0) {
      console.log('[KAFKA] Todos os tópicos já existem!\n');
      await admin.disconnect();
      return;
    }

    await admin.createTopics({
      topics: topicosParaCriar.map(topic => ({
        topic,
        numPartitions: 3,
        replicationFactor: 1,
        configEntries: [
          { name: 'retention.ms', value: '604800000' }, // 7 dias
          { name: 'compression.type', value: 'snappy' },
        ],
      })),
    });

    for (const topic of topicosParaCriar) {
      console.log(`   [OK] Tópico criado: ${topic}`);
    }

    console.log(`\n[KAFKA] ${topicosParaCriar.length} tópicos criados com sucesso!\n`);
    await admin.disconnect();
  } catch (error) {
    console.warn('[KAFKA] Aviso: Não foi possível criar tópicos. Continuando sem Kafka.\n');
  }
}

// ============================================================================  
// PUBLICAR EVENTO NO KAFKA
// ============================================================================

let kafkaHabilitado = true;
let eventosCriados = 0;

async function publicarEventoKafka(topic: string, key: string, evento: any, timestamp: Date) {
  if (!kafkaHabilitado) return;
  
  try {
    await producer.send({
      topic,
      messages: [{
        key,
        value: JSON.stringify(evento),
        timestamp: timestamp.getTime().toString(),
      }],
    });
    eventosCriados++;
  } catch (error) {
    // Silenciar erro e desabilitar Kafka
    kafkaHabilitado = false;
  }
}

// ============================================================================  
// FUNCOES AUXILIARES
// ============================================================================

async function criarAtualizacao(dados: {
  chamadoId: string;
  dataHora: Date;
  tipo: string;
  de?: string;
  para?: string;
  descricao?: string;
  autorId: string;
  autorNome: string;
  autorEmail: string;
}) {
  await ChamadoAtualizacao.create(dados);
}

async function criarUsuario(email: string, dados: any) {
  const hashed = await bcrypt.hash(dados.password, 10);
  return prisma.usuario.upsert({
    where: { email },
    update: { password: hashed, ativo: true },
    create: { ...dados, password: hashed, ativo: true },
  });
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(array: T[]): T {
  return array[randomInt(0, array.length - 1)];
}

function gerarDataInteligente(index: number, total: number): Date {
  const agora = new Date();
  const percentual = index / total;
  let data: Date;
  
  if (percentual < 0.40) {
    const diasAtras = Math.random() * 7;
    const msAtras = diasAtras * 24 * 60 * 60 * 1000;
    data = new Date(agora.getTime() - msAtras);
  } else if (percentual < 0.75) {
    const diasAtras = 8 + Math.random() * 22;
    const msAtras = diasAtras * 24 * 60 * 60 * 1000;
    data = new Date(agora.getTime() - msAtras);
  } else {
    const diasAtras = 31 + Math.random() * 59;
    const msAtras = diasAtras * 24 * 60 * 60 * 1000;
    data = new Date(agora.getTime() - msAtras);
  }
  
  if (data.getTime() > agora.getTime() - 5 * 60 * 1000) {
    data = new Date(agora.getTime() - 5 * 60 * 1000);
  }
  
  return data;
}

// ============================================================================  
// POPULAR REDIS - ESTATISTICAS E CACHE
// ============================================================================

async function popularRedis() {
  if (!redisHabilitado) return;

  console.log('\n' + '='.repeat(80));
  console.log('POPULANDO REDIS COM ESTATISTICAS E CACHE');
  console.log('='.repeat(80) + '\n');

  let chavesPopuladas = 0;

  try {
    // Limpar Redis
    console.log('[REDIS] Limpando cache anterior...');
    await redisClient.flushAll();
    console.log('[OK] Redis limpo!\n');

    // 1. ESTATÍSTICAS GERAIS
    console.log('[REDIS] Populando estatísticas gerais...');
    
    const totalChamados = await prisma.chamado.count();
    await redisClient.set('stats:chamados:total', totalChamados.toString(), { EX: TTL_MEDIO });
    chavesPopuladas++;
    
    const totalUsuarios = await prisma.usuario.count();
    await redisClient.set('stats:usuarios:total', totalUsuarios.toString(), { EX: TTL_LONGO });
    chavesPopuladas++;
    
    const totalTecnicos = await prisma.usuario.count({ where: { regra: 'TECNICO' } });
    await redisClient.set('stats:tecnicos:total', totalTecnicos.toString(), { EX: TTL_LONGO });
    chavesPopuladas++;
    
    const totalServicos = await prisma.servico.count({ where: { ativo: true } });
    await redisClient.set('stats:servicos:total', totalServicos.toString(), { EX: TTL_LONGO });
    chavesPopuladas++;
    
    console.log(`   [OK] Total Chamados: ${totalChamados}`);
    console.log(`   [OK] Total Usuários: ${totalUsuarios}`);
    console.log(`   [OK] Total Técnicos: ${totalTecnicos}`);
    console.log(`   [OK] Total Serviços Ativos: ${totalServicos}\n`);

    // 2. CHAMADOS POR STATUS
    console.log('[REDIS] Populando contadores por status...');
    
    const statusList = ['ABERTO', 'EM_ATENDIMENTO', 'ENCERRADO', 'CANCELADO', 'REABERTO'];
    for (const status of statusList) {
      const count = await prisma.chamado.count({ where: { status: status as any } });
      await redisClient.set(`stats:chamados:status:${status}`, count.toString(), { EX: TTL_CURTO });
      chavesPopuladas++;
      console.log(`   [OK] ${status}: ${count}`);
    }
    console.log('');

    // 3. CHAMADOS POR PERÍODO
    console.log('[REDIS] Populando chamados por período...');
    
    const agora = new Date();
    const ultimas24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const chamados24h = await prisma.chamado.count({ where: { geradoEm: { gte: ultimas24h } } });
    await redisClient.set('stats:chamados:periodo:24h', chamados24h.toString(), { EX: TTL_CURTO });
    chavesPopuladas++;
    
    const ultimos7dias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const chamados7dias = await prisma.chamado.count({ where: { geradoEm: { gte: ultimos7dias } } });
    await redisClient.set('stats:chamados:periodo:7dias', chamados7dias.toString(), { EX: TTL_MEDIO });
    chavesPopuladas++;
    
    const ultimos30dias = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const chamados30dias = await prisma.chamado.count({ where: { geradoEm: { gte: ultimos30dias } } });
    await redisClient.set('stats:chamados:periodo:30dias', chamados30dias.toString(), { EX: TTL_LONGO });
    chavesPopuladas++;
    
    console.log(`   [OK] Últimas 24h: ${chamados24h}`);
    console.log(`   [OK] Últimos 7 dias: ${chamados7dias}`);
    console.log(`   [OK] Últimos 30 dias: ${chamados30dias}\n`);

    // 4. PERFORMANCE DOS TÉCNICOS
    console.log('[REDIS] Populando performance dos técnicos...');
    
    const tecnicos = await prisma.usuario.findMany({
      where: { regra: 'TECNICO' },
      select: { id: true, nome: true, sobrenome: true }
    });
    
    for (const tecnico of tecnicos) {
      const totalAtribuidos = await prisma.chamado.count({ where: { tecnicoId: tecnico.id } });
      const totalEncerrados = await prisma.chamado.count({ where: { tecnicoId: tecnico.id, status: 'ENCERRADO' } });
      const emAtendimento = await prisma.chamado.count({ where: { tecnicoId: tecnico.id, status: 'EM_ATENDIMENTO' } });
      const taxaResolucao = totalAtribuidos > 0 ? ((totalEncerrados / totalAtribuidos) * 100).toFixed(2) : '0.00';
      
      await redisClient.hSet(`tecnico:${tecnico.id}:stats`, {
        nome: `${tecnico.nome} ${tecnico.sobrenome}`,
        totalAtribuidos: totalAtribuidos.toString(),
        totalEncerrados: totalEncerrados.toString(),
        emAtendimento: emAtendimento.toString(),
        taxaResolucao: taxaResolucao
      });
      await redisClient.expire(`tecnico:${tecnico.id}:stats`, TTL_MEDIO);
      chavesPopuladas++;
      
      console.log(`   [OK] ${tecnico.nome} ${tecnico.sobrenome}: ${totalAtribuidos} atribuídos, ${totalEncerrados} encerrados (${taxaResolucao}%)`);
    }
    console.log('');

    // 5. RANKING DE TÉCNICOS
    console.log('[REDIS] Populando ranking de técnicos...');
    
    await redisClient.del('ranking:tecnicos:resolvidos');
    
    for (const tecnico of tecnicos) {
      const totalEncerrados = await prisma.chamado.count({
        where: { tecnicoId: tecnico.id, status: 'ENCERRADO' }
      });
      
      await redisClient.zAdd('ranking:tecnicos:resolvidos', {
        score: totalEncerrados,
        value: `${tecnico.id}:${tecnico.nome} ${tecnico.sobrenome}`
      });
    }
    await redisClient.expire('ranking:tecnicos:resolvidos', TTL_LONGO);
    chavesPopuladas++;
    
    const top3 = await redisClient.zRange('ranking:tecnicos:resolvidos', 0, 2, { REV: true });
    console.log('   [TOP 3]');
    for (let i = 0; i < Math.min(3, top3.length); i++) {
      const [id, nome] = top3[i].split(':');
      const score = await redisClient.zScore('ranking:tecnicos:resolvidos', top3[i]);
      console.log(`      ${i + 1}º ${nome}: ${score} resolvidos`);
    }
    console.log('');

    // 6. CACHE DE SERVIÇOS ATIVOS
    console.log('[REDIS] Cacheando serviços ativos...');
    
    const servicos = await prisma.servico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, descricao: true }
    });
    
    await redisClient.set(
      'cache:servicos:ativos',
      JSON.stringify(servicos),
      { EX: TTL_MUITO_LONGO }
    );
    chavesPopuladas++;
    
    console.log(`   [OK] ${servicos.length} serviços cacheados\n`);

    // 7. USUÁRIOS POR SETOR
    console.log('[REDIS] Populando usuários por setor...');
    
    const setores = [
      'ADMINISTRACAO', 'ALMOXARIFADO', 'CALL_CENTER', 'COMERCIAL',
      'DEPARTAMENTO_PESSOAL', 'FINANCEIRO', 'JURIDICO', 'LOGISTICA',
      'MARKETING', 'QUALIDADE', 'RECURSOS_HUMANOS', 'TECNOLOGIA_INFORMACAO'
    ];
    
    for (const setor of setores) {
      const count = await prisma.usuario.count({ where: { setor: setor as any } });
      await redisClient.set(`stats:usuarios:setor:${setor}`, count.toString(), { EX: TTL_LONGO });
      chavesPopuladas++;
    }
    console.log(`   [OK] ${setores.length} setores populados\n`);

    // 8. TEMPO MÉDIO DE RESOLUÇÃO
    console.log('[REDIS] Calculando tempo médio de resolução...');
    
    const chamadosEncerrados = await prisma.chamado.findMany({
      where: { status: 'ENCERRADO', encerradoEm: { not: null } },
      select: { geradoEm: true, encerradoEm: true }
    });
    
    if (chamadosEncerrados.length > 0) {
      const tempos = chamadosEncerrados.map(c => {
        const inicio = new Date(c.geradoEm).getTime();
        const fim = new Date(c.encerradoEm!).getTime();
        return (fim - inicio) / (1000 * 60 * 60); // em horas
      });
      
      const tempoMedio = tempos.reduce((a, b) => a + b, 0) / tempos.length;
      await redisClient.set('stats:tempo:medio:resolucao', tempoMedio.toFixed(2), { EX: TTL_LONGO });
      chavesPopuladas++;
      
      console.log(`   [OK] Tempo médio de resolução: ${tempoMedio.toFixed(2)} horas\n`);
    }

    // 9. SLA - CHAMADOS DENTRO/FORA DO PRAZO
    console.log('[REDIS] Calculando métricas de SLA...');
    
    const sla24h = 24; // SLA de 24 horas
    let dentroPrazo = 0;
    let foraPrazo = 0;
    
    for (const chamado of chamadosEncerrados) {
      const inicio = new Date(chamado.geradoEm).getTime();
      const fim = new Date(chamado.encerradoEm!).getTime();
      const horas = (fim - inicio) / (1000 * 60 * 60);
      
      if (horas <= sla24h) dentroPrazo++;
      else foraPrazo++;
    }
    
    await redisClient.set('stats:sla:dentro:prazo', dentroPrazo.toString(), { EX: TTL_MEDIO });
    await redisClient.set('stats:sla:fora:prazo', foraPrazo.toString(), { EX: TTL_MEDIO });
    chavesPopuladas += 2;
    
    const percentualSLA = chamadosEncerrados.length > 0 
      ? ((dentroPrazo / chamadosEncerrados.length) * 100).toFixed(2) 
      : '0.00';
    await redisClient.set('stats:sla:percentual', percentualSLA, { EX: TTL_MEDIO });
    chavesPopuladas++;
    
    console.log(`   [OK] Dentro do prazo (24h): ${dentroPrazo} (${percentualSLA}%)`);
    console.log(`   [OK] Fora do prazo: ${foraPrazo}\n`);

    // 10. LISTA DOS ÚLTIMOS CHAMADOS (TOP 50)
    console.log('[REDIS] Cacheando últimos 50 chamados...');
    
    const ultimosChamados = await prisma.chamado.findMany({
      take: 50,
      orderBy: { geradoEm: 'desc' },
      select: {
        id: true,
        OS: true,
        descricao: true,
        status: true,
        geradoEm: true,
        usuario: { select: { nome: true, sobrenome: true } }
      }
    });
    
    await redisClient.set(
      'cache:chamados:ultimos:50',
      JSON.stringify(ultimosChamados),
      { EX: TTL_CURTO }
    );
    chavesPopuladas++;
    
    console.log(`   [OK] ${ultimosChamados.length} chamados cacheados\n`);

    console.log('='.repeat(80));
    console.log(`[REDIS] ${chavesPopuladas} chaves populadas com sucesso!`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('[REDIS] Erro ao popular cache:', error);
    redisHabilitado = false;
  }
}

// ============================================================================  
// DADOS PARA CHAMADOS ALEATORIOS
// ============================================================================

const problemas = [
  'Computador nao liga', 'Internet lenta', 'Email nao esta funcionando',
  'Impressora travada', 'Senha expirada', 'Sistema nao responde',
  'Erro ao acessar sistema', 'Telefone sem sinal', 'Mouse nao funciona',
  'Teclado com teclas travadas', 'Monitor sem imagem', 'Aplicativo travando',
  'Erro de acesso negado', 'Backup nao realizado', 'VPN nao conecta',
  'Arquivo corrompido', 'Espaco em disco cheio', 'Software precisa atualizacao',
  'Configuracao de email', 'Instalacao de programa', 'Problema com antivirus',
  'Rede sem internet', 'Erro no banco de dados', 'Licenca de software expirada',
  'Periferico USB nao reconhecido', 'Problema com drivers', 'Sistema operacional lento',
  'Falha no login', 'Camera nao funciona', 'Audio sem som',
  'Projetor sem sinal', 'Scanner nao digitaliza', 'Problema com certificado digital',
  'Erro ao imprimir', 'Notebook superaquecendo', 'Bateria nao carrega',
  'Configuracao de rede', 'Problema com Teams/Zoom', 'Transferencia de arquivos falhou',
  'Acesso remoto nao funciona',
];

const descricoes = [
  'Equipamento apresentando falha desde hoje pela manha',
  'Problema intermitente ao longo do dia',
  'Erro ocorreu apos ultima atualizacao',
  'Nao consigo trabalhar devido ao problema',
  'Urgente! Preciso resolver o quanto antes',
  'Problema comecou ontem a tarde',
  'Equipamento esta inoperante',
  'Tentei reiniciar mas nao resolveu',
  'Mensagem de erro aparece constantemente',
  'Performance muito abaixo do esperado',
  'Ja tentei varias solucoes sem sucesso',
  'Problema afetando toda a equipe',
  'Sistema critico fora do ar',
  'Impossivel realizar minhas atividades',
  'Problema recorrente que precisa solucao definitiva',
  'Equipamento apresenta lentidao extrema',
  'Erro critico no sistema',
  'Necessito suporte tecnico especializado',
  'Problema detectado no inicio do expediente',
  'Falha intermitente dificulta o trabalho',
];

const resolucoes = [
  'Problema resolvido apos reinicializacao do sistema',
  'Configuracao ajustada com sucesso',
  'Software atualizado e testado',
  'Hardware substituido e funcionando normalmente',
  'Usuario orientado sobre procedimento correto',
  'Permissoes de acesso ajustadas',
  'Servico reiniciado e normalizado',
  'Driver atualizado com sucesso',
  'Cabo substituido, equipamento funcionando',
  'Senha redefinida e acesso liberado',
  'Backup realizado e verificado',
  'Limpeza de arquivos temporarios resolveu o problema',
  'Antivirus atualizado e sistema verificado',
  'Conexao de rede reconfigurada',
  'Aplicativo reinstalado corretamente',
  'Problema era configuracao incorreta',
  'Memoria RAM adicionada, sistema mais rapido',
  'Disco rigido substituido por SSD',
  'Licenca renovada e ativada',
  'Problema resolvido remotamente',
];

const descricoesAtualizacao = [
  'Tecnico analisando o problema',
  'Diagnostico inicial realizado',
  'Aguardando aprovacao para substituicao de peca',
  'Realizando testes',
  'Configurando sistema',
  'Aplicando atualizacoes',
  'Aguardando reinicializacao',
  'Verificando conectividade',
  'Testando funcionalidades',
  'Documentando procedimento'
];

// ============================================================================  
// FUNCAO PRINCIPAL DE SEED
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('SEED COMPLETO: PostgreSQL + MongoDB + Kafka + Redis');
  console.log('='.repeat(80));
  console.log('\nIniciando seed do banco de dados com 15.000 chamados...\n');

  // ============================================================================
  // 0. CONECTAR AOS BANCOS E SERVICOS
  // ============================================================================
  console.log('Conectando ao MongoDB...\n');
  await connectMongo();
  
  console.log('Conectando ao Redis...\n');
  await conectarRedis();
  
  console.log('Conectando ao Kafka...\n');
  await conectarKafka();
  
  if (kafkaHabilitado) {
    await criarTopicosKafka();
  }

  // ============================================================================
  // 1. LIMPAR TODA A BASE DE DADOS
  // ============================================================================
  console.log('Limpando base de dados (PostgreSQL + MongoDB)...\n');
  
  try {
    await prisma.ordemDeServico.deleteMany({});
    console.log('   [PG] Ordens de servico removidas');
    
    await prisma.chamado.deleteMany({});
    console.log('   [PG] Chamados removidos');
    
    await prisma.expediente.deleteMany({});
    console.log('   [PG] Expedientes removidos');
    
    await prisma.servico.deleteMany({});
    console.log('   [PG] Servicos removidos');
    
    await prisma.usuario.deleteMany({});
    console.log('   [PG] Usuarios removidos');
    
    await ChamadoAtualizacao.deleteMany({});
    console.log('   [MONGO] Atualizacoes de chamados removidas');
    
    console.log('\n[SUCESSO] Base de dados limpa com sucesso!\n');
  } catch (error) {
    console.error('[ERRO] Erro ao limpar base de dados:', error);
    throw error;
  }

  // ============================================================================
  // 2. CRIAR ADMIN
  // ============================================================================
  console.log('Criando Admin...');
  
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

  console.log('[OK] Admin criado:', adminUser.email);

  // ============================================================================
  // 3. CRIAR 5 TECNICOS
  // ============================================================================
  console.log('\nCriando 5 Tecnicos...');
  
  const tecnicosData = [
    { nome: 'Carlos', sobrenome: 'Silva', email: 'carlos.silva@helpme.com', telefone: '(11) 98765-0001', ramal: '3001' },
    { nome: 'Ana', sobrenome: 'Santos', email: 'ana.santos@helpme.com', telefone: '(11) 98765-0002', ramal: '3002' },
    { nome: 'Roberto', sobrenome: 'Ferreira', email: 'roberto.ferreira@helpme.com', telefone: '(11) 98765-0003', ramal: '3003' },
    { nome: 'Juliana', sobrenome: 'Alves', email: 'juliana.alves@helpme.com', telefone: '(11) 98765-0004', ramal: '3004' },
    { nome: 'Fernando', sobrenome: 'Souza', email: 'fernando.souza@helpme.com', telefone: '(11) 98765-0005', ramal: '3005' },
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
    console.log(`[OK] Tecnico: ${tecnico.nome} ${tecnico.sobrenome}`);
  }

  for (const tecnico of tecnicos) {
    const expedienteId = `${tecnico.id}-expediente`;
    await prisma.expediente.upsert({
      where: { id: expedienteId },
      update: { entrada: '08:00', saida: '18:00' },
      create: { id: expedienteId, usuarioId: tecnico.id, entrada: '08:00', saida: '18:00' },
    });
  }

  console.log('[OK] Expedientes configurados: 08:00 - 18:00\n');

  // ============================================================================
  // 4. CRIAR 12 USUARIOS (UM PARA CADA SETOR)
  // ============================================================================
  console.log('Criando 12 Usuarios (um por setor)...');
  
  const usuariosData = [
    { nome: 'Joao', sobrenome: 'Oliveira', setor: Setor.ADMINISTRACAO, email: 'joao.oliveira@helpme.com', ramal: '2001' },
    { nome: 'Maria', sobrenome: 'Costa', setor: Setor.ALMOXARIFADO, email: 'maria.costa@helpme.com', ramal: '2002' },
    { nome: 'Pedro', sobrenome: 'Lima', setor: Setor.CALL_CENTER, email: 'pedro.lima@helpme.com', ramal: '2003' },
    { nome: 'Paula', sobrenome: 'Martins', setor: Setor.COMERCIAL, email: 'paula.martins@helpme.com', ramal: '2004' },
    { nome: 'Ricardo', sobrenome: 'Rocha', setor: Setor.DEPARTAMENTO_PESSOAL, email: 'ricardo.rocha@helpme.com', ramal: '2005' },
    { nome: 'Fernanda', sobrenome: 'Mendes', setor: Setor.FINANCEIRO, email: 'fernanda.mendes@helpme.com', ramal: '2006' },
    { nome: 'Lucas', sobrenome: 'Barbosa', setor: Setor.JURIDICO, email: 'lucas.barbosa@helpme.com', ramal: '2007' },
    { nome: 'Camila', sobrenome: 'Ribeiro', setor: Setor.LOGISTICA, email: 'camila.ribeiro@helpme.com', ramal: '2008' },
    { nome: 'Bruno', sobrenome: 'Cardoso', setor: Setor.MARKETING, email: 'bruno.cardoso@helpme.com', ramal: '2009' },
    { nome: 'Aline', sobrenome: 'Pereira', setor: Setor.QUALIDADE, email: 'aline.pereira@helpme.com', ramal: '2010' },
    { nome: 'Rodrigo', sobrenome: 'Dias', setor: Setor.RECURSOS_HUMANOS, email: 'rodrigo.dias@helpme.com', ramal: '2011' },
    { nome: 'Beatriz', sobrenome: 'Araujo', setor: Setor.TECNOLOGIA_INFORMACAO, email: 'beatriz.araujo@helpme.com', ramal: '2012' },
  ];

  const usuarios = [];
  for (const dados of usuariosData) {
    const usuario = await criarUsuario(dados.email, {
      ...dados,
      password: 'User123!',
      regra: Regra.USUARIO,
      telefone: `(11) 97654-${dados.ramal}`,
    });
    usuarios.push(usuario);
    console.log(`[OK] Usuario: ${usuario.nome} ${usuario.sobrenome} (${dados.setor})`);
  }

  // ============================================================================
  // 5. CRIAR SERVICOS
  // ============================================================================
  console.log('\nCriando Servicos...');
  
  const servicosData = [
    { nome: 'Suporte Tecnico Geral', descricao: 'Suporte tecnico para problemas gerais', ativo: true },
    { nome: 'Instalacao de Software', descricao: 'Instalacao e configuracao de softwares', ativo: true },
    { nome: 'Manutencao de Hardware', descricao: 'Reparo e manutencao de equipamentos', ativo: true },
    { nome: 'Suporte de Rede', descricao: 'Configuracao e troubleshooting de rede', ativo: true },
    { nome: 'Backup e Recuperacao', descricao: 'Servicos de backup e recuperacao de dados', ativo: true },
    { nome: 'Configuracao de Email', descricao: 'Configuracao de contas de email', ativo: true },
    { nome: 'Acesso e Permissoes', descricao: 'Gerenciamento de acessos e permissoes', ativo: true },
    { nome: 'Impressoras e Perifericos', descricao: 'Suporte para impressoras e perifericos', ativo: true },
  ];

  const servicos = [];
  for (const dados of servicosData) {
    const servico = await prisma.servico.upsert({
      where: { nome: dados.nome },
      update: { descricao: dados.descricao, ativo: dados.ativo },
      create: dados,
    });
    servicos.push(servico);
    console.log(`[OK] Servico: ${servico.nome}`);
  }

  // ============================================================================
  // 6. CRIAR 15.000 CHAMADOS + MONGO + KAFKA
  // ============================================================================
  console.log('\nCriando 15.000 chamados com distribuicao inteligente...\n');
  console.log(`   [INFO] Kafka habilitado: ${kafkaHabilitado ? 'SIM' : 'NAO'}\n`);

  const agora = new Date();
  const data7DiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const data30DiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const data90DiasAtras = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);

  const distribuicaoStatus = [
    ...Array(12).fill(ChamadoStatus.ABERTO),
    ...Array(4406).fill(ChamadoStatus.EM_ATENDIMENTO),
    ...Array(8810).fill(ChamadoStatus.ENCERRADO),
    ...Array(1234).fill(ChamadoStatus.CANCELADO),
    ...Array(538).fill(ChamadoStatus.REABERTO),
  ];

  let chamadosCriados = 0;
  let atualizacoesCriadas = 0;
  const totalChamados = 15000;
  const batchSize = 50;
  const totalBatches = Math.ceil(totalChamados / batchSize);

  for (let batch = 0; batch < totalBatches; batch++) {
    const chamadosBatch: any[] = [];
    const chamadosNesteBatch = Math.min(batchSize, totalChamados - chamadosCriados);
    
    for (let i = 0; i < chamadosNesteBatch; i++) {
      const numero = chamadosCriados + 1;
      const OS = `INC${numero.toString().padStart(6, '0')}`;
      
      const usuario = randomElement(usuarios);
      const status = distribuicaoStatus[chamadosCriados];
      const servico = randomElement(servicos);
      const problema = randomElement(problemas);
      const descricao = `${problema}. ${randomElement(descricoes)}`;
      
      const geradoEm = gerarDataInteligente(chamadosCriados, totalChamados);
      
      const chamadoData: any = {
        OS,
        descricao,
        status,
        usuarioId: usuario.id,
        geradoEm,
      };

      let tecnico = null;
      const atualizacoesDoChamado: any[] = [];
      const eventosKafka: any[] = [];

      // ATUALIZACAO: CRIACAO
      atualizacoesDoChamado.push({
        tipo: 'CRIACAO',
        dataHora: geradoEm,
        descricao: `Chamado criado: ${problema}`,
        autorId: usuario.id,
        autorNome: `${usuario.nome} ${usuario.sobrenome}`,
        autorEmail: usuario.email,
      });

      // EVENTO KAFKA: CRIACAO
      eventosKafka.push({
        topic: TOPICS.CHAMADO_CRIADO,
        key: 'to-be-set',
        timestamp: geradoEm,
        evento: {
          eventId: `${OS}-criado`,
          eventType: 'chamado.criado',
          timestamp: geradoEm.toISOString(),
          version: '1.0',
          source: 'helpdesk-api',
          data: {
            OS,
            descricao,
            status,
            usuario: {
              id: usuario.id,
              nome: `${usuario.nome} ${usuario.sobrenome}`,
              email: usuario.email,
              setor: usuario.setor,
            },
            servico: {
              id: servico.id,
              nome: servico.nome,
            },
            geradoEm: geradoEm.toISOString(),
          },
        },
      });

      // KAFKA: AUDITORIA - CRIACAO
      eventosKafka.push({
        topic: TOPICS.AUDITORIA,
        key: `${OS}-audit-criacao`,
        timestamp: geradoEm,
        evento: {
          eventId: `${OS}-audit-criacao`,
          timestamp: geradoEm.toISOString(),
          action: 'CREATE',
          entity: 'Chamado',
          OS,
          userId: usuario.id,
          userName: `${usuario.nome} ${usuario.sobrenome}`,
          changes: {
            status: { from: null, to: 'ABERTO' },
          },
        },
      });

      // KAFKA: NOTIFICACAO EMAIL - CRIACAO
      eventosKafka.push({
        topic: TOPICS.NOTIFICACAO_EMAIL,
        key: `${OS}-email-criacao`,
        timestamp: geradoEm,
        evento: {
          eventId: `${OS}-email-criacao`,
          timestamp: geradoEm.toISOString(),
          to: [usuario.email],
          subject: `Chamado ${OS} criado com sucesso`,
          template: 'chamado-criado',
          data: { OS, usuarioNome: `${usuario.nome} ${usuario.sobrenome}`, descricao, status },
        },
      });

      if (status !== ChamadoStatus.ABERTO) {
        tecnico = randomElement(tecnicos);
        chamadoData.tecnicoId = tecnico.id;
        
        const horasAtualizacao = randomInt(1, 48);
        let atualizadoEm = new Date(geradoEm.getTime() + horasAtualizacao * 60 * 60 * 1000);
        
        if (atualizadoEm > agora) {
          atualizadoEm = new Date(agora.getTime() - 30 * 60 * 1000);
        }
        
        chamadoData.atualizadoEm = atualizadoEm;

        // ATUALIZACAO: ATRIBUICAO
        atualizacoesDoChamado.push({
          tipo: 'ATRIBUICAO',
          dataHora: new Date(geradoEm.getTime() + randomInt(5, 30) * 60 * 1000),
          de: 'Sem tecnico',
          para: `${tecnico.nome} ${tecnico.sobrenome}`,
          descricao: `Chamado atribuido ao tecnico ${tecnico.nome} ${tecnico.sobrenome}`,
          autorId: adminUser.id,
          autorNome: `${adminUser.nome} ${adminUser.sobrenome}`,
          autorEmail: adminUser.email,
        });

        // KAFKA: ATRIBUICAO
        const dataAtribuicao = new Date(geradoEm.getTime() + randomInt(5, 30) * 60 * 1000);
        eventosKafka.push({
          topic: TOPICS.CHAMADO_ATRIBUIDO,
          key: 'to-be-set',
          timestamp: dataAtribuicao,
          evento: {
            eventId: `${OS}-atribuido`,
            eventType: 'chamado.atribuido',
            timestamp: dataAtribuicao.toISOString(),
            version: '1.0',
            source: 'helpdesk-api',
            data: {
              OS,
              tecnico: {
                id: tecnico.id,
                nome: `${tecnico.nome} ${tecnico.sobrenome}`,
                email: tecnico.email,
              },
            },
          },
        });

        // ATUALIZACAO: MUDANCA DE STATUS
        atualizacoesDoChamado.push({
          tipo: 'MUDANCA_STATUS',
          dataHora: atualizadoEm,
          de: 'ABERTO',
          para: 'EM_ATENDIMENTO',
          descricao: randomElement(descricoesAtualizacao),
          autorId: tecnico.id,
          autorNome: `${tecnico.nome} ${tecnico.sobrenome}`,
          autorEmail: tecnico.email,
        });

        // KAFKA: ATUALIZADO
        eventosKafka.push({
          topic: TOPICS.CHAMADO_ATUALIZADO,
          key: 'to-be-set',
          timestamp: atualizadoEm,
          evento: {
            eventId: `${OS}-atualizado`,
            eventType: 'chamado.atualizado',
            timestamp: atualizadoEm.toISOString(),
            version: '1.0',
            source: 'helpdesk-api',
            data: {
              OS,
              statusAnterior: 'ABERTO',
              statusNovo: 'EM_ATENDIMENTO',
              tecnicoId: tecnico.id,
            },
          },
        });
      }

      if (status === ChamadoStatus.ENCERRADO) {
        const horasParaResolver = randomInt(1, 72);
        let encerradoEm = new Date(geradoEm.getTime() + horasParaResolver * 60 * 60 * 1000);
        
        if (encerradoEm > agora) {
          encerradoEm = new Date(agora.getTime() - 15 * 60 * 1000);
        }
        
        chamadoData.encerradoEm = encerradoEm;
        chamadoData.descricaoEncerramento = randomElement(resolucoes);

        // ATUALIZACOES INTERMEDIARIAS
        const numAtualizacoes = randomInt(1, 3);
        const tempoTotal = encerradoEm.getTime() - chamadoData.atualizadoEm.getTime();
        
        for (let j = 0; j < numAtualizacoes; j++) {
          const porcentagem = (j + 1) / (numAtualizacoes + 1);
          const dataAtualizacao = new Date(
            chamadoData.atualizadoEm.getTime() + tempoTotal * porcentagem
          );
          
          atualizacoesDoChamado.push({
            tipo: 'COMENTARIO',
            dataHora: dataAtualizacao,
            descricao: randomElement(descricoesAtualizacao),
            autorId: tecnico!.id,
            autorNome: `${tecnico!.nome} ${tecnico!.sobrenome}`,
            autorEmail: tecnico!.email,
          });
        }

        // ATUALIZACAO: ENCERRAMENTO
        atualizacoesDoChamado.push({
          tipo: 'MUDANCA_STATUS',
          dataHora: encerradoEm,
          de: 'EM_ATENDIMENTO',
          para: 'ENCERRADO',
          descricao: chamadoData.descricaoEncerramento,
          autorId: tecnico!.id,
          autorNome: `${tecnico!.nome} ${tecnico!.sobrenome}`,
          autorEmail: tecnico!.email,
        });

        // KAFKA: ENCERRADO
        eventosKafka.push({
          topic: TOPICS.CHAMADO_ENCERRADO,
          key: 'to-be-set',
          timestamp: encerradoEm,
          evento: {
            eventId: `${OS}-encerrado`,
            eventType: 'chamado.encerrado',
            timestamp: encerradoEm.toISOString(),
            version: '1.0',
            source: 'helpdesk-api',
            data: {
              OS,
              descricaoEncerramento: chamadoData.descricaoEncerramento,
              tempoResolucao: encerradoEm.getTime() - geradoEm.getTime(),
            },
          },
        });

      } else if (status === ChamadoStatus.CANCELADO) {
        const horasParaCancelar = randomInt(1, 24);
        let encerradoEm = new Date(geradoEm.getTime() + horasParaCancelar * 60 * 60 * 1000);
        
        if (encerradoEm > agora) {
          encerradoEm = new Date(agora.getTime() - 15 * 60 * 1000);
        }
        
        chamadoData.encerradoEm = encerradoEm;
        chamadoData.descricaoEncerramento = 'Chamado cancelado a pedido do usuario';

        // ATUALIZACAO: CANCELAMENTO
        atualizacoesDoChamado.push({
          tipo: 'MUDANCA_STATUS',
          dataHora: encerradoEm,
          de: chamadoData.atualizadoEm ? 'EM_ATENDIMENTO' : 'ABERTO',
          para: 'CANCELADO',
          descricao: 'Chamado cancelado a pedido do usuario',
          autorId: usuario.id,
          autorNome: `${usuario.nome} ${usuario.sobrenome}`,
          autorEmail: usuario.email,
        });

        // KAFKA: CANCELADO
        eventosKafka.push({
          topic: TOPICS.CHAMADO_CANCELADO,
          key: 'to-be-set',
          timestamp: encerradoEm,
          evento: {
            eventId: `${OS}-cancelado`,
            eventType: 'chamado.cancelado',
            timestamp: encerradoEm.toISOString(),
            version: '1.0',
            source: 'helpdesk-api',
            data: {
              OS,
              motivo: chamadoData.descricaoEncerramento,
            },
          },
        });

      } else if (status === ChamadoStatus.REABERTO) {
        const horasParaEncerrar = randomInt(24, 72);
        let primeiroEncerramento = new Date(geradoEm.getTime() + horasParaEncerrar * 60 * 60 * 1000);
        
        if (primeiroEncerramento > agora) {
          primeiroEncerramento = new Date(agora.getTime() - 48 * 60 * 60 * 1000);
        }

        const resolucaoInicial = randomElement(resolucoes);

        // ATUALIZACAO: PRIMEIRO ENCERRAMENTO
        atualizacoesDoChamado.push({
          tipo: 'MUDANCA_STATUS',
          dataHora: primeiroEncerramento,
          de: 'EM_ATENDIMENTO',
          para: 'ENCERRADO',
          descricao: resolucaoInicial,
          autorId: tecnico!.id,
          autorNome: `${tecnico!.nome} ${tecnico!.sobrenome}`,
          autorEmail: tecnico!.email,
        });

        // REABERTURA
        const horasParaReabrir = randomInt(4, 24);
        let reabertoEm = new Date(primeiroEncerramento.getTime() + horasParaReabrir * 60 * 60 * 1000);
        
        if (reabertoEm > agora) {
          reabertoEm = new Date(agora.getTime() - 10 * 60 * 1000);
        }

        chamadoData.atualizadoEm = reabertoEm;

        // ATUALIZACAO: REABERTURA
        atualizacoesDoChamado.push({
          tipo: 'MUDANCA_STATUS',
          dataHora: reabertoEm,
          de: 'ENCERRADO',
          para: 'REABERTO',
          descricao: 'Problema persiste, reabrindo chamado',
          autorId: usuario.id,
          autorNome: `${usuario.nome} ${usuario.sobrenome}`,
          autorEmail: usuario.email,
        });

        // KAFKA: REABERTO
        eventosKafka.push({
          topic: TOPICS.CHAMADO_REABERTO,
          key: 'to-be-set',
          timestamp: reabertoEm,
          evento: {
            eventId: `${OS}-reaberto`,
            eventType: 'chamado.reaberto',
            timestamp: reabertoEm.toISOString(),
            version: '1.0',
            source: 'helpdesk-api',
            data: {
              OS,
              motivo: 'Problema persistiu após encerramento',
            },
          },
        });
      }

      chamadosBatch.push({ 
        chamadoData, 
        servicoId: servico.id, 
        atualizacoes: atualizacoesDoChamado,
        eventosKafka 
      });
      chamadosCriados++;
    }

    // SALVAR POSTGRESQL
    await prisma.$transaction(async (tx) => {
      for (const { chamadoData, servicoId } of chamadosBatch) {
        const chamado = await tx.chamado.create({
          data: chamadoData,
        });

        await tx.ordemDeServico.create({
          data: {
            chamadoId: chamado.id,
            servicoId: servicoId,
          },
        });
      }
    });

    // SALVAR MONGODB + KAFKA
    for (const { chamadoData, atualizacoes, eventosKafka } of chamadosBatch) {
      const chamado = await prisma.chamado.findUnique({
        where: { OS: chamadoData.OS }
      });

      if (chamado) {
        // MONGODB
        for (const atualizacao of atualizacoes) {
          await criarAtualizacao({
            chamadoId: chamado.id,
            ...atualizacao
          });
          atualizacoesCriadas++;
        }

        // KAFKA
        for (const { topic, key, timestamp, evento } of eventosKafka) {
          const kafkaKey = key === 'to-be-set' ? chamado.id : key;
          await publicarEventoKafka(topic, kafkaKey, evento, timestamp);
        }
      }
    }

    const progresso = ((chamadosCriados / totalChamados) * 100).toFixed(1);
    const barraProgresso = '='.repeat(Math.floor(parseFloat(progresso) / 5));
    const espacos = ' '.repeat(20 - barraProgresso.length);
    const eventosTxt = kafkaHabilitado ? ` | ${eventosCriados} eventos Kafka` : '';
    console.log(`[${barraProgresso}${espacos}] Lote ${batch + 1}/${totalBatches} | ${chamadosCriados}/${totalChamados} (${progresso}%) | ${atualizacoesCriadas} atualizações${eventosTxt}`);
  }

  // ============================================================================
  // 7. POPULAR REDIS COM ESTATISTICAS
  // ============================================================================
  await popularRedis();

  // ============================================================================
  // 8. VALIDACAO DOS DADOS
  // ============================================================================
  console.log('\n[VALIDACAO] Verificando distribuicao dos dados...\n');

  const totalCriados = await prisma.chamado.count();
  const totalAtualizacoes = await ChamadoAtualizacao.countDocuments();
  
  console.log(`[CHECK PG] Total de chamados: ${totalCriados}`);
  console.log(`[CHECK MONGO] Total de atualizacoes: ${totalAtualizacoes}`);
  if (kafkaHabilitado) {
    console.log(`[CHECK KAFKA] Total de eventos: ${eventosCriados}`);
  }

  const ultimos7Dias = await prisma.chamado.count({
    where: { geradoEm: { gte: data7DiasAtras } }
  });
  console.log(`[CHECK] Ultimos 7 dias: ${ultimos7Dias} (${((ultimos7Dias/totalCriados)*100).toFixed(1)}%)`);

  const ultimos30Dias = await prisma.chamado.count({
    where: { geradoEm: { gte: data30DiasAtras } }
  });
  console.log(`[CHECK] Ultimos 30 dias: ${ultimos30Dias} (${((ultimos30Dias/totalCriados)*100).toFixed(1)}%)`);

  // ============================================================================
  // 9. ESTATISTICAS FINAIS
  // ============================================================================
  console.log('\nEstatisticas dos chamados criados:\n');

  const stats = await prisma.chamado.groupBy({
    by: ['status'],
    _count: true,
  });

  for (const stat of stats) {
    const percentual = ((stat._count / totalChamados) * 100).toFixed(2);
    const espacamento = ' '.repeat(20 - stat.status.length);
    console.log(`   ${stat.status}:${espacamento}${stat._count.toString().padStart(5)} chamados (${percentual.padStart(5)}%)`);
  }

  // ============================================================================
  // RESUMO FINAL
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('SEED COMPLETO CONCLUIDO COM SUCESSO!');
  console.log('='.repeat(80));
  console.log('\n[RESUMO]\n');
  console.log(`   - 1 Admin criado`);
  console.log(`   - 5 Tecnicos criados`);
  console.log(`   - 12 Usuarios criados`);
  console.log(`   - ${servicos.length} Servicos criados`);
  console.log(`   - ${totalChamados} Chamados criados`);
  console.log(`\n[BANCOS DE DADOS]`);
  console.log(`   - PostgreSQL: ${totalCriados} chamados`);
  console.log(`   - MongoDB: ${totalAtualizacoes} atualizacoes`);
  if (kafkaHabilitado) {
    console.log(`   - Kafka: ${eventosCriados} eventos`);
  } else {
    console.log(`   - Kafka: DESABILITADO (configure KAFKA_BROKER_URL)`);
  }
  if (redisHabilitado) {
    const totalChaves = await redisClient.dbSize();
    console.log(`   - Redis: ${totalChaves} chaves em cache`);
  } else {
    console.log(`   - Redis: DESABILITADO (configure REDIS_HOST)`);
  }
  console.log('\n' + '='.repeat(80) + '\n');
}

// ============================================================================  
// EXECUCAO
// ============================================================================

main()
  .catch((e) => {
    console.error('[ERRO] Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectMongo();
    await desconectarKafka();
    await desconectarRedis();
  });