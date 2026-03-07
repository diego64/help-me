import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EachMessagePayload } from 'kafkajs';

const {
  mockSendMail,
  mockInsertMany,
  mockEmitirParaUsuario,
  mockEmitirParaTecnicos,
  mockConsumerConnect,
  mockConsumerDisconnect,
  mockConsumerSubscribe,
  mockConsumerStop,
  mockConsumerRun,
  mockConsumer,
} = vi.hoisted(() => {
  const mockSendMail           = vi.fn().mockResolvedValue({ messageId: 'ok' });
  const mockInsertMany         = vi.fn().mockResolvedValue([]);
  const mockEmitirParaUsuario  = vi.fn();
  const mockEmitirParaTecnicos = vi.fn();
  const mockConsumerConnect    = vi.fn().mockResolvedValue(undefined);
  const mockConsumerDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockConsumerSubscribe  = vi.fn().mockResolvedValue(undefined);
  const mockConsumerStop       = vi.fn().mockResolvedValue(undefined);
  const mockConsumerRun        = vi.fn().mockResolvedValue(undefined);
  const mockConsumer = {
    connect:    mockConsumerConnect,
    disconnect: mockConsumerDisconnect,
    subscribe:  mockConsumerSubscribe,
    stop:       mockConsumerStop,
    run:        mockConsumerRun,
  };
  return {
    mockSendMail, mockInsertMany, mockEmitirParaUsuario, mockEmitirParaTecnicos,
    mockConsumerConnect, mockConsumerDisconnect, mockConsumerSubscribe,
    mockConsumerStop, mockConsumerRun, mockConsumer,
  };
});

vi.mock('@infrastructure/email/email.service', () => ({
  transporter: { sendMail: mockSendMail },
}));

vi.mock('@infrastructure/database/mongodb/notificacao.model', () => ({
  default: { insertMany: mockInsertMany },
}));

vi.mock('@infrastructure/websocket/socket', () => ({
  emitirParaUsuario:  mockEmitirParaUsuario,
  emitirParaTecnicos: mockEmitirParaTecnicos,
}));

vi.mock('@infrastructure/messaging/kafka/client', () => ({
  kafka: { consumer: vi.fn(() => mockConsumer) },
}));

vi.mock('@shared/config/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../producers/notificacao.producer', () => ({
  TOPICO_NOTIFICACOES: 'helpme.notificacoes',
}));

// fs e handlebars: template sempre disponível por padrão
import fs from 'fs';
import handlebars from 'handlebars';

const existsSyncSpy   = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue('<p>{{nomeDestinatario}}</p>' as any);
vi.spyOn(handlebars, 'compile').mockReturnValue((data: any) => `<html>${JSON.stringify(data)}</html>` as any);

import {
  processarMensagemNotificacao,
  startNotificacaoConsumer,
  stopNotificacaoConsumer,
  isNotificacaoConsumerRunning,
} from '@infrastructure/messaging/kafka/consumers/notificacao.consumer';

import type { EventoNotificacao } from '@infrastructure/messaging/kafka/producers/notificacao.producer';
import type { TipoEvento } from '@infrastructure/database/mongodb/notificacao.model';

function buildDestinatario(overrides = {}) {
  return { id: 'user-1', nome: 'Técnico João', email: 'joao@empresa.com', ...overrides };
}

function buildEvento(tipo: TipoEvento, overrides: Partial<EventoNotificacao> = {}): EventoNotificacao {
  return {
    tipo,
    chamadoId:         'ch-001',
    chamadoOS:         'OS-2024-001',
    chamadoPrioridade: 'ALTA',
    destinatarios:     [buildDestinatario()],
    dados:             { usuarioNome: 'Maria', servicos: ['Suporte'], prioridade: 'ALTA' },
    timestamp:         new Date().toISOString(),
    ...overrides,
  } as EventoNotificacao;
}

