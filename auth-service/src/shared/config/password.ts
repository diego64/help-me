import crypto from 'crypto';

const CONFIGURACAO_HASH = {
  iteracoes: 600000,
  tamanhoSalt: 16,
  tamanhoChave: 64,
  algoritmo: 'sha512' as const,
} as const;

export const CONFIGURACAO_SENHA = {
  TAMANHO_MINIMO: 8,
  TAMANHO_MAXIMO: 128,
  TAMANHO_RECOMENDADO: 12,
  ITERACOES: CONFIGURACAO_HASH.iteracoes,
  ALGORITMO: 'PBKDF2-SHA512',
} as const;

/**
 * Padrões fracos comuns em senhas
 * Baseado em: análise de data breaches e senhas vazadas
 */
const PADROES_FRACOS_SENHA = [
  /^123456/, // Começa com 123456
  /password/i, // Contém "password"
  /qwerty/i, // Contém "qwerty"
  /abc123/i, // Contém "abc123"
  /^(.)\1+$/, // Apenas caracteres repetidos (aaaa, 1111, etc)
] as const;

/**
 * Valida entrada de senha antes de processar
 * Previne: Ataques de injeção, buffer overflow, DoS
 * @private
 */
function validarEntradaSenha(senha: unknown, contexto: string): void {
  // Validação de tipo
  if (!senha || typeof senha !== 'string') {
    throw new Error('Senha inválida: deve ser uma string não vazia');
  }

  // Validação de tamanho mínimo
  if (senha.length < CONFIGURACAO_SENHA.TAMANHO_MINIMO) {
    throw new Error(`Senha muito curta: mínimo de ${CONFIGURACAO_SENHA.TAMANHO_MINIMO} caracteres`);
  }

  // Validação de tamanho máximo (previne DoS e buffer overflow)
  if (senha.length > CONFIGURACAO_SENHA.TAMANHO_MAXIMO) {
    throw new Error(`Senha muito longa: máximo de ${CONFIGURACAO_SENHA.TAMANHO_MAXIMO} caracteres`);
  }

  // Log de tentativa de senha suspeita (apenas em desenvolvimento)
  if (process.env.NODE_ENV === 'development') {
    if (senha.length > 64) {
      console.warn(`[PASSWORD] Senha incomumente longa detectada (${senha.length} chars) em ${contexto}`);
    }
  }
}

/**
 * Valida entrada de hash antes de processar
 * Previne: Ataques de injeção, DoS
 * @private
 */
function validarEntradaHash(hash: unknown, contexto: string): void {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Hash inválido: deve ser uma string não vazia');
  }

  // Validação de tamanho máximo de hash (previne DoS)
  const MAX_HASH_LENGTH = 512; // Hashes PBKDF2 normais têm ~200 chars
  if (hash.length > MAX_HASH_LENGTH) {
    console.warn(`[SECURITY] Hash suspeitosamente longo detectado (${hash.length} chars) em ${contexto}`);
    throw new Error('Hash inválido: tamanho excede limite de segurança');
  }
}

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
 * MELHORIAS APLICADAS:
 * - Validação rigorosa de entrada (previne injeção)
 * - Validação de tamanho (previne DoS)
 * - Salt criptograficamente seguro
 * - Logging de segurança (apenas desenvolvimento)
 *
 * @param senha - Senha em texto plano
 * @returns String no formato "pbkdf2_sha512$600000$salt$hash"
 *
 * @throws {Error} Se senha for inválida (muito curta, muito longa, tipo errado)
 *
 * @example
 * const hash = hashPassword('minhaSenha123!');
 * // Retorna: "pbkdf2_sha512$600000$a1b2c3d4...$e5f6g7h8..."
 */
