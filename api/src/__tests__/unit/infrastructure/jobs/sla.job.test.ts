import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockExecutarChecagemSLA, mockSchedule, mockValidate, mockTask } = vi.hoisted(() => {
  const mockTask      = { stop: vi.fn(), start: vi.fn() };
  const mockSchedule  = vi.fn().mockReturnValue(mockTask);
  const mockValidate  = vi.fn().mockReturnValue(true);
  const mockExecutarChecagemSLA = vi.fn().mockResolvedValue(undefined);
  return { mockExecutarChecagemSLA, mockSchedule, mockValidate, mockTask };
});

vi.mock('node-cron', () => {
  const mod = { schedule: mockSchedule, validate: mockValidate };
  return { default: mod, ...mod };
});

vi.mock('../../../../domain/jobs/sla-checker.job', () => ({
  executarChecagemSLA: mockExecutarChecagemSLA,
}));

import { iniciarSLAJob } from '../../../../domain/jobs/sla.job';

beforeEach(() => {
  vi.clearAllMocks();
  mockValidate.mockReturnValue(true);
  mockSchedule.mockReturnValue(mockTask);
});

describe('iniciarSLAJob()', () => {

  describe('validação da expressão cron', () => {
    it('deve chamar cron.validate com a expressão correta', () => {
      iniciarSLAJob();

      expect(mockValidate).toHaveBeenCalledWith('*/5 8-18 * * 1-5');
    });

    it('deve lançar erro quando a expressão cron for inválida', () => {
      mockValidate.mockReturnValueOnce(false);

      expect(() => iniciarSLAJob()).toThrow('Expressão cron inválida');
    });
  });

  describe('agendamento', () => {
    it('deve chamar cron.schedule uma vez', () => {
      iniciarSLAJob();

      expect(mockSchedule).toHaveBeenCalledTimes(1);
    });

    it('deve agendar com a expressão cron correta', () => {
      iniciarSLAJob();

      const [expressao] = mockSchedule.mock.calls[0];
      expect(expressao).toBe('*/5 8-18 * * 1-5');
    });

    it('deve retornar a ScheduledTask criada pelo cron', () => {
      const task = iniciarSLAJob();

      expect(task).toBeDefined();
      expect(task).toBe(mockTask);
    });
  });

  describe('callback agendado — executarChecagemSLA', () => {
    it('deve chamar executarChecagemSLA quando o callback for disparado', async () => {
      iniciarSLAJob();

      const callback = mockSchedule.mock.calls[0][1];
      await callback();

      expect(mockExecutarChecagemSLA).toHaveBeenCalledTimes(1);
    });

    it('não deve propagar erro quando executarChecagemSLA lançar exceção', async () => {
      mockExecutarChecagemSLA.mockRejectedValueOnce(new Error('DB offline'));

      iniciarSLAJob();
      const callback = mockSchedule.mock.calls[0][1];

      await expect(callback()).resolves.not.toThrow();
    });

    it('deve continuar funcionando após um erro', async () => {
      mockExecutarChecagemSLA
        .mockRejectedValueOnce(new Error('Falha temporária'))
        .mockResolvedValueOnce(undefined);

      iniciarSLAJob();
      const callback = mockSchedule.mock.calls[0][1];

      await callback(); // falha — não deve lançar
      await callback(); // sucesso

      expect(mockExecutarChecagemSLA).toHaveBeenCalledTimes(2);
    });
  });
});