import {
  describe,
  it,
  expect,
  vi
} from 'vitest';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  precisaRehash,
  gerarSenhaSegura,
  validarForcaSenha,
  CONFIGURACAO_SENHA,
} from '../../utils/password';

describe('password.ts - Utilitário de Senha', () => {
  describe('hashPassword', () => {
    it('deve gerar hash válido para senha válida', () => {
      const senha = 'SenhaSegura123!';
      const hash = hashPassword(senha);

      expect(hash).toContain('pbkdf2_sha512$600000$');
      expect(hash.split('$')).toHaveLength(4);
    });

    it('deve gerar hashes diferentes para mesma senha (salt único)', () => {
      const senha = 'MesmaSenha123!';
      const hash1 = hashPassword(senha);
      const hash2 = hashPassword(senha);

      expect(hash1).not.toBe(hash2);
    });

    it('deve gerar hash com formato correto', () => {
      const senha = 'Teste@1234';
      const hash = hashPassword(senha);
      const partes = hash.split('$');

      expect(partes[0]).toBe('pbkdf2_sha512');
      expect(partes[1]).toBe('600000');
      expect(partes[2]).toHaveLength(32); // salt em hex (16 bytes = 32 chars)
      expect(partes[3]).toHaveLength(128); // hash em hex (64 bytes = 128 chars)
    });

    it('deve lançar erro para senha vazia', () => {
      expect(() => hashPassword('')).toThrow('Senha inválida');
    });

    it('deve lançar erro para senha null/undefined', () => {
      expect(() => hashPassword(null as any)).toThrow('Senha inválida');
      expect(() => hashPassword(undefined as any)).toThrow('Senha inválida');
    });

    it('deve lançar erro para senha não-string', () => {
      expect(() => hashPassword(12345 as any)).toThrow('Senha inválida');
      expect(() => hashPassword({} as any)).toThrow('Senha inválida');
    });

    it('deve lançar erro para senha muito curta (<8 caracteres)', () => {
      expect(() => hashPassword('Abc123!')).toThrow('Senha muito curta');
    });

    it('deve aceitar senha com exatamente 8 caracteres', () => {
      const hash = hashPassword('Abcd123!');
      expect(hash).toContain('pbkdf2_sha512$');
    });

    it('deve lançar erro para senha muito longa (>128 caracteres)', () => {
      const senhaLonga = 'A'.repeat(129);
      expect(() => hashPassword(senhaLonga)).toThrow('Senha muito longa');
    });

    it('deve aceitar senha com exatamente 128 caracteres', () => {
      const senha = 'A'.repeat(128);
      const hash = hashPassword(senha);
      expect(hash).toContain('pbkdf2_sha512$');
    });

    it('deve suportar caracteres especiais e Unicode', () => {
      const senha = 'Sẽnhã@Ûñîçõdë123!';
      const hash = hashPassword(senha);
      expect(hash).toContain('pbkdf2_sha512$');
    });

    it('deve gerar hash determinístico com mesmo salt', () => {
      const senha = 'TesteSenha123!';
      const salt = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      
      const hash1 = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
      const hash2 = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('deve retornar true para senha correta', () => {
      const senha = 'MinhaSenha123!';
      const hash = hashPassword(senha);
      
      expect(verifyPassword(senha, hash)).toBe(true);
    });

    it('deve retornar false para senha incorreta', () => {
      const senhaCorreta = 'SenhaCorreta123!';
      const senhaErrada = 'SenhaErrada456@';
      const hash = hashPassword(senhaCorreta);
      
      expect(verifyPassword(senhaErrada, hash)).toBe(false);
    });

    it('deve retornar false para senha vazia', () => {
      const hash = hashPassword('ValidPassword123!');
      
      expect(() => verifyPassword('', hash)).toThrow('Senha inválida');
    });

    it('deve lançar erro para hash vazio', () => {
      expect(() => verifyPassword('senha', '')).toThrow('Hash inválido');
    });

    it('deve lançar erro para hash null/undefined', () => {
      expect(() => verifyPassword('senha', null as any)).toThrow('Hash inválido');
      expect(() => verifyPassword('senha', undefined as any)).toThrow('Hash inválido');
    });

    it('deve retornar false para hash com formato inválido', () => {
      const resultado = verifyPassword('senha', 'hash_invalido_sem_formato');
      expect(resultado).toBe(false);
    });

    it('deve verificar hash legado (formato salt:hash)', () => {
      const senha = 'SenhaLegada123!';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(senha, salt, 100000, 64, 'sha512').toString('hex');
      const hashLegado = `${salt}:${hash}`;
      
      expect(verifyPassword(senha, hashLegado)).toBe(true);
    });

    it('deve rejeitar senha incorreta em hash legado', () => {
      const senhaCorreta = 'SenhaLegada123!';
      const senhaErrada = 'SenhaErrada456@';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(senhaCorreta, salt, 100000, 64, 'sha512').toString('hex');
      const hashLegado = `${salt}:${hash}`;
      
      expect(verifyPassword(senhaErrada, hashLegado)).toBe(false);
    });

    it('deve verificar diferentes iterações do PBKDF2', () => {
      const senha = 'TestIteracoes123!';
      const salt = crypto.randomBytes(16).toString('hex');
      
      // Hash com 500k iterações
      const hash500k = crypto.pbkdf2Sync(senha, salt, 500000, 64, 'sha512').toString('hex');
      const hashFormatado500k = `pbkdf2_sha512$500000$${salt}$${hash500k}`;
      
      expect(verifyPassword(senha, hashFormatado500k)).toBe(true);
    });

    it('deve rejeitar formato PBKDF2 com partes faltando', () => {
      const hashInvalido1 = 'pbkdf2_sha512$600000$salt'; // falta hash
      const hashInvalido2 = 'pbkdf2_sha512$600000'; // falta salt e hash
      const hashInvalido3 = 'pbkdf2_sha512'; // falta tudo
      
      expect(verifyPassword('senha', hashInvalido1)).toBe(false);
      expect(verifyPassword('senha', hashInvalido2)).toBe(false);
      expect(verifyPassword('senha', hashInvalido3)).toBe(false);
    });

    it('deve rejeitar formato legado inválido', () => {
      const hashInvalidoSemDoisPontos = 'salthashjuntos';
      const hashInvalidoSemHash = 'salt:';
      const hashInvalidoSemSalt = ':hash';
      
      expect(verifyPassword('senha', hashInvalidoSemDoisPontos)).toBe(false);
      expect(verifyPassword('senha', hashInvalidoSemHash)).toBe(false);
      expect(verifyPassword('senha', hashInvalidoSemSalt)).toBe(false);
    });

    it('deve retornar false para algoritmo não suportado (linha 108)', () => {
      const senha = 'TesteSenha123!';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');

      const hashInvalido = `pbkdf2_sha256$600000$${salt}$${hash}`;
      
      const resultado = verifyPassword(senha, hashInvalido);
      expect(resultado).toBe(false);
    });

    it('deve retornar false para número de iterações inválido - NaN (linha 113)', () => {
      const senha = 'TesteSenha123!';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
      
      const hashInvalido = `pbkdf2_sha512$abc$${salt}$${hash}`;
      
      const resultado = verifyPassword(senha, hashInvalido);
      expect(resultado).toBe(false);
    });

    it('deve retornar false para número de iterações zero ou negativo (linha 113)', () => {
      const senha = 'TesteSenha123!';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
      
      const hashZero = `pbkdf2_sha512$0$${salt}$${hash}`;
      expect(verifyPassword(senha, hashZero)).toBe(false);
      
      const hashNegativo = `pbkdf2_sha512$-1000$${salt}$${hash}`;
      expect(verifyPassword(senha, hashNegativo)).toBe(false);
    });

    it('deve usar fallback quando comparação hex falha (linhas 157-159)', () => {
      const senha = 'TesteSenha123!';
      const salt = 'invalid_non_hex_salt!!!';
      
      const hashLegado = `${salt}:invalid_non_hex_hash!!!`;
      
      const resultado = verifyPassword(senha, hashLegado);
      expect(resultado).toBe(false);
    });

    it('deve logar erro quando verificação lança exceção inesperada (linha 168)', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const hashMalformado = 'pbkdf2_sha512$$$';
      
      const resultado = verifyPassword('senha', hashMalformado);
      
      expect(resultado).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toBe('Erro ao verificar senha:');
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('precisaRehash', () => {
    it('deve retornar false para hash atualizado', () => {
      const hash = hashPassword('SenhaAtual123!');
      expect(precisaRehash(hash)).toBe(false);
    });

    it('deve retornar true para hash legado', () => {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync('senha', salt, 100000, 64, 'sha512').toString('hex');
      const hashLegado = `${salt}:${hash}`;
      
      expect(precisaRehash(hashLegado)).toBe(true);
    });

    it('deve retornar true para hash com iterações antigas (<600k)', () => {
      const senha = 'SenhaAntiga123!';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(senha, salt, 100000, 64, 'sha512').toString('hex');
      const hashAntigo = `pbkdf2_sha512$100000$${salt}$${hash}`;
      
      expect(precisaRehash(hashAntigo)).toBe(true);
    });

    it('deve retornar true para hash vazio ou null', () => {
      expect(precisaRehash('')).toBe(true);
      expect(precisaRehash(null as any)).toBe(true);
      expect(precisaRehash(undefined as any)).toBe(true);
    });

    it('deve retornar true para formato inválido', () => {
      const hashInvalido = 'formato_completamente_invalido';
      expect(precisaRehash(hashInvalido)).toBe(false);
    });

    it('deve retornar true para hash PBKDF2 com formato incompleto', () => {
      const hashIncompleto = 'pbkdf2_sha512$600000$salt'; // falta o hash
      expect(precisaRehash(hashIncompleto)).toBe(true);
    });

    it('deve retornar false para hash com iterações iguais ou maiores', () => {
      const senha = 'SenhaAtual123!';
      const salt = crypto.randomBytes(16).toString('hex');
      
      const hash600k = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
      const hashAtual = `pbkdf2_sha512$600000$${salt}$${hash600k}`;
      expect(precisaRehash(hashAtual)).toBe(false);
      
      const hash700k = crypto.pbkdf2Sync(senha, salt, 700000, 64, 'sha512').toString('hex');
      const hashMaior = `pbkdf2_sha512$700000$${salt}$${hash700k}`;
      expect(precisaRehash(hashMaior)).toBe(false);
    });
  });

  describe('gerarSenhaSegura', () => {
    it('deve gerar senha com tamanho padrão (16 caracteres)', () => {
      const senha = gerarSenhaSegura();
      expect(senha).toHaveLength(16);
    });

    it('deve gerar senha com tamanho especificado', () => {
      const senha8 = gerarSenhaSegura(8);
      const senha20 = gerarSenhaSegura(20);
      const senha50 = gerarSenhaSegura(50);
      
      expect(senha8).toHaveLength(8);
      expect(senha20).toHaveLength(20);
      expect(senha50).toHaveLength(50);
    });

    it('deve gerar senhas diferentes a cada chamada', () => {
      const senha1 = gerarSenhaSegura(16);
      const senha2 = gerarSenhaSegura(16);
      const senha3 = gerarSenhaSegura(16);
      
      expect(senha1).not.toBe(senha2);
      expect(senha2).not.toBe(senha3);
      expect(senha1).not.toBe(senha3);
    });

    it('deve conter pelo menos uma maiúscula', () => {
      const senha = gerarSenhaSegura(16);
      expect(/[A-Z]/.test(senha)).toBe(true);
    });

    it('deve conter pelo menos uma minúscula', () => {
      const senha = gerarSenhaSegura(16);
      expect(/[a-z]/.test(senha)).toBe(true);
    });

    it('deve conter pelo menos um número', () => {
      const senha = gerarSenhaSegura(16);
      expect(/[0-9]/.test(senha)).toBe(true);
    });

    it('deve conter pelo menos um caractere especial', () => {
      const senha = gerarSenhaSegura(16);
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(senha)).toBe(true);
    });

    it('deve lançar erro para tamanho menor que 8', () => {
      expect(() => gerarSenhaSegura(7)).toThrow('Tamanho mínimo');
      expect(() => gerarSenhaSegura(5)).toThrow('Tamanho mínimo');
      expect(() => gerarSenhaSegura(0)).toThrow('Tamanho mínimo');
    });

    it('deve lançar erro para tamanho maior que 128', () => {
      expect(() => gerarSenhaSegura(129)).toThrow('Tamanho máximo');
      expect(() => gerarSenhaSegura(200)).toThrow('Tamanho máximo');
    });

    it('deve aceitar tamanhos limites (8 e 128)', () => {
      const senha8 = gerarSenhaSegura(8);
      const senha128 = gerarSenhaSegura(128);
      
      expect(senha8).toHaveLength(8);
      expect(senha128).toHaveLength(128);
    });

    it('deve gerar senha que passa na validação de força', () => {
      const senha = gerarSenhaSegura(12);
      const validacao = validarForcaSenha(senha);
      
      expect(validacao.ehValida).toBe(true);
      expect(validacao.pontuacao).toBeGreaterThanOrEqual(2);
    });

    it('senha gerada deve ser criptograficamente aleatória', () => {
      const senhas = new Set();
      const totalSenhas = 100;
      
      for (let i = 0; i < totalSenhas; i++) {
        senhas.add(gerarSenhaSegura(16));
      }
      
      // Todas as senhas devem ser únicas
      expect(senhas.size).toBe(totalSenhas);
    });
  });

  describe('validarForcaSenha', () => {
    it('deve rejeitar senha muito curta', () => {
      const resultado = validarForcaSenha('Abc12!');
      
      expect(resultado.ehValida).toBe(false);
      expect(resultado.erros).toContain('Senha deve ter no mínimo 8 caracteres');
    });

    it('deve aceitar senha de 8 caracteres com complexidade', () => {
      const resultado = validarForcaSenha('Abcd123!');
      
      expect(resultado.ehValida).toBe(true);
    });

    it('deve rejeitar senha sem maiúsculas', () => {
      const resultado = validarForcaSenha('minuscula123!');
      
      expect(resultado.ehValida).toBe(false);
      expect(resultado.erros).toContain('Senha deve conter letras maiúsculas');
    });

    it('deve rejeitar senha sem minúsculas', () => {
      const resultado = validarForcaSenha('MAIUSCULA123!');
      
      expect(resultado.ehValida).toBe(false);
      expect(resultado.erros).toContain('Senha deve conter letras minúsculas');
    });

    it('deve rejeitar senha sem números', () => {
      const resultado = validarForcaSenha('SemNumeros!');
      
      expect(resultado.ehValida).toBe(false);
      expect(resultado.erros).toContain('Senha deve conter números');
    });

    it('deve sugerir caracteres especiais se não tiver', () => {
      const resultado = validarForcaSenha('SemEspeciais123');
      
      expect(resultado.sugestoes).toContain('Adicione caracteres especiais para maior segurança');
    });

    it('deve detectar padrões fracos comuns', () => {
      const senhasFracas = [
        '123456789!Aa',
        'Password123!',
        'Qwerty123!',
        'Abc123456!',
      ];
      
      senhasFracas.forEach(senha => {
        const resultado = validarForcaSenha(senha);
        expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true);
      });
    });

    it('deve detectar senha com caracteres repetidos', () => {
      const resultado = validarForcaSenha('aaaaaaaaaa');
      
      expect(resultado.erros.length).toBeGreaterThan(0);
      expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true);
    });

    it('deve dar pontuação maior para senhas longas', () => {
      const senha8 = validarForcaSenha('Abcd123!');
      const senha12 = validarForcaSenha('Abcd123!@#$%');
      const senha16 = validarForcaSenha('Abcd123!@#$%^&*(');
      
      expect(senha12.pontuacao).toBeGreaterThan(senha8.pontuacao);
      expect(senha16.pontuacao).toBeGreaterThan(senha12.pontuacao);
    });

    it('deve dar pontuação máxima (4) para senha muito forte', () => {
      const senhaForte = validarForcaSenha('MuitoF0rt3&Segur@2024!');
      
      expect(senhaForte.pontuacao).toBe(4);
      expect(senhaForte.ehValida).toBe(true);
      expect(senhaForte.erros).toHaveLength(0);
    });

    it('deve validar senha com todos os critérios', () => {
      const resultado = validarForcaSenha('S3nh@F0rt3!');
      
      expect(resultado.ehValida).toBe(true);
      expect(resultado.pontuacao).toBeGreaterThanOrEqual(2);
      expect(resultado.erros).toHaveLength(0);
    });

    it('deve sugerir mais caracteres para senhas de 8-11 chars', () => {
      const resultado = validarForcaSenha('Senha123!');
      
      expect(resultado.sugestoes).toContain('Considere usar 12+ caracteres para maior segurança');
    });

    it('deve aceitar senha de 12+ caracteres sem sugestão de tamanho', () => {
      const resultado = validarForcaSenha('SenhaLonga123!@#');
      
      const temSugestaoTamanho = resultado.sugestoes.some(s => s.includes('12+ caracteres'));
      expect(temSugestaoTamanho).toBe(false);
    });
  });

  describe('CONFIGURACAO_SENHA', () => {
    it('deve exportar constantes corretas', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MINIMO).toBe(8);
      expect(CONFIGURACAO_SENHA.TAMANHO_MAXIMO).toBe(128);
      expect(CONFIGURACAO_SENHA.TAMANHO_RECOMENDADO).toBe(12);
      expect(CONFIGURACAO_SENHA.ITERACOES).toBe(600000);
      expect(CONFIGURACAO_SENHA.ALGORITMO).toBe('PBKDF2-SHA512');
    });

    it('constantes devem ser readonly', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MINIMO).toBe(8);
      expect(CONFIGURACAO_SENHA.TAMANHO_MAXIMO).toBe(128);
    });
  });

  describe('Integração - Fluxo completo', () => {
    it('deve permitir ciclo completo: hash -> verify -> rehash', () => {
      const senhaOriginal = 'MinhaSenha123!';
      
      const hash1 = hashPassword(senhaOriginal);
      expect(hash1).toContain('pbkdf2_sha512$600000$');
      
      expect(verifyPassword(senhaOriginal, hash1)).toBe(true);
      expect(verifyPassword('SenhaErrada', hash1)).toBe(false);
      
      expect(precisaRehash(hash1)).toBe(false);
      
      const salt = crypto.randomBytes(16).toString('hex');
      const hashLegado = `${salt}:${crypto.pbkdf2Sync(senhaOriginal, salt, 100000, 64, 'sha512').toString('hex')}`;
      
      expect(verifyPassword(senhaOriginal, hashLegado)).toBe(true);
      
      expect(precisaRehash(hashLegado)).toBe(true);
      
      const novoHash = hashPassword(senhaOriginal);
      expect(verifyPassword(senhaOriginal, novoHash)).toBe(true);
      expect(precisaRehash(novoHash)).toBe(false);
    });

    it('deve permitir geração e validação de senha temporária', () => {
      const senhaTemp = gerarSenhaSegura(16);
      expect(senhaTemp).toHaveLength(16);
      
      const validacao = validarForcaSenha(senhaTemp);
      expect(validacao.ehValida).toBe(true);
      
      const hash = hashPassword(senhaTemp);
      expect(hash).toContain('pbkdf2_sha512$');
      
      expect(verifyPassword(senhaTemp, hash)).toBe(true);
    });
  });
});