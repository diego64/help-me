import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  vi
} from 'vitest';
import express from 'express';
import request from 'supertest';

// ============================================================================
// PRISMA MOCK
// ============================================================================

const prismaMock = {
  chamado: {
    findMany: vi.fn(),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: function () { return prismaMock; }
}));

// ============================================================================
// USER FIXTURES
// ============================================================================

const usuarioPadrao = { 
  id: 'user1', 
  email: 'user@mail.com', 
  regra: 'USUARIO' 
};

const tecnicoPadrao = { 
  id: 'tecnico1', 
  email: 'tecnico@mail.com', 
  regra: 'TECNICO' 
};

const adminPadrao = { 
  id: 'admin1', 
  email: 'admin@mail.com', 
  regra: 'ADMIN' 
};

// ============================================================================
// AUTH STATE
// ============================================================================

let Regra = 'USUARIO';
let UsuarioAtual: any = usuarioPadrao;

// ============================================================================
// MODULE MOCKS
// ============================================================================

vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.usuario = { ...UsuarioAtual, regra: Regra };
    next();
  },
  authorizeRoles: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.usuario.regra) ? next() : res.status(403).json({ error: 'Forbidden' }),
}));

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

let router: any;

beforeAll(async () => {
  router = (await import('../../routes/fila-de-chamados.routes')).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  Regra = 'USUARIO';
  UsuarioAtual = usuarioPadrao;
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Factory para criar instância do Express app com o router configurado
 */
function getApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

const chamadoMock = {
  id: 'c1',
  OS: 'INC0001',
  descricao: 'Test chamado',
  descricaoEncerramento: null,
  status: 'ABERTO',
  geradoEm: new Date().toISOString(),
  atualizadoEm: null,
  encerradoEm: null,
  usuario: usuarioPadrao,
  tecnico: tecnicoPadrao,
  servicos: [
    { servico: { nome: 'Email' }, servicoId: 's1' }
  ]
};

// ============================================================================
// TEST SUITES
// ============================================================================

describe('GET /meus-chamados (listar chamados do usuário logado)', () => {
  it('deve retornar status 200 e listar os chamados do usuário quando o usuário estiver autenticado com perfil USUARIO', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = usuarioPadrao;
    prismaMock.chamado.findMany.mockResolvedValueOnce([chamadoMock]);
    
    const res = await request(getApp()).get('/meus-chamados');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].usuario.email).toBe('user@mail.com');
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir o perfil USUARIO', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = tecnicoPadrao;
    
    const res = await request(getApp()).get('/meus-chamados');
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('deve retornar status 500 quando ocorrer um erro durante a consulta ao banco de dados', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = usuarioPadrao;
    prismaMock.chamado.findMany.mockRejectedValueOnce(new Error('Database connection failed'));
    
    const res = await request(getApp()).get('/meus-chamados');
    
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /chamados-atribuidos (listar chamados atribuídos ao técnico)', () => {
  it('deve retornar status 200 e listar os chamados atribuídos quando o usuário for um técnico autenticado', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = tecnicoPadrao;
    prismaMock.chamado.findMany.mockResolvedValueOnce([chamadoMock]);
    
    const res = await request(getApp()).get('/chamados-atribuidos');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].tecnico.email).toBe('tecnico@mail.com');
    expect(res.body[0].TipoDeServico).toBeDefined();
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir o perfil TECNICO', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = usuarioPadrao;
    
    const res = await request(getApp()).get('/chamados-atribuidos');
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('deve retornar status 500 quando ocorrer um erro durante a consulta ao banco de dados', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = tecnicoPadrao;
    prismaMock.chamado.findMany.mockRejectedValueOnce(new Error('Database connection failed'));
    
    const res = await request(getApp()).get('/chamados-atribuidos');
    
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /todos-chamados (listar todos os chamados filtrados por status)', () => {
  it('deve retornar status 400 com mensagem de erro quando o parâmetro "status" não for informado', async () => {
    Regra = 'ADMIN';
    UsuarioAtual = adminPadrao;
    
    const res = await request(getApp()).get('/todos-chamados');
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('status');
  });

  it('deve retornar status 400 com mensagem de erro quando o parâmetro "status" informado for inválido', async () => {
    Regra = 'ADMIN';
    UsuarioAtual = adminPadrao;
    
    const res = await request(getApp()).get('/todos-chamados?status=INVALIDO');
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('inválido');
  });

  it('deve retornar status 403 e negar acesso quando o usuário não possuir o perfil ADMIN', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = tecnicoPadrao;
    
    const res = await request(getApp()).get('/todos-chamados?status=ABERTO');
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('deve retornar status 200 e listar chamados filtrados por status quando o usuário for ADMIN e o parâmetro for válido', async () => {
    Regra = 'ADMIN';
    UsuarioAtual = adminPadrao;
    prismaMock.chamado.findMany.mockResolvedValueOnce([chamadoMock]);
    
    const res = await request(getApp()).get('/todos-chamados?status=ABERTO');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].status).toBe('ABERTO');
  });

  it('deve retornar status 500 quando ocorrer um erro durante a consulta ao banco de dados', async () => {
    Regra = 'ADMIN';
    UsuarioAtual = adminPadrao;
    prismaMock.chamado.findMany.mockRejectedValueOnce(new Error('Database connection failed'));
    
    const res = await request(getApp()).get('/todos-chamados?status=ABERTO');
    
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /abertos (listar chamados com status ABERTO)', () => {
  it('deve retornar status 200 e listar chamados abertos quando o usuário possuir perfil ADMIN', async () => {
    Regra = 'ADMIN';
    UsuarioAtual = adminPadrao;
    prismaMock.chamado.findMany.mockResolvedValueOnce([chamadoMock]);
    
    const res = await request(getApp()).get('/abertos');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(prismaMock.chamado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({
            in: expect.arrayContaining(['ABERTO', 'REABERTO'])
          })
        })
      })
    );
  });

  it('deve retornar status 200 e listar chamados abertos quando o usuário possuir perfil TECNICO', async () => {
    Regra = 'TECNICO';
    UsuarioAtual = tecnicoPadrao;
    prismaMock.chamado.findMany.mockResolvedValueOnce([chamadoMock]);
    
    const res = await request(getApp()).get('/abertos');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('deve retornar status 403 e negar acesso quando o usuário possuir perfil USUARIO', async () => {
    Regra = 'USUARIO';
    UsuarioAtual = usuarioPadrao;
    
    const res = await request(getApp()).get('/abertos');
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('deve retornar status 500 quando ocorrer um erro durante a consulta ao banco de dados', async () => {
    Regra = 'ADMIN';
    UsuarioAtual = adminPadrao;
    prismaMock.chamado.findMany.mockRejectedValueOnce(new Error('Database connection failed'));
    
    const res = await request(getApp()).get('/abertos');
    
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});