export function hashPassword(senha: string): string {
  // Validação de entrada (mantém funcionalidade original + melhorias)
  validarEntradaSenha(senha, 'hashPassword');

  // Log de criação de hash (apenas desenvolvimento)
  if (process.env.NODE_ENV === 'development') {
    console.debug('[PASSWORD] Gerando hash para senha de', senha.length, 'caracteres');
  }

  // Geração de salt criptograficamente seguro
  const salt = crypto.randomBytes(CONFIGURACAO_HASH.tamanhoSalt).toString('hex');

  // Verificação de qualidade do salt (paranoia extra)
  if (salt.length !== CONFIGURACAO_HASH.tamanhoSalt * 2) { // hex = 2x bytes
    throw new Error('Erro ao gerar salt: tamanho inesperado');
  }

  const hash = crypto.pbkdf2Sync(
    senha,
    salt,
    CONFIGURACAO_HASH.iteracoes,
    CONFIGURACAO_HASH.tamanhoChave,
    CONFIGURACAO_HASH.algoritmo
  ).toString('hex');

  // Verificação de qualidade do hash
  if (hash.length !== CONFIGURACAO_HASH.tamanhoChave * 2) { // hex = 2x bytes
    throw new Error('Erro ao gerar hash: tamanho inesperado');
  }

  // Retorna no formato padronizado
  return `pbkdf2_sha512$${CONFIGURACAO_HASH.iteracoes}$${salt}$${hash}`;
}

/**
 * Verifica se uma senha corresponde ao hash armazenado
 *
 * Usa comparação timing-safe para prevenir ataques de timing
 * Suporta formato legado (salt:hash) e novo formato (pbkdf2_sha512$...)
 *
 * MELHORIAS APLICADAS:
 * - Validação rigorosa de entrada
 * - Detecção de tentativas de ataque
 * - Logging de segurança
 * - Comparação timing-safe
 *
 * @param senha - Senha em texto plano fornecida pelo usuário
 * @param hashArmazenado - Hash armazenado no banco de dados
 * @returns true se a senha está correta, false caso contrário
 *
 * @throws {Error} Se senha ou hash forem inválidos
 *
 * @example
 * const ehValida = verifyPassword('minhaSenha123!', hashArmazenado);
 * if (ehValida) {
 *   console.log('Senha correta!');
 * }
 */
export function verifyPassword(senha: string, hashArmazenado: string): boolean {
  // Validações de entrada
  validarEntradaSenha(senha, 'verifyPassword');
  validarEntradaHash(hashArmazenado, 'verifyPassword');

  try {
    // Determina formato do hash e delega para função apropriada
    if (hashArmazenado.startsWith('pbkdf2_sha512$')) {
      return verificarHashPbkdf2(senha, hashArmazenado);
    } else if (hashArmazenado.includes(':')) {
      // Log de uso de hash legado (deve migrar)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PASSWORD] Hash legado detectado - considere migrar para novo formato');
      }
      return verificarHashLegado(senha, hashArmazenado);
    } else {
      // Logging de formato desconhecido
      console.warn('[SECURITY] Formato de hash não reconhecido:', hashArmazenado.substring(0, 20) + '...');
      throw new Error('Formato de hash não reconhecido');
    }
  } catch (error) {
    console.error('Erro ao verificar senha:', error);
    return false;
  }
}

/**
 * Verifica senha usando formato PBKDF2 (formato atual)
 *
 * PROTEÇÕES APLICADAS:
 * - Validação de estrutura
 * - Validação de algoritmo
 * - Validação de iterações
 * - Comparação timing-safe
 *
 * @private
 */
function verificarHashPbkdf2(senha: string, hashArmazenado: string): boolean {
  const partes = hashArmazenado.split('$');

  // Validação de estrutura: algoritmo$iterações$salt$hash
  if (partes.length !== 4) {
    console.warn('[SECURITY] Hash PBKDF2 malformado: esperado 4 partes, recebido', partes.length);
    throw new Error('Formato de hash PBKDF2 inválido');
  }

  const [algoritmo, iteracoes, salt, hashOriginal] = partes;

  // Validação de presença de todos os componentes (noUncheckedIndexedAccess)
  if (!algoritmo || !iteracoes || !salt || !hashOriginal) {
    console.warn('[SECURITY] Hash PBKDF2 com componentes vazios');
    throw new Error('Formato de hash PBKDF2 inválido: componentes ausentes');
  }

  // Validação de algoritmo (previne algorithm confusion)
  if (algoritmo !== 'pbkdf2_sha512') {
    console.warn('[SECURITY] Algoritmo não suportado:', algoritmo);
    throw new Error(`Algoritmo não suportado: ${algoritmo}`);
  }

  // Validação de iterações
  const numeroIteracoes = parseInt(iteracoes, 10);
  if (isNaN(numeroIteracoes)) {
    console.warn('[SECURITY] Número de iterações inválido (NaN):', iteracoes);
    throw new Error('Número de iterações inválido');
  }

  if (numeroIteracoes < 1) {
    console.warn('[SECURITY] Número de iterações suspeito:', numeroIteracoes);
    throw new Error('Número de iterações inválido');
  }

  // Log se iterações estão abaixo do recomendado
  if (numeroIteracoes < CONFIGURACAO_HASH.iteracoes && process.env.NODE_ENV === 'development') {
    console.warn('[PASSWORD] Hash com iterações antigas detectado:', numeroIteracoes, '(recomendado:', CONFIGURACAO_HASH.iteracoes + ')');
  }

  // Validação de salt
  if (salt.length === 0) {
    throw new Error('Salt vazio ou inválido');
  }

  // Geração do hash para comparação
  const hash = crypto.pbkdf2Sync(
    senha,
    salt,
    numeroIteracoes,
    CONFIGURACAO_HASH.tamanhoChave,
    CONFIGURACAO_HASH.algoritmo
  ).toString('hex');

  // Comparação timing-safe
  return comparacaoTimingSafe(hash, hashOriginal);
}

