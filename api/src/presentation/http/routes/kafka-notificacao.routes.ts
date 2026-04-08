import { Router, Response } from 'express';
import { ChamadoStatus } from '@prisma/client';
import { getStringParamRequired } from '@shared/utils/request-params';
import { prisma } from '@infrastructure/database/prisma/client';
import { producer } from '@infrastructure/messaging/kafka/client';
import { authMiddleware, authorizeRoles, AuthRequest } from '@infrastructure/http/middlewares/auth';
import { logger } from '@shared/config/logger';

export const router: Router = Router();

const KAFKA_TOPIC_CHAMADO = 'chamado-status';
const KAFKA_TIMEOUT       = 5000;
const EMAIL_REGEX         = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EventoChamado {
  status:            ChamadoStatus;
  nomeUsuario:       string;
  emailUsuario:      string;
  assunto:           string;
  id:                string;
  OS?:               string;
  descricao?:        string;
  dataAbertura:      string;
  dataEncerramento?: string;
  tecnicoNome?:      string;
  tecnicoEmail?:     string;
}

function validarEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function validarStatus(status: string): status is ChamadoStatus {
  return Object.values(ChamadoStatus).includes(status as ChamadoStatus);
}

function formatarDataBR(data: Date): string {
  return data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day:      '2-digit',
    month:    '2-digit',
    year:     'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
  });
}

async function enviarEventoKafka(evento: EventoChamado, tentativas = 3): Promise<void> {
  let ultimoErro: Error | null = null;

  for (let i = 0; i < tentativas; i++) {
    try {
      await producer.send({
        topic:    KAFKA_TOPIC_CHAMADO,
        messages: [{
          key:   evento.id,
          value: JSON.stringify(evento),
          headers: {
            'event-type':    'chamado-status',
            'event-version': '1.0',
            'timestamp':     Date.now().toString(),
          },
        }],
        timeout: KAFKA_TIMEOUT,
      });
      return;
    } catch (err: unknown) {
      ultimoErro = err instanceof Error ? err : new Error(String(err));
      logger.error({ err, tentativa: i + 1, tentativas }, '[KAFKA] Falha ao enviar evento');

      if (i < tentativas - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  throw ultimoErro ?? new Error('Falha ao enviar evento após múltiplas tentativas');
}

function handleError(res: Response, err: unknown, mensagem: string) {
  logger.error({ err }, mensagem);
  const message = err instanceof Error ? err.message : 'Erro desconhecido';
  res.status(500).json({ error: mensagem, message });
}

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
 *     description: Publica um evento de chamado no tópico 'chamado-status' para fins de teste e validação da integração.
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ABERTO, EM_ATENDIMENTO, ENCERRADO, CANCELADO, REABERTO]
 *                 default: ENCERRADO
 *               nomeUsuario:
 *                 type: string
 *                 default: Usuário Teste
 *               emailUsuario:
 *                 type: string
 *                 format: email
 *                 default: teste@mailtrap.io
 *               assunto:
 *                 type: string
 *                 default: Chamado Encerrado
 *               id:
 *                 type: string
 *                 default: "123"
 *               OS:
 *                 type: string
 *                 default: "INC0000001"
 *               descricao:
 *                 type: string
 *               dataAbertura:
 *                 type: string
 *               dataEncerramento:
 *                 type: string
 *               tecnicoNome:
 *                 type: string
 *               tecnicoEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Evento enviado com sucesso para o Kafka
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Falha ao enviar evento para o Kafka
 */
router.post('/chamado-teste', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      status        = ChamadoStatus.ENCERRADO,
      nomeUsuario   = 'Usuário Teste',
      emailUsuario  = 'teste@mailtrap.io',
      assunto       = 'Chamado Encerrado',
      id            = '123',
      OS            = 'INC0000001',
      descricao,
      dataAbertura,
      dataEncerramento,
      tecnicoNome,
      tecnicoEmail,
    } = req.body;

    if (!validarStatus(status)) {
      return res.status(400).json({ error: 'Status inválido', statusValidos: Object.values(ChamadoStatus) });
    }
    if (!validarEmail(emailUsuario)) {
      return res.status(400).json({ error: 'Email do usuário inválido' });
    }
    if (tecnicoEmail && !validarEmail(tecnicoEmail)) {
      return res.status(400).json({ error: 'Email do técnico inválido' });
    }
    if (!id || !nomeUsuario || !assunto) {
      return res.status(400).json({ error: 'Campos obrigatórios: id, nomeUsuario, assunto' });
    }

    const evento: EventoChamado = {
      status,
      nomeUsuario,
      emailUsuario,
      assunto,
      id,
      OS,
      descricao,
      dataAbertura:     dataAbertura     || formatarDataBR(new Date()),
      dataEncerramento: dataEncerramento || undefined,
      tecnicoNome,
      tecnicoEmail,
    };

    await enviarEventoKafka(evento);

    logger.info({ topic: KAFKA_TOPIC_CHAMADO, id: evento.id, status: evento.status }, '[KAFKA] Evento de teste enviado');

    res.json({
      success: true,
      message: 'Evento enviado com sucesso para Kafka',
      evento:  { id: evento.id, OS: evento.OS, status: evento.status, topic: KAFKA_TOPIC_CHAMADO },
    });
  } catch (err: unknown) {
    handleError(res, err, 'Falha ao enviar evento para Kafka');
  }
});

