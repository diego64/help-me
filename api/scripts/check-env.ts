import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

console.log('🔍 Diagnóstico de Carregamento do .env\n');
console.log('[INFO] Diretório de trabalho:', process.cwd());
console.log('');

const possiveisLocais = [
  '.env',
  path.resolve(process.cwd(), '.env'),
];

console.log('🔎 Procurando arquivo .env:\n');

let envEncontrado = false;
let envPath = '';

for (const local of possiveisLocais) {
  const exists = fs.existsSync(local);
  const absolutePath = path.resolve(local);
  
  if (exists) {
    console.log(`[SUCESSO] ${local}`);
    console.log(`   Caminho absoluto: ${absolutePath}`);
    
    if (!envEncontrado) {
      envEncontrado = true;
      envPath = local;
      console.log(`   ⭐ Este será usado!\n`);
    } else {
      console.log('');
    }
  }
}

if (!envEncontrado) {
  console.log('[ERROR] Nenhum arquivo .env encontrado!\n');
  console.log('[INFO] Soluções:');
  console.log('   1. Crie um arquivo .env na raiz do projeto');
  console.log('   2. Execute o script a partir da raiz do projeto');
  console.log('   3. Verifique se o arquivo se chama exatamente ".env"\n');
  process.exit(1);
}

console.log('════════════════════════════════════════════════════════════');
console.log('\n📖 Carregando .env de:', path.resolve(envPath), '\n');

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('[ERROR] Erro ao carregar .env:', result.error.message);
  process.exit(1);
}

console.log('[SUCESSO] Arquivo .env carregado com sucesso!\n');
console.log('════════════════════════════════════════════════════════════');
console.log('\n📋 Variáveis de ambiente carregadas:\n');

const envVars = Object.keys(result.parsed || {});

if (envVars.length === 0) {
  console.log('[WAN]  Nenhuma variável encontrada no .env\n');
} else {
  console.log(`Total: ${envVars.length} variáveis\n`);
  
  envVars.forEach((key) => {
    const value = process.env[key] || '';
    
    // Mascara valores sensíveis
    let displayValue = value;
    if (key.toLowerCase().includes('password') || 
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('key') ||
        key === 'DATABASE_URL') {
      if (key === 'DATABASE_URL') {
        // Mostra apenas host e database
        const match = value.match(/\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
        if (match) {
          displayValue = `postgresql://***:***@${match[3]}:${match[4]}/${match[5]}`;
        } else {
          displayValue = value.substring(0, 20) + '...';
        }
      } else {
        displayValue = value.substring(0, 3) + '***';
      }
    }
    
    console.log(`  ${key}: ${displayValue}`);
  });
}

console.log('\n════════════════════════════════════════════════════════════');
console.log('\n🎯 Verificação específica de DATABASE_URL:\n');

if (process.env.DATABASE_URL) {
  console.log('[SUCESSO] DATABASE_URL está definida');
  console.log('[INFO] Tipo:', typeof process.env.DATABASE_URL);
  console.log('📏 Tamanho:', process.env.DATABASE_URL.length, 'caracteres');
  
  // Parse básico
  const match = process.env.DATABASE_URL.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  
  if (match) {
    console.log('\n[INFO] Componentes da URL:');
    console.log('   Protocolo: postgresql://');
    console.log('   Usuário:', match[1]);
    console.log('   Senha:', '***' + ' (' + match[2].length + ' caracteres)');
    console.log('   Host:', match[3]);
    console.log('   Porta:', match[4]);
    console.log('   Database:', match[5]);
  }
} else {
  console.log('[ERROR] DATABASE_URL NÃO está definida');
  console.log('\n[INFO] Verifique se:');
  console.log('   1. A linha DATABASE_URL=... existe no .env');
  console.log('   2. Não há espaços antes do nome da variável');
  console.log('   3. Não há aspas ao redor do valor');
}

console.log('\n════════════════════════════════════════════════════════════');
console.log('\n[SUCESSO] Diagnóstico concluído!\n');

if (process.env.DATABASE_URL) {
  console.log('[SUCESSO] Tudo OK! Limpeza da base de dados pode ser executada.\n');
} else {
  console.log('[WAN]  Corrija o problema acima antes de continuar.\n');
  process.exit(1);
}