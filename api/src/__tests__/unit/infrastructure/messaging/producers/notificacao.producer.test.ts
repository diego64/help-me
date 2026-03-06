import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockSendMessage, mockIsKafkaConnected } = vi.hoisted(() => {
  const mockSendMessage      = vi.fn().mockResolvedValue(undefined);
  const mockIsKafkaConnected = vi.fn().mockReturnValue(true);
  return { mockSendMessage, mockIsKafkaConnected };
});

vi.mock('@infrastructure/messaging/kafka/client', () => ({
  sendMessage:      mockSendMessage,
  isKafkaConnected: mockIsKafkaConnected,
}));

vi.mock('@shared/config/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@infrastructure/database/mongodb/notificacao.model', () => ({
  default: {},
}));

import {
  TOPICO_NOTIFICACOES,
  publicarChamadoAberto,
  publicarChamadoAtribuido,
  publicarChamadoTransferido,
  publicarChamadoReaberto,
  publicarPrioridadeAlterada,
  publicarSLAVencendo,
} from '@infrastructure/messaging/kafka/producers/notificacao.producer';

const tecnico = { id: 'tec-1', email: 'tec@emp.com', nome: 'Carlos', nivel: 'N2' };

function getSentEvento() {
  const [, messages] = mockSendMessage.mock.calls[0];
  return JSON.parse(messages[0].value);
}

function getSentMessage() {
  const [, messages] = mockSendMessage.mock.calls[0];
  return messages[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsKafkaConnected.mockReturnValue(true);
});

describe('TOPICO_NOTIFICACOES', () => {
  it('deve ser helpme.notificacoes', () => {
    expect(TOPICO_NOTIFICACOES).toBe('helpme.notificacoes');
  });
});

describe('publicar() — comportamento comum', () => {
  it('não deve chamar sendMessage quando Kafka não estiver conectado', async () => {
    mockIsKafkaConnected.mockReturnValue(false);

    await publicarChamadoAberto({
      chamadoId: 'ch-1', chamadoOS: 'OS-1', prioridade: 'ALTA',
      descricao: 'desc', usuarioNome: 'Maria', usuarioSetor: 'TI',
      servicos: ['Suporte'], tecnicos: [tecnico],
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('deve publicar no tópico helpme.notificacoes', async () => {
    await publicarChamadoAberto({
      chamadoId: 'ch-1', chamadoOS: 'OS-1', prioridade: 'ALTA',
      descricao: 'desc', usuarioNome: 'Maria', usuarioSetor: 'TI',
      servicos: ['Suporte'], tecnicos: [tecnico],
    });

    const [topico] = mockSendMessage.mock.calls[0];
    expect(topico).toBe(TOPICO_NOTIFICACOES);
  });

  it('deve usar chamadoId como key da mensagem', async () => {
    await publicarChamadoAberto({
      chamadoId: 'ch-42', chamadoOS: 'OS-42', prioridade: 'ALTA',
      descricao: 'desc', usuarioNome: 'Maria', usuarioSetor: 'TI',
      servicos: [], tecnicos: [tecnico],
    });

    expect(getSentMessage().key).toBe('ch-42');
  });

  it('deve incluir header "tipo" com o tipo do evento', async () => {
    await publicarChamadoAberto({
      chamadoId: 'ch-1', chamadoOS: 'OS-1', prioridade: 'ALTA',
      descricao: 'desc', usuarioNome: 'Maria', usuarioSetor: 'TI',
      servicos: [], tecnicos: [tecnico],
    });

    expect(getSentMessage().headers.tipo).toBe('CHAMADO_ABERTO');
  });

  it('deve serializar o evento como JSON no campo value', async () => {
    await publicarChamadoAberto({
      chamadoId: 'ch-1', chamadoOS: 'OS-1', prioridade: 'ALTA',
      descricao: 'desc', usuarioNome: 'Maria', usuarioSetor: 'TI',
      servicos: [], tecnicos: [tecnico],
    });

    expect(() => JSON.parse(getSentMessage().value)).not.toThrow();
  });

  it('deve incluir timestamp ISO 8601 válido no evento', async () => {
    await publicarChamadoAberto({
      chamadoId: 'ch-1', chamadoOS: 'OS-1', prioridade: 'ALTA',
      descricao: 'desc', usuarioNome: 'Maria', usuarioSetor: 'TI',
      servicos: [], tecnicos: [tecnico],
    });

    const ts = new Date(getSentEvento().timestamp);
    expect(ts.toString()).not.toBe('Invalid Date');
  });

  it('deve propagar erro quando sendMessage falhar', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Kafka timeout'));

    await expect(
      publicarChamadoAberto({
        chamadoId: 'ch-1', chamadoOS: 'OS-1', prioridade: 'ALTA',
        descricao: 'desc', usuarioNome: 'Maria', usuarioSetor: 'TI',
        servicos: [], tecnicos: [tecnico],
      })
    ).rejects.toThrow('Kafka timeout');
  });
});

describe('publicarChamadoAberto()', () => {
  const params = {
    chamadoId: 'ch-1', chamadoOS: 'OS-001', prioridade: 'ALTA',
    descricao: 'Problema na rede', usuarioNome: 'Maria', usuarioSetor: 'TI',
    servicos: ['Suporte', 'Rede'],
    tecnicos: [tecnico, { id: 'tec-2', email: 't2@emp.com', nome: 'Ana', nivel: 'N1' }],
  };

  it('deve publicar com tipo CHAMADO_ABERTO', async () => {
    await publicarChamadoAberto(params);
    expect(getSentEvento().tipo).toBe('CHAMADO_ABERTO');
  });

  it('deve incluir todos os técnicos como destinatários', async () => {
    await publicarChamadoAberto(params);
    expect(getSentEvento().destinatarios).toHaveLength(2);
  });

  it('deve incluir chamadoOS no evento', async () => {
    await publicarChamadoAberto(params);
    expect(getSentEvento().chamadoOS).toBe('OS-001');
  });

  it('deve incluir prioridade no evento', async () => {
    await publicarChamadoAberto(params);
    expect(getSentEvento().chamadoPrioridade).toBe('ALTA');
  });

  it('deve incluir servicos nos dados', async () => {
    await publicarChamadoAberto(params);
    expect(getSentEvento().dados.servicos).toEqual(['Suporte', 'Rede']);
  });

  it('deve incluir usuarioNome e usuarioSetor nos dados', async () => {
    await publicarChamadoAberto(params);
    const { dados } = getSentEvento();
    expect(dados.usuarioNome).toBe('Maria');
    expect(dados.usuarioSetor).toBe('TI');
  });

  it('deve chamar sendMessage exatamente uma vez', async () => {
    await publicarChamadoAberto(params);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('publicarChamadoAtribuido()', () => {
  const params = {
    chamadoId: 'ch-2', chamadoOS: 'OS-002', prioridade: 'MEDIA',
    descricao: 'Tela azul', usuarioNome: 'João', tecnico,
  };

  it('deve publicar com tipo CHAMADO_ATRIBUIDO', async () => {
    await publicarChamadoAtribuido(params);
    expect(getSentEvento().tipo).toBe('CHAMADO_ATRIBUIDO');
  });

  it('deve incluir apenas o técnico como destinatário', async () => {
    await publicarChamadoAtribuido(params);
    expect(getSentEvento().destinatarios).toHaveLength(1);
    expect(getSentEvento().destinatarios[0].id).toBe(tecnico.id);
  });

  it('deve incluir usuarioNome nos dados', async () => {
    await publicarChamadoAtribuido(params);
    expect(getSentEvento().dados.usuarioNome).toBe('João');
  });

  it('deve incluir descricao nos dados', async () => {
    await publicarChamadoAtribuido(params);
    expect(getSentEvento().dados.descricao).toBe('Tela azul');
  });
});

describe('publicarChamadoTransferido()', () => {
  const params = {
    chamadoId: 'ch-3', chamadoOS: 'OS-003', prioridade: 'BAIXA',
    motivo: 'Férias', tecnicoAnteriorNome: 'Carlos', tecnicoNovo: tecnico,
  };

  it('deve publicar com tipo CHAMADO_TRANSFERIDO', async () => {
    await publicarChamadoTransferido(params);
    expect(getSentEvento().tipo).toBe('CHAMADO_TRANSFERIDO');
  });

  it('deve ter o novo técnico como destinatário', async () => {
    await publicarChamadoTransferido(params);
    expect(getSentEvento().destinatarios[0].id).toBe(tecnico.id);
  });

  it('deve incluir motivo e tecnicoAnteriorNome nos dados', async () => {
    await publicarChamadoTransferido(params);
    const { dados } = getSentEvento();
    expect(dados.motivo).toBe('Férias');
    expect(dados.tecnicoAnteriorNome).toBe('Carlos');
  });
});

describe('publicarChamadoReaberto()', () => {
  const baseParams = {
    chamadoId: 'ch-4', chamadoOS: 'OS-004', prioridade: 'ALTA',
    descricao: 'Problema voltou', usuarioNome: 'Maria',
  };

  it('deve publicar com tipo CHAMADO_REABERTO quando técnico presente', async () => {
    await publicarChamadoReaberto({ ...baseParams, tecnico });
    expect(getSentEvento().tipo).toBe('CHAMADO_REABERTO');
  });

  it('não deve chamar sendMessage quando tecnico for null', async () => {
    await publicarChamadoReaberto({ ...baseParams, tecnico: null });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('deve incluir o técnico como destinatário', async () => {
    await publicarChamadoReaberto({ ...baseParams, tecnico });
    expect(getSentEvento().destinatarios[0].id).toBe(tecnico.id);
  });

  it('deve incluir usuarioNome e descricao nos dados', async () => {
    await publicarChamadoReaberto({ ...baseParams, tecnico });
    const { dados } = getSentEvento();
    expect(dados.usuarioNome).toBe('Maria');
    expect(dados.descricao).toBe('Problema voltou');
  });
});

describe('publicarPrioridadeAlterada()', () => {
  const baseParams = {
    chamadoId: 'ch-5', chamadoOS: 'OS-005',
    prioridadeAnterior: 'BAIXA', prioridadeNova: 'CRITICA',
    alteradoPorNome: 'Admin',
  };

  it('deve publicar com tipo PRIORIDADE_ALTERADA quando técnico presente', async () => {
    await publicarPrioridadeAlterada({ ...baseParams, tecnico });
    expect(getSentEvento().tipo).toBe('PRIORIDADE_ALTERADA');
  });

  it('não deve chamar sendMessage quando tecnico for null', async () => {
    await publicarPrioridadeAlterada({ ...baseParams, tecnico: null });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('deve usar prioridadeNova como chamadoPrioridade', async () => {
    await publicarPrioridadeAlterada({ ...baseParams, tecnico });
    expect(getSentEvento().chamadoPrioridade).toBe('CRITICA');
  });

  it('deve incluir prioridadeAnterior, prioridadeNova e alteradoPorNome nos dados', async () => {
    await publicarPrioridadeAlterada({ ...baseParams, tecnico });
    const { dados } = getSentEvento();
    expect(dados.prioridadeAnterior).toBe('BAIXA');
    expect(dados.prioridadeNova).toBe('CRITICA');
    expect(dados.alteradoPorNome).toBe('Admin');
  });
});

describe('publicarSLAVencendo()', () => {
  const params = {
    chamadoId: 'ch-6', chamadoOS: 'OS-006',
    prioridade: 'ALTA', horasAberto: 48, tecnico,
  };

  it('deve publicar com tipo SLA_VENCENDO', async () => {
    await publicarSLAVencendo(params);
    expect(getSentEvento().tipo).toBe('SLA_VENCENDO');
  });

  it('deve incluir o técnico como destinatário', async () => {
    await publicarSLAVencendo(params);
    expect(getSentEvento().destinatarios[0].id).toBe(tecnico.id);
  });

  it('deve incluir horasAberto nos dados', async () => {
    await publicarSLAVencendo(params);
    expect(getSentEvento().dados.horasAberto).toBe(48);
  });

  it('deve chamar sendMessage exatamente uma vez', async () => {
    await publicarSLAVencendo(params);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});