import crypto from 'crypto';

const CONFIGURACAO_HASH = {
  iteracoes: 600000,
  tamanhoSalt: 16,
  tamanhoChave: 64,
  algoritmo: 'sha512' as const,
} as const;

/**
 * Gera um hash seguro de senha usando PBKDF2 com SHA-512
 * 
 * PBKDF2 (Password-Based Key Derivation Function 2) é um algoritmo
 * recomendado pelo NIST para derivação de chaves de senhas.
 * 
 * Características de segurança:
 * - Salt único gerado criptograficamente para cada senha
 * - 600.000 iterações (proteção contra ataques de força bruta)
 * - SHA-512 como função de hash
 * - Armazenamento no formato: algoritmo$iterações$salt$hash
 * 
 * @param senha - Senha em texto plano
 * @returns String no formato "pbkdf2_sha512$600000$salt$hash"
 * 
 * @example
 * const hash = hashPassword('minhaSenha123!');
 * // Retorna: "pbkdf2_sha512$600000$a1b2c3d4...$e5f6g7h8..."
 */
export function hashPassword(senha: string): string {
  if (!senha || typeof senha !== 'string') {
    throw new Error('Senha inválida: deve ser uma string não vazia');
  }

  if (senha.length < 8) {
    throw new Error('Senha muito curta: mínimo de 8 caracteres');
  }

  if (senha.length > 128) {
    throw new Error('Senha muito longa: máximo de 128 caracteres');
  }

  const salt = crypto.randomBytes(CONFIGURACAO_HASH.tamanhoSalt).toString('hex');
  
  const hash = crypto.pbkdf2Sync(
    senha,
    salt,
    CONFIGURACAO_HASH.iteracoes,
    CONFIGURACAO_HASH.tamanhoChave,
    CONFIGURACAO_HASH.algoritmo
  ).toString('hex');
  
  return `pbkdf2_sha512$${CONFIGURACAO_HASH.iteracoes}$${salt}$${hash}`;
}

/**
 * Verifica se uma senha corresponde ao hash armazenado
 * 
 * Usa comparação timing-safe para prevenir ataques de timing
 * Suporta formato legado (salt:hash) e novo formato (pbkdf2_sha512$...)
 * 
 * @param senha - Senha em texto plano fornecida pelo usuário
 * @param hashArmazenado - Hash armazenado no banco de dados
 * @returns true se a senha está correta, false caso contrário
 * 
 * @example
 * const ehValida = verifyPassword('minhaSenha123!', hashArmazenado);
 * if (ehValida) {
 *   console.log('Senha correta!');
 * }
 */
export function verifyPassword(senha: string, hashArmazenado: string): boolean {
  if (!senha || typeof senha !== 'string') {
    throw new Error('Senha inválida: deve ser uma string não vazia');
  }

  if (!hashArmazenado || typeof hashArmazenado !== 'string') {
    throw new Error('Hash inválido: deve ser uma string não vazia');
  }

  try {
    if (hashArmazenado.startsWith('pbkdf2_sha512$')) {
      return verificarHashPbkdf2(senha, hashArmazenado);
    } else if (hashArmazenado.includes(':')) {
      return verificarHashLegado(senha, hashArmazenado);
    } else {
      throw new Error('Formato de hash não reconhecido');
    }
  } catch (error) {
    console.error('Erro ao verificar senha:', error);
    return false;
  }
}

/**
 * Verifica senha usando formato PBKDF2 (formato atual)
 * @private
 */
function verificarHashPbkdf2(senha: string, hashArmazenado: string): boolean {
  const partes = hashArmazenado.split('$');
  
  if (partes.length !== 4) {
    throw new Error('Formato de hash PBKDF2 inválido');
  }

  const [algoritmo, iteracoes, salt, hashOriginal] = partes;

  if (algoritmo !== 'pbkdf2_sha512') {
    throw new Error(`Algoritmo não suportado: ${algoritmo}`);
  }

  const numeroIteracoes = parseInt(iteracoes, 10);
  if (isNaN(numeroIteracoes) || numeroIteracoes < 1) {
    throw new Error('Número de iterações inválido');
  }

  const hash = crypto.pbkdf2Sync(
    senha,
    salt,
    numeroIteracoes,
    CONFIGURACAO_HASH.tamanhoChave,
    CONFIGURACAO_HASH.algoritmo
  ).toString('hex');
  
  return comparacaoTimingSafe(hash, hashOriginal);
}

/**
 * Verifica senha usando formato legado (salt:hash)
 * Mantido para compatibilidade com senhas antigas do bcrypt
 * @private
 */
function verificarHashLegado(senha: string, hashArmazenado: string): boolean {
  const [salt, hashOriginal] = hashArmazenado.split(':');
  
  if (!salt || !hashOriginal) {
    throw new Error('Formato de hash legado inválido - esperado: salt:hash');
  }

  const hash = crypto.pbkdf2Sync(
    senha,
    salt,
    100000,
    64,
    'sha512'
  ).toString('hex');
  
  return comparacaoTimingSafe(hash, hashOriginal);
}

/**
 * Comparação timing-safe entre duas strings
 * Previne ataques de timing side-channel
 * @private
 */
function comparacaoTimingSafe(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const dummy = 'a'.repeat(a.length);
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(dummy));
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(a, 'hex'),
      Buffer.from(b, 'hex')
    );
  } catch (error) {
    return crypto.timingSafeEqual(
      Buffer.from(a),
      Buffer.from(b)
    );
  }
}

