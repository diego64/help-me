import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '@infrastructure/database/prisma/client';
import {
  AuthenticatedClient,
  createAuthenticatedClient,
  generateUniqueEmail,
  extractErrorMessage,
} from '../setup/test.helpers';

function tecnicoBase(overrides: Record<string, unknown> = {}) {
  return {
    nome: 'Carlos',
    sobrenome: 'Técnico',
    email: generateUniqueEmail('tecnico'),
    password: 'Senha123!',
    setor: 'TECNOLOGIA_INFORMACAO',
    entrada: '08:00',
    saida: '17:00',
    ...overrides,
  };
}

async function criarTecnico(
  admin: AuthenticatedClient,
  overrides: Record<string, unknown> = {},
) {
  const res = await admin.post('/api/tecnicos', tecnicoBase(overrides)).expect(201);
  return res.body as { id: string; email: string };
}

describe('E2E: Técnicos', () => {
  let admin: AuthenticatedClient;
  let tecnico: AuthenticatedClient;
  let usuario: AuthenticatedClient;

  beforeEach(async () => {
    [admin, tecnico, usuario] = await Promise.all([
      createAuthenticatedClient(
        process.env.ADMIN_EMAIL_TESTE ?? 'admin@helpme.com',
        process.env.ADMIN_PASSWORD_TESTE ?? 'Admin123!',
      ),
      createAuthenticatedClient(
        process.env.TECNICO_EMAIL_TESTE ?? 'tecnico@helpme.com',
        process.env.TECNICO_PASSWORD_TESTE ?? 'Tecnico123!',
      ),
      createAuthenticatedClient(
        process.env.USER_EMAIL_TESTE ?? 'user@helpme.com',
        process.env.USER_PASSWORD_TESTE ?? 'User123!',
      ),
    ]);
  }, 60000);

  describe('POST /api/tecnicos - Criação', () => {
    it('admin cria técnico com dados completos', async () => {
      const dados = tecnicoBase();
      const res = await admin.post('/api/tecnicos', dados).expect(201);

      expect(res.body).toMatchObject({
        nome: dados.nome,
        sobrenome: dados.sobrenome,
        email: dados.email,
        regra: 'TECNICO',
        setor: 'TECNOLOGIA_INFORMACAO',
        ativo: true,
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).not.toHaveProperty('password');
      expect(Array.isArray(res.body.tecnicoDisponibilidade)).toBe(true);
    });

    it('cria técnico com horário padrão (08:00-17:00) quando não informado', async () => {
      const res = await admin
        .post('/api/tecnicos', tecnicoBase({ entrada: undefined, saida: undefined }))
        .expect(201);

      expect(res.body.tecnicoDisponibilidade.length).toBeGreaterThan(0);
    });

    it('sem autenticação retorna 401', async () => {
      await request(app)
        .post('/api/tecnicos')
        .send(tecnicoBase())
        .expect(401);
    });

    it.each([
      ['técnico', () => tecnico],
      ['usuário comum', () => usuario],
    ])('%s não pode criar técnico → 403', async (_, getClient) => {
      await getClient().post('/api/tecnicos', tecnicoBase()).expect(403);
    });

    it.each([
      ['sem nome', { nome: undefined }, /nome/i],
      ['sem sobrenome', { sobrenome: undefined }, /sobrenome/i],
      ['email inválido', { email: 'nao-é-email' }, /email/i],
      ['senha fraca', { password: '123' }, /senha.*8/i],
      ['horário de entrada inválido', { entrada: '25:00' }, /horário.*entrada/i],
      ['saída anterior à entrada', { entrada: '17:00', saida: '08:00' }, /saída.*posterior.*entrada/i],
    ])('rejeita criação %s → 400', async (_, overrides, msgPattern) => {
      const res = await admin.post('/api/tecnicos', tecnicoBase(overrides));

      expect(res.status).toBe(400);
      expect(extractErrorMessage(res)).toMatch(msgPattern);
    });

    it('rejeita email duplicado → 409', async () => {
      const email = generateUniqueEmail('dup');

      await admin.post('/api/tecnicos', tecnicoBase({ email })).expect(201);

      const res = await admin.post('/api/tecnicos', tecnicoBase({ email }));
      expect(res.status).toBe(409);
      expect(extractErrorMessage(res)).toMatch(/já cadastrado|email/i);
    });
  });

  describe('GET /api/tecnicos - Listagem', () => {
    it('admin lista técnicos com paginação e sem expor senhas', async () => {
      const res = await admin.get('/api/tecnicos?page=1&limit=5').expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 5 });
      res.body.data.forEach((t: any) => expect(t).not.toHaveProperty('password'));
    });

    it('retorna campo tecnicoDisponibilidade em cada item', async () => {
      const res = await admin.get('/api/tecnicos').expect(200);

      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('tecnicoDisponibilidade');
      }
    });

    it.each([
      ['técnico', () => tecnico],
      ['usuário comum', () => usuario],
    ])('%s não pode listar técnicos → 403', async (_, getClient) => {
      await getClient().get('/api/tecnicos').expect(403);
    });
  });

  describe('GET /api/tecnicos/:id - Busca individual', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      ({ id: tecnicoId } = await criarTecnico(admin));
    }, 60000);

    it('admin busca técnico por ID', async () => {
      const res = await admin.get(`/api/tecnicos/${tecnicoId}`).expect(200);

      expect(res.body.id).toBe(tecnicoId);
      expect(res.body).not.toHaveProperty('password');
    });

    it('técnico pode buscar qualquer técnico', async () => {
      await tecnico.get(`/api/tecnicos/${tecnicoId}`).expect(200);
    });

    it('usuário comum não pode buscar técnico → 403', async () => {
      await usuario.get(`/api/tecnicos/${tecnicoId}`).expect(403);
    });

    it('ID inexistente retorna 404', async () => {
      await admin.get('/api/tecnicos/id-inexistente-12345').expect(404);
    });
  });

  describe('PUT /api/tecnicos/:id - Atualização de dados', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      ({ id: tecnicoId } = await criarTecnico(admin));
    }, 60000);

    it.each([
      ['nome', { nome: 'Nome Atualizado' }, 'nome', 'Nome Atualizado'],
      ['sobrenome', { sobrenome: 'Sobrenome Atualizado' }, 'sobrenome', 'Sobrenome Atualizado'],
      ['setor', { setor: 'FINANCEIRO' }, 'setor', 'FINANCEIRO'],
    ])('admin atualiza %s', async (_, body, campo, valor) => {
      const res = await admin.put(`/api/tecnicos/${tecnicoId}`, body).expect(200);
      expect(res.body[campo]).toBe(valor);
    });

    it('ID inexistente retorna 404', async () => {
      await admin.put('/api/tecnicos/id-inexistente', { nome: 'Teste' }).expect(404);
    });

    it('email já em uso retorna 409', async () => {
      const emailExistente = generateUniqueEmail('outro');
      await criarTecnico(admin, { email: emailExistente });

      const res = await admin.put(`/api/tecnicos/${tecnicoId}`, { email: emailExistente });
      expect(res.status).toBe(409);
    });

    it('técnico não pode atualizar outro técnico → 403', async () => {
      const res = await tecnico.put(`/api/tecnicos/${tecnicoId}`, { nome: 'Tentativa' });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/tecnicos/:id/senha - Alteração de senha', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      ({ id: tecnicoId } = await criarTecnico(admin));
    }, 60000);

    it('admin altera senha de qualquer técnico', async () => {
      const res = await admin
        .put(`/api/tecnicos/${tecnicoId}/senha`, { password: 'NovaSenha123!' })
        .expect(200);

      expect(res.body.message).toMatch(/senha.*sucesso/i);
    });

    it('senha fraca retorna 400', async () => {
      const res = await admin.put(`/api/tecnicos/${tecnicoId}/senha`, { password: '123' });

      expect(res.status).toBe(400);
      expect(extractErrorMessage(res)).toMatch(/senha/i);
    });

    it('técnico não pode alterar senha de outro → 403', async () => {
      const res = await tecnico.put(`/api/tecnicos/${tecnicoId}/senha`, {
        password: 'NovaSenha123!',
      });
      expect(res.status).toBe(403);
    });

    it('ID inexistente retorna 404', async () => {
      await admin
        .put('/api/tecnicos/id-inexistente/senha', { password: 'NovaSenha123!' })
        .expect(404);
    });
  });

  describe('PUT /api/tecnicos/:id/horarios - Horários de expediente', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      ({ id: tecnicoId } = await criarTecnico(admin));
    }, 60000);

    it('admin atualiza horários com sucesso', async () => {
      const res = await admin
        .put(`/api/tecnicos/${tecnicoId}/horarios`, { entrada: '09:00', saida: '18:00' })
        .expect(200);

      expect(res.body.message).toMatch(/horário.*atualizado/i);
      expect(res.body.horario).toBeDefined();
    });

    it.each([
      ['horário de entrada inválido', { entrada: '25:00', saida: '17:00' }, /horário.*entrada/i],
      ['horário de saída inválido', { entrada: '08:00', saida: 'ABC' }, /horário.*saída/i],
      ['saída anterior à entrada', { entrada: '17:00', saida: '08:00' }, /saída.*posterior.*entrada/i],
    ])('rejeita %s → 400', async (_, body, msgPattern) => {
      const res = await admin.put(`/api/tecnicos/${tecnicoId}/horarios`, body);

      expect(res.status).toBe(400);
      expect(extractErrorMessage(res)).toMatch(msgPattern);
    });

    it('técnico não pode alterar horários de outro → 403', async () => {
      const res = await tecnico.put(`/api/tecnicos/${tecnicoId}/horarios`, {
        entrada: '09:00',
        saida: '18:00',
      });
      expect(res.status).toBe(403);
    });

    it('ID inexistente retorna 404', async () => {
      await admin
        .put('/api/tecnicos/id-inexistente/horarios', { entrada: '09:00', saida: '18:00' })
        .expect(404);
    });
  });

  describe('PATCH /api/tecnicos/:id/nivel - Alteração de nível', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      ({ id: tecnicoId } = await criarTecnico(admin));
    }, 60000);

    it.each([['N2'], ['N3']])('admin promove técnico para %s', async (nivel) => {
      const res = await admin
        .patch(`/api/tecnicos/${tecnicoId}/nivel`, { nivel })
        .expect(200);

      expect(res.body.tecnico.nivel).toBe(nivel);
    });

    it('nível inválido retorna 400', async () => {
      const res = await admin.patch(`/api/tecnicos/${tecnicoId}/nivel`, { nivel: 'N9' });
      expect(res.status).toBe(400);
    });

    it('mesmo nível retorna 400', async () => {
      const res = await admin.patch(`/api/tecnicos/${tecnicoId}/nivel`, { nivel: 'N1' });
      expect(res.status).toBe(400);
      expect(extractErrorMessage(res)).toMatch(/já possui o nível/i);
    });

    it('técnico não pode alterar nível → 403', async () => {
      await tecnico.patch(`/api/tecnicos/${tecnicoId}/nivel`, { nivel: 'N2' }).expect(403);
    });
  });

  describe('DELETE /api/tecnicos/:id - Deleção', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      ({ id: tecnicoId } = await criarTecnico(admin));
    }, 60000);

    it('admin faz soft delete e registro permanece no banco', async () => {
      const res = await admin.delete(`/api/tecnicos/${tecnicoId}`).expect(200);

      expect(res.body.message).toMatch(/deletado.*sucesso/i);

      const registro = await prisma.usuario.findUnique({ where: { id: tecnicoId } });
      expect(registro).not.toBeNull();
      expect(registro!.deletadoEm).not.toBeNull();
    });

    it.each([
      ['técnico', () => tecnico],
      ['usuário comum', () => usuario],
    ])('%s não pode deletar técnico → 403', async (_, getClient) => {
      await getClient().delete(`/api/tecnicos/${tecnicoId}`).expect(403);
    });

    it('ID inexistente retorna 404', async () => {
      await admin.delete('/api/tecnicos/id-inexistente').expect(404);
    });
  });

  describe('PATCH /api/tecnicos/:id/restaurar - Restauração', () => {
    let tecnicoId: string;

    beforeEach(async () => {
      ({ id: tecnicoId } = await criarTecnico(admin));
    }, 60000);

    it('admin restaura técnico deletado', async () => {
      await admin.delete(`/api/tecnicos/${tecnicoId}`).expect(200);

      const res = await admin
        .patch(`/api/tecnicos/${tecnicoId}/restaurar`)
        .expect(200);

      expect(res.body.message).toMatch(/restaurado/i);
      expect(res.body.tecnico.ativo).toBe(true);
    });

    it('técnico não pode restaurar → 403', async () => {
      await admin.delete(`/api/tecnicos/${tecnicoId}`).expect(200);

      await tecnico.patch(`/api/tecnicos/${tecnicoId}/restaurar`).expect(403);
    });

    it('restaurar técnico ativo retorna 400', async () => {
      const res = await admin.patch(`/api/tecnicos/${tecnicoId}/restaurar`);
      expect(res.status).toBe(400);
      expect(extractErrorMessage(res)).toMatch(/não está deletado/i);
    });
  });
});