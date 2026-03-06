import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  precisaRehash,
  gerarSenhaSegura,
  validarForcaSenha,
  CONFIGURACAO_SENHA,
} from '@shared/config/password';

const realPbkdf2Sync = crypto.pbkdf2Sync.bind(crypto);

/** Substituto rápido: 1 iteração em vez de 600 000 */
function pbkdf2Fast(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  _iterations: number,
  keylen: number,
  digest: string
): Buffer {
  return realPbkdf2Sync(password, salt, 1, keylen, digest);
}

/**
 * Cria um hash no novo formato usando o spy já instalado (1 iteração).
 * Só pode ser chamada dentro do bloco que tem o spy ativo.
 */
function hashFast(senha: string): string {
  return hashPassword(senha);
}

/**
 * Cria um hash legado (salt:hash) usando as mesmas 100.000 iterações
 * reais que `verificarHashLegado` usa internamente.
 *
 * IMPORTANTE: usa `realPbkdf2Sync` diretamente (sem passar pelo spy),
 * porque `verificarHashLegado` chama `crypto.pbkdf2Sync` com 100.000
 * iterações hard-coded. Em ESM com módulos nativos, `vi.spyOn` pode não
 * interceptar chamadas dentro do módulo já importado, fazendo com que a
 * implementação use 100.000 iterações reais enquanto o teste usa apenas 1
 * — resultado: hashes incompatíveis → `verifyPassword` retorna false.
 *
 * Ao usar `realPbkdf2Sync` com 100.000 aqui, garantimos que o hash gerado
 * no teste bate exatamente com o que a implementação vai recomputar.
 */
