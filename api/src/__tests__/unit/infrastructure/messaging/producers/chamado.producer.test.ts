import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue(undefined);
  return { mockSend };
});

vi.mock('@infrastructure/messaging/kafka/client', () => ({
  producer: { send: mockSend },
}));

import { publicaEventoChamado } from '@infrastructure/messaging/kafka/producers/chamado.producer';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publicaEventoChamado()', () => {
  it('deve chamar producer.send uma vez', async () => {
    await publicaEventoChamado({ id: '1', status: 'ABERTO' });

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('deve publicar no tópico chamado-status', async () => {
    await publicaEventoChamado({ id: '1', status: 'ABERTO' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'chamado-status' })
    );
  });

  it('deve serializar o payload como JSON na mensagem', async () => {
    const payload = { id: '42', status: 'ENCERRADO' };

    await publicaEventoChamado(payload);

    const { messages } = mockSend.mock.calls[0][0];
    expect(messages[0].value).toBe(JSON.stringify(payload));
  });

  it('deve enviar exatamente uma mensagem por chamada', async () => {
    await publicaEventoChamado({ id: '1' });

    const { messages } = mockSend.mock.calls[0][0];
    expect(messages).toHaveLength(1);
  });

  it('deve propagar erro quando producer.send falhar', async () => {
    mockSend.mockRejectedValueOnce(new Error('Kafka indisponível'));

    await expect(publicaEventoChamado({ id: '1' })).rejects.toThrow('Kafka indisponível');
  });
});