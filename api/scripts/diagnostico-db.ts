import dotenv from 'dotenv';

// ====== CARREGAMENTO DAS VARIAVEIS DE AMBIENTE ====== 
dotenv.config();

console.log('🔍 Diagnóstico da Conexão com Banco de Dados\n');

// ====== VERIFICAÇÃO DA URL DO BANCO DE DADOS ======
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[ERROR] DATABASE_URL não está definida no arquivo .env');
  process.exit(1);
}

console.log('[SUCESSO] DATABASE_URL encontrada');
console.log('[INFO] Tipo:', typeof databaseUrl);
console.log('📏 Tamanho:', databaseUrl.length, 'caracteres\n');

// ====== PARSE MANUAL DA URL DO BANCO DE DADOS POSTGRESQL ======
function parsePostgresUrl(url: string) {
  const regex = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = url.match(regex);
  
  if (!match) {
    throw new Error('Formato de URL inválido');
  }
  
  return {
    user: decodeURIComponent(match[1]),
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: match[4],
    database: match[5],
  };
}

// ====== TENTATIVA DO PARSE ======
try {
  const config = parsePostgresUrl(databaseUrl);
  
  console.log('[SUCESSO] Parse bem-sucedido da DATABASE_URL\n');
  console.log('📋 Configuração extraída:');
  console.log('   Host:', config.host);
  console.log('   Port:', config.port);
  console.log('   Database:', config.database);
  console.log('   User:', config.user);
  console.log('   Password tipo:', typeof config.password);
  console.log('   Password definida?', config.password !== undefined && config.password !== null);
  
  if (config.password) {
    console.log('   Password tamanho:', config.password.length, 'caracteres');
    console.log('   Password começa com:', config.password.substring(0, 3) + '...');
    
    const issues: string[] = [];
    
    if (typeof config.password !== 'string') {
      issues.push(`[ERROR] Senha não é string (tipo: ${typeof config.password})`);
    }
    
    if (config.password.includes(' ')) {
      issues.push('[WARN]  Senha contém espaços');
    }
    
    if (config.password.includes('"') || config.password.includes("'")) {
      issues.push('[WARN]  Senha contém aspas');
    }
    
    if (config.password.startsWith(' ') || config.password.endsWith(' ')) {
      issues.push('[WARN]  Senha tem espaços no início ou fim');
    }
    
    // ====== VERIFICA CARACTERES ESPECIAIS QUE PODEM CAUSAR PROBLEMAS ======
    const specialChars = ['@', '#', '$', '%', '&', ':', '/', '?', '='];
    const foundSpecialChars = specialChars.filter(char => config.password!.includes(char));
    if (foundSpecialChars.length > 0) {
      issues.push(`[WARN]  Senha contém caracteres especiais: ${foundSpecialChars.join(', ')}`);
      issues.push('   [INFO] Estes caracteres podem precisar de URL encoding');
    }
    
    if (issues.length > 0) {
      console.log('\n[WARN]  Problemas encontrados:');
      issues.forEach(issue => console.log('   ' + issue));
    } else {
      console.log('\n[SUCESSO] Nenhum problema óbvio detectado na senha');
    }
  } else {
    console.log('   [ERROR] Password não está definida na URL');
  }
  
  console.log('\n📖 Formato esperado da DATABASE_URL:');
  console.log('   postgresql://usuario:senha@host:porta/database');
  console.log('   postgresql://user:pass@localhost:5432/mydb');
  
  // ====== MOSTRA COMO CODIFICAR CARACTERES ESPECIAIS ======
  console.log('\n[INFO] Se a senha tiver caracteres especiais, use URL encoding:');
  console.log('   @ → %40');
  console.log('   # → %23');
  console.log('   $ → %24');
  console.log('   % → %25');
  console.log('   & → %26');
  console.log('   : → %3A');
  console.log('   / → %2F');
  console.log('   ? → %3F');
  console.log('   = → %3D');
  
  if (config.password && /[@#$%&:/?=]/.test(config.password)) {
    const encoded = encodeURIComponent(config.password);
    console.log(`\n[INFO] Sua senha codificada ficaria: ${encoded.substring(0, 10)}...`);
    console.log('   Use-a na DATABASE_URL assim:');
    console.log(`   postgresql://${config.user}:${encoded}@${config.host}:${config.port}/${config.database}`);
  }
  
} catch (error: any) {
  console.error('\n[ERROR] Erro ao fazer parse da DATABASE_URL:', error.message);
  console.log('\n[INFO] Dicas:');
  console.log('   1. Verifique se a URL está no formato correto');
  console.log('   2. Certifique-se de que não há aspas extras ao redor da URL');
  console.log('   3. Se a senha tiver caracteres especiais, use URL encoding');
  console.log('   4. Não use espaços em nenhuma parte da URL');
  console.log('\n📖 Formato esperado:');
  console.log('   postgresql://usuario:senha@host:porta/database');
  console.log('\n[INFO] Sua URL começa com:', databaseUrl.substring(0, 30) + '...');
  process.exit(1);
}

  // ====== TESTE DE CONEXÃO SIMPLES ======
console.log('\n🔌 Tentando conexão de teste...');
import pkg from 'pg';
const { Pool } = pkg;

const testPool = new Pool({
  connectionString: databaseUrl,
  max: 1,
});

testPool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('[ERROR] Erro na conexão:', err.message);
  } else {
    console.log('[SUCESSO] Conexão bem-sucedida!');
    console.log('   Timestamp do servidor:', res.rows[0].now);
  }
  testPool.end();
});