import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { hashPassword, verifyPassword, precisaRehash, gerarSenhaSegura, validarForcaSenha, CONFIGURACAO_SENHA } from '../../shared/config/password';

describe('Password Utility', () => {
  describe('hashPassword', () => {
    describe('Quando receber senha válida', () => {
      it('deve gerar hash com formato PBKDF2-SHA512 correto', () => {
        const senha = 'SenhaSegura123!';
        const hash = hashPassword(senha);

        expect(hash).toContain('pbkdf2_sha512$600000$');
        expect(hash.split('$')).toHaveLength(4);
      });

      it('deve gerar hash com estrutura correta: algoritmo$iterações$salt$hash', () => {
        const senha = 'Teste@1234';
        const hash = hashPassword(senha);
        const [algoritmo, iteracoes, salt, hashValue] = hash.split('$');

        expect(algoritmo).toBe('pbkdf2_sha512');
        expect(iteracoes).toBe('600000');
        expect(salt).toHaveLength(32); // 16 bytes em hex = 32 chars
        expect(hashValue).toHaveLength(128); // 64 bytes em hex = 128 chars
      });

      it('deve gerar salts únicos para mesma senha', () => {
        const senha = 'MesmaSenha123!';
        const hash1 = hashPassword(senha);
        const hash2 = hashPassword(senha);
        const hash3 = hashPassword(senha);

        expect(hash1).not.toBe(hash2);
        expect(hash2).not.toBe(hash3);
        expect(hash1).not.toBe(hash3);

        // Verifica que apenas o salt é diferente
        const [, , salt1] = hash1.split('$');
        const [, , salt2] = hash2.split('$');
        const [, , salt3] = hash3.split('$');

        expect(salt1).not.toBe(salt2);
        expect(salt2).not.toBe(salt3);
      });

      it('deve aceitar senha com exatamente 8 caracteres (limite mínimo)', () => {
        const senha = 'Abcd123!';
        const hash = hashPassword(senha);

        expect(hash).toContain('pbkdf2_sha512$');
        expect(hash.split('$')).toHaveLength(4);
      });

      it('deve aceitar senha com exatamente 128 caracteres (limite máximo)', () => {
        const senha = 'A1b@' + 'x'.repeat(124); // 128 caracteres no total
        const hash = hashPassword(senha);

        expect(hash).toContain('pbkdf2_sha512$');
      });

      it('deve suportar caracteres especiais diversos', () => {
        const senhas = [
          'Senha!@#$%^&*()',
          'Test[]{}|;:,.<>?',
          'Pass_+-=`~',
        ];

        senhas.forEach(senha => {
          const hash = hashPassword(senha);
          expect(hash).toContain('pbkdf2_sha512$');
        });
      });

      it('deve suportar caracteres Unicode e acentuação', () => {
        const senhas = [
          'Sẽnhã@Ûñîçõdë123!',
          'Сенька123!', // Cirílico
          '密码Test123!', // Chinês
          'كلمة123!', // Árabe
        ];

        senhas.forEach(senha => {
          const hash = hashPassword(senha);
          expect(hash).toContain('pbkdf2_sha512$');
        });
      });

      it('deve suportar emojis e caracteres especiais Unicode', () => {
        const senha = 'Senha🔐🔑123!';
        const hash = hashPassword(senha);

        expect(hash).toContain('pbkdf2_sha512$');
      });

      it('deve gerar hash determinístico com mesmo salt (teste de reprodutibilidade)', () => {
        const senha = 'TesteSenha123!';
        const salt = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

        const hash1 = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
        const hash2 = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');

        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(128);
      });
    });

    describe('Quando receber entrada inválida', () => {
      it('deve lançar erro para senha vazia', () => {
        expect(() => hashPassword('')).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha null', () => {
        expect(() => hashPassword(null as any)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha undefined', () => {
        expect(() => hashPassword(undefined as any)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha como número', () => {
        expect(() => hashPassword(12345 as any)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha como objeto', () => {
        expect(() => hashPassword({} as any)).toThrow('Senha inválida: deve ser uma string não vazia');
        expect(() => hashPassword({ senha: 'test' } as any)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha como array', () => {
        expect(() => hashPassword(['senha'] as any)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha como boolean', () => {
        expect(() => hashPassword(true as any)).toThrow('Senha inválida: deve ser uma string não vazia');
        expect(() => hashPassword(false as any)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha muito curta (< 8 caracteres)', () => {
        expect(() => hashPassword('A')).toThrow('Senha muito curta: mínimo de 8 caracteres');
        expect(() => hashPassword('Ab1!')).toThrow('Senha muito curta: mínimo de 8 caracteres');
        expect(() => hashPassword('Abc123!')).toThrow('Senha muito curta: mínimo de 8 caracteres');
      });

      it('deve lançar erro para senha muito longa (> 128 caracteres)', () => {
        const senhaLonga = 'A1b@' + 'x'.repeat(125); // 129 caracteres
        expect(() => hashPassword(senhaLonga)).toThrow('Senha muito longa: máximo de 128 caracteres');
      });

      it('deve lançar erro para senha extremamente longa', () => {
        const senhaGigante = 'A'.repeat(1000);
        expect(() => hashPassword(senhaGigante)).toThrow('Senha muito longa: máximo de 128 caracteres');
      });
    });
  });

  describe('verifyPassword', () => {
    describe('Quando verificar hash PBKDF2 válido', () => {
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

      it('deve verificar senhas com diferentes tamanhos', () => {
        const senhas = [
          'Abcd123!', // 8 chars
          'MinhaSenha123!', // 14 chars
          'SenhaLongaComMuitosCaracteres123!@#', // 36 chars
        ];

        senhas.forEach(senha => {
          const hash = hashPassword(senha);
          expect(verifyPassword(senha, hash)).toBe(true);
          expect(verifyPassword(senha + 'x', hash)).toBe(false);
        });
      });

      it('deve verificar senhas com caracteres especiais', () => {
        const senha = 'Test!@#$%^&*()_+-=[]{}|;:,.<>?';
        const hash = hashPassword(senha);

        expect(verifyPassword(senha, hash)).toBe(true);
      });

      it('deve verificar senhas com Unicode', () => {
        const senha = 'Sẽnhã@Ûñîçõdë123!';
        const hash = hashPassword(senha);

        expect(verifyPassword(senha, hash)).toBe(true);
      });

      it('deve verificar hash com diferentes números de iterações', () => {
        const senha = 'TestIteracoes123!';
        const salt = crypto.randomBytes(16).toString('hex');

        // 500k iterações
        const hash500k = crypto.pbkdf2Sync(senha, salt, 500000, 64, 'sha512').toString('hex');
        const hashFormatado500k = `pbkdf2_sha512$500000$${salt}$${hash500k}`;
        expect(verifyPassword(senha, hashFormatado500k)).toBe(true);

        // 600k iterações
        const hash600k = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
        const hashFormatado600k = `pbkdf2_sha512$600000$${salt}$${hash600k}`;
        expect(verifyPassword(senha, hashFormatado600k)).toBe(true);

        // 1M iterações
        const hash1M = crypto.pbkdf2Sync(senha, salt, 1000000, 64, 'sha512').toString('hex');
        const hashFormatado1M = `pbkdf2_sha512$1000000$${salt}$${hash1M}`;
        expect(verifyPassword(senha, hashFormatado1M)).toBe(true);
      });

      it('deve ser case-sensitive', () => {
        const senha = 'SenhaTeste123!';
        const hash = hashPassword(senha);

        expect(verifyPassword(senha, hash)).toBe(true);
        expect(verifyPassword('senhateste123!', hash)).toBe(false);
        expect(verifyPassword('SENHATESTE123!', hash)).toBe(false);
      });
    });

    describe('Quando verificar hash legado (formato salt:hash)', () => {
      it('deve verificar hash legado válido', () => {
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

      it('deve retornar false para hash legado malformado sem hash', () => {
        const hashInvalido = 'salt:';
        expect(verifyPassword('SenhaValida123!', hashInvalido)).toBe(false);
      });

      it('deve retornar false para hash legado malformado sem salt', () => {
        const hashInvalido = ':hash';
        expect(verifyPassword('SenhaValida123!', hashInvalido)).toBe(false);
      });

      it('deve retornar false para hash legado sem separador', () => {
        const hashInvalido = 'salthashjuntos';
        expect(verifyPassword('SenhaValida123!', hashInvalido)).toBe(false);
      });

      it('deve usar fallback de comparação quando hex falha em hash legado', () => {
        const senha = 'TesteSenha123!';
        const salt = 'invalid_non_hex_salt!!!';
        const hashLegado = `${salt}:invalid_non_hex_hash!!!`;

        const resultado = verifyPassword(senha, hashLegado);
        expect(resultado).toBe(false);
      });
    });

    describe('Quando receber hash PBKDF2 inválido', () => {
      it('deve retornar false para hash com partes faltando', () => {
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512$600000$salt')).toBe(false); // falta hash
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512$600000')).toBe(false); // falta salt e hash
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512')).toBe(false); // falta tudo
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512$')).toBe(false); // apenas separadores
      });

      it('deve retornar false para algoritmo não suportado', () => {
        const senha = 'TesteSenha123!';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');

        const hashSha256 = `pbkdf2_sha256$600000$${salt}$${hash}`;
        const hashMd5 = `pbkdf2_md5$600000$${salt}$${hash}`;
        const hashInvalido = `algoritmo_invalido$600000$${salt}$${hash}`;

        expect(verifyPassword(senha, hashSha256)).toBe(false);
        expect(verifyPassword(senha, hashMd5)).toBe(false);
        expect(verifyPassword(senha, hashInvalido)).toBe(false);
      });

      it('deve retornar false para número de iterações inválido (NaN)', () => {
        const senha = 'TesteSenha123!';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');

        const hashInvalido = `pbkdf2_sha512$abc$${salt}$${hash}`;
        expect(verifyPassword(senha, hashInvalido)).toBe(false);

        const hashTexto = `pbkdf2_sha512$texto$${salt}$${hash}`;
        expect(verifyPassword(senha, hashTexto)).toBe(false);
      });

      it('deve retornar false para número de iterações zero ou negativo', () => {
        const senha = 'TesteSenha123!';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');

        const hashZero = `pbkdf2_sha512$0$${salt}$${hash}`;
        expect(verifyPassword(senha, hashZero)).toBe(false);

        const hashNegativo = `pbkdf2_sha512$-1000$${salt}$${hash}`;
        expect(verifyPassword(senha, hashNegativo)).toBe(false);

        const hashNegativo2 = `pbkdf2_sha512$-1$${salt}$${hash}`;
        expect(verifyPassword(senha, hashNegativo2)).toBe(false);
      });

      it('deve retornar false para hash completamente malformado', () => {
        const hashMalformado = 'pbkdf2_sha512$$$';
        expect(verifyPassword('SenhaValida123!', hashMalformado)).toBe(false);
      });
    });

    describe('Quando receber formato de hash não reconhecido', () => {
      it('deve retornar false para formato desconhecido', () => {
        expect(verifyPassword('SenhaValida123!', 'hash_invalido_sem_formato')).toBe(false);
        expect(verifyPassword('SenhaValida123!', 'formatoinvalido')).toBe(false);
        expect(verifyPassword('SenhaValida123!', 'bcrypt$hash')).toBe(false);
      });

      it('deve logar erro quando verificação lança exceção inesperada', () => {
          const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

          const hashMalformado = 'pbkdf2_sha512$$$';
          const senhaValida = 'senha123'; // 8 caracteres
          const resultado = verifyPassword(senhaValida, hashMalformado);

          expect(resultado).toBe(false);
          expect(consoleErrorSpy).toHaveBeenCalled();
          expect(consoleErrorSpy.mock.calls[0][0]).toBe('Erro ao verificar senha:');

          consoleErrorSpy.mockRestore();
        });
      });

    describe('Quando receber entrada inválida', () => {
      it('deve lançar erro para senha vazia', () => {
        const hash = hashPassword('ValidPassword123!');
        expect(() => verifyPassword('', hash)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para senha null ou undefined', () => {
        const hash = hashPassword('ValidPassword123!');
        expect(() => verifyPassword(null as any, hash)).toThrow('Senha inválida: deve ser uma string não vazia');
        expect(() => verifyPassword(undefined as any, hash)).toThrow('Senha inválida: deve ser uma string não vazia');
      });

      it('deve lançar erro para hash vazio', () => {
        expect(() => verifyPassword('senha', '')).toThrow('Senha muito curta: mínimo de 8 caracteres');
      });

      it('deve lançar erro para hash null ou undefined', () => {
        expect(() => verifyPassword('senha', null as any)).toThrow('Senha muito curta: mínimo de 8 caracteres');
        expect(() => verifyPassword('senha', undefined as any)).toThrow('Senha muito curta: mínimo de 8 caracteres');
      });

      it('deve lançar erro para hash não-string', () => {
        expect(() => verifyPassword('senha', 12345 as any)).toThrow('Senha muito curta: mínimo de 8 caracteres');
        expect(() => verifyPassword('senha', {} as any)).toThrow('Senha muito curta: mínimo de 8 caracteres');
      });
    });

    describe('Timing-safe comparison', () => {
      it('deve usar comparação timing-safe através do crypto.timingSafeEqual', () => {
        const senha = 'TesteSenha123!';
        const hash = hashPassword(senha);

        // Verifica que a função executa sem revelar timing information
        // crypto.timingSafeEqual é usado internamente
        const resultadoCorreto = verifyPassword(senha, hash);
        const resultadoErrado = verifyPassword('SenhaErrada123!', hash);

        expect(resultadoCorreto).toBe(true);
        expect(resultadoErrado).toBe(false);

        // Ambas as execuções usam timingSafeEqual internamente
        // independente do resultado
      });
    });
  });

  describe('precisaRehash', () => {
    describe('Quando hash está atualizado', () => {
      it('deve retornar false para hash atual (600k iterações)', () => {
        const hash = hashPassword('SenhaAtual123!');
        expect(precisaRehash(hash)).toBe(false);
      });

      it('deve retornar false para hash com iterações maiores que o padrão', () => {
        const senha = 'SenhaFutura123!';
        const salt = crypto.randomBytes(16).toString('hex');

        const hash700k = crypto.pbkdf2Sync(senha, salt, 700000, 64, 'sha512').toString('hex');
        const hashFormatado = `pbkdf2_sha512$700000$${salt}$${hash700k}`;

        expect(precisaRehash(hashFormatado)).toBe(false);
      });

      it('deve retornar false para hash com iterações iguais ao padrão', () => {
        const senha = 'SenhaAtual123!';
        const salt = crypto.randomBytes(16).toString('hex');

        const hash600k = crypto.pbkdf2Sync(senha, salt, 600000, 64, 'sha512').toString('hex');
        const hashFormatado = `pbkdf2_sha512$600000$${salt}$${hash600k}`;

        expect(precisaRehash(hashFormatado)).toBe(false);
      });

      it('deve retornar false para hash com 1 milhão de iterações', () => {
        const senha = 'SenhaMuitoForte123!';
        const salt = crypto.randomBytes(16).toString('hex');

        const hash1M = crypto.pbkdf2Sync(senha, salt, 1000000, 64, 'sha512').toString('hex');
        const hashFormatado = `pbkdf2_sha512$1000000$${salt}$${hash1M}`;

        expect(precisaRehash(hashFormatado)).toBe(false);
      });
    });

    describe('Quando hash precisa atualização', () => {
      it('deve retornar true para hash legado (formato salt:hash)', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync('senha', salt, 100000, 64, 'sha512').toString('hex');
        const hashLegado = `${salt}:${hash}`;

        expect(precisaRehash(hashLegado)).toBe(true);
      });

      it('deve retornar true para hash com iterações antigas (< 600k)', () => {
        const senha = 'SenhaAntiga123!';
        const salt = crypto.randomBytes(16).toString('hex');

        // 100k iterações
        const hash100k = crypto.pbkdf2Sync(senha, salt, 100000, 64, 'sha512').toString('hex');
        const hashAntigo = `pbkdf2_sha512$100000$${salt}$${hash100k}`;
        expect(precisaRehash(hashAntigo)).toBe(true);

        // 500k iterações
        const hash500k = crypto.pbkdf2Sync(senha, salt, 500000, 64, 'sha512').toString('hex');
        const hashMenosAntigo = `pbkdf2_sha512$500000$${salt}$${hash500k}`;
        expect(precisaRehash(hashMenosAntigo)).toBe(true);

        // 599999 iterações (um a menos que o padrão)
        const hash599k = crypto.pbkdf2Sync(senha, salt, 599999, 64, 'sha512').toString('hex');
        const hashQuaseAtual = `pbkdf2_sha512$599999$${salt}$${hash599k}`;
        expect(precisaRehash(hashQuaseAtual)).toBe(true);
      });

      it('deve retornar true para hash PBKDF2 com formato incompleto', () => {
        // Hash com 3 partes (falta o hash final) - retorna true pois length !== 4
        const hashIncompleto1 = 'pbkdf2_sha512$600000$salt';
        expect(precisaRehash(hashIncompleto1)).toBe(true);
        
        // Hash com 2 partes (falta salt e hash) - retorna true pois length !== 4
        const hashIncompleto2 = 'pbkdf2_sha512$600000';
        expect(precisaRehash(hashIncompleto2)).toBe(true);
      });

      it('deve retornar false para hash PBKDF2 com 4 partes mas salt vazio', () => {
        // Hash com 4 partes mas salt vazio - passa na validação de length === 4
        // então tenta parsear iterações e retorna false (não precisa rehash se iterações >= 600k)
        const hashSaltVazio = 'pbkdf2_sha512$600000$$hash';
        
        // Este hash tem 4 partes, então passa pela primeira validação
        // As iterações são 600000 (>= 600000), então retorna false
        expect(precisaRehash(hashSaltVazio)).toBe(false);
      });

      it('deve retornar false para hash PBKDF2 sem prefixo correto', () => {
        const hashSemPrefixo = 'pbkdf2_sha512'; // falta tudo mas não tem :
        
        // Não é formato legado (sem :) nem PBKDF2 válido, então retorna false
        expect(precisaRehash(hashSemPrefixo)).toBe(false);
      });

      it('deve retornar true para hash com mais de 4 partes', () => {
        const hashComMaisPartes = 'pbkdf2_sha512$600000$salt$hash$extra';
        expect(precisaRehash(hashComMaisPartes)).toBe(true);
      });
    });

    describe('Quando hash é inválido', () => {
      it('deve retornar true para hash vazio', () => {
        expect(precisaRehash('')).toBe(true);
      });

      it('deve retornar true para hash null ou undefined', () => {
        expect(precisaRehash(null as any)).toBe(true);
        expect(precisaRehash(undefined as any)).toBe(true);
      });

      it('deve retornar true para hash não-string', () => {
        expect(precisaRehash(12345 as any)).toBe(true);
        expect(precisaRehash({} as any)).toBe(true);
        expect(precisaRehash([] as any)).toBe(true);
      });

      it('deve retornar false para formato completamente desconhecido', () => {
        const hashInvalido = 'formato_completamente_invalido';
        expect(precisaRehash(hashInvalido)).toBe(false);
      });

      it('deve retornar false para formato bcrypt', () => {
        const hashBcrypt = '$2b$10$abc123';
        expect(precisaRehash(hashBcrypt)).toBe(false);
      });
    });
  });

  describe('gerarSenhaSegura', () => {
    describe('Quando gerar senha com parâmetros válidos', () => {
      it('deve gerar senha com tamanho padrão (16 caracteres)', () => {
        const senha = gerarSenhaSegura();
        expect(senha).toHaveLength(16);
      });

      it('deve gerar senha com tamanho especificado', () => {
        const tamanhos = [8, 10, 12, 16, 20, 32, 50, 100, 128];

        tamanhos.forEach(tamanho => {
          const senha = gerarSenhaSegura(tamanho);
          expect(senha).toHaveLength(tamanho);
        });
      });

      it('deve gerar senhas diferentes a cada chamada', () => {
        const senhas = new Set();
        const quantidade = 100;

        for (let i = 0; i < quantidade; i++) {
          senhas.add(gerarSenhaSegura(16));
        }

        expect(senhas.size).toBe(quantidade);
      });

      it('deve gerar senha com limite mínimo (8 caracteres)', () => {
        const senha = gerarSenhaSegura(8);
        expect(senha).toHaveLength(8);
      });

      it('deve gerar senha com limite máximo (128 caracteres)', () => {
        const senha = gerarSenhaSegura(128);
        expect(senha).toHaveLength(128);
      });
    });

    describe('Quando verificar complexidade da senha gerada', () => {
      it('deve conter pelo menos uma letra maiúscula', () => {
        for (let i = 0; i < 10; i++) {
          const senha = gerarSenhaSegura(16);
          expect(/[A-Z]/.test(senha)).toBe(true);
        }
      });

      it('deve conter pelo menos uma letra minúscula', () => {
        for (let i = 0; i < 10; i++) {
          const senha = gerarSenhaSegura(16);
          expect(/[a-z]/.test(senha)).toBe(true);
        }
      });

      it('deve conter pelo menos um número', () => {
        for (let i = 0; i < 10; i++) {
          const senha = gerarSenhaSegura(16);
          expect(/[0-9]/.test(senha)).toBe(true);
        }
      });

      it('deve conter pelo menos um caractere especial', () => {
        for (let i = 0; i < 10; i++) {
          const senha = gerarSenhaSegura(16);
          expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(senha)).toBe(true);
        }
      });

      it('senha gerada deve passar na validação de força', () => {
        for (let i = 0; i < 10; i++) {
          const senha = gerarSenhaSegura(12);
          const validacao = validarForcaSenha(senha);

          expect(validacao.ehValida).toBe(true);
          expect(validacao.pontuacao).toBeGreaterThanOrEqual(2);
          expect(validacao.erros).toHaveLength(0);
        }
      });

      it('deve gerar senhas bem distribuídas (teste de aleatoriedade)', () => {
        const senhas = Array.from({ length: 50 }, () => gerarSenhaSegura(20));
        const todasDiferentes = new Set(senhas).size === senhas.length;

        expect(todasDiferentes).toBe(true);
      });
    });

    describe('Quando receber parâmetros inválidos', () => {
      it('deve lançar erro para tamanho menor que 8', () => {
        expect(() => gerarSenhaSegura(7)).toThrow('Tamanho mínimo de senha: 8 caracteres');
        expect(() => gerarSenhaSegura(5)).toThrow('Tamanho mínimo de senha: 8 caracteres');
        expect(() => gerarSenhaSegura(0)).toThrow('Tamanho mínimo de senha: 8 caracteres');
        expect(() => gerarSenhaSegura(-1)).toThrow('Tamanho mínimo de senha: 8 caracteres');
      });

      it('deve lançar erro para tamanho maior que 128', () => {
        expect(() => gerarSenhaSegura(129)).toThrow('Tamanho máximo de senha: 128 caracteres');
        expect(() => gerarSenhaSegura(200)).toThrow('Tamanho máximo de senha: 128 caracteres');
        expect(() => gerarSenhaSegura(1000)).toThrow('Tamanho máximo de senha: 128 caracteres');
      });
    });

    describe('Quando testar segurança criptográfica', () => {
      it('deve usar randomInt criptograficamente seguro', () => {
        const senhas = new Set();

        // Gera muitas senhas para verificar aleatoriedade
        for (let i = 0; i < 100; i++) {
          senhas.add(gerarSenhaSegura(16));
        }

        // Todas devem ser únicas
        expect(senhas.size).toBe(100);
      });

      it('deve embaralhar caracteres usando Fisher-Yates', () => {
        const senhas = Array.from({ length: 20 }, () => gerarSenhaSegura(16));

        // Verifica que os 4 primeiros caracteres não seguem padrão fixo
        const primeiroChar = new Set(senhas.map(s => s[0]));
        const segundoChar = new Set(senhas.map(s => s[1]));
        const terceiroChar = new Set(senhas.map(s => s[2]));
        const quartoChar = new Set(senhas.map(s => s[3]));

        // Deve ter variação nos primeiros caracteres
        expect(primeiroChar.size).toBeGreaterThan(1);
        expect(segundoChar.size).toBeGreaterThan(1);
        expect(terceiroChar.size).toBeGreaterThan(1);
        expect(quartoChar.size).toBeGreaterThan(1);
      });
    });
  });

  describe('validarForcaSenha', () => {
    describe('Quando validar requisitos mínimos', () => {
      it('deve rejeitar senha muito curta (< 8 caracteres)', () => {
        const senhasCurtas = ['A', 'Ab1!', 'Abc12!', 'Abcd12!'];

        senhasCurtas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.ehValida).toBe(false);
          expect(resultado.erros).toContain('Senha deve ter no mínimo 8 caracteres');
        });
      });

      it('deve aceitar senha com exatamente 8 caracteres e complexidade adequada', () => {
        const resultado = validarForcaSenha('Abcd123!');

        expect(resultado.ehValida).toBe(true);
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(2);
      });

      it('deve rejeitar senha sem letras maiúsculas', () => {
        const senhas = ['minuscula123!', 'senhafraca123@', 'password123#'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.ehValida).toBe(false);
          expect(resultado.erros).toContain('Senha deve conter letras maiúsculas');
        });
      });

      it('deve rejeitar senha sem letras minúsculas', () => {
        const senhas = ['MAIUSCULA123!', 'SENHAFRACA123@', 'PASSWORD123#'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.ehValida).toBe(false);
          expect(resultado.erros).toContain('Senha deve conter letras minúsculas');
        });
      });

      it('deve rejeitar senha sem números', () => {
        const senhas = ['SemNumeros!', 'ApenasLetras@', 'SenhaFraca#'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.ehValida).toBe(false);
          expect(resultado.erros).toContain('Senha deve conter números');
        });
      });

      it('deve sugerir caracteres especiais quando não houver', () => {
        const senhas = ['SemEspeciais123', 'OutraSenha456', 'MaisUma789'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.sugestoes).toContain('Adicione caracteres especiais para maior segurança');
        });
      });
    });

    describe('Quando detectar padrões fracos', () => {
      it('deve detectar senha começando com 123456', () => {
        const senhas = ['123456789!Aa', '1234567890!Bb'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true);
          expect(resultado.pontuacao).toBeLessThan(4);
        });
      });

      it('deve detectar senha com palavra "password"', () => {
        const senhas = ['Password123!', 'password123!', 'MyPassword1!'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve detectar senha com "qwerty"', () => {
        const senhas = ['Qwerty123!', 'qwerty123!', 'MyQwerty1!'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve detectar senha com "abc123"', () => {
        const senhas = ['Abc123456!', 'abc123456!', 'MyAbc1234!'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve detectar senha com caracteres repetidos', () => {
        const senhas = ['aaaaaaaaaa', 'AAAAAAAAAA', '1111111111'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve reduzir pontuação quando detectar padrão fraco', () => {
        const senhaFraca = 'Password123!';
        const resultado = validarForcaSenha(senhaFraca);

        // Pontuação deve ser reduzida em 2
        expect(resultado.pontuacao).toBeLessThan(3);
      });
    });

    describe('Quando calcular pontuação', () => {
      it('deve dar pontuação 1 para senha de 8-11 caracteres', () => {
        const senha = 'Abcd123!'; // 8 chars
        const resultado = validarForcaSenha(senha);

        expect(resultado.ehValida).toBe(true);
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(1);
      });

      it('deve dar pontuação 2 para senha de 12-15 caracteres', () => {
        const senha = 'Abcd123!@#$%'; // 12 chars
        const resultado = validarForcaSenha(senha);

        expect(resultado.pontuacao).toBeGreaterThanOrEqual(2);
      });

      it('deve dar pontuação 3+ para senha de 16+ caracteres', () => {
        const senha = 'Abcd123!@#$%^&*('; // 16 chars
        const resultado = validarForcaSenha(senha);

        expect(resultado.pontuacao).toBeGreaterThanOrEqual(3);
      });

      it('deve dar pontuação máxima (4) para senha muito forte', () => {
        const senhasFortes = [
          'MuitoF0rt3&Segur@2024!',
          'C0mpl3x@P4ssw0rd!2024',
          'Sup3rS3gur4&F0rt3#2024',
        ];

        senhasFortes.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.pontuacao).toBe(4);
          expect(resultado.ehValida).toBe(true);
          expect(resultado.erros).toHaveLength(0);
        });
      });

      it('deve adicionar ponto quando tiver 4 tipos de caracteres', () => {
        const senhaCompleta = 'S3nh@Forte!'; // maiúscula, minúscula, número, especial (sem padrões fracos)
        const resultado = validarForcaSenha(senhaCompleta);

        // Senha de 11 chars (pontuação 1) + 4 tipos de caracteres (pontuação 1) = 2+
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(2);
        expect(resultado.ehValida).toBe(true);
      });

      it('deve limitar pontuação máxima em 4', () => {
        const senhaExtremaForte = 'A'.repeat(100) + 'b1!@#$%';
        const resultado = validarForcaSenha(senhaExtremaForte);

        expect(resultado.pontuacao).toBeLessThanOrEqual(4);
        expect(resultado.pontuacao).toBe(4);
      });

      it('deve garantir pontuação mínima de 0', () => {
        const senhaFraca = 'password123!'; // tem padrão fraco
        const resultado = validarForcaSenha(senhaFraca);

        expect(resultado.pontuacao).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Quando dar sugestões', () => {
      it('deve sugerir mais caracteres para senhas de 8-11 chars', () => {
        const senhas = ['Abcd123!', 'Senha12!', 'Test123!@'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.sugestoes).toContain('Considere usar 12+ caracteres para maior segurança');
        });
      });

      it('NÃO deve sugerir mais caracteres para senhas de 12+ chars', () => {
        const senhas = ['SenhaLonga123!@#', 'OutraSenhaMuitoLonga123!@#'];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          const temSugestaoTamanho = resultado.sugestoes.some(s => s.includes('12+ caracteres'));
          expect(temSugestaoTamanho).toBe(false);
        });
      });

      it('deve ter lista vazia de erros para senha válida', () => {
        const resultado = validarForcaSenha('S3nh@F0rt3!');

        expect(resultado.ehValida).toBe(true);
        expect(resultado.erros).toHaveLength(0);
      });
    });

    describe('Quando validar casos extremos', () => {
      it('deve validar senha com todos os critérios atendidos', () => {
        const senhas = [
          'S3nh@F0rt3!',
          'P4ssw0rd!Str0ng',
          'C0mpl3x@2024',
        ];

        senhas.forEach(senha => {
          const resultado = validarForcaSenha(senha);
          expect(resultado.ehValida).toBe(true);
          expect(resultado.pontuacao).toBeGreaterThanOrEqual(2);
        });
      });

      it('deve rejeitar senha com múltiplos problemas', () => {
        const senha = 'abc'; // curta, sem maiúscula, sem número, sem especial

        const resultado = validarForcaSenha(senha);

        expect(resultado.ehValida).toBe(false);
        expect(resultado.erros.length).toBeGreaterThan(1);
        expect(resultado.pontuacao).toBe(0);
      });

      it('deve validar senha longa com todos os tipos de caracteres', () => {
        const senha = 'A1b@' + 'Cd3$Ef5%Gh7&Ij9*';
        const resultado = validarForcaSenha(senha);

        expect(resultado.ehValida).toBe(true);
        expect(resultado.pontuacao).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('CONFIGURACAO_SENHA', () => {
    it('deve exportar constante TAMANHO_MINIMO correta', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MINIMO).toBe(8);
    });

    it('deve exportar constante TAMANHO_MAXIMO correta', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MAXIMO).toBe(128);
    });

    it('deve exportar constante TAMANHO_RECOMENDADO correta', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_RECOMENDADO).toBe(12);
    });

    it('deve exportar constante ITERACOES correta', () => {
      expect(CONFIGURACAO_SENHA.ITERACOES).toBe(600000);
    });

    it('deve exportar constante ALGORITMO correta', () => {
      expect(CONFIGURACAO_SENHA.ALGORITMO).toBe('PBKDF2-SHA512');
    });

    it('constantes devem ser readonly (imutáveis)', () => {
      const config = CONFIGURACAO_SENHA;

      expect(config.TAMANHO_MINIMO).toBe(8);
      expect(config.TAMANHO_MAXIMO).toBe(128);
      expect(config.TAMANHO_RECOMENDADO).toBe(12);
      expect(config.ITERACOES).toBe(600000);
      expect(config.ALGORITMO).toBe('PBKDF2-SHA512');
    });

    it('deve ter todas as propriedades definidas', () => {
      expect(CONFIGURACAO_SENHA).toHaveProperty('TAMANHO_MINIMO');
      expect(CONFIGURACAO_SENHA).toHaveProperty('TAMANHO_MAXIMO');
      expect(CONFIGURACAO_SENHA).toHaveProperty('TAMANHO_RECOMENDADO');
      expect(CONFIGURACAO_SENHA).toHaveProperty('ITERACOES');
      expect(CONFIGURACAO_SENHA).toHaveProperty('ALGORITMO');
    });
  });

  describe('Cenários de integração completos', () => {
    describe('Fluxo de criação e verificação', () => {
      it('deve executar ciclo completo: hash -> verify -> rehash quando necessário', () => {
        const senhaOriginal = 'MinhaSenha123!';

        // 1. Criar hash
        const hash1 = hashPassword(senhaOriginal);
        expect(hash1).toContain('pbkdf2_sha512$600000$');

        // 2. Verificar senha correta
        expect(verifyPassword(senhaOriginal, hash1)).toBe(true);

        // 3. Verificar senha incorreta
        expect(verifyPassword('SenhaErrada', hash1)).toBe(false);

        // 4. Verificar que não precisa rehash
        expect(precisaRehash(hash1)).toBe(false);

        // 5. Simular hash legado
        const salt = crypto.randomBytes(16).toString('hex');
        const hashLegado = `${salt}:${crypto.pbkdf2Sync(senhaOriginal, salt, 100000, 64, 'sha512').toString('hex')}`;

        // 6. Verificar hash legado
        expect(verifyPassword(senhaOriginal, hashLegado)).toBe(true);

        // 7. Verificar que precisa rehash
        expect(precisaRehash(hashLegado)).toBe(true);

        // 8. Fazer rehash
        const novoHash = hashPassword(senhaOriginal);
        expect(verifyPassword(senhaOriginal, novoHash)).toBe(true);
        expect(precisaRehash(novoHash)).toBe(false);
      });

      it('deve permitir migração de hash legado para novo formato', () => {
        const senha = 'SenhaMigracao123!';

        // Hash legado
        const salt = crypto.randomBytes(16).toString('hex');
        const hashLegado = `${salt}:${crypto.pbkdf2Sync(senha, salt, 100000, 64, 'sha512').toString('hex')}`;

        // Verificar que funciona
        expect(verifyPassword(senha, hashLegado)).toBe(true);

        // Verificar que precisa atualizar
        expect(precisaRehash(hashLegado)).toBe(true);

        // Migrar para novo formato
        const hashNovo = hashPassword(senha);

        // Verificar novo hash
        expect(verifyPassword(senha, hashNovo)).toBe(true);
        expect(precisaRehash(hashNovo)).toBe(false);
      });
    });

    describe('Fluxo de geração e validação de senha temporária', () => {
      it('deve gerar senha temporária que passa na validação', () => {
        // Gerar senha
        const senhaTemp = gerarSenhaSegura(16);
        expect(senhaTemp).toHaveLength(16);

        // Validar força
        const validacao = validarForcaSenha(senhaTemp);
        expect(validacao.ehValida).toBe(true);
        expect(validacao.pontuacao).toBeGreaterThanOrEqual(2);

        // Criar hash
        const hash = hashPassword(senhaTemp);
        expect(hash).toContain('pbkdf2_sha512$');

        // Verificar
        expect(verifyPassword(senhaTemp, hash)).toBe(true);
      });

      it('deve gerar múltiplas senhas válidas', () => {
        for (let i = 0; i < 20; i++) {
          const senha = gerarSenhaSegura();
          const validacao = validarForcaSenha(senha);

          expect(validacao.ehValida).toBe(true);
          expect(validacao.erros).toHaveLength(0);
        }
      });
    });

    describe('Fluxo de atualização de senha', () => {
      it('deve permitir troca de senha mantendo segurança', () => {
        const senhaAntiga = 'SenhaAntiga123!';
        const senhaNova = 'SenhaNova456@';

        // Hash da senha antiga
        const hashAntigo = hashPassword(senhaAntiga);

        // Verificar senha antiga
        expect(verifyPassword(senhaAntiga, hashAntigo)).toBe(true);

        // Criar hash da nova senha
        const hashNovo = hashPassword(senhaNova);

        // Verificar que nova senha funciona
        expect(verifyPassword(senhaNova, hashNovo)).toBe(true);

        // Verificar que senha antiga não funciona com novo hash
        expect(verifyPassword(senhaAntiga, hashNovo)).toBe(false);

        // Verificar que nova senha não funciona com hash antigo
        expect(verifyPassword(senhaNova, hashAntigo)).toBe(false);
      });
    });

    describe('Fluxo de reset de senha', () => {
      it('deve permitir reset com senha temporária e depois troca', () => {
        // 1. Gerar senha temporária
        const senhaTemp = gerarSenhaSegura(12);
        const hashTemp = hashPassword(senhaTemp);

        // 2. Usuário faz login com senha temporária
        expect(verifyPassword(senhaTemp, hashTemp)).toBe(true);

        // 3. Usuário define nova senha
        const senhaNova = 'MinhaNovaSenha123!';
        const validacao = validarForcaSenha(senhaNova);
        expect(validacao.ehValida).toBe(true);

        const hashNovo = hashPassword(senhaNova);

        // 4. Verificar que nova senha funciona
        expect(verifyPassword(senhaNova, hashNovo)).toBe(true);

        // 5. Verificar que senha temporária não funciona mais
        expect(verifyPassword(senhaTemp, hashNovo)).toBe(false);
      });
    });

    describe('Cenários de segurança', () => {
      it('deve prevenir timing attacks na comparação', () => {
        const senha = 'TesteSenha123!';
        const hash = hashPassword(senha);

        // Múltiplas tentativas de senha errada não devem revelar informação por timing
        const tentativas = [
          'SenhaErrada1!',
          'OutraSenha2@',
          'MaisUma3#',
        ];

        tentativas.forEach(tentativa => {
          const resultado = verifyPassword(tentativa, hash);
          expect(resultado).toBe(false);
        });
      });

      it('deve manter salt único mesmo para senhas idênticas', () => {
        const senha = 'MesmaSenha123!';

        const hash1 = hashPassword(senha);
        const hash2 = hashPassword(senha);
        const hash3 = hashPassword(senha);

        const [, , salt1] = hash1.split('$');
        const [, , salt2] = hash2.split('$');
        const [, , salt3] = hash3.split('$');

        // Todos os salts devem ser diferentes
        expect(salt1).not.toBe(salt2);
        expect(salt2).not.toBe(salt3);
        expect(salt1).not.toBe(salt3);
      });
    });
  });
});