/**
 * Verifica senha usando formato legado (salt:hash)
 * Mantido para compatibilidade com senhas antigas
 *
 * Este formato deve ser migrado para PBKDF2 quando possível
 *
 * @private
 */
function verificarHashLegado(senha: string, hashArmazenado: string): boolean {
  const partes = hashArmazenado.split(':');

  // Validação de estrutura legada
  if (partes.length !== 2) {
    console.warn('[SECURITY] Hash legado malformado: esperado 2 partes, recebido', partes.length);
    throw new Error('Formato de hash legado inválido - esperado: salt:hash');
  }

  const [salt, hashOriginal] = partes;

  // Validação de presença de todos os componentes (noUncheckedIndexedAccess)
  if (!salt || !hashOriginal) {
    throw new Error('Formato de hash legado inválido - esperado: salt:hash');
  }

  if (salt.length === 0 || hashOriginal.length === 0) {
    throw new Error('Salt ou hash vazio no formato legado');
  }

  // Geração do hash com configuração legada (100k iterações)
  const hash = crypto.pbkdf2Sync(
    senha,
    salt,
    100000, // Iterações antigas (menos seguro)
    64,
    'sha512'
  ).toString('hex');

  return comparacaoTimingSafe(hash, hashOriginal);
}

/**
 * Comparação timing-safe entre duas strings
 * Previne ataques de timing side-channel
 *
 * PROTEÇÕES APLICADAS:
 * - Tempo constante de execução
 * - Fallback para diferentes encodings
 * - Comparação dummy quando tamanhos diferem
 *
 * Inspirado em: Slack/GitHub timing attack research
 *
 * @private
 */
function comparacaoTimingSafe(a: string, b: string): boolean {
  // Se tamanhos são diferentes, faz comparação dummy
  // para manter tempo constante
  if (a.length !== b.length) {
    const dummy = 'a'.repeat(a.length);
    try {
      // Comparação dummy para manter timing constante
      crypto.timingSafeEqual(Buffer.from(a), Buffer.from(dummy));
    } catch {
      // Ignora erro da comparação dummy
    }
    return false;
  }

  try {
    // Tenta comparação como hex primeiro (formato esperado)
    return crypto.timingSafeEqual(
      Buffer.from(a, 'hex'),
      Buffer.from(b, 'hex')
    );
  } catch (error) {
    // Log de fallback (pode indicar problema)
    if (process.env.NODE_ENV === 'development') {
      console.debug('[PASSWORD] Usando fallback de comparação (encoding não-hex)');
    }

    // Fallback para UTF-8 se hex falhar
    try {
      return crypto.timingSafeEqual(
        Buffer.from(a),
        Buffer.from(b)
      );
    } catch {
      // Se tudo falhar, retorna false por segurança
      return false;
    }
  }
}