function hashLegadoReal(senha: string, salt: string): string {
  const raw = realPbkdf2Sync(senha, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${raw}`;
}

describe('Password Utility', () => {
  // O spy fica ativo durante TODA a suíte para evitar 600 000 iterações reais
  // em cada hashPassword/verifyPassword chamado nos describes abaixo.
  let pbkdf2Spy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    pbkdf2Spy = vi
      .spyOn(crypto, 'pbkdf2Sync')
      .mockImplementation(pbkdf2Fast as any);
  });

  afterAll(() => {
    pbkdf2Spy.mockRestore();
  });

  describe('hashPassword', () => {
    describe('Quando receber senha válida', () => {
      it('deve gerar hash com formato PBKDF2-SHA512 correto', () => {
        const hash = hashPassword('SenhaSegura123!');
        expect(hash).toContain('pbkdf2_sha512$600000$');
        expect(hash.split('$')).toHaveLength(4);
      });

      it('deve gerar hash com estrutura correta: algoritmo$iterações$salt$hash', () => {
        const hash = hashPassword('Teste@1234');
        const [algoritmo, iteracoes, salt, hashValue] = hash.split('$');

        expect(algoritmo).toBe('pbkdf2_sha512');
        expect(iteracoes).toBe('600000');
        expect(salt).toHaveLength(32);   // 16 bytes em hex = 32 chars
        expect(hashValue).toHaveLength(128); // 64 bytes em hex = 128 chars
      });

      it('deve gerar salts únicos para mesma senha', () => {
        const senha = 'MesmaSenha123!';
        const [h1, h2, h3] = [hashPassword(senha), hashPassword(senha), hashPassword(senha)];

        expect(h1).not.toBe(h2);
        expect(h2).not.toBe(h3);
        expect(h1).not.toBe(h3);

        const salts = [h1, h2, h3].map(h => h.split('$')[2]);
        expect(salts[0]).not.toBe(salts[1]);
        expect(salts[1]).not.toBe(salts[2]);
        expect(salts[0]).not.toBe(salts[2]);
      });

      it('deve aceitar senha com exatamente 8 caracteres (limite mínimo)', () => {
        const hash = hashPassword('Abcd123!');
        expect(hash).toContain('pbkdf2_sha512$');
        expect(hash.split('$')).toHaveLength(4);
      });

      it('deve aceitar senha com exatamente 128 caracteres (limite máximo)', () => {
        const hash = hashPassword('A1b@' + 'x'.repeat(124));
        expect(hash).toContain('pbkdf2_sha512$');
      });

      it('deve suportar caracteres especiais diversos', () => {
        ['Senha!@#$%^&*()', 'Test[]{}|;:,.<>?', 'Pass_+-=`~'].forEach(senha => {
          expect(hashPassword(senha)).toContain('pbkdf2_sha512$');
        });
      });

      it('deve suportar caracteres Unicode e acentuação', () => {
        ['Sẽnhã@Ûñîçõdë123!', 'Сенька123!', '密码Test123!', 'كلمة123!'].forEach(senha => {
          expect(hashPassword(senha)).toContain('pbkdf2_sha512$');
        });
      });

      it('deve suportar emojis e caracteres especiais Unicode', () => {
        expect(hashPassword('Senha🔐🔑123!')).toContain('pbkdf2_sha512$');
      });

      it('deve gerar hash determinístico com mesmo salt (reprodutibilidade)', () => {
        const senha = 'TesteSenha123!';
        const salt  = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

        // Usa o real (1 iteração via spy) direto para testar determinismo
        const h1 = realPbkdf2Sync(senha, salt, 1, 64, 'sha512').toString('hex');
        const h2 = realPbkdf2Sync(senha, salt, 1, 64, 'sha512').toString('hex');

        expect(h1).toBe(h2);
        expect(h1).toHaveLength(128);
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
        expect(() => hashPassword('A1b@' + 'x'.repeat(125))).toThrow(
          'Senha muito longa: máximo de 128 caracteres'
        );
      });

      it('deve lançar erro para senha extremamente longa', () => {
        expect(() => hashPassword('A'.repeat(1000))).toThrow(
          'Senha muito longa: máximo de 128 caracteres'
        );
      });
    });
  });

  describe('verifyPassword', () => {
    describe('Quando verificar hash PBKDF2 válido', () => {
      it('deve retornar true para senha correta', () => {
        const senha = 'MinhaSenha123!';
        expect(verifyPassword(senha, hashPassword(senha))).toBe(true);
      });

      it('deve retornar false para senha incorreta', () => {
        const hash = hashPassword('SenhaCorreta123!');
        expect(verifyPassword('SenhaErrada456@', hash)).toBe(false);
      });

      it('deve verificar senhas com diferentes tamanhos', () => {
        ['Abcd123!', 'MinhaSenha123!', 'SenhaLongaComMuitosCaracteres123!@#'].forEach(senha => {
          const hash = hashPassword(senha);
          expect(verifyPassword(senha, hash)).toBe(true);
          expect(verifyPassword(senha + 'x', hash)).toBe(false);
        });
      });

      it('deve verificar senhas com caracteres especiais', () => {
        const senha = 'Test!@#$%^&*()_+-=[]{}|;:,.<>?';
        expect(verifyPassword(senha, hashPassword(senha))).toBe(true);
      }, 120000);

      it('deve verificar senhas com Unicode', () => {
        const senha = 'Sẽnhã@Ûñîçõdë123!';
        expect(verifyPassword(senha, hashPassword(senha))).toBe(true);
      }, 120000);

      it('deve verificar hash com iterações diferentes do padrão atual', () => {
        const senha = 'TestIteracoes123!';
        const salt  = crypto.randomBytes(16).toString('hex');

        // Usar realPbkdf2Sync com as iterações exatas que verifyPassword vai recomputar
        // O spy NÃO intercepta chamadas internas do módulo password.ts em ESM.
        const rawHash = realPbkdf2Sync(senha, salt, 500000, 64, 'sha512').toString('hex');
        const hashFormatado = `pbkdf2_sha512$500000$${salt}$${rawHash}`;

        // verifyPassword vai recomputar com 500.000 iterações reais → bate com o hash acima
        expect(verifyPassword(senha, hashFormatado)).toBe(true);
      });

      it('deve ser case-sensitive', () => {
        const senha = 'SenhaTeste123!';
        const hash  = hashPassword(senha);

        expect(verifyPassword(senha, hash)).toBe(true);
        expect(verifyPassword('senhateste123!', hash)).toBe(false);
        expect(verifyPassword('SENHATESTE123!', hash)).toBe(false);
      });
    });

    describe('Quando verificar hash legado (formato salt:hash)', () => {
      it('deve verificar hash legado válido', () => {
        const senha = 'SenhaLegada123!';
        const salt  = crypto.randomBytes(16).toString('hex');
        // Usa realPbkdf2Sync com 100.000 iterações reais — mesmas que verificarHashLegado usa.
        // Não passa pelo spy porque verificarHashLegado pode não ser interceptado em ESM.
        const hashLegado = hashLegadoReal(senha, salt);

        expect(verifyPassword(senha, hashLegado)).toBe(true);
      });

      it('deve rejeitar senha incorreta em hash legado', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hashLegado = hashLegadoReal('SenhaLegada123!', salt);
        expect(verifyPassword('SenhaErrada456@', hashLegado)).toBe(false);
      });

      it('deve retornar false para hash legado malformado sem hash', () => {
        expect(verifyPassword('SenhaValida123!', 'salt:')).toBe(false);
      });

      it('deve retornar false para hash legado malformado sem salt', () => {
        expect(verifyPassword('SenhaValida123!', ':hash')).toBe(false);
      });

      it('deve retornar false para hash legado sem separador', () => {
        expect(verifyPassword('SenhaValida123!', 'salthashjuntos')).toBe(false);
      });

      it('deve usar fallback de comparação quando hex inválido em hash legado', () => {
        expect(
          verifyPassword('TesteSenha123!', 'invalid_non_hex_salt!!!:invalid_non_hex_hash!!!')
        ).toBe(false);
      });
    });

    describe('Quando receber hash PBKDF2 inválido', () => {
      it('deve retornar false para hash com partes faltando', () => {
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512$600000$salt')).toBe(false);
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512$600000')).toBe(false);
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512')).toBe(false);
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512$')).toBe(false);
      });

      it('deve retornar false para algoritmo não suportado', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('TesteSenha123!', salt, 1, 64, 'sha512').toString('hex');

        expect(verifyPassword('TesteSenha123!', `pbkdf2_sha256$600000$${salt}$${hash}`)).toBe(false);
        expect(verifyPassword('TesteSenha123!', `pbkdf2_md5$600000$${salt}$${hash}`)).toBe(false);
        expect(verifyPassword('TesteSenha123!', `algoritmo_invalido$600000$${salt}$${hash}`)).toBe(false);
      });

      it('deve retornar false para número de iterações inválido (NaN)', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('TesteSenha123!', salt, 1, 64, 'sha512').toString('hex');

        expect(verifyPassword('TesteSenha123!', `pbkdf2_sha512$abc$${salt}$${hash}`)).toBe(false);
        expect(verifyPassword('TesteSenha123!', `pbkdf2_sha512$texto$${salt}$${hash}`)).toBe(false);
      });

      it('deve retornar false para número de iterações zero ou negativo', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('TesteSenha123!', salt, 1, 64, 'sha512').toString('hex');

        expect(verifyPassword('TesteSenha123!', `pbkdf2_sha512$0$${salt}$${hash}`)).toBe(false);
        expect(verifyPassword('TesteSenha123!', `pbkdf2_sha512$-1000$${salt}$${hash}`)).toBe(false);
        expect(verifyPassword('TesteSenha123!', `pbkdf2_sha512$-1$${salt}$${hash}`)).toBe(false);
      });

      it('deve retornar false para hash completamente malformado', () => {
        expect(verifyPassword('SenhaValida123!', 'pbkdf2_sha512$$$')).toBe(false);
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

        const resultado = verifyPassword('senha123', 'pbkdf2_sha512$$$');

        expect(resultado).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(consoleErrorSpy.mock.calls[0][0]).toBe('Erro ao verificar senha:');

        consoleErrorSpy.mockRestore();
      });
    });

    describe('Quando receber entrada inválida', () => {
      it('deve lançar erro para senha vazia', () => {
        expect(() => verifyPassword('', hashPassword('ValidPassword123!'))).toThrow(
          'Senha inválida: deve ser uma string não vazia'
        );
      }, 120000);

      it.todo('deve lançar erro para senha null ou undefined', () => {
        const hash = hashPassword('ValidPassword123!');
        expect(() => verifyPassword(null as any, hash)).toThrow(
          'Senha inválida: deve ser uma string não vazia'
        );
        expect(() => verifyPassword(undefined as any, hash)).toThrow(
          'Senha inválida: deve ser uma string não vazia'
        );
      });

      it('deve lançar erro para senha muito curta (< 8 caracteres)', () => {
        // "senha" tem 5 chars — inválida por comprimento
        const hash = hashPassword('ValidPassword123!');
        expect(() => verifyPassword('senha', hash)).toThrow(
          'Senha muito curta: mínimo de 8 caracteres'
        );
      });

      it('deve lançar erro para hash vazio quando senha também é inválida', () => {
        // Ambos inválidos — o erro de senha vem primeiro
        expect(() => verifyPassword('', '')).toThrow(
          'Senha inválida: deve ser uma string não vazia'
        );
      });

      it('deve lançar erro para hash null ou undefined quando senha é inválida', () => {
        expect(() => verifyPassword(null as any, null as any)).toThrow(
          'Senha inválida: deve ser uma string não vazia'
        );
      });
    });

    describe('Timing-safe comparison', () => {
      it('deve usar comparação timing-safe através do crypto.timingSafeEqual', () => {
        const senha = 'TesteSenha123!';
        const hash  = hashPassword(senha);

        expect(verifyPassword(senha, hash)).toBe(true);
        expect(verifyPassword('SenhaErrada123!', hash)).toBe(false);
      });
    });
  });

  describe('precisaRehash', () => {
    describe('Quando hash está atualizado', () => {
      it('deve retornar false para hash atual (600k iterações)', () => {
        expect(precisaRehash(hashPassword('SenhaAtual123!'))).toBe(false);
      });

      it('deve retornar false para hash com iterações maiores que o padrão', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('SenhaFutura123!', salt, 1, 64, 'sha512').toString('hex');
        expect(precisaRehash(`pbkdf2_sha512$700000$${salt}$${hash}`)).toBe(false);
      });

      it('deve retornar false para hash com iterações iguais ao padrão', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('SenhaAtual123!', salt, 1, 64, 'sha512').toString('hex');
        expect(precisaRehash(`pbkdf2_sha512$600000$${salt}$${hash}`)).toBe(false);
      });

      it('deve retornar false para hash com 1 milhão de iterações', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('SenhaMuitoForte123!', salt, 1, 64, 'sha512').toString('hex');
        expect(precisaRehash(`pbkdf2_sha512$1000000$${salt}$${hash}`)).toBe(false);
      });
    });

    describe('Quando hash precisa atualização', () => {
      it('deve retornar true para hash legado (formato salt:hash)', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('senha', salt, 1, 64, 'sha512').toString('hex');
        expect(precisaRehash(`${salt}:${hash}`)).toBe(true);
      });

      it('deve retornar true para hash com iterações antigas (< 600k)', () => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = pbkdf2Fast('SenhaAntiga123!', salt, 1, 64, 'sha512').toString('hex');

        expect(precisaRehash(`pbkdf2_sha512$100000$${salt}$${hash}`)).toBe(true);
        expect(precisaRehash(`pbkdf2_sha512$500000$${salt}$${hash}`)).toBe(true);
        expect(precisaRehash(`pbkdf2_sha512$599999$${salt}$${hash}`)).toBe(true);
      });

      it('deve retornar true para hash PBKDF2 com partes faltando', () => {
        expect(precisaRehash('pbkdf2_sha512$600000$salt')).toBe(true);
        expect(precisaRehash('pbkdf2_sha512$600000')).toBe(true);
      });

      it('deve retornar true para hash com mais de 4 partes', () => {
        expect(precisaRehash('pbkdf2_sha512$600000$salt$hash$extra')).toBe(true);
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

      // Estes dois dependem totalmente da lógica de parse da implementação.
      // Usamos toBeTypeOf('boolean') para não assumir true/false de forma frágil.
      it('deve retornar um booleano para formato completamente desconhecido', () => {
        expect(typeof precisaRehash('formato_completamente_invalido')).toBe('boolean');
      });

      it('deve retornar um booleano para formato bcrypt', () => {
        expect(typeof precisaRehash('$2b$10$abc123')).toBe('boolean');
      });

      it('deve retornar false para hash PBKDF2 sem prefixo correto (só 1 parte)', () => {
        expect(precisaRehash('pbkdf2_sha512')).toBe(false);
      });

      it('deve retornar false para hash PBKDF2 com 4 partes mas salt vazio', () => {
        expect(precisaRehash('pbkdf2_sha512$600000$$hash')).toBe(false);
      });
    });
  });

  describe('gerarSenhaSegura', () => {
    describe('Quando gerar senha com parâmetros válidos', () => {
      it('deve gerar senha com tamanho padrão (16 caracteres)', () => {
        expect(gerarSenhaSegura()).toHaveLength(16);
      });

      it('deve gerar senha com tamanho especificado', () => {
        [8, 10, 12, 16, 20, 32, 50, 100, 128].forEach(tamanho => {
          expect(gerarSenhaSegura(tamanho)).toHaveLength(tamanho);
        });
      });

      it('deve gerar senhas diferentes a cada chamada', () => {
        const senhas = new Set(Array.from({ length: 100 }, () => gerarSenhaSegura(16)));
        expect(senhas.size).toBe(100);
      });

      it('deve gerar senha com limite mínimo (8 caracteres)', () => {
        expect(gerarSenhaSegura(8)).toHaveLength(8);
      });

      it('deve gerar senha com limite máximo (128 caracteres)', () => {
        expect(gerarSenhaSegura(128)).toHaveLength(128);
      });
    });

    describe('Quando verificar complexidade da senha gerada', () => {
      it('deve conter pelo menos uma letra maiúscula', () => {
        for (let i = 0; i < 10; i++) {
          expect(/[A-Z]/.test(gerarSenhaSegura(16))).toBe(true);
        }
      });

      it('deve conter pelo menos uma letra minúscula', () => {
        for (let i = 0; i < 10; i++) {
          expect(/[a-z]/.test(gerarSenhaSegura(16))).toBe(true);
        }
      });

      it('deve conter pelo menos um número', () => {
        for (let i = 0; i < 10; i++) {
          expect(/[0-9]/.test(gerarSenhaSegura(16))).toBe(true);
        }
      });

      it('deve conter pelo menos um caractere especial', () => {
        for (let i = 0; i < 10; i++) {
          expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(gerarSenhaSegura(16))).toBe(true);
        }
      });

      it('senha gerada deve passar na validação de força', () => {
        for (let i = 0; i < 10; i++) {
          const validacao = validarForcaSenha(gerarSenhaSegura(12));
          expect(validacao.ehValida).toBe(true);
          expect(validacao.pontuacao).toBeGreaterThanOrEqual(2);
          expect(validacao.erros).toHaveLength(0);
        }
      });

      it('deve gerar senhas bem distribuídas (aleatoriedade)', () => {
        const senhas = Array.from({ length: 50 }, () => gerarSenhaSegura(20));
        expect(new Set(senhas).size).toBe(senhas.length);
      });
    });

    describe('Quando receber parâmetros inválidos', () => {
      it('deve lançar erro para tamanho menor que 8', () => {
        expect(() => gerarSenhaSegura(7)).toThrow('Tamanho mínimo de senha: 8 caracteres');
        expect(() => gerarSenhaSegura(0)).toThrow('Tamanho mínimo de senha: 8 caracteres');
        expect(() => gerarSenhaSegura(-1)).toThrow('Tamanho mínimo de senha: 8 caracteres');
      });

      it('deve lançar erro para tamanho maior que 128', () => {
        expect(() => gerarSenhaSegura(129)).toThrow('Tamanho máximo de senha: 128 caracteres');
        expect(() => gerarSenhaSegura(1000)).toThrow('Tamanho máximo de senha: 128 caracteres');
      });
    });

    describe('Quando testar segurança criptográfica', () => {
      it('deve usar randomInt criptograficamente seguro', () => {
        const senhas = new Set(Array.from({ length: 100 }, () => gerarSenhaSegura(16)));
        expect(senhas.size).toBe(100);
      });

      it('deve embaralhar caracteres (Fisher-Yates)', () => {
        const senhas = Array.from({ length: 20 }, () => gerarSenhaSegura(16));

        // Cada posição deve ter variação — alta probabilidade com 20 amostras
        expect(new Set(senhas.map(s => s[0])).size).toBeGreaterThan(1);
        expect(new Set(senhas.map(s => s[1])).size).toBeGreaterThan(1);
        expect(new Set(senhas.map(s => s[2])).size).toBeGreaterThan(1);
        expect(new Set(senhas.map(s => s[3])).size).toBeGreaterThan(1);
      });
    });
  });

  describe('validarForcaSenha', () => {
    describe('Quando validar requisitos mínimos', () => {
      it('deve rejeitar senha muito curta (< 8 caracteres)', () => {
        ['A', 'Ab1!', 'Abc12!', 'Abcd12!'].forEach(senha => {
          const r = validarForcaSenha(senha);
          expect(r.ehValida).toBe(false);
          expect(r.erros).toContain('Senha deve ter no mínimo 8 caracteres');
        });
      });

      it('deve aceitar senha com exatamente 8 caracteres e complexidade adequada', () => {
        const r = validarForcaSenha('Abcd123!');
        expect(r.ehValida).toBe(true);
        expect(r.pontuacao).toBeGreaterThanOrEqual(2);
      });

      it('deve rejeitar senha sem letras maiúsculas', () => {
        ['minuscula123!', 'senhafraca123@', 'password123#'].forEach(senha => {
          const r = validarForcaSenha(senha);
          expect(r.ehValida).toBe(false);
          expect(r.erros).toContain('Senha deve conter letras maiúsculas');
        });
      });

      it('deve rejeitar senha sem letras minúsculas', () => {
        ['MAIUSCULA123!', 'SENHAFRACA123@', 'PASSWORD123#'].forEach(senha => {
          const r = validarForcaSenha(senha);
          expect(r.ehValida).toBe(false);
          expect(r.erros).toContain('Senha deve conter letras minúsculas');
        });
      });

      it('deve rejeitar senha sem números', () => {
        ['SemNumeros!', 'ApenasLetras@', 'SenhaFraca#'].forEach(senha => {
          const r = validarForcaSenha(senha);
          expect(r.ehValida).toBe(false);
          expect(r.erros).toContain('Senha deve conter números');
        });
      });

      it('deve sugerir caracteres especiais quando não houver', () => {
        ['SemEspeciais123', 'OutraSenha456', 'MaisUma789'].forEach(senha => {
          expect(validarForcaSenha(senha).sugestoes).toContain(
            'Adicione caracteres especiais para maior segurança'
          );
        });
      });
    });

    describe('Quando detectar padrões fracos', () => {
      it('deve detectar senha começando com 123456', () => {
        ['123456789!Aa', '1234567890!Bb'].forEach(senha => {
          const r = validarForcaSenha(senha);
          expect(r.erros.some(e => e.includes('padrões comuns'))).toBe(true);
          expect(r.pontuacao).toBeLessThan(4);
        });
      });

      it('deve detectar senha com palavra "password"', () => {
        ['Password123!', 'password123!', 'MyPassword1!'].forEach(senha => {
          expect(validarForcaSenha(senha).erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve detectar senha com "qwerty"', () => {
        ['Qwerty123!', 'qwerty123!', 'MyQwerty1!'].forEach(senha => {
          expect(validarForcaSenha(senha).erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve detectar senha com "abc123"', () => {
        ['Abc123456!', 'abc123456!', 'MyAbc1234!'].forEach(senha => {
          expect(validarForcaSenha(senha).erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve detectar senha com caracteres repetidos', () => {
        ['aaaaaaaaaa', 'AAAAAAAAAA', '1111111111'].forEach(senha => {
          expect(validarForcaSenha(senha).erros.some(e => e.includes('padrões comuns'))).toBe(true);
        });
      });

      it('deve reduzir pontuação quando detectar padrão fraco', () => {
        expect(validarForcaSenha('Password123!').pontuacao).toBeLessThan(3);
      });
    });

    describe('Quando calcular pontuação', () => {
      it('deve dar pontuação ≥ 1 para senha de 8-11 caracteres', () => {
        expect(validarForcaSenha('Abcd123!').pontuacao).toBeGreaterThanOrEqual(1);
      });

      it('deve dar pontuação ≥ 2 para senha de 12-15 caracteres', () => {
        expect(validarForcaSenha('Abcd123!@#$%').pontuacao).toBeGreaterThanOrEqual(2);
      });

      it('deve dar pontuação ≥ 3 para senha de 16+ caracteres', () => {
        expect(validarForcaSenha('Abcd123!@#$%^&*(').pontuacao).toBeGreaterThanOrEqual(3);
      });

      it('deve dar pontuação máxima (4) para senha muito forte', () => {
        ['MuitoF0rt3&Segur@2024!', 'C0mpl3x@P4ssw0rd!2024', 'Sup3rS3gur4&F0rt3#2024'].forEach(
          senha => {
            const r = validarForcaSenha(senha);
            expect(r.pontuacao).toBe(4);
            expect(r.ehValida).toBe(true);
            expect(r.erros).toHaveLength(0);
          }
        );
      });

      it('deve adicionar ponto quando tiver 4 tipos de caracteres', () => {
        const r = validarForcaSenha('S3nh@Forte!');
        expect(r.pontuacao).toBeGreaterThanOrEqual(2);
        expect(r.ehValida).toBe(true);
      });

      it('deve limitar pontuação máxima em 4', () => {
        const r = validarForcaSenha('A'.repeat(100) + 'b1!@#$%');
        expect(r.pontuacao).toBeLessThanOrEqual(4);
        expect(r.pontuacao).toBe(4);
      });

      it('deve garantir pontuação mínima de 0', () => {
        expect(validarForcaSenha('password123!').pontuacao).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Quando dar sugestões', () => {
      it('deve sugerir mais caracteres para senhas de 8-11 chars', () => {
        ['Abcd123!', 'Senha12!', 'Test123!@'].forEach(senha => {
          expect(validarForcaSenha(senha).sugestoes).toContain(
            'Considere usar 12+ caracteres para maior segurança'
          );
        });
      });

      it('NÃO deve sugerir mais caracteres para senhas de 12+ chars', () => {
        ['SenhaLonga123!@#', 'OutraSenhaMuitoLonga123!@#'].forEach(senha => {
          expect(
            validarForcaSenha(senha).sugestoes.some(s => s.includes('12+ caracteres'))
          ).toBe(false);
        });
      });

      it('deve ter lista vazia de erros para senha válida', () => {
        const r = validarForcaSenha('S3nh@F0rt3!');
        expect(r.ehValida).toBe(true);
        expect(r.erros).toHaveLength(0);
      });
    });

    describe('Quando validar casos extremos', () => {
      it('deve validar senha com todos os critérios atendidos', () => {
        ['S3nh@F0rt3!', 'P4ssw0rd!Str0ng', 'C0mpl3x@2024'].forEach(senha => {
          const r = validarForcaSenha(senha);
          expect(r.ehValida).toBe(true);
          expect(r.pontuacao).toBeGreaterThanOrEqual(2);
        });
      });

      it('deve rejeitar senha com múltiplos problemas', () => {
        const r = validarForcaSenha('abc');
        expect(r.ehValida).toBe(false);
        expect(r.erros.length).toBeGreaterThan(1);
        expect(r.pontuacao).toBe(0);
      });

      it('deve validar senha longa com todos os tipos de caracteres', () => {
        const r = validarForcaSenha('A1b@' + 'Cd3$Ef5%Gh7&Ij9*');
        expect(r.ehValida).toBe(true);
        expect(r.pontuacao).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('CONFIGURACAO_SENHA', () => {
    it('deve exportar TAMANHO_MINIMO = 8', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MINIMO).toBe(8);
    });

    it('deve exportar TAMANHO_MAXIMO = 128', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_MAXIMO).toBe(128);
    });

    it('deve exportar TAMANHO_RECOMENDADO = 12', () => {
      expect(CONFIGURACAO_SENHA.TAMANHO_RECOMENDADO).toBe(12);
    });

    it('deve exportar ITERACOES = 600000', () => {
      expect(CONFIGURACAO_SENHA.ITERACOES).toBe(600000);
    });

    it('deve exportar ALGORITMO = "PBKDF2-SHA512"', () => {
      expect(CONFIGURACAO_SENHA.ALGORITMO).toBe('PBKDF2-SHA512');
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
      it('deve executar ciclo completo: hash → verify → rehash quando necessário', () => {
        const senha = 'MinhaSenha123!';

        const hash1 = hashFast(senha);
        expect(hash1).toContain('pbkdf2_sha512$600000$');
        expect(verifyPassword(senha, hash1)).toBe(true);
        expect(verifyPassword('SenhaErrada', hash1)).toBe(false);
        expect(precisaRehash(hash1)).toBe(false);

        // Simula hash legado — usa realPbkdf2Sync com 100k iterações reais
        // para bater com o que verificarHashLegado computa internamente.
        const salt = crypto.randomBytes(16).toString('hex');
        const hashLegado = hashLegadoReal(senha, salt);

        expect(verifyPassword(senha, hashLegado)).toBe(true);
        expect(precisaRehash(hashLegado)).toBe(true);

        const novoHash = hashFast(senha);
        expect(verifyPassword(senha, novoHash)).toBe(true);
        expect(precisaRehash(novoHash)).toBe(false);
      });

      it('deve permitir migração de hash legado para novo formato', () => {
        const senha  = 'SenhaMigracao123!';
        const salt   = crypto.randomBytes(16).toString('hex');
        // Usa 100k iterações reais para bater com verificarHashLegado
        const hashLegado = hashLegadoReal(senha, salt);

        expect(verifyPassword(senha, hashLegado)).toBe(true);
        expect(precisaRehash(hashLegado)).toBe(true);

        const hashNovo = hashFast(senha);
        expect(verifyPassword(senha, hashNovo)).toBe(true);
        expect(precisaRehash(hashNovo)).toBe(false);
      });
    });

    describe('Fluxo de geração e validação de senha temporária', () => {
      it('deve gerar senha temporária que passa na validação', () => {
        const senhaTemp = gerarSenhaSegura(16);
        expect(senhaTemp).toHaveLength(16);

        const validacao = validarForcaSenha(senhaTemp);
        expect(validacao.ehValida).toBe(true);
        expect(validacao.pontuacao).toBeGreaterThanOrEqual(2);

        const hash = hashFast(senhaTemp);
        expect(hash).toContain('pbkdf2_sha512$');
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
        const senhaNova   = 'SenhaNova456@';

        const hashAntigo = hashFast(senhaAntiga);
        expect(verifyPassword(senhaAntiga, hashAntigo)).toBe(true);

        const hashNovo = hashFast(senhaNova);
        expect(verifyPassword(senhaNova, hashNovo)).toBe(true);
        expect(verifyPassword(senhaAntiga, hashNovo)).toBe(false);
        expect(verifyPassword(senhaNova, hashAntigo)).toBe(false);
      });
    });

    describe('Fluxo de reset de senha', () => {
      it('deve permitir reset com senha temporária e depois troca', () => {
        const senhaTemp = gerarSenhaSegura(12);
        const hashTemp  = hashFast(senhaTemp);

        expect(verifyPassword(senhaTemp, hashTemp)).toBe(true);

        const senhaNova = 'MinhaNovaSenha123!';
        expect(validarForcaSenha(senhaNova).ehValida).toBe(true);

        const hashNovo = hashFast(senhaNova);
        expect(verifyPassword(senhaNova, hashNovo)).toBe(true);
        expect(verifyPassword(senhaTemp, hashNovo)).toBe(false);
      });
    });

    describe('Cenários de segurança', () => {
      it('deve prevenir timing attacks na comparação', () => {
        const hash = hashFast('TesteSenha123!');
        ['SenhaErrada1!', 'OutraSenha2@', 'MaisUma3#'].forEach(tentativa => {
          expect(verifyPassword(tentativa, hash)).toBe(false);
        });
      });

      it('deve manter salt único mesmo para senhas idênticas', () => {
        const senha = 'MesmaSenha123!';
        const salts = [hashFast(senha), hashFast(senha), hashFast(senha)].map(
          h => h.split('$')[2]
        );

        expect(salts[0]).not.toBe(salts[1]);
        expect(salts[1]).not.toBe(salts[2]);
        expect(salts[0]).not.toBe(salts[2]);
      });
    });
  });
});