/**
 * @swagger
 * /api/kafka/chamado/{id}/notificar:
 *   post:
 *     summary: Envia notificação de um chamado real para o Kafka
 *     description: Publica um evento de status de um chamado existente no sistema. Útil para reenviar notificações.
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assunto:
 *                 type: string
 *     responses:
 *       200:
 *         description: Evento enviado com sucesso
 *       404:
 *         description: Chamado não encontrado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Falha ao enviar evento
 */
router.post('/chamado/:id/notificar', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res: Response) => {
  try {
    const id      = getStringParamRequired(req.params.id);
    const { assunto } = req.body;

    const chamado = await prisma.chamado.findUnique({
      where:   { id },
      include: {
        usuario: { select: { nome: true, sobrenome: true, email: true } },
        tecnico: { select: { nome: true, sobrenome: true, email: true } },
      },
    });

    if (!chamado) return res.status(404).json({ error: 'Chamado não encontrado' });

    const evento: EventoChamado = {
      status:           chamado.status,
      nomeUsuario:      `${chamado.usuario.nome} ${chamado.usuario.sobrenome}`,
      emailUsuario:     chamado.usuario.email,
      assunto:          assunto || `Chamado ${chamado.OS} - ${chamado.status}`,
      id:               chamado.id,
      OS:               chamado.OS,
      descricao:        chamado.descricao,
      dataAbertura:     formatarDataBR(chamado.geradoEm),
      dataEncerramento: chamado.encerradoEm ? formatarDataBR(chamado.encerradoEm) : undefined,
      tecnicoNome:      chamado.tecnico ? `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}` : undefined,
      tecnicoEmail:     chamado.tecnico?.email,
    };

    await enviarEventoKafka(evento);

    logger.info({ chamadoId: chamado.id, OS: chamado.OS, status: chamado.status }, '[KAFKA] Notificação enviada');

    res.json({
      success: true,
      message: 'Notificação enviada com sucesso',
      chamado: { id: chamado.id, OS: chamado.OS, status: chamado.status },
    });
  } catch (err: unknown) {
    handleError(res, err, 'Falha ao enviar notificação');
  }
});

/**
 * @swagger
 * /api/kafka/health:
 *   get:
 *     summary: Verifica a saúde da conexão com Kafka
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kafka está saudável
 *       503:
 *         description: Kafka não está acessível
 */
router.get('/health', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    await producer.send({
      topic:    KAFKA_TOPIC_CHAMADO,
      messages: [{ key: 'health-check', value: JSON.stringify({ type: 'health-check', timestamp: Date.now() }) }],
      timeout:  3000,
    });

    res.json({ status: 'healthy', connected: true, topic: KAFKA_TOPIC_CHAMADO, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    logger.error({ err }, '[KAFKA] Health check falhou');
    res.status(503).json({ status: 'unhealthy', connected: false, error: message, timestamp: new Date().toISOString() });
  }
});

export default router;