/**
 * Verifica se um hash precisa ser atualizado
 *
 * Retorna true se:
 * - O hash usa formato legado
 * - O hash usa número de iterações desatualizado
 * - O hash usa algoritmo mais fraco
 * - O hash está malformado
 *
 * Use esta função para detectar senhas que precisam de rehash
 * durante o login do usuário
 *
 * MELHORIAS APLICADAS:
 * - Detecção de múltiplos formatos
 * - Validação de estrutura
 * - Logging de hashes que precisam migração
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
  // Validação de entrada
  if (!hashArmazenado || typeof hashArmazenado !== 'string') {
    console.warn('[PASSWORD] precisaRehash chamado com hash inválido');
    return true; // Hash inválido sempre precisa rehash
  }

  // Formato legado sempre precisa rehash
  if (hashArmazenado.includes(':') && !hashArmazenado.startsWith('pbkdf2_sha512$')) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[PASSWORD] Hash legado detectado - precisa migração');
    }
    return true;
  }

  // Verifica formato PBKDF2
  if (hashArmazenado.startsWith('pbkdf2_sha512$')) {
    const partes = hashArmazenado.split('$');

    // Validação de estrutura
    if (partes.length !== 4) {
      console.warn('[PASSWORD] Hash PBKDF2 malformado - precisa rehash');
      return true;
    }

    // Validação de iterações (noUncheckedIndexedAccess)
    const iteracoesStr = partes[1] ?? '';
    const iteracoes = parseInt(iteracoesStr, 10);

    if (isNaN(iteracoes)) {
      console.warn('[PASSWORD] Iterações inválidas no hash - precisa rehash');
      return true;
    }

    // Verifica se iterações estão desatualizadas
    if (iteracoes < CONFIGURACAO_HASH.iteracoes) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[PASSWORD] Hash com iterações antigas detectado:', iteracoes, '< ', CONFIGURACAO_HASH.iteracoes);
      }
      return true;
    }

    // Hash está atualizado
    return false;
  }

  // Formato desconhecido - não força rehash por padrão
  // (pode ser formato válido que não conhecemos)
  if (process.env.NODE_ENV === 'development') {
    console.warn('[PASSWORD] Formato de hash desconhecido:', hashArmazenado.substring(0, 20) + '...');
  }
  return false;
}

/**
 * Gera uma senha temporária segura
 *
 * Útil para reset de senha, criação de senha temporária, etc.
 *
 * CARACTERÍSTICAS DE SEGURANÇA:
 * - Geração criptograficamente segura (crypto.randomInt)
 * - Garante presença de todos os tipos de caracteres
 * - Embaralhamento Fisher-Yates
 * - Entropia adequada
 *
 * MELHORIAS APLICADAS:
 * - Validação de tamanho
 * - Logging de geração
 * - Garantia de complexidade
 *
 * @param tamanho - Tamanho da senha (padrão: 16 caracteres)
 * @returns Senha aleatória segura
 *
 * @throws {Error} Se tamanho for inválido
 *
 * @example
 * const senhaTemp = gerarSenhaSegura(12);
 * // Retorna algo como: "X7k@mP2#qL9n"
 */
export function gerarSenhaSegura(tamanho: number = 16): string {
  // Validação de tamanho
  if (tamanho < CONFIGURACAO_SENHA.TAMANHO_MINIMO) {
    throw new Error(`Tamanho mínimo de senha: ${CONFIGURACAO_SENHA.TAMANHO_MINIMO} caracteres`);
  }

  if (tamanho > CONFIGURACAO_SENHA.TAMANHO_MAXIMO) {
    throw new Error(`Tamanho máximo de senha: ${CONFIGURACAO_SENHA.TAMANHO_MAXIMO} caracteres`);
  }

  // Log de geração (apenas desenvolvimento)
  if (process.env.NODE_ENV === 'development') {
    console.debug('[PASSWORD] Gerando senha segura de', tamanho, 'caracteres');
  }

  // Conjuntos de caracteres
  const maiusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const minusculas = 'abcdefghijklmnopqrstuvwxyz';
  const numeros = '0123456789';
  const simbolos = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const todosCaracteres = maiusculas + minusculas + numeros + simbolos;

  // Garante pelo menos um de cada tipo (CRÍTICO para segurança)
  const obterChar = (conjunto: string): string => {
    const char = conjunto[crypto.randomInt(0, conjunto.length)];
    if (!char) throw new Error('Erro ao gerar caractere: índice inválido');
    return char;
  };

  const senha: string[] = [
    obterChar(maiusculas),
    obterChar(minusculas),
    obterChar(numeros),
    obterChar(simbolos),
  ];

  // Preenche o restante aleatoriamente
  for (let i = senha.length; i < tamanho; i++) {
    senha.push(obterChar(todosCaracteres));
  }

  // Embaralha usando Fisher-Yates (previne padrões previsíveis)
  for (let i = senha.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = senha[i];
    const dest = senha[j];

    // Validação de índices (noUncheckedIndexedAccess)
    if (temp === undefined || dest === undefined) {
      throw new Error('Erro ao embaralhar senha: índice inválido');
    }

    senha[i] = dest;
    senha[j] = temp;
  }

  const senhaFinal = senha.join('');

  // Validação de qualidade da senha gerada
  if (process.env.NODE_ENV === 'development') {
    const validacao = validarForcaSenha(senhaFinal);
    if (!validacao.ehValida) {
      console.error('[PASSWORD] ERRO: Senha gerada não passou na validação!', validacao.erros);
    }
  }

  return senhaFinal;
}