/**
 * Verifica se um hash precisa ser atualizado
 * 
 * Retorna true se:
 * - O hash usa formato legado
 * - O hash usa número de iterações desatualizado
 * - O hash usa algoritmo mais fraco
 * 
 * Use esta função para detectar senhas que precisam de rehash
 * durante o login do usuário
 * 
 * @param hashArmazenado - Hash armazenado no banco de dados
 * @returns true se o hash deve ser atualizado, false caso contrário
 * 
 * @example
 * if (verifyPassword(senha, hash) && precisaRehash(hash)) {
 *   const novoHash = hashPassword(senha);
 *   await atualizarHashNoBanco(usuarioId, novoHash);
 * }
 */
export function precisaRehash(hashArmazenado: string): boolean {
  if (!hashArmazenado || typeof hashArmazenado !== 'string') {
    return true;
  }

  if (hashArmazenado.includes(':') && !hashArmazenado.startsWith('pbkdf2_sha512$')) {
    return true;
  }

  if (hashArmazenado.startsWith('pbkdf2_sha512$')) {
    const partes = hashArmazenado.split('$');
    if (partes.length !== 4) {
      return true;
    }

    const iteracoes = parseInt(partes[1], 10);
    
    if (iteracoes < CONFIGURACAO_HASH.iteracoes) {
      return true;
    }
  }

  return false;
}

/**
 * Gera uma senha temporária segura
 * 
 * Útil para reset de senha, criação de senha temporária, etc.
 * 
 * @param tamanho - Tamanho da senha (padrão: 16 caracteres)
 * @returns Senha aleatória segura
 * 
 * @example
 * const senhaTemp = gerarSenhaSegura(12);
 * // Retorna algo como: "X7k@mP2#qL9n"
 */
export function gerarSenhaSegura(tamanho: number = 16): string {
  if (tamanho < 8) {
    throw new Error('Tamanho mínimo de senha: 8 caracteres');
  }

  if (tamanho > 128) {
    throw new Error('Tamanho máximo de senha: 128 caracteres');
  }

  const maiusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minusculas = 'abcdefghijklmnopqrstuvwxyz';
  const numeros = '0123456789';
  const simbolos = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const todosCaracteres = maiusculas + minusculas + numeros + simbolos;
  
  let senha = [
    maiusculas[crypto.randomInt(0, maiusculas.length)],
    minusculas[crypto.randomInt(0, minusculas.length)],
    numeros[crypto.randomInt(0, numeros.length)],
    simbolos[crypto.randomInt(0, simbolos.length)],
  ];

  for (let i = senha.length; i < tamanho; i++) {
    senha.push(todosCaracteres[crypto.randomInt(0, todosCaracteres.length)]);
  }

  // Embaralha a senha usando Fisher-Yates
  for (let i = senha.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [senha[i], senha[j]] = [senha[j], senha[i]];
  }

  return senha.join('');
}

/**
 * Valida força da senha
 * 
 * @param senha - Senha a ser validada
 * @returns Objeto com resultado da validação
 * 
 * @example
 * const resultado = validarForcaSenha('minhasenha');
 * if (!resultado.ehValida) {
 *   console.log(resultado.erros);
 * }
 */
export function validarForcaSenha(senha: string): {
  ehValida: boolean;
  pontuacao: number; // 0-4 (0=muito fraca, 4=muito forte)
  erros: string[];
  sugestoes: string[];
} {
  const erros: string[] = [];
  const sugestoes: string[] = [];
  let pontuacao = 0;

  if (senha.length < 8) {
    erros.push('Senha deve ter no mínimo 8 caracteres');
  } else if (senha.length >= 8 && senha.length < 12) {
    pontuacao += 1;
    sugestoes.push('Considere usar 12+ caracteres para maior segurança');
  } else if (senha.length >= 12 && senha.length < 16) {
    pontuacao += 2;
  } else {
    pontuacao += 3;
  }

  const temMaiusculas = /[A-Z]/.test(senha);
  const temMinusculas = /[a-z]/.test(senha);
  const temNumeros = /[0-9]/.test(senha);
  const temSimbolos = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(senha);

  if (!temMaiusculas) erros.push('Senha deve conter letras maiúsculas');
  if (!temMinusculas) erros.push('Senha deve conter letras minúsculas');
  if (!temNumeros) erros.push('Senha deve conter números');
  if (!temSimbolos) sugestoes.push('Adicione caracteres especiais para maior segurança');

  const contagemComplexidade = [temMaiusculas, temMinusculas, temNumeros, temSimbolos].filter(Boolean).length;
  pontuacao += contagemComplexidade >= 4 ? 1 : 0;

  const padroesFracos = [
    /^123456/,
    /password/i,
    /qwerty/i,
    /abc123/i,
    /^(.)\1+$/,
  ];

  for (const padrao of padroesFracos) {
    if (padrao.test(senha)) {
      erros.push('Senha contém padrões comuns inseguros');
      pontuacao = Math.max(0, pontuacao - 2);
      break;
    }
  }

  const ehValida = erros.length === 0 && pontuacao >= 2;

  return {
    ehValida,
    pontuacao: Math.min(4, pontuacao),
    erros,
    sugestoes,
  };
}

export const CONFIGURACAO_SENHA = {
  TAMANHO_MINIMO: 8,
  TAMANHO_MAXIMO: 128,
  TAMANHO_RECOMENDADO: 12,
  ITERACOES: CONFIGURACAO_HASH.iteracoes,
  ALGORITMO: 'PBKDF2-SHA512',
} as const;