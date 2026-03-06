import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockFindMany, mockPublicarSLAVencendo } = vi.hoisted(() => {
  const mockFindMany = vi.fn().mockResolvedValue([]);
  const mockPublicarSLAVencendo = vi.fn().mockResolvedValue(undefined);
  return { mockFindMany, mockPublicarSLAVencendo };
});

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: { chamado: { findMany: mockFindMany } },
}));

vi.mock('@infrastructure/messaging/kafka/producers/notificacao.producer', () => ({
  publicarSLAVencendo: mockPublicarSLAVencendo,
}));

vi.mock('@shared/config/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { verificarSLAVencendo, startSLAJob } from '@infrastructure/jobs/sla.job';

function buildChamado(horasAtras: number, overrides: Record<string, any> = {}) {
  return {
    id:        'ch-001',
    OS:        'OS-2024-001',
    prioridade: 'ALTA',
    geradoEm:  new Date(Date.now() - horasAtras * 60 * 60 * 1000),
    tecnico: {
      id:    'tec-1',
      email: 'tec@emp.com',
      nome:  'Carlos',
      nivel: 'N2',
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('verificarSLAVencendo() — query Prisma', () => {
  it('deve chamar prisma.chamado.findMany uma vez', async () => {
    await verificarSLAVencendo();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it.todo('deve filtrar somente status ABERTO e EM_ATENDIMENTO', async () => {
    await verificarSLAVencendo();

    const { where } = mockFindMany.mock.calls[0][0];
    expect(where.status).toEqual({ in: ['ABERTO', 'EM_ATENDIMENTO'] });
  });

  it('deve filtrar somente chamados com tecnicoId não nulo', async () => {
    await verificarSLAVencendo();

    const { where } = mockFindMany.mock.calls[0][0];
    expect(where.tecnicoId).toEqual({ not: null });
  });

  it('deve filtrar somente chamados não deletados', async () => {
    await verificarSLAVencendo();

    const { where } = mockFindMany.mock.calls[0][0];
    expect(where.deletadoEm).toBeNull();
  });

  it('deve definir janela de alerta entre 20h e 24h atrás', async () => {
    const agora = new Date('2024-06-01T12:00:00Z').getTime();
    vi.setSystemTime(agora);

    await verificarSLAVencendo();

    const { where } = mockFindMany.mock.calls[0][0];
    const esperadoLte = new Date(agora - 20 * 60 * 60 * 1000);
    const esperadoGte = new Date(agora - 24 * 60 * 60 * 1000);

    expect(where.geradoEm.lte.getTime()).toBeCloseTo(esperadoLte.getTime(), -3);
    expect(where.geradoEm.gte.getTime()).toBeCloseTo(esperadoGte.getTime(), -3);
  });

  it('deve selecionar os campos corretos do chamado e do técnico', async () => {
    await verificarSLAVencendo();

    const { select } = mockFindMany.mock.calls[0][0];
    expect(select).toMatchObject({
      id: true, OS: true, prioridade: true, geradoEm: true,
      tecnico: { select: { id: true, email: true, nome: true, nivel: true } },
    });
  });
});

describe('verificarSLAVencendo() — publicação de eventos', () => {
  it('não deve publicar quando não há chamados em alerta', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await verificarSLAVencendo();

    expect(mockPublicarSLAVencendo).not.toHaveBeenCalled();
  });

  it('deve publicar uma vez por chamado', async () => {
    mockFindMany.mockResolvedValueOnce([
      buildChamado(21, { id: 'ch-1' }),
      buildChamado(22, { id: 'ch-2' }),
      buildChamado(23, { id: 'ch-3' }),
    ]);

    await verificarSLAVencendo();

    expect(mockPublicarSLAVencendo).toHaveBeenCalledTimes(3);
  });

  it('deve publicar com chamadoId, chamadoOS e prioridade corretos', async () => {
    mockFindMany.mockResolvedValueOnce([
      buildChamado(21, { id: 'ch-XYZ', OS: 'OS-9999', prioridade: 'CRITICA' }),
    ]);

    await verificarSLAVencendo();

    expect(mockPublicarSLAVencendo).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId:  'ch-XYZ',
        chamadoOS:  'OS-9999',
        prioridade: 'CRITICA',
      })
    );
  });

  it('deve calcular horasAberto corretamente', async () => {
    const agora = new Date('2024-06-01T12:00:00Z').getTime();
    vi.setSystemTime(agora);

    mockFindMany.mockResolvedValueOnce([buildChamado(22)]);

    await verificarSLAVencendo();

    const { horasAberto } = mockPublicarSLAVencendo.mock.calls[0][0];
    expect(horasAberto).toBe(22);
  });

  it('deve publicar com os dados do técnico corretos', async () => {
    mockFindMany.mockResolvedValueOnce([buildChamado(21)]);

    await verificarSLAVencendo();

    expect(mockPublicarSLAVencendo).toHaveBeenCalledWith(
      expect.objectContaining({
        tecnico: {
          id:    'tec-1',
          email: 'tec@emp.com',
          nome:  'Carlos',
          nivel: 'N2',
        },
      })
    );
  });

  it('não deve publicar para chamado sem técnico', async () => {
    mockFindMany.mockResolvedValueOnce([
      buildChamado(21, { tecnico: null }),
    ]);

    await verificarSLAVencendo();

    expect(mockPublicarSLAVencendo).not.toHaveBeenCalled();
  });

  it('deve continuar processando outros chamados quando um falhar', async () => {
    mockPublicarSLAVencendo
      .mockRejectedValueOnce(new Error('Kafka down'))
      .mockResolvedValueOnce(undefined);

    mockFindMany.mockResolvedValueOnce([
      buildChamado(21, { id: 'ch-fail' }),
      buildChamado(22, { id: 'ch-ok' }),
    ]);

    await expect(verificarSLAVencendo()).resolves.not.toThrow();
    expect(mockPublicarSLAVencendo).toHaveBeenCalledTimes(2);
  });
});

describe('verificarSLAVencendo() — resiliência', () => {
  it('não deve propagar erro quando findMany falhar', async () => {
    mockFindMany.mockRejectedValueOnce(new Error('Prisma offline'));

    await expect(verificarSLAVencendo()).resolves.not.toThrow();
  });

  it('não deve propagar erro quando publicarSLAVencendo falhar em todos os chamados', async () => {
    mockPublicarSLAVencendo.mockRejectedValue(new Error('Kafka indisponível'));
    mockFindMany.mockResolvedValueOnce([buildChamado(21), buildChamado(22)]);

    await expect(verificarSLAVencendo()).resolves.not.toThrow();
  });
});

describe('startSLAJob()', () => {
  it('deve retornar um NodeJS.Timeout', () => {
    const timer = startSLAJob();

    expect(timer).toBeDefined();
    clearInterval(timer);
  });

  it('deve chamar verificarSLAVencendo imediatamente ao iniciar', async () => {
    const timer = startSLAJob();

    await Promise.resolve();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    clearInterval(timer);
  });

  it('deve executar novamente após 30 minutos', async () => {
    const timer = startSLAJob();
    await Promise.resolve();

    mockFindMany.mockClear();
    vi.advanceTimersByTime(30 * 60 * 1000);
    await Promise.resolve();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    clearInterval(timer);
  });

  it('deve executar a cada 30 minutos repetidamente', async () => {
    const timer = startSLAJob();
    await Promise.resolve();

    mockFindMany.mockClear();
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();
    }

    expect(mockFindMany).toHaveBeenCalledTimes(3);
    clearInterval(timer);
  });
});