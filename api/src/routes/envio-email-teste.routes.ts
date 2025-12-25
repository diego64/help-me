import {
  Router,
  Request,
  Response
} from 'express';
import { producer } from '../services/kafka';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Kafka
 *   description: Endpoints de integração e teste com Apache Kafka
 */

/**
 * @swagger
 * /api/kafka/chamado-teste:
 *   post:
 *     summary: Envia um evento de teste para o Kafka
 *     description: Publica um evento de chamado no tópico 'chamado-status' do Kafka para fins de teste e desenvolvimento. Útil para validar a integração com o sistema de mensageria e o fluxo de notificações por email.
 *     tags: [Kafka]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 default: ENCERRADO
 *                 description: Status do chamado
 *               nomeUsuario:
 *                 type: string
 *                 default: Usuário Teste
 *                 description: Nome do usuário
 *               emailUsuario:
 *                 type: string
 *                 format: email
 *                 default: teste@mailtrap.io
 *                 description: Email do usuário
 *               assunto:
 *                 type: string
 *                 default: Chamado Encerrado
 *                 description: Assunto do email
 *               id:
 *                 type: string
 *                 default: "123"
 *                 description: ID do chamado
 *               dataAbertura:
 *                 type: string
 *                 description: Data de abertura do chamado (formato pt-BR)
 *               dataEncerramento:
 *                 type: string
 *                 description: Data de encerramento do chamado (opcional)
 *     responses:
 *       200:
 *         description: Evento enviado com sucesso para o Kafka
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 mensagem:
 *                   type: string
 *                   example: Evento do chamado enviado para Kafka!
 *       500:
 *         description: Falha ao enviar evento para o Kafka
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Falha ao enviar evento
 *                 details:
 *                   type: object
 *                   description: Detalhes do erro
 */
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