/**
 * Valida força da senha
 *
 * CRITÉRIOS DE VALIDAÇÃO:
 * - Tamanho mínimo (8+ caracteres)
 * - Presença de maiúsculas
 * - Presença de minúsculas
 * - Presença de números
 * - Presença de símbolos (recomendado)
 * - Ausência de padrões fracos
 *
 * PONTUAÇÃO (0-4):
 * - 0: Muito fraca (não atende requisitos)
 * - 1: Fraca (8-11 chars)
 * - 2: Razoável (12-15 chars)
 * - 3: Forte (16+ chars)
 * - 4: Muito forte (16+ chars + 4 tipos)
 *
 * MELHORIAS APLICADAS:
 * - Detecção de padrões fracos
 * - Sistema de pontuação baseado em NIST
 * - Sugestões construtivas
 *
 * @param senha - Senha a ser validada
 * @returns Objeto com resultado da validação
 *
 * @example
 * const resultado = validarForcaSenha('minhasenha');
 * if (!resultado.ehValida) {
 *   console.log('Erros:', resultado.erros);
 *   console.log('Sugestões:', resultado.sugestoes);
 * }
 * console.log('Pontuação:', resultado.pontuacao, '/4');
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

  // Validação de tamanho
  if (senha.length < CONFIGURACAO_SENHA.TAMANHO_MINIMO) {
    erros.push(`Senha deve ter no mínimo ${CONFIGURACAO_SENHA.TAMANHO_MINIMO} caracteres`);
  } else if (senha.length >= 8 && senha.length < 12) {
    pontuacao += 1;
    sugestoes.push('Considere usar 12+ caracteres para maior segurança');
  } else if (senha.length >= 12 && senha.length < 16) {
    pontuacao += 2;
  } else {
    pontuacao += 3;
  }

  // Validação de complexidade
  const temMaiusculas = /[A-Z]/.test(senha);
  const temMinusculas = /[a-z]/.test(senha);
  const temNumeros = /[0-9]/.test(senha);
  const temSimbolos = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(senha);

  if (!temMaiusculas) erros.push('Senha deve conter letras maiúsculas');
  if (!temMinusculas) erros.push('Senha deve conter letras minúsculas');
  if (!temNumeros) erros.push('Senha deve conter números');
  if (!temSimbolos) sugestoes.push('Adicione caracteres especiais para maior segurança');

  // Bônus de pontuação para ter todos os 4 tipos
  const contagemComplexidade = [temMaiusculas, temMinusculas, temNumeros, temSimbolos].filter(Boolean).length;
  pontuacao += contagemComplexidade >= 4 ? 1 : 0;

  // Detecção de padrões fracos
  let contemPadraoFraco = false;
  for (const padrao of PADROES_FRACOS_SENHA) {
    if (padrao.test(senha)) {
      contemPadraoFraco = true;
      erros.push('Senha contém padrões comuns inseguros');
      pontuacao = Math.max(0, pontuacao - 2); // Penalidade de 2 pontos
      break;
    }
  }

  // Log de validação (apenas desenvolvimento)
  if (process.env.NODE_ENV === 'development' && contemPadraoFraco) {
    console.warn('[PASSWORD] Senha com padrão fraco detectada na validação');
  }

  // Determina se senha é válida
  const ehValida = erros.length === 0 && pontuacao >= 2;

  // Limita pontuação máxima em 4
  const pontuacaoFinal = Math.min(4, Math.max(0, pontuacao));

  return {
    ehValida,
    pontuacao: pontuacaoFinal,
    erros,
    sugestoes,
  };
}

/**
 * Utilitários de segurança expostos para testes
 * NÃO usar em produção diretamente
 */
export const _internals = {
  PADROES_FRACOS_SENHA,
  verificarHashPbkdf2,
  verificarHashLegado,
  comparacaoTimingSafe,
  validarEntradaSenha,
  validarEntradaHash,
} as const;