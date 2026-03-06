import { producer } from '../client';

export async function publicaEventoChamado(payload: any) {
  await producer.send({
    topic: 'chamado-status',
    messages: [
      { value: JSON.stringify(payload) }
    ],
  });
}