import { Router, Request, Response } from 'express';
import { producer } from '../services/kafka';

const router = Router();

router.post('/chamado-teste', async (req: Request, res: Response) => {
  const {
    status = 'ENCERRADO',
    nomeUsuario = 'Usuário Teste',
    emailUsuario = 'teste@mailtrap.io',
    assunto = 'Chamado Encerrado',
    id = '123',
    dataAbertura = new Date().toLocaleString('pt-BR'),
    dataEncerramento = ''
  } = req.body;

  try {
    await producer.send({
      topic: 'chamado-status',
      messages: [
        {
          value: JSON.stringify({
            status,
            nomeUsuario,
            emailUsuario,
            assunto,
            id,
            dataAbertura,
            dataEncerramento
          })
        }
      ]
    });

    res.json({ ok: true, mensagem: 'Evento do chamado enviado para Kafka!' });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao enviar evento', details: err });
  }
});

export default router;