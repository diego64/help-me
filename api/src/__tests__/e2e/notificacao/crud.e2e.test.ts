import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import NotificacaoModel, { TipoEvento } from '@infrastructure/database/mongodb/notificacao.model';
import {
  AuthenticatedClient,
  createAuthenticatedClient,
  extractErrorMessage,
} from '../setup/test.helpers';

interface NotificacaoOverrides {
  titulo?: string;
  mensagem?: string;
  tipo?: TipoEvento;
  chamadoId?: string;
  chamadoOS?: string;
  destinatarioEmail?: string;
  lida?: boolean;
  lidaEm?: Date;
  criadoEm?: Date;
}

async function criarNotificacao(destinatarioId: string, overrides: NotificacaoOverrides = {}) {
  return NotificacaoModel.create({
    destinatarioId,
    destinatarioEmail: 'teste@helpme.com',
    tipo: 'CHAMADO_ABERTO' as TipoEvento,
    titulo: 'Notificação de teste',
    mensagem: 'Conteúdo da notificação de teste',
    chamadoId: 'chamado-id-teste',
    chamadoOS: 'INC-0001',
    lida: false,
    criadoEm: new Date(),
    ...overrides,
  });
}

async function criarNotificacoes(destinatarioId: string, quantidade: number, overrides: NotificacaoOverrides = {}) {
  return Promise.all(
    Array.from({ length: quantidade }, () => criarNotificacao(destinatarioId, overrides))
  );
}

