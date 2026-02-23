import { PrismaClient, Regra, ChamadoStatus, Setor, Usuario, Servico } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { Kafka } from 'kafkajs';

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const MONGODB_URI = process.env.MONGO_INITDB_URI || 
  `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_INITDB_DATABASE}?authSource=admin`;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KAFKA_ENABLED = process.env.KAFKA_ENABLED !== 'false';
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER_URL || 'localhost:9093').split(',');

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function gerarOS(index: number): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `OS-${timestamp}-${index}-${random}`;
}

function gerarDataAleatoria(diasAtras: number): Date {
  const hoje = new Date();
  const diasAleatorios = Math.floor(Math.random() * diasAtras);
  const data = new Date(hoje.getTime() - diasAleatorios * 24 * 60 * 60 * 1000);
  return data;
}

function adicionarTempoAleatorio(data: Date, horasMin: number, horasMax: number): Date {
  const horas = Math.random() * (horasMax - horasMin) + horasMin;
  return new Date(data.getTime() + horas * 60 * 60 * 1000);
}

function gerarRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function gerarIP(): string {
  return `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function gerarUserAgent(): string {
  const browsers = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0',
  ];
  return browsers[Math.floor(Math.random() * browsers.length)];
}

let contadores = {
  systemLogs: 0,
  auditLogs: 0,
  eventosKafka: 0,
  chamadosRedis: 0,
  usuariosRedis: 0,
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🌱 SEED BIG HELP-ME');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('[1/8] Conectando aos bancos de dados...\n');

  console.log('Conectando ao MongoDB...');
  const mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const mongodb = mongoClient.db(process.env.MONGO_INITDB_DATABASE || 'helpme-mongo');
  console.log('MongoDB conectado');
 
  console.log('Conectando ao Redis...');
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  console.log('Redis conectado');

  let kafkaProducer: any = null;
  let kafkaConnected = false;

  if (KAFKA_ENABLED) {
    try {
      console.log(`Tentando conectar ao Kafka em: ${KAFKA_BROKERS.join(', ')}...`);
      const kafka = new Kafka({
        clientId: 'helpme-seed',
        brokers: KAFKA_BROKERS,
        retry: {
          retries: 3,
          initialRetryTime: 100,
        },
        connectionTimeout: 3000,
        requestTimeout: 5000,
      });
      
      kafkaProducer = kafka.producer();
      await kafkaProducer.connect();
      kafkaConnected = true;
      console.log('Kafka conectado');
    } catch (error) {
      console.log('Kafka não disponível - continuando sem eventos');
      kafkaConnected = false;
    }
  } else {
    console.log('Kafka desabilitado via variável de ambiente');
  }

  console.log();

  console.log('[2/8] Limpando dados existentes...\n');
  
  console.log('PostgreSQL:');
  await prisma.ordemDeServico.deleteMany();
  console.log('1 - Ordens de Serviço removidas');
  await prisma.chamado.deleteMany();
  console.log('2 - Chamados removidos');
  await prisma.expediente.deleteMany();
  console.log('3 - Expedientes removidos');
  await prisma.servico.deleteMany();
  console.log('4 - Serviços removidos');
  await prisma.usuario.deleteMany();
  console.log('5 - Usuários removidos');

  console.log('MongoDB:');
  const mongoCollections = await mongodb.listCollections().toArray();
  for (const collection of mongoCollections) {
    const count = await mongodb.collection(collection.name).countDocuments();
    await mongodb.collection(collection.name).deleteMany({});
    console.log(`${collection.name} limpo (${count} documentos removidos)`);
  }

  console.log('Redis:');
  const redisKeys = await redis.keys('*');
  await redis.flushAll();
  console.log(`Redis limpo (${redisKeys.length} chaves removidas)`);

  console.log();

  console.log('[3/8] Criando usuários...\n');

  const senhaHash = hashPassword('Senha@123');
  const setoresDisponiveis = Object.values(Setor);

  console.log('Criando Admin...');
  const admin = await prisma.usuario.create({
    data: {
      nome: 'Admin',
      sobrenome: 'Sistema',
      email: 'admin@helpme.com',
      password: senhaHash,
      regra: Regra.ADMIN,
      setor: Setor.TECNOLOGIA_INFORMACAO,
      telefone: '(11) 98888-0000',
      ramal: '1000',
      ativo: true,
    },
  });
  console.log('Admin criado');

  console.log('Criando 20 técnicos...');
  const tecnicos: Usuario[] = [];

  for (let i = 1; i <= 20; i++) {
    const tecnico = await prisma.usuario.create({
      data: {
        nome: `Técnico`,
        sobrenome: `${i}`,
        email: `tecnico${i}@helpme.com`,
        password: senhaHash,
        regra: Regra.TECNICO,
        setor: setoresDisponiveis[i % setoresDisponiveis.length],
        telefone: `(11) 9${8000 + i}-${1000 + i}`,
        ramal: `${2000 + i}`,
        ativo: true,
      },
    });
    tecnicos.push(tecnico);

    await redis.hSet(`user:${tecnico.id}`, {
      id: tecnico.id,
      nome: `${tecnico.nome} ${tecnico.sobrenome}`,
      email: tecnico.email,
      regra: tecnico.regra,
      setor: tecnico.setor || '',
      online: Math.random() > 0.3 ? 'true' : 'false',
    });
    contadores.usuariosRedis++;
  }
  console.log('20 técnicos criados e cacheados no Redis');

  console.log('Criando 100 usuários...');
  const usuarios: Usuario[] = [];
  
  for (let i = 1; i <= 100; i++) {
    const usuario = await prisma.usuario.create({
      data: {
        nome: `Usuário`,
        sobrenome: `${i}`,
        email: `usuario${i}@helpme.com`,
        password: senhaHash,
        regra: Regra.USUARIO,
        setor: setoresDisponiveis[i % setoresDisponiveis.length],
        telefone: `(11) 9${7000 + i}-${1000 + i}`,
        ramal: `${3000 + i}`,
        ativo: true,
      },
    });
    usuarios.push(usuario);
  }
  console.log('100 usuários criados');

  console.log(`Total: 121 usuários (1 admin + 20 técnicos + 100 usuários)\n`);


  console.log('[4/8] Criando expedientes para técnicos...\n');

  let totalExpedientes = 0;
  for (const tecnico of tecnicos) {
    for (let dia = 0; dia < 30; dia++) {
      const dataExpediente = new Date();
      dataExpediente.setDate(dataExpediente.getDate() - dia);
      dataExpediente.setHours(8, 0, 0, 0);

      const entrada = new Date(dataExpediente);
      const saida = new Date(dataExpediente);
      saida.setHours(17, 0, 0, 0);

      await prisma.expediente.create({
        data: {
          usuarioId: tecnico.id,
          entrada,
          saida,
          ativo: true,
        },
      });
      totalExpedientes++;
    }
  }

  console.log(`${totalExpedientes} expedientes criados (30 dias × 20 técnicos)\n`);

  console.log('[5/8] Criando serviços...\n');

  const servicosData = [
    { nome: 'Instalação de Software', descricao: 'Instalação e configuração de softwares' },
    { nome: 'Manutenção de Hardware', descricao: 'Reparo e manutenção de equipamentos' },
    { nome: 'Suporte de Rede', descricao: 'Configuração e troubleshooting de rede' },
    { nome: 'Backup de Dados', descricao: 'Backup e restauração de informações' },
    { nome: 'Configuração de Email', descricao: 'Configuração de contas de email' },
    { nome: 'Treinamento de Usuário', descricao: 'Capacitação de usuários em sistemas' },
    { nome: 'Desenvolvimento de Sistema', descricao: 'Desenvolvimento de funcionalidades' },
    { nome: 'Suporte Remoto', descricao: 'Atendimento remoto via acesso remoto' },
    { nome: 'Manutenção Preventiva', descricao: 'Manutenção preventiva de equipamentos' },
    { nome: 'Instalação de Impressora', descricao: 'Instalação e configuração de impressoras' },
    { nome: 'Configuração de VPN', descricao: 'Configuração de acesso VPN' },
    { nome: 'Recuperação de Senha', descricao: 'Reset e recuperação de senhas' },
    { nome: 'Atualização de Sistema', descricao: 'Atualização de sistemas operacionais' },
    { nome: 'Criação de Usuário', descricao: 'Criação de contas de usuário' },
    { nome: 'Configuração de Periféricos', descricao: 'Configuração de dispositivos periféricos' },
  ];

  const servicos: Servico[] = [];
  for (const servicoData of servicosData) {
    const servico = await prisma.servico.create({
      data: {
        nome: servicoData.nome,
        descricao: servicoData.descricao,
        ativo: true,
      },
    });
    servicos.push(servico);
  }

  console.log(`${servicos.length} serviços criados\n`);

  async function criarLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    metadata: Record<string, any>
  ) {
    try {
      const result = await mongodb.collection('system_logs').insertOne({
        timestamp: new Date(),
        level,
        service: 'api',
        message,
        metadata,
      });
      contadores.systemLogs++;
      return result.insertedId;
    } catch (error) {
      console.error(`Erro ao criar log no MongoDB:`, error);
    }
  }

  async function criarAuditoria(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    changes?: Record<string, any>
  ) {
    try {
      const result = await mongodb.collection('audit_logs').insertOne({
        timestamp: new Date(),
        userId,
        action,
        resource,
        resourceId,
        changes,
        ipAddress: gerarIP(),
        userAgent: gerarUserAgent(),
      });
      contadores.auditLogs++;
      return result.insertedId;
    } catch (error) {
      console.error(`Erro ao criar auditoria no MongoDB:`, error);
    }
  }

  async function publicarEvento(topic: string, evento: any) {
    if (kafkaConnected && kafkaProducer) {
      try {
        await kafkaProducer.send({
          topic,
          messages: [
            {
              key: evento.chamadoId || evento.id,
              value: JSON.stringify(evento),
              timestamp: Date.now().toString(),
            },
          ],
        });
        contadores.eventosKafka++;
      } catch (error) {
        // Silenciar erros do Kafka
      }
    }
  }

  console.log('[6/8] Criando 1000 chamados com fluxo completo...\n');

  const totalChamados = 1000;
  const distribuicao = {
    ABERTO: Math.floor(totalChamados * 0.15),           // 150
    EM_ATENDIMENTO: Math.floor(totalChamados * 0.05),   // 50
    ENCERRADO: Math.floor(totalChamados * 0.20),        // 200
    CANCELADO: Math.floor(totalChamados * 0.30),        // 300
    REABERTO: Math.floor(totalChamados * 0.30),         // 300
  };

  console.log('   Distribuição planejada:');
  console.log(`      • ABERTO: ${distribuicao.ABERTO} (15%)`);
  console.log(`      • EM_ATENDIMENTO: ${distribuicao.EM_ATENDIMENTO} (5%)`);
  console.log(`      • ENCERRADO: ${distribuicao.ENCERRADO} (20%)`);
  console.log(`      • CANCELADO: ${distribuicao.CANCELADO} (30%)`);
  console.log(`      • REABERTO: ${distribuicao.REABERTO} (30%)`);
  console.log();

  const descricoesChamados = [
    'Computador não liga',
    'Internet lenta',
    'Impressora com problema',
    'Email não sincroniza',
    'Sistema travando',
    'Tela azul da morte',
    'Vírus detectado',
    'Backup não funciona',
    'VPN não conecta',
    'Senha esquecida',
    'Software não abre',
    'Mouse não funciona',
    'Teclado com teclas travadas',
    'Monitor sem imagem',
    'Sistema operacional lento',
    'Aplicação com erro',
    'Banco de dados inacessível',
    'Servidor fora do ar',
    'Disco rígido cheio',
    'Atualização necessária',
  ];

  const descricoesEncerramento = [
    'Problema resolvido com sucesso. Hardware substituído.',
    'Configuração de rede ajustada. Sistema normalizado.',
    'Software reinstalado. Funcionando corretamente.',
    'Atualização aplicada. Bug corrigido.',
    'Equipamento limpo e otimizado.',
    'Senha redefinida com sucesso.',
    'Backup restaurado. Dados recuperados.',
    'Vírus removido. Antivírus atualizado.',
    'Impressora configurada corretamente.',
    'Acesso VPN restabelecido.',
  ];

  const descricoesCancelamento = [
    'Usuário desistiu do chamado.',
    'Problema resolvido pelo próprio usuário.',
    'Chamado duplicado.',
    'Equipamento será substituído.',
    'Fora do escopo do suporte.',
    'Usuário não disponível para atendimento.',
  ];

  let chamadoIndex = 0;

  async function criarChamadosComStatus(
    status: ChamadoStatus,
    quantidade: number
  ) {
    for (let i = 0; i < quantidade; i++) {
      chamadoIndex++;
      
      const usuario = usuarios[Math.floor(Math.random() * usuarios.length)];
      const descricao = descricoesChamados[Math.floor(Math.random() * descricoesChamados.length)];
      const geradoEm = gerarDataAleatoria(90);
      
      let tecnicoId: string | null = null;
      let encerradoEm: Date | null = null;
      let descricaoEncerramento: string | null = null;
      let tecnico: Usuario | null = null;

      switch (status) {
        case ChamadoStatus.ABERTO:
          break;

        case ChamadoStatus.EM_ATENDIMENTO:
          tecnico = tecnicos[Math.floor(Math.random() * tecnicos.length)];
          tecnicoId = tecnico.id;
          break;

        case ChamadoStatus.ENCERRADO:
          tecnico = tecnicos[Math.floor(Math.random() * tecnicos.length)];
          tecnicoId = tecnico.id;
          encerradoEm = adicionarTempoAleatorio(geradoEm, 1, 48);
          descricaoEncerramento = descricoesEncerramento[Math.floor(Math.random() * descricoesEncerramento.length)];
          break;

        case ChamadoStatus.CANCELADO:
          if (Math.random() > 0.5) {
            tecnico = tecnicos[Math.floor(Math.random() * tecnicos.length)];
            tecnicoId = tecnico.id;
          }
          encerradoEm = adicionarTempoAleatorio(geradoEm, 0.5, 24);
          descricaoEncerramento = descricoesCancelamento[Math.floor(Math.random() * descricoesCancelamento.length)];
          break;

        case ChamadoStatus.REABERTO:
          tecnico = tecnicos[Math.floor(Math.random() * tecnicos.length)];
          tecnicoId = tecnico.id;
          break;
      }

      const chamado = await prisma.chamado.create({
        data: {
          OS: gerarOS(chamadoIndex),
          descricao: `${descricao} - ${status} #${chamadoIndex}`,
          status,
          usuarioId: usuario.id,
          tecnicoId,
          encerradoEm,
          descricaoEncerramento,
          geradoEm,
        },
      });

      const numServicos = Math.floor(Math.random() * 3) + 1;
      const servicosSelecionados = new Set<string>();

      while (servicosSelecionados.size < numServicos) {
        const servico = servicos[Math.floor(Math.random() * servicos.length)];
        servicosSelecionados.add(servico.id);
      }

      for (const servicoId of servicosSelecionados) {
        await prisma.ordemDeServico.create({
          data: {
            chamadoId: chamado.id,
            servicoId,
            geradoEm: chamado.geradoEm,
          },
        });
      }

      const requestId = gerarRequestId();

      await criarLog('info', `Chamado ${chamado.OS} criado`, {
        chamadoId: chamado.id,
        usuarioId: usuario.id,
        status: chamado.status,
        requestId,
      });

      await criarAuditoria(
        usuario.id,
        'CREATE',
        'chamado',
        chamado.id,
        { status: chamado.status, descricao: chamado.descricao }
      );

      await publicarEvento('chamados.created', {
        chamadoId: chamado.id,
        OS: chamado.OS,
        usuarioId: usuario.id,
        status: chamado.status,
        timestamp: geradoEm.toISOString(),
      });

      await redis.hSet(`chamado:${chamado.id}`, {
        id: chamado.id,
        OS: chamado.OS,
        status: chamado.status,
        usuarioId: usuario.id,
        descricao: chamado.descricao,
      });
      contadores.chamadosRedis++;

      if (status === ChamadoStatus.ABERTO) {
        await redis.lPush('chamados:abertos', chamado.id);
      }
      
      if (status === ChamadoStatus.EM_ATENDIMENTO && tecnico) {
        const atribuidoEm = adicionarTempoAleatorio(geradoEm, 0.5, 4);

        await criarLog('info', `Chamado ${chamado.OS} atribuído ao técnico`, {
          chamadoId: chamado.id,
          tecnicoId: tecnico.id,
          requestId: gerarRequestId(),
        });

        await criarAuditoria(
          tecnico.id,
          'ASSIGN',
          'chamado',
          chamado.id,
          { tecnicoId: tecnico.id, status: 'EM_ATENDIMENTO' }
        );

        await publicarEvento('chamados.assigned', {
          chamadoId: chamado.id,
          tecnicoId: tecnico.id,
          timestamp: atribuidoEm.toISOString(),
        });

        await redis.lPush(`tecnico:${tecnico.id}:chamados`, chamado.id);
      }

      if (status === ChamadoStatus.ENCERRADO && tecnico && encerradoEm) {
        await criarLog('info', `Chamado ${chamado.OS} atribuído`, {
          chamadoId: chamado.id,
          tecnicoId: tecnico.id,
        });

        await criarLog('info', `Atendimento iniciado para chamado ${chamado.OS}`, {
          chamadoId: chamado.id,
          tecnicoId: tecnico.id,
        });

        await criarLog('info', `Chamado ${chamado.OS} encerrado`, {
          chamadoId: chamado.id,
          tecnicoId: tecnico.id,
          resolucao: descricaoEncerramento,
        });

        await criarAuditoria(
          tecnico.id,
          'CLOSE',
          'chamado',
          chamado.id,
          { status: 'ENCERRADO', descricaoEncerramento }
        );

        await publicarEvento('chamados.closed', {
          chamadoId: chamado.id,
          tecnicoId: tecnico.id,
          resolucao: descricaoEncerramento,
          timestamp: encerradoEm.toISOString(),
        });

        await redis.hSet(`chamado:${chamado.id}`, 'status', 'ENCERRADO');
        await redis.hIncrBy('stats:chamados', 'encerrados', 1);
      }

      if (status === ChamadoStatus.CANCELADO && encerradoEm) {
        await criarLog('warn', `Chamado ${chamado.OS} cancelado`, {
          chamadoId: chamado.id,
          motivo: descricaoEncerramento,
        });

        const canceladoPor = tecnico?.id || usuario.id;
        await criarAuditoria(
          canceladoPor,
          'CANCEL',
          'chamado',
          chamado.id,
          { status: 'CANCELADO', motivo: descricaoEncerramento }
        );

        await publicarEvento('chamados.cancelled', {
          chamadoId: chamado.id,
          motivo: descricaoEncerramento,
          timestamp: encerradoEm.toISOString(),
        });

        await redis.hSet(`chamado:${chamado.id}`, 'status', 'CANCELADO');
      }

      if (status === ChamadoStatus.REABERTO && tecnico) {
        const encerramentoAnterior = adicionarTempoAleatorio(geradoEm, 1, 24);
        const reabertoEm = adicionarTempoAleatorio(encerramentoAnterior, 0.5, 48);

        await criarLog('info', `Chamado ${chamado.OS} foi encerrado anteriormente`, {
          chamadoId: chamado.id,
        });

        await criarLog('warn', `Chamado ${chamado.OS} reaberto`, {
          chamadoId: chamado.id,
          usuarioId: usuario.id,
        });

        await criarAuditoria(
          usuario.id,
          'REOPEN',
          'chamado',
          chamado.id,
          { status: 'REABERTO', motivoReabertura: 'Problema persistiu' }
        );

        await publicarEvento('chamados.reopened', {
          chamadoId: chamado.id,
          usuarioId: usuario.id,
          timestamp: reabertoEm.toISOString(),
        });

        await redis.hSet(`chamado:${chamado.id}`, 'status', 'REABERTO');
        await redis.lPush('chamados:reabertos', chamado.id);
      }

      if (chamadoIndex % 100 === 0) {
        console.log(`   Progresso: ${chamadoIndex}/${totalChamados} chamados criados...`);
      }
    }
  }

  await criarChamadosComStatus(ChamadoStatus.ABERTO, distribuicao.ABERTO);
  await criarChamadosComStatus(ChamadoStatus.EM_ATENDIMENTO, distribuicao.EM_ATENDIMENTO);
  await criarChamadosComStatus(ChamadoStatus.ENCERRADO, distribuicao.ENCERRADO);
  await criarChamadosComStatus(ChamadoStatus.CANCELADO, distribuicao.CANCELADO);
  await criarChamadosComStatus(ChamadoStatus.REABERTO, distribuicao.REABERTO);

  console.log(`Todos os ${totalChamados} chamados criados!\n`);

  console.log('[7/8] Coletando estatísticas finais...\n');

  const stats = await prisma.chamado.groupBy({
    by: ['status'],
    _count: true,
  });

  const totalUsuarios = await prisma.usuario.count();
  const totalServicos = await prisma.servico.count();
  const totalChamadosDB = await prisma.chamado.count();
  const totalExpedientesDB = await prisma.expediente.count();
  const totalOrdens = await prisma.ordemDeServico.count();

  console.log('PostgreSQL:');
  console.log(`Usuários: ${totalUsuarios}`);
  console.log(`Serviços: ${totalServicos}`);
  console.log(`Chamados: ${totalChamadosDB}`);
  for (const stat of stats) {
    const porcentagem = ((stat._count / totalChamadosDB) * 100).toFixed(1);
    console.log(`- ${stat.status}: ${stat._count} (${porcentagem}%)`);
  }
  console.log(`Ordens de Serviço: ${totalOrdens}`);
  console.log(`Expedientes: ${totalExpedientesDB}`);

  const totalLogs = await mongodb.collection('system_logs').countDocuments();
  const totalAudits = await mongodb.collection('audit_logs').countDocuments();
  
  console.log(`MongoDB:`);
  console.log(`system_logs: ${totalLogs}`);
  console.log(`audit_logs: ${totalAudits}`);

  const chamadosAbertos = await redis.lLen('chamados:abertos');
  const chamadosReabertos = await redis.lLen('chamados:reabertos');
  const keysRedis = await redis.keys('*');
  
  console.log(`Redis:`);
  console.log(`Total de chaves: ${keysRedis.length}`);
  console.log(`Chamados em cache: ${contadores.chamadosRedis}`);
  console.log(`Usuários em cache: ${contadores.usuariosRedis}`);
  console.log(`Fila de abertos: ${chamadosAbertos}`);
  console.log(`Fila de reabertos: ${chamadosReabertos}`);

  if (kafkaConnected) {
    console.log(`Kafka:`);
    console.log(`Eventos publicados: ${contadores.eventosKafka}`);
  } else {
    console.log(`Kafka:`);
    console.log(`Não conectado (seed executado sem eventos)`);
  }

  console.log();

  console.log('[8/8] Validando população dos bancos...\n');

  let tudoOk = true;

  if (totalChamadosDB !== totalChamados) {
    console.log(`PostgreSQL: esperado ${totalChamados} chamados, encontrado ${totalChamadosDB}`);
    tudoOk = false;
  } else {
    console.log('PostgreSQL: todos os dados foram criados corretamente');
  }

  if (totalLogs === 0 || totalAudits === 0) {
    console.log(`MongoDB: system_logs=${totalLogs}, audit_logs=${totalAudits}`);
    tudoOk = false;
  } else {
    console.log('MongoDB: logs e auditorias foram criados corretamente');
  }

  if (contadores.chamadosRedis !== totalChamados) {
    console.log(`Redis: esperado ${totalChamados} chamados em cache, encontrado ${contadores.chamadosRedis}`);
    tudoOk = false;
  } else {
    console.log('Redis: todos os chamados foram cacheados corretamente');
  }

  console.log();

  if (tudoOk) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🌱 SEED COMPLETO EXECUTADO COM SUCESSO!');
    console.log('═══════════════════════════════════════════════════════════════');
  } else {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🌱  SEED COMPLETO COM ALGUNS AVISOS');
    console.log('═══════════════════════════════════════════════════════════════');
  }

  console.log('Credenciais de acesso:');
  console.log('Admin:   admin@helpme.com | Senha@123');
  console.log('Técnico: tecnico1@helpme.com | Senha@123');
  console.log('Usuário: usuario1@helpme.com | Senha@123');

  console.log('Desconectando bancos de dados...');
  await mongoClient.close();
  await redis.quit();
  if (kafkaConnected && kafkaProducer) {
    await kafkaProducer.disconnect();
  }
  console.log('Desconexões concluídas\n');
}

main()
  .catch((e) => {
    console.error('\n ERRO FATAL ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });