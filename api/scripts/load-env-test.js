#!/usr/bin/env node
const { config } = require('dotenv');
const { spawn } = require('child_process');

// Carrega o .env.test
config({ path: '.env.test' });

// Pega os argumentos após o script
const args = process.argv.slice(2);

// Executa o comando com as variáveis de ambiente
const child = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
});

child.on('exit', (code) => {
  process.exit(code);
});