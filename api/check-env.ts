import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

console.log('🔍 Diagnóstico de Carregamento do .env\n');
console.log('📂 Diretório de trabalho:', process.cwd());
console.log('');

const possiveisLocais = [
  '.env',
  '../.env',
  '../../.env',
  path.resolve(process.cwd(), '.env'),
  path.join(process.cwd(), '.env'),
];

console.log('🔎 Procurando arquivo .env nos seguintes locais:\n');

let envEncontrado = false;
let envPath = '';

for (const local of possiveisLocais) {
  const exists = fs.existsSync(local);
  const absolutePath = path.resolve(local);
  
  console.log(`${exists ? '✅' : '❌'} ${local}`);
  console.log(`   Caminho absoluto: ${absolutePath}`);
  
  if (exists && !envEncontrado) {
    envEncontrado = true;
    envPath = local;
    console.log(`   ⭐ Este será usado!\n`);
  } else {
    console.log('');
  }
}

if (!envEncontrado) {
  console.log('❌ Nenhum arquivo .env encontrado!\n');
  console.log('💡 Soluções:');
  console.log('   1. Crie um arquivo .env na raiz do projeto');
  console.log('   2. Execute o script a partir da raiz do projeto');
  console.log('   3. Verifique se o arquivo se chama exatamente ".env"\n');
  process.exit(1);
}

console.log('─'.repeat(60));
console.log('\n📖 Carregando .env de:', path.resolve(envPath), '\n');

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('❌ Erro ao carregar .env:', result.error.message);
  process.exit(1);
}

console.log('✅ Arquivo .env carregado com sucesso!\n');
console.log('─'.repeat(60));
console.log('\n📋 Variáveis de ambiente carregadas:\n');

const envVars = Object.keys(result.parsed || {});

if (envVars.length === 0) {
  console.log('⚠️  Nenhuma variável encontrada no .env\n');
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

console.log('\n─'.repeat(60));
console.log('\n🎯 Verificação específica de DATABASE_URL:\n');

if (process.env.DATABASE_URL) {
  console.log('✅ DATABASE_URL está definida');
  console.log('📝 Tipo:', typeof process.env.DATABASE_URL);
  console.log('📏 Tamanho:', process.env.DATABASE_URL.length, 'caracteres');
  
  // Parse básico
  const match = process.env.DATABASE_URL.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  
  if (match) {
    console.log('\n📊 Componentes da URL:');
    console.log('   Protocolo: postgresql://');
    console.log('   Usuário:', match[1]);
    console.log('   Senha:', '***' + ' (' + match[2].length + ' caracteres)');
    console.log('   Host:', match[3]);
    console.log('   Porta:', match[4]);
    console.log('   Database:', match[5]);
  }
} else {
  console.log('❌ DATABASE_URL NÃO está definida');
  console.log('\n💡 Verifique se:');
  console.log('   1. A linha DATABASE_URL=... existe no .env');
  console.log('   2. Não há espaços antes do nome da variável');
  console.log('   3. Não há aspas ao redor do valor');
}

console.log('\n─'.repeat(60));
console.log('\n✅ Diagnóstico concluído!\n');

if (process.env.DATABASE_URL) {
  console.log('🎉 Tudo OK! Limpeza da base de dados pode ser executada.\n');
} else {
  console.log('⚠️  Corrija o problema acima antes de continuar.\n');
  process.exit(1);
}