describe('E2E: Notificações', () => {
  let adminClient: AuthenticatedClient;
  let tecnicoClient: AuthenticatedClient;
  let usuarioClient: AuthenticatedClient;

  let adminId: string;
  let tecnicoId: string;
  let usuarioId: string;

  beforeEach(async () => {
    const [adminLogin, tecnicoLogin, usuarioLogin] = await Promise.all([
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

    adminClient = adminLogin;
    tecnicoClient = tecnicoLogin;
    usuarioClient = usuarioLogin;

    const [resAdmin, resTecnico, resUsuario] = await Promise.all([
      request(app).get('/api/auth/me').set('Authorization', `Bearer ${(adminClient as any).accessToken}`),
      request(app).get('/api/auth/me').set('Authorization', `Bearer ${(tecnicoClient as any).accessToken}`),
      request(app).get('/api/auth/me').set('Authorization', `Bearer ${(usuarioClient as any).accessToken}`),
    ]);

    adminId = resAdmin.body.id ?? resAdmin.body.usuario?.id;
    tecnicoId = resTecnico.body.id ?? resTecnico.body.usuario?.id;
    usuarioId = resUsuario.body.id ?? resUsuario.body.usuario?.id;
  }, 60000);

  afterEach(async () => {
    await NotificacaoModel.deleteMany({
      destinatarioId: { $in: [adminId, tecnicoId, usuarioId].filter(Boolean) },
    });
  });

  describe('GET /api/notificacoes - Listagem', () => {
    it('retorna lista paginada com campo naoLidas', async () => {
      await criarNotificacoes(usuarioId, 3);

      const res = await usuarioClient.get('/api/notificacoes').expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body).toHaveProperty('naoLidas');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('retorna apenas notificações do usuário autenticado', async () => {
      await criarNotificacoes(usuarioId, 2);
      await criarNotificacoes(tecnicoId, 3);

      const res = await usuarioClient.get('/api/notificacoes').expect(200);

      expect(res.body.data.length).toBe(2);
      res.body.data.forEach((n: any) => {
        expect(n.destinatarioId).toBe(usuarioId);
      });
    });

    it('respeita paginação', async () => {
      await criarNotificacoes(usuarioId, 5);

      const res = await usuarioClient.get('/api/notificacoes?page=1&limit=2').expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 2 });
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.hasNext).toBe(true);
      expect(res.body.pagination.hasPrev).toBe(false);
    });

    it('filtra apenas não lidas com naoLidas=true', async () => {
      await criarNotificacoes(usuarioId, 2, { lida: false });
      await criarNotificacoes(usuarioId, 3, { lida: true, lidaEm: new Date() });

      const res = await usuarioClient.get('/api/notificacoes?naoLidas=true').expect(200);

      expect(res.body.data.length).toBe(2);
      res.body.data.forEach((n: any) => expect(n.lida).toBe(false));
    });

    it('campo naoLidas reflete total correto mesmo com filtro ativo', async () => {
      await criarNotificacoes(usuarioId, 2, { lida: false });
      await criarNotificacoes(usuarioId, 3, { lida: true, lidaEm: new Date() });

      const res = await usuarioClient.get('/api/notificacoes?naoLidas=true').expect(200);

      expect(res.body.naoLidas).toBe(2);
    });

    it('retorna lista vazia quando não há notificações', async () => {
      const res = await usuarioClient.get('/api/notificacoes').expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
      expect(res.body.naoLidas).toBe(0);
    });

    it('sem autenticação retorna 401', async () => {
      await request(app).get('/api/notificacoes').expect(401);
    });

    it.each([
      ['admin', () => adminClient],
      ['técnico', () => tecnicoClient],
      ['usuário', () => usuarioClient],
    ])('%s autenticado pode listar suas notificações', async (_, getClient) => {
      await getClient().get('/api/notificacoes').expect(200);
    });
  });

  describe('PATCH /api/notificacoes/marcar-todas-lidas - Marcar todas como lidas', () => {
    it('marca todas as notificações não lidas como lidas', async () => {
      await criarNotificacoes(usuarioId, 4, { lida: false });

      const res = await usuarioClient
        .patch('/api/notificacoes/marcar-todas-lidas')
        .expect(200);

      expect(res.body.message).toMatch(/todas.*notificações.*lidas/i);
      expect(res.body.atualizadas).toBe(4);

      const restantes = await NotificacaoModel.countDocuments({
        destinatarioId: usuarioId,
        lida: false,
      });
      expect(restantes).toBe(0);
    });

    it('não afeta notificações já lidas', async () => {
      await criarNotificacoes(usuarioId, 2, { lida: true, lidaEm: new Date() });
      await criarNotificacoes(usuarioId, 3, { lida: false });

      const res = await usuarioClient
        .patch('/api/notificacoes/marcar-todas-lidas')
        .expect(200);

      expect(res.body.atualizadas).toBe(3);
    });

    it('não afeta notificações de outros usuários', async () => {
      await criarNotificacoes(usuarioId, 2, { lida: false });
      await criarNotificacoes(tecnicoId, 3, { lida: false });

      await usuarioClient.patch('/api/notificacoes/marcar-todas-lidas').expect(200);

      const naoLidasTecnico = await NotificacaoModel.countDocuments({
        destinatarioId: tecnicoId,
        lida: false,
      });
      expect(naoLidasTecnico).toBe(3);
    });

    it('retorna atualizadas=0 quando não há não lidas', async () => {
      const res = await usuarioClient
        .patch('/api/notificacoes/marcar-todas-lidas')
        .expect(200);

      expect(res.body.atualizadas).toBe(0);
    });

    it('sem autenticação retorna 401', async () => {
      await request(app).patch('/api/notificacoes/marcar-todas-lidas').expect(401);
    });
  });

  describe('PATCH /api/notificacoes/:id/lida - Marcar uma como lida', () => {
    it('marca notificação própria como lida', async () => {
      const notificacao = await criarNotificacao(usuarioId, { lida: false });

      const res = await usuarioClient
        .patch(`/api/notificacoes/${notificacao._id}/lida`)
        .expect(200);

      expect(res.body.message).toMatch(/notificação.*lida/i);
      expect(res.body.notificacao.lida).toBe(true);
      expect(res.body.notificacao.lidaEm).not.toBeNull();
    });

    it('não pode marcar notificação de outro usuário → 404', async () => {
      const notificacaoTecnico = await criarNotificacao(tecnicoId, { lida: false });

      const res = await usuarioClient
        .patch(`/api/notificacoes/${notificacaoTecnico._id}/lida`);

      expect(res.status).toBe(404);
      expect(extractErrorMessage(res)).toMatch(/não encontrada/i);
    });

    it('ID inexistente retorna 404', async () => {
      const res = await usuarioClient
        .patch('/api/notificacoes/000000000000000000000000/lida');

      expect(res.status).toBe(404);
    });

    it('sem autenticação retorna 401', async () => {
      const notificacao = await criarNotificacao(usuarioId);

      await request(app)
        .patch(`/api/notificacoes/${notificacao._id}/lida`)
        .expect(401);
    });
  });

  describe('DELETE /api/notificacoes/:id - Remoção', () => {
    it('remove notificação própria', async () => {
      const notificacao = await criarNotificacao(usuarioId);

      const res = await usuarioClient
        .delete(`/api/notificacoes/${notificacao._id}`)
        .expect(200);

      expect(res.body.message).toMatch(/removida/i);
      expect(res.body.id).toBe(String(notificacao._id));

      const removida = await NotificacaoModel.findById(notificacao._id);
      expect(removida).toBeNull();
    });

    it('não pode remover notificação de outro usuário → 404', async () => {
      const notificacaoTecnico = await criarNotificacao(tecnicoId);

      const res = await usuarioClient
        .delete(`/api/notificacoes/${notificacaoTecnico._id}`);

      expect(res.status).toBe(404);
      expect(extractErrorMessage(res)).toMatch(/não encontrada/i);
    });

    it('ID inexistente retorna 404', async () => {
      const res = await usuarioClient
        .delete('/api/notificacoes/000000000000000000000000');

      expect(res.status).toBe(404);
    });

    it('sem autenticação retorna 401', async () => {
      const notificacao = await criarNotificacao(usuarioId);

      await request(app)
        .delete(`/api/notificacoes/${notificacao._id}`)
        .expect(401);
    });
  });
});