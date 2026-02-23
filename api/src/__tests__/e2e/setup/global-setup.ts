import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';
import mongoose from 'mongoose';

const execAsync = promisify(exec);

async function isPortOpen(host: string, port: number, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    
    socket.setTimeout(timeout);
    socket.once('error', onError);
    socket.once('timeout', onError);
    
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

async function waitForService(
  name: string, 
  host: string, 
  port: number, 
  maxRetries = 30,
  retryDelay = 2000
): Promise<void> {
  console.log(`[INFO]: Aguardando ${name} em ${host}:${port}...`);
  
  for (let i = 0; i < maxRetries; i++) {
    const isOpen = await isPortOpen(host, port, 3000);
    
    if (isOpen) {
      console.log(`[INFO]: ${name} está disponível!`);
      return;
    }
    
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error(
    `[INFO]: ${name} não está disponível em ${host}:${port} após ${maxRetries} tentativas.\n` +
    `   Certifique-se de que os containers de teste estão rodando:\n` +
    `   docker compose up -d postgresql_helpme_teste mongodb_helpme_teste redis_helpme_teste kafka_helpme_teste zookeeper_helpme_teste influxdb_helpme_teste`
  );
}

function validateEnvironment(): void {
  const requiredVars = [
    'DATABASE_URL',
    'MONGO_INITDB_ROOT_USERNAME_TESTE',
    'MONGO_INITDB_URI_TESTE',
    'REDIS_HOST_TESTE',
    'REDIS_PORT_TESTE',
    'KAFKA_BROKER_URL_TESTE',
    'INFLUX_URL_TESTE',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `[INFO]: Variáveis de ambiente obrigatórias não definidas:\n` +
      missing.map(v => `   - ${v}`).join('\n') +
      `\n\nCertifique-se de carregar o .env.test antes de rodar os testes.`
    );
  }
  
  console.log('[INFO]: Variáveis de ambiente validadas');
}

async function checkDockerContainers(): Promise<void> {
  try {
    const { stdout } = await execAsync(
      'docker ps --filter "label=com.helpme.environment=test" --format "{{.Names}}"'
    );
    
    const runningContainers = stdout.trim().split('\n').filter(Boolean);
    
    if (runningContainers.length === 0) {
      console.warn(
        '[INFO]: Nenhum container de teste encontrado rodando.\n' +
        '   Tentando subir automaticamente...'
      );
      
      await execAsync(
        'docker compose up -d postgresql_helpme_teste mongodb_helpme_teste redis_helpme_teste kafka_helpme_teste zookeeper_helpme_teste influxdb_helpme_teste'
      );
      
      console.log('[INFO]: Containers de teste iniciados');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log(`[INFO]: Containers de teste rodando: ${runningContainers.join(', ')}`);
    }
  } catch (error) {
    console.warn('[INFO]: Não foi possível verificar containers Docker (isso é normal se Docker não estiver disponível)');
  }
}

async function connectMongoDB(): Promise<void> {
  try {
    console.log('[INFO]: Conectando ao MongoDB de teste...');
    
    const mongoUri = process.env.MONGO_INITDB_URI_TESTE!;
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    
    console.log('[INFO]: MongoDB conectado com sucesso');
  } catch (error: any) {
    console.error('[INFO]: Erro ao conectar ao MongoDB:', error.message);
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  try {
    console.log('[INFO]: Executando migrations do Prisma...');
    
    await execAsync('npx prisma db push --accept-data-loss', {
      env: { ...process.env }
    });
    
    console.log('[INFO]: Migrations aplicadas com sucesso');
  } catch (error: any) {
    console.error('[INFO]: Erro ao executar migrations:', error.message);
    throw error;
  }
}

export async function setup() {
  console.log('\n🌱 Iniciando setup global dos testes E2E...\n');
  
  const startTime = Date.now();
  
  try {
    validateEnvironment();
    
    await checkDockerContainers();
    
    await Promise.all([
      waitForService('PostgreSQL', 'localhost', Number(process.env.DB_PORT || 5433)),
      waitForService('MongoDB', 'localhost', Number(process.env.MONGO_PORT_TESTE || 27018)),
      waitForService('Redis', 'localhost', Number(process.env.REDIS_PORT_TESTE || 6380)),
      waitForService('Kafka', 'localhost', Number(process.env.KAFKA_PORT || 9095)),
      waitForService('InfluxDB', 'localhost', Number(process.env.INFLUX_PORT_TESTE || 8087)),
    ]);
    
    // Conectar ao MongoDB ANTES das migrations
    await connectMongoDB();
    
    await runMigrations();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[INFO]: Setup global concluído com sucesso em ${duration}s!\n`);
    
  } catch (error: any) {
    console.error('\n[INFO]: Falha no setup global dos testes E2E:', error.message);
    console.error('\nDetalhes do erro:', error);
    process.exit(1);
  }
}

export async function teardown() {
  console.log('\n[INFO]: Executando teardown global dos testes E2E...');
  
  try {
    await mongoose.disconnect();
  } catch (error) {
    console.warn('[INFO]: Erro ao desconectar MongoDB:', error);
  }

  console.log('[INFO]: Teardown global concluído!\n');
}