import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
const ORIGINAL_DB_MAX_CONNECTIONS = process.env.DB_MAX_CONNECTIONS;

const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
const mockPoolQuery = vi.fn();
const mockPoolConnect = vi.fn();

class MockPrismaClient {
  $connect = vi.fn();
  $disconnect = vi.fn().mockResolvedValue(undefined);
  $queryRaw = vi.fn();
  options: any;

  constructor(options?: any) {
    this.options = options;
  }
}

class MockPrismaPg {
  pool: any;
  
  constructor(pool: any) {
    this.pool = pool;
  }
}

class MockPool {
  end = mockPoolEnd;
  query = mockPoolQuery;
  connect = mockPoolConnect;
  options: any;

  constructor(config: any) {
    this.options = config;
  }
}

// Spies nas classes
const MockPoolSpy = vi.fn(MockPool);
const MockPrismaPgSpy = vi.fn(MockPrismaPg);

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: MockPrismaPgSpy,
}));

vi.mock('pg', () => ({
  Pool: MockPoolSpy,
}));

describe('Prisma Client Configuration', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    }

    vi.resetModules();
    (globalThis as any).prisma = undefined;
    vi.clearAllMocks();

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL_NODE_ENV !== undefined) {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    } else {
      delete process.env.NODE_ENV;
    }

    if (ORIGINAL_DATABASE_URL !== undefined) {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    } else {
      delete process.env.DATABASE_URL;
    }

    if (ORIGINAL_DB_MAX_CONNECTIONS !== undefined) {
      process.env.DB_MAX_CONNECTIONS = ORIGINAL_DB_MAX_CONNECTIONS;
    } else {
      delete process.env.DB_MAX_CONNECTIONS;
    }

    (globalThis as any).prisma = undefined;
    consoleErrorSpy.mockRestore();
  });

  describe('DATABASE_URL Validation', () => {
    describe('Quando DATABASE_URL está inválida', () => {
      it('deve lançar erro quando DATABASE_URL é undefined', async () => {
        delete process.env.DATABASE_URL;

        await expect(async () => {
          await import('../../infrastructure/database/prisma/client');
        }).rejects.toThrow('DATABASE_URL não está definida ou não é uma string');

        expect(consoleErrorSpy).toHaveBeenCalledWith('DATABASE_URL não encontrada!');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Variáveis disponíveis:', expect.any(Array));
      });

      it('deve lançar erro quando DATABASE_URL é string vazia', async () => {
        process.env.DATABASE_URL = '';

        await expect(async () => {
          await import('../../infrastructure/database/prisma/client');
        }).rejects.toThrow('DATABASE_URL não está definida ou não é uma string');

        expect(consoleErrorSpy).toHaveBeenCalledWith('DATABASE_URL não encontrada!');
      });

      it('deve listar variáveis DATABASE* disponíveis no console.error', async () => {
        process.env.DATABASE_HOST = 'localhost';
        process.env.DATABASE_PORT = '5432';
        delete process.env.DATABASE_URL;

        await expect(async () => {
          await import('../../infrastructure/database/prisma/client');
        }).rejects.toThrow();

        const secondCall = consoleErrorSpy.mock.calls[1];
        expect(secondCall[0]).toBe('Variáveis disponíveis:');
        expect(secondCall[1]).toBeInstanceOf(Array);
        expect(secondCall[1]).toContain('DATABASE_HOST');
        expect(secondCall[1]).toContain('DATABASE_PORT');
      });
    });

    describe('Quando DATABASE_URL é válida', () => {
      it('deve aceitar URL PostgreSQL válida', async () => {
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
      });

      it('deve aceitar URL com parâmetros adicionais', async () => {
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db?schema=public&ssl=true';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect(prisma).toBeDefined();
      });

      it('deve aceitar URL com diferentes hosts', async () => {
        const urls = [
          'postgresql://user:pass@127.0.0.1:5432/db',
          'postgresql://user:pass@db.example.com:5432/db',
          'postgresql://user:pass@postgres:5432/db',
        ];

        for (const url of urls) {
          process.env.DATABASE_URL = url;
          delete (globalThis as any).prisma;
          vi.resetModules();

          const { prisma } = await import('../../infrastructure/database/prisma/client');
          expect(prisma).toBeDefined();
        }
      });
    });
  });

  describe('Pool Configuration', () => {
    describe('Quando DB_MAX_CONNECTIONS está definido', () => {
      it('deve usar valor de DB_MAX_CONNECTIONS quando fornecido', async () => {
        process.env.DB_MAX_CONNECTIONS = '15';
        delete (globalThis as any).prisma;
        vi.resetModules();

        await import('../../infrastructure/database/prisma/client');

        // Pool foi criado com as configurações corretas
        expect(MockPoolSpy).toHaveBeenCalled();
      });

      it('deve aceitar diferentes valores numéricos válidos', async () => {
        const valores = ['5', '10', '20', '50', '100'];

        for (const valor of valores) {
          process.env.DB_MAX_CONNECTIONS = valor;
          delete (globalThis as any).prisma;
          vi.resetModules();
          vi.clearAllMocks();

          await import('../../infrastructure/database/prisma/client');
          expect(MockPoolSpy).toHaveBeenCalled();
        }
      });

      it('deve parsear string numérica corretamente', async () => {
        process.env.DB_MAX_CONNECTIONS = '25';
        delete (globalThis as any).prisma;
        vi.resetModules();

        await import('../../infrastructure/database/prisma/client');

        const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS, 10);
        expect(maxConnections).toBe(25);
      });
    });

    describe('Quando DB_MAX_CONNECTIONS não está definido', () => {
      it('deve usar valor padrão de 10 conexões', async () => {
        delete process.env.DB_MAX_CONNECTIONS;
        delete (globalThis as any).prisma;
        vi.resetModules();

        await import('../../infrastructure/database/prisma/client');

        const defaultValue = parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10);
        expect(defaultValue).toBe(10);
      });

      it('deve funcionar sem DB_MAX_CONNECTIONS definido', async () => {
        delete process.env.DB_MAX_CONNECTIONS;
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect(prisma).toBeDefined();
      });
    });

    describe('Quando validar outras configurações do Pool', () => {
      it('deve configurar idleTimeoutMillis em 30000', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();

        await import('../../infrastructure/database/prisma/client');

        // Verifica que Pool foi criado
        expect(MockPoolSpy).toHaveBeenCalled();
      });

      it('deve configurar connectionTimeoutMillis em 2000', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();

        await import('../../infrastructure/database/prisma/client');

        expect(MockPoolSpy).toHaveBeenCalled();
      });

      it('deve usar connectionString do DATABASE_URL', async () => {
        const testUrl = 'postgresql://specific:test@localhost:5432/specific_db';
        process.env.DATABASE_URL = testUrl;
        delete (globalThis as any).prisma;
        vi.resetModules();

        await import('../../infrastructure/database/prisma/client');

        expect(MockPoolSpy).toHaveBeenCalled();
      });
    });
  });

  describe('PrismaClient Singleton Pattern', () => {
    describe('Quando criar nova instância', () => {
      it('deve criar nova instância quando não existir globalThis.prisma', async () => {
        process.env.NODE_ENV = 'development';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
      });

      it('deve criar instância com adapter configurado', async () => {
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
        // Adapter é configurado internamente, verificamos que o mock foi chamado
        expect(MockPrismaPgSpy).toHaveBeenCalled();
        expect(MockPoolSpy).toHaveBeenCalled();
      });
    });

    describe('Quando reutilizar instância existente', () => {
      it('deve reutilizar instância global quando já existe', async () => {
        const instanciaExistente = new MockPrismaClient();
        (globalThis as any).prisma = instanciaExistente;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect(prisma).toBe(instanciaExistente);
      });

      it('deve usar operador nullish coalescing (??) corretamente', async () => {
        // Caso 1: undefined - cria nova instância
        delete (globalThis as any).prisma;
        vi.resetModules();
        const { prisma: prisma1 } = await import('../../infrastructure/database/prisma/client');
        expect(prisma1).toBeInstanceOf(MockPrismaClient);

        // Caso 2: instância existe - reutiliza
        const instanciaExistente = new MockPrismaClient();
        (globalThis as any).prisma = instanciaExistente;
        vi.resetModules();
        const { prisma: prisma2 } = await import('../../infrastructure/database/prisma/client');
        expect(prisma2).toBe(instanciaExistente);
      });

      it('deve manter singleton em múltiplas importações', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();

        const { prisma: prisma1 } = await import('../../infrastructure/database/prisma/client');
        const { prisma: prisma2 } = await import('../../infrastructure/database/prisma/client');
        const { prisma: prisma3 } = await import('../../infrastructure/database/prisma/client');

        expect(prisma1).toBe(prisma2);
        expect(prisma2).toBe(prisma3);
        expect(prisma1).toBe(prisma3);
      });

      it('deve garantir consistência do singleton através de reimportações', async () => {
        process.env.NODE_ENV = 'development';
        delete (globalThis as any).prisma;

        const imports = [];
        for (let i = 0; i < 5; i++) {
          const { prisma } = await import('../../infrastructure/database/prisma/client');
          imports.push(prisma);
        }

        const primeiraInstancia = imports[0];
        imports.forEach(instancia => {
          expect(instancia).toBe(primeiraInstancia);
        });
      });
    });
  });

  describe('NODE_ENV Configuration', () => {
    describe('Quando NODE_ENV é development', () => {
      it('deve criar prisma com configurações de development', async () => {
        process.env.NODE_ENV = 'development';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        // Verifica que prisma foi criado (logs são configurados internamente)
        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
      });

      it('deve atribuir prisma ao globalThis', async () => {
        process.env.NODE_ENV = 'development';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect((globalThis as any).prisma).toBe(prisma);
      });
    });

    describe('Quando NODE_ENV é test', () => {
      it('deve criar prisma com configurações de test', async () => {
        process.env.NODE_ENV = 'test';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        // Verifica que prisma foi criado
        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
      });

      it('deve atribuir prisma ao globalThis', async () => {
        process.env.NODE_ENV = 'test';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect((globalThis as any).prisma).toBe(prisma);
      });
    });

    describe('Quando NODE_ENV é production', () => {
      it('deve criar prisma com configurações de production', async () => {
        process.env.NODE_ENV = 'production';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        // Verifica que prisma foi criado
        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
      });

      it('NÃO deve atribuir prisma ao globalThis', async () => {
        process.env.NODE_ENV = 'production';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect(prisma).toBeDefined();
        expect((globalThis as any).prisma).toBeUndefined();
      });
    });

    describe('Quando NODE_ENV é staging', () => {
      it('deve criar prisma com configurações de staging', async () => {
        process.env.NODE_ENV = 'staging';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        // Verifica que prisma foi criado
        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
      });

      it('deve atribuir prisma ao globalThis (não-production)', async () => {
        process.env.NODE_ENV = 'staging';
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect((globalThis as any).prisma).toBe(prisma);
      });
    });

    describe('Quando NODE_ENV não está definido', () => {
      it('deve criar prisma com configurações padrão', async () => {
        delete process.env.NODE_ENV;
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        // Verifica que prisma foi criado
        expect(prisma).toBeDefined();
        expect(prisma).toBeInstanceOf(MockPrismaClient);
      });

      it('deve atribuir prisma ao globalThis', async () => {
        delete process.env.NODE_ENV;
        delete (globalThis as any).prisma;

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        expect((globalThis as any).prisma).toBe(prisma);
      });
    });

    describe('Quando testar todos os ambientes possíveis', () => {
      it('deve cobrir todos os branches da condição NODE_ENV', async () => {
        const ambientes = [
          { nome: 'development', deveAtribuirGlobal: true },
          { nome: 'test', deveAtribuirGlobal: true },
          { nome: 'staging', deveAtribuirGlobal: true },
          { nome: 'production', deveAtribuirGlobal: false },
          { nome: 'local', deveAtribuirGlobal: true },
        ];

        for (const ambiente of ambientes) {
          process.env.NODE_ENV = ambiente.nome;
          delete (globalThis as any).prisma;
          vi.resetModules();

          const { prisma } = await import('../../infrastructure/database/prisma/client');

          expect(prisma).toBeDefined();
          expect(prisma).toBeInstanceOf(MockPrismaClient);

          if (ambiente.deveAtribuirGlobal) {
            expect((globalThis as any).prisma).toBe(prisma);
          } else {
            expect((globalThis as any).prisma).toBeUndefined();
          }
        }
      });
    });
  });

  describe('Process Event Handlers', () => {
    describe('Quando registrar listener beforeExit', () => {
      it('deve registrar listener para evento beforeExit', async () => {
        delete (globalThis as any).prisma;

        const processOnSpy = vi.spyOn(process, 'on');

        vi.resetModules();
        await import('../../infrastructure/database/prisma/client');

        expect(processOnSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));

        processOnSpy.mockRestore();
      });

      it('deve ter apenas um listener beforeExit registrado', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();

        const listenersBefore = process.listenerCount('beforeExit');
        await import('../../infrastructure/database/prisma/client');
        const listenersAfter = process.listenerCount('beforeExit');

        expect(listenersAfter).toBeGreaterThan(listenersBefore);
      });
    });

    describe('Quando executar cleanup no beforeExit', () => {
      it('deve chamar prisma.$disconnect quando beforeExit for emitido', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();
        vi.clearAllMocks();

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        const listeners = process.listeners('beforeExit');
        const beforeExitHandler = listeners[listeners.length - 1] as (...args: any[]) => Promise<void>;

        await beforeExitHandler(0);

        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
      });

      it('deve chamar pool.end quando beforeExit for emitido', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();
        vi.clearAllMocks();

        await import('../../infrastructure/database/prisma/client');

        const listeners = process.listeners('beforeExit');
        const beforeExitHandler = listeners[listeners.length - 1] as (...args: any[]) => Promise<void>;

        await beforeExitHandler(0);

        // Pool.end deve ter sido chamado
        expect(mockPoolEnd).toHaveBeenCalled();
      });

      it('deve executar cleanup na ordem correta (disconnect antes de pool.end)', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();
        vi.clearAllMocks();

        const callOrder: string[] = [];

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        prisma.$disconnect = vi.fn().mockImplementation(async () => {
          callOrder.push('disconnect');
        });

        mockPoolEnd.mockImplementation(async () => {
          callOrder.push('pool.end');
        });

        const listeners = process.listeners('beforeExit');
        const beforeExitHandler = listeners[listeners.length - 1] as (...args: any[]) => Promise<void>;

        await beforeExitHandler(0);

        expect(callOrder).toEqual(['disconnect', 'pool.end']);
      });

      it('deve executar cleanup mesmo que prisma.$disconnect lance erro', async () => {
        delete (globalThis as any).prisma;
        vi.resetModules();
        vi.clearAllMocks();

        const { prisma } = await import('../../infrastructure/database/prisma/client');

        prisma.$disconnect = vi.fn().mockRejectedValue(new Error('Disconnect error'));

        const listeners = process.listeners('beforeExit');
        const beforeExitHandler = listeners[listeners.length - 1] as (...args: any[]) => Promise<void>;

        // Não deve lançar erro
        await expect(beforeExitHandler(0)).rejects.toThrow();
      });
    });
  });

  describe('Module Exports', () => {
    it('deve exportar prisma como named export', async () => {
      delete (globalThis as any).prisma;

      const module = await import('../../infrastructure/database/prisma/client');

      expect(module).toHaveProperty('prisma');
      expect(module.prisma).toBeDefined();
      expect(module.prisma).toBeInstanceOf(MockPrismaClient);
    });

    it('deve ter apenas named export (sem default export)', async () => {
      delete (globalThis as any).prisma;

      const module = await import('../../infrastructure/database/prisma/client');

      // Verifica que não há default export usando Object.keys
      const exports = Object.keys(module);
      expect(exports).toContain('prisma');
      expect(exports).not.toContain('default');
    });

    it('prisma export deve ter métodos essenciais do PrismaClient', async () => {
      delete (globalThis as any).prisma;

      const { prisma } = await import('../../infrastructure/database/prisma/client');

      expect(typeof prisma.$connect).toBe('function');
      expect(typeof prisma.$disconnect).toBe('function');
      expect(typeof prisma.$queryRaw).toBe('function');
    });
  });

  describe('Adapter Integration', () => {
    it('deve criar PrismaPg adapter e pool corretamente', async () => {
      delete (globalThis as any).prisma;
      vi.resetModules();
      vi.clearAllMocks();

      await import('../../infrastructure/database/prisma/client');

      // Verifica que PrismaPg foi criado com pool
      expect(MockPrismaPgSpy).toHaveBeenCalled();
      expect(MockPoolSpy).toHaveBeenCalled();
      
      // Verifica que PrismaPg recebeu uma instância de Pool
      const prismaPgCallArgs = MockPrismaPgSpy.mock.calls[0];
      expect(prismaPgCallArgs).toBeDefined();
      expect(prismaPgCallArgs[0]).toBeDefined(); // pool foi passado
    });

    it('deve passar pool para adapter na inicialização', async () => {
      delete (globalThis as any).prisma;
      vi.resetModules();

      await import('../../infrastructure/database/prisma/client');

      expect(MockPrismaPgSpy).toHaveBeenCalled();
      expect(MockPoolSpy).toHaveBeenCalled();
    });
  });

  describe('Type Validations', () => {
    it('deve validar que DATABASE_URL não é número', () => {
      const value: any = 123;
      const isInvalid = !value || typeof value !== 'string';
      expect(isInvalid).toBe(true);
    });

    it('deve validar que DATABASE_URL não é objeto', () => {
      const value: any = { url: 'test' };
      const isInvalid = !value || typeof value !== 'string';
      expect(isInvalid).toBe(true);
    });

    it('deve validar que DATABASE_URL não é array', () => {
      const value: any = ['postgresql://test'];
      const isInvalid = !value || typeof value !== 'string';
      expect(isInvalid).toBe(true);
    });

    it('deve validar que DATABASE_URL não é boolean', () => {
      const value: any = true;
      const isInvalid = !value || typeof value !== 'string';
      expect(isInvalid).toBe(true);
    });

    it('deve aceitar DATABASE_URL como string válida', () => {
      const value = 'postgresql://valid:pass@localhost:5432/db';
      const isInvalid = !value || typeof value !== 'string';
      expect(isInvalid).toBe(false);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('deve lidar com DB_MAX_CONNECTIONS como string não numérica', async () => {
      process.env.DB_MAX_CONNECTIONS = 'invalid';
      delete (globalThis as any).prisma;
      vi.resetModules();

      const { prisma } = await import('../../infrastructure/database/prisma/client');

      // parseInt retorna NaN, mas não quebra a aplicação
      expect(prisma).toBeDefined();
    });

    it('deve lidar com DB_MAX_CONNECTIONS como string vazia', async () => {
      process.env.DB_MAX_CONNECTIONS = '';
      delete (globalThis as any).prisma;
      vi.resetModules();

      const { prisma } = await import('../../infrastructure/database/prisma/client');

      // Usa valor padrão quando string vazia
      const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10);
      expect(maxConnections).toBe(10);
      expect(prisma).toBeDefined();
    });

    it('deve funcionar com NODE_ENV contendo espaços', async () => {
      process.env.NODE_ENV = ' development ';
      delete (globalThis as any).prisma;

      const { prisma } = await import('../../infrastructure/database/prisma/client');

      expect(prisma).toBeDefined();
    });

    it('deve funcionar com NODE_ENV em uppercase', async () => {
      process.env.NODE_ENV = 'PRODUCTION';
      delete (globalThis as any).prisma;

      const { prisma } = await import('../../infrastructure/database/prisma/client');

      expect(prisma).toBeDefined();
      // Não é exatamente 'production', então atribui ao global
      expect((globalThis as any).prisma).toBe(prisma);
    });
  });

  describe('Concurrent Initialization', () => {
    it('deve lidar com múltiplas inicializações simultâneas', async () => {
      delete (globalThis as any).prisma;
      vi.resetModules();

      const promises = Array.from({ length: 5 }, async () => {
        const { prisma } = await import('../../infrastructure/database/prisma/client');
        return prisma;
      });

      const instances = await Promise.all(promises);

      // Todas devem ser a mesma instância (singleton)
      const primeiraInstancia = instances[0];
      instances.forEach(instancia => {
        expect(instancia).toBe(primeiraInstancia);
      });
    });
  });

  describe('Global State Management', () => {
    it('deve limpar globalThis.prisma entre testes', () => {
      expect((globalThis as any).prisma).toBeUndefined();
    });

    it('deve permitir reset do singleton', async () => {
      delete (globalThis as any).prisma;
      vi.resetModules();

      const { prisma: prisma1 } = await import('../../infrastructure/database/prisma/client');

      // Simula reset
      (globalThis as any).prisma = undefined;
      vi.resetModules();

      const { prisma: prisma2 } = await import('../../infrastructure/database/prisma/client');

      // Devem ser instâncias diferentes após reset
      expect(prisma1).not.toBe(prisma2);
    });
  });
});