import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// CONFIGURAÇÃO DOS MOCKS
// ============================================================================

vi.mock('express-session', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

class MockRedisStore {
  constructor(_opcoes: any) {}
}

vi.mock('connect-redis', () => ({
  RedisStore: MockRedisStore
}));

vi.mock('../src/services/redisClient', () => ({
  redisClient: {},
}));

const criarMockMiddlewareRota = () => (req: any, res: any, next: any) => next();

vi.mock('../src/routes/auth.routes', () => ({ default: criarMockMiddlewareRota() }));
vi.mock('../src/routes/admin.routes', () => ({ default: criarMockMiddlewareRota() }));
vi.mock('../src/routes/tecnico.routes', () => ({ default: criarMockMiddlewareRota() }));
vi.mock('../src/routes/usuario.routes', () => ({ default: criarMockMiddlewareRota() }));
vi.mock('../src/routes/servico.routes', () => ({ default: criarMockMiddlewareRota() }));
vi.mock('../src/routes/chamado.routes', () => ({ default: criarMockMiddlewareRota() }));
vi.mock('../src/routes/fila-de-chamados.routes', () => ({ default: criarMockMiddlewareRota() }));
vi.mock('../src/routes/envio-email-teste.routes', () => ({ default: criarMockMiddlewareRota() }));

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

const importarModuloApp = async () => await import('../src/app');

const definirJwtSecret = (secret: string | undefined) => {
  if (secret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = secret;
  }
};

const limparAmbiente = () => {
  delete process.env.JWT_SECRET;
};

// ============================================================================
// SUÍTE DE TESTES
// ============================================================================

describe('Configuração da Aplicação', () => {
  // ============================================================================
  // PREPARAÇÃO E LIMPEZA
  // ============================================================================
  
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    limparAmbiente();
  });

  // ============================================================================
  // TESTES DE SEGURANÇA
  // ============================================================================

  describe('Configuração de Segurança', () => {
    it('deve lançar erro quando JWT_SECRET não está definido - DADO que JWT_SECRET está ausente QUANDO app inicializa ENTÃO deve lançar erro de configuração', async () => {
      definirJwtSecret(undefined);
      const mensagemErroEsperada = 'JWT_SECRET não definido nas variáveis de ambiente!';

      await expect(importarModuloApp()).rejects.toThrow(mensagemErroEsperada);
    });

    it('deve lançar erro quando JWT_SECRET é string vazia - DADO que JWT_SECRET está vazio QUANDO app inicializa ENTÃO deve lançar erro de configuração', async () => {
      definirJwtSecret('');
      const mensagemErroEsperada = 'JWT_SECRET não definido nas variáveis de ambiente!';

      await expect(importarModuloApp()).rejects.toThrow(mensagemErroEsperada);
    });
  });

  // ============================================================================
  // TESTES DE INICIALIZAÇÃO
  // ============================================================================

  describe('Inicialização da Aplicação', () => {
    it('deve inicializar com sucesso quando JWT_SECRET está definido - DADO que JWT_SECRET é válido QUANDO app inicializa ENTÃO deve retornar app Express configurado', async () => {
      const jwtSecretValido = 'test-secret-key-12345';
      definirJwtSecret(jwtSecretValido);

      const moduloApp = await importarModuloApp();
      const appExpress = moduloApp.default;

      expect(appExpress).toBeDefined();
      expect(appExpress).not.toBeNull();
      expect(typeof appExpress.use).toBe('function');
      expect(typeof appExpress.get).toBe('function');
      expect(typeof appExpress.post).toBe('function');
      expect(typeof appExpress.listen).toBe('function');
    });

    it('deve inicializar com diferentes valores de JWT_SECRET - DADO que vários JWT_SECRET válidos QUANDO app inicializa ENTÃO deve ter sucesso para todos', async () => {
      const secretsValidos = [
        'secret-simples',
        'secret-complexo!@#$%^&*()',
        'a'.repeat(256),
        'secret-com-numeros-123456',
      ];

      for (const secret of secretsValidos) {
        vi.resetModules();
        definirJwtSecret(secret);
        
        const moduloApp = await importarModuloApp();
        const appExpress = moduloApp.default;

        expect(appExpress).toBeDefined();
        expect(typeof appExpress.use).toBe('function');
      }
    });
  });

  // ============================================================================
  // TESTES DE ESTRUTURA DO EXPRESS
  // ============================================================================

  describe('Estrutura da Aplicação Express', () => {
    beforeEach(() => {
      definirJwtSecret('test-jwt-secret');
    });

    it('deve ter todos os métodos Express necessários - DADO que app está inicializado QUANDO verifico métodos ENTÃO todos os métodos HTTP estão disponíveis', async () => {
      const moduloApp = await importarModuloApp();
      const appExpress = moduloApp.default;

      // Assert (Verificação): Verifica presença de todos os métodos HTTP principais
      const metodosNecessarios = ['use', 'get', 'post', 'put', 'delete', 'patch', 'listen', 'set'];
      
      metodosNecessarios.forEach(metodo => {
        expect(typeof (appExpress as any)[metodo]).toBe('function');
        expect((appExpress as any)[metodo]).toBeDefined();
      });
    });

    it('deve exportar app como exportação padrão - DADO que módulo app QUANDO importado ENTÃO exportação padrão é a aplicação Express', async () => {
      const moduloApp = await importarModuloApp();

      // Assert (Verificação): Verifica estrutura de exportação
      expect(moduloApp.default).toBeDefined();
      expect(moduloApp.default).toBe(moduloApp.default);
      expect(typeof moduloApp.default).toBe('function');
    });
  });
});