function buildKafkaPayload(data: object | null): EachMessagePayload {
  return {
    topic:     'helpme-notificacoes',
    partition: 0,
    message: {
      offset:     '0',
      value:      data === null ? null : Buffer.from(JSON.stringify(data)),
      key:        null,
      timestamp:  Date.now().toString(),
      size:       0,
      attributes: 0,
      headers:    {},
    },
    heartbeat:                vi.fn(),
    commitOffsetsIfNecessary: vi.fn(),
    resolveOffset:            vi.fn(),
    isRunning:                vi.fn().mockReturnValue(true),
    isStale:                  vi.fn().mockReturnValue(false),
    pause:                    vi.fn(),
  } as unknown as EachMessagePayload;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockSendMail.mockResolvedValue({ messageId: 'ok' });
  mockInsertMany.mockResolvedValue([]);
  mockConsumerConnect.mockResolvedValue(undefined);
  mockConsumerDisconnect.mockResolvedValue(undefined);
  mockConsumerSubscribe.mockResolvedValue(undefined);
  mockConsumerStop.mockResolvedValue(undefined);
  mockConsumerRun.mockResolvedValue(undefined);

  existsSyncSpy.mockReturnValue(true);
  readFileSyncSpy.mockReturnValue('<p>{{nomeDestinatario}}</p>' as any);
});

afterEach(async () => {
  await stopNotificacaoConsumer();
});

describe('processarMensagemNotificacao() — roteamento por tipo', () => {
  it.each([
    'CHAMADO_ABERTO',
    'CHAMADO_ATRIBUIDO',
    'CHAMADO_TRANSFERIDO',
    'CHAMADO_REABERTO',
    'PRIORIDADE_ALTERADA',
    'SLA_VENCENDO',
    'CHAMADO_ENCERRADO',
  ] as TipoEvento[])('deve salvar notificação e enviar email para tipo %s', async (tipo) => {
    const evento = buildEvento(tipo, {
      dados: {
        usuarioNome:         'Maria',
        servicos:            ['Suporte'],
        prioridade:          'ALTA',
        tecnicoAnteriorNome: 'Carlos',
        motivo:              'Férias',
        prioridadeAnterior:  'BAIXA',
        prioridadeNova:      'ALTA',
        alteradoPorNome:     'Admin',
        horasAberto:         48,
      },
    });

    await processarMensagemNotificacao(buildKafkaPayload(evento));

    expect(mockInsertMany).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe('processarMensagemNotificacao() — entradas inválidas', () => {
  it('não deve processar quando message.value for null', async () => {
    await processarMensagemNotificacao(buildKafkaPayload(null));

    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('não deve propagar erro com JSON malformado', async () => {
    const payload = buildKafkaPayload({});
    (payload.message as any).value = Buffer.from('{ json invalido }');

    await expect(processarMensagemNotificacao(payload)).resolves.not.toThrow();
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it('não deve propagar erro quando MongoDB falhar', async () => {
    mockInsertMany.mockRejectedValueOnce(new Error('Mongo down'));

    await expect(
      processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ABERTO')))
    ).resolves.not.toThrow();
  });

  it('não deve propagar erro quando sendMail falhar', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP offline'));

    await expect(
      processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ABERTO')))
    ).resolves.not.toThrow();
  });

  it('não deve propagar erro quando emitirSocketNotificacoes lançar exceção', async () => {
    mockEmitirParaTecnicos.mockImplementationOnce(() => { throw new Error('Socket error'); });

    await expect(
      processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ABERTO')))
    ).resolves.not.toThrow();
  });
});

describe('processarMensagemNotificacao() — salvarNotificacoes', () => {
  it('deve chamar insertMany com um documento por destinatário', async () => {
    const evento = buildEvento('CHAMADO_ABERTO', {
      destinatarios: [
        buildDestinatario({ id: 'u1', email: 'u1@x.com' }),
        buildDestinatario({ id: 'u2', email: 'u2@x.com' }),
      ],
    });

    await processarMensagemNotificacao(buildKafkaPayload(evento));

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs).toHaveLength(2);
  });

  it('deve incluir destinatarioId e destinatarioEmail em cada documento', async () => {
    const dest = buildDestinatario({ id: 'tecnico-99', email: 'tec@emp.com' });
    await processarMensagemNotificacao(
      buildKafkaPayload(buildEvento('CHAMADO_ATRIBUIDO', { destinatarios: [dest] }))
    );

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0].destinatarioId).toBe('tecnico-99');
    expect(docs[0].destinatarioEmail).toBe('tec@emp.com');
  });

  it('deve salvar com lida=false', async () => {
    await processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ABERTO')));

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0].lida).toBe(false);
  });

  it('deve persistir chamadoId e chamadoOS corretamente', async () => {
    const evento = buildEvento('CHAMADO_ABERTO', { chamadoId: 'ch-XYZ', chamadoOS: 'OS-9999' });

    await processarMensagemNotificacao(buildKafkaPayload(evento));

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0].chamadoId).toBe('ch-XYZ');
    expect(docs[0].chamadoOS).toBe('OS-9999');
  });

  it('deve incluir criadoEm como instância de Date', async () => {
    await processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ABERTO')));

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0].criadoEm).toBeInstanceOf(Date);
  });
});

describe('processarMensagemNotificacao() — enviarEmails', () => {
  it('deve enviar um email por destinatário', async () => {
    const evento = buildEvento('CHAMADO_ATRIBUIDO', {
      destinatarios: [
        buildDestinatario({ id: 'u1', email: 'a@x.com' }),
        buildDestinatario({ id: 'u2', email: 'b@x.com' }),
      ],
    });

    await processarMensagemNotificacao(buildKafkaPayload(evento));

    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it('deve usar o email do destinatário como campo "to"', async () => {
    await processarMensagemNotificacao(
      buildKafkaPayload(buildEvento('CHAMADO_ATRIBUIDO', {
        destinatarios: [buildDestinatario({ email: 'dest@teste.com' })],
      }))
    );

    expect(mockSendMail.mock.calls[0][0].to).toBe('dest@teste.com');
  });

  it('deve usar SMTP_FROM do env quando definido', async () => {
    process.env.SMTP_FROM = 'custom@empresa.com';

    await processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ATRIBUIDO')));

    expect(mockSendMail.mock.calls[0][0].from).toBe('custom@empresa.com');
    delete process.env.SMTP_FROM;
  });

  it('deve usar from padrão quando SMTP_FROM não estiver definido', async () => {
    delete process.env.SMTP_FROM;

    await processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ATRIBUIDO')));

    expect(mockSendMail.mock.calls[0][0].from).toContain('noreply@helpme.com');
  });

  it('deve usar fallback de texto quando template não existir', async () => {
    existsSyncSpy.mockReturnValue(false);

    await expect(
      processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ATRIBUIDO')))
    ).resolves.not.toThrow();

    // Mesmo sem template, o email deve ser enviado (fallback texto)
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('deve continuar enviando para outros destinatários quando um falhar', async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error('Erro dest 1'))
      .mockResolvedValueOnce({ messageId: 'ok' });

    const evento = buildEvento('CHAMADO_ATRIBUIDO', {
      destinatarios: [
        buildDestinatario({ id: 'u1', email: 'fail@x.com' }),
        buildDestinatario({ id: 'u2', email: 'ok@x.com' }),
      ],
    });

    await expect(processarMensagemNotificacao(buildKafkaPayload(evento))).resolves.not.toThrow();
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});

describe('processarMensagemNotificacao() — emitirSocketNotificacoes', () => {
  it('deve chamar emitirParaTecnicos para CHAMADO_ABERTO', async () => {
    await processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ABERTO')));

    expect(mockEmitirParaTecnicos).toHaveBeenCalledTimes(1);
    expect(mockEmitirParaUsuario).not.toHaveBeenCalled();
  });

  it.each([
    'CHAMADO_ATRIBUIDO',
    'CHAMADO_TRANSFERIDO',
    'CHAMADO_REABERTO',
    'PRIORIDADE_ALTERADA',
    'SLA_VENCENDO',
    'CHAMADO_ENCERRADO',
  ] as TipoEvento[])('deve chamar emitirParaUsuario (não emitirParaTecnicos) para tipo %s', async (tipo) => {
    await processarMensagemNotificacao(buildKafkaPayload(buildEvento(tipo)));

    expect(mockEmitirParaUsuario).toHaveBeenCalledTimes(1);
    expect(mockEmitirParaTecnicos).not.toHaveBeenCalled();
  });

  it('deve chamar emitirParaUsuario uma vez por destinatário', async () => {
    const evento = buildEvento('CHAMADO_ATRIBUIDO', {
      destinatarios: [
        buildDestinatario({ id: 'u1' }),
        buildDestinatario({ id: 'u2' }),
        buildDestinatario({ id: 'u3' }),
      ],
    });

    await processarMensagemNotificacao(buildKafkaPayload(evento));

    expect(mockEmitirParaUsuario).toHaveBeenCalledTimes(3);
  });

  it('deve incluir tipo, chamadoId e chamadoOS no payload do socket', async () => {
    const evento = buildEvento('CHAMADO_ENCERRADO', {
      chamadoId: 'ch-42',
      chamadoOS: 'OS-0042',
    });

    await processarMensagemNotificacao(buildKafkaPayload(evento));

    const [, , socketPayload] = mockEmitirParaUsuario.mock.calls[0];
    expect(socketPayload.tipo).toBe('CHAMADO_ENCERRADO');
    expect(socketPayload.chamadoId).toBe('ch-42');
    expect(socketPayload.chamadoOS).toBe('OS-0042');
  });

  it('deve incluir titulo e mensagem no payload do socket', async () => {
    await processarMensagemNotificacao(buildKafkaPayload(buildEvento('CHAMADO_ENCERRADO')));

    const [, , socketPayload] = mockEmitirParaUsuario.mock.calls[0];
    expect(socketPayload.titulo).toBeDefined();
    expect(socketPayload.mensagem).toBeDefined();
  });
});

describe('startNotificacaoConsumer()', () => {
  it('deve conectar, inscrever e iniciar o consumer', async () => {
    await startNotificacaoConsumer();

    expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
    expect(mockConsumerSubscribe).toHaveBeenCalledWith({
      topic: 'helpme.notificacoes',
      fromBeginning: false,
    });
    expect(mockConsumerRun).toHaveBeenCalledWith({
      eachMessage: processarMensagemNotificacao,
    });
  });

  it('deve marcar isRunning como true após iniciar', async () => {
    await startNotificacaoConsumer();

    expect(isNotificacaoConsumerRunning()).toBe(true);
  });

  it('não deve reiniciar quando já estiver em execução', async () => {
    await startNotificacaoConsumer();
    await startNotificacaoConsumer();

    expect(mockConsumerConnect).toHaveBeenCalledTimes(1);
  });

  it('deve propagar erro quando connect falhar', async () => {
    mockConsumerConnect.mockRejectedValueOnce(new Error('Kafka indisponível'));

    await expect(startNotificacaoConsumer()).rejects.toThrow('Kafka indisponível');
  });

  it('deve resetar estado quando connect falhar', async () => {
    mockConsumerConnect.mockRejectedValueOnce(new Error('Timeout'));

    try { await startNotificacaoConsumer(); } catch { /* esperado */ }

    expect(isNotificacaoConsumerRunning()).toBe(false);
  });

  it('deve propagar erro quando subscribe falhar', async () => {
    mockConsumerSubscribe.mockRejectedValueOnce(new Error('Topic não existe'));

    await expect(startNotificacaoConsumer()).rejects.toThrow('Topic não existe');
  });
});

describe('stopNotificacaoConsumer()', () => {
  it('deve parar e desconectar o consumer', async () => {
    await startNotificacaoConsumer();
    await stopNotificacaoConsumer();

    expect(mockConsumerStop).toHaveBeenCalledTimes(1);
    expect(mockConsumerDisconnect).toHaveBeenCalledTimes(1);
  });

  it('deve marcar isRunning como false após parar', async () => {
    await startNotificacaoConsumer();
    await stopNotificacaoConsumer();

    expect(isNotificacaoConsumerRunning()).toBe(false);
  });

  it('não deve fazer nada se o consumer não estiver em execução', async () => {
    await stopNotificacaoConsumer();

    expect(mockConsumerStop).not.toHaveBeenCalled();
    expect(mockConsumerDisconnect).not.toHaveBeenCalled();
  });

  it('deve resetar estado mesmo quando stop lançar erro (finally)', async () => {
    await startNotificacaoConsumer();
    mockConsumerStop.mockRejectedValueOnce(new Error('Erro ao parar'));

    await stopNotificacaoConsumer(); // não deve propagar

    expect(isNotificacaoConsumerRunning()).toBe(false);
  });

  it('deve permitir restart após stop', async () => {
    await startNotificacaoConsumer();
    await stopNotificacaoConsumer();
    await startNotificacaoConsumer();

    expect(isNotificacaoConsumerRunning()).toBe(true);
    expect(mockConsumerConnect).toHaveBeenCalledTimes(2);
  });
});

describe('isNotificacaoConsumerRunning()', () => {
  it('deve retornar false antes de iniciar', () => {
    expect(isNotificacaoConsumerRunning()).toBe(false);
  });

  it('deve retornar true após iniciar', async () => {
    await startNotificacaoConsumer();
    expect(isNotificacaoConsumerRunning()).toBe(true);
  });

  it('deve retornar false após parar', async () => {
    await startNotificacaoConsumer();
    await stopNotificacaoConsumer();
    expect(isNotificacaoConsumerRunning()).toBe(false);
  });
});