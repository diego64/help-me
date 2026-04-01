import { Router } from 'express';
import {
  conectarKafkaProducer,
  desconectarKafkaProducer,
  isKafkaConnected,
  sendMessage,
  getKafkaConfig
} from '@infrastructure/messaging/kafka/client';
import { authMiddleware, authorizeRoles } from '@infrastructure/http/middlewares/auth';
import { logger } from '@shared/config/logger';

export const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Kafka
 *   description: Gerenciamento e monitoramento do Kafka Producer
 */

/**
 * @swagger
 * /api/kafka/status:
 *   get:
 *     summary: Verifica o status da conexão com o Kafka
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status do Kafka retornado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
router.get('/status', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req, res) => {
  try {
    res.json({ connected: isKafkaConnected(), config: getKafkaConfig() });
  } catch (error: unknown) {
    logger.error({ error }, '[KAFKA] Erro ao verificar status');
    res.status(500).json({ error: 'Erro ao verificar status do Kafka' });
  }
});

/**
 * @swagger
 * /api/kafka/connect:
 *   post:
 *     summary: Conecta ao Kafka Producer
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conexão estabelecida com sucesso
 *       500:
 *         description: Falha ao conectar
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
router.post('/connect', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    await conectarKafkaProducer();
    const connected = isKafkaConnected();
    res.json({
      message:   connected ? 'Kafka Producer conectado com sucesso' : 'Falha ao conectar ao Kafka - funcionando sem Kafka',
      connected,
    });
  } catch (error: unknown) {
    logger.error({ error }, '[KAFKA] Erro ao conectar');
    res.status(500).json({ message: 'Erro ao conectar ao Kafka', connected: false });
  }
});

/**
 * @swagger
 * /api/kafka/disconnect:
 *   post:
 *     summary: Desconecta do Kafka Producer
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Desconexão realizada com sucesso
 *       500:
 *         description: Erro ao desconectar
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
router.post('/disconnect', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    await desconectarKafkaProducer();
    res.json({ message: 'Kafka Producer desconectado com sucesso', connected: false });
  } catch (error: unknown) {
    logger.error({ error }, '[KAFKA] Erro ao desconectar');
    res.status(500).json({ error: 'Erro ao desconectar do Kafka' });
  }
});

/**
 * @swagger
 * /api/kafka/send:
 *   post:
 *     summary: Envia mensagens para um tópico Kafka
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topic, messages]
 *             properties:
 *               topic:
 *                 type: string
 *               messages:
 *                 type: array
 *     responses:
 *       200:
 *         description: Mensagens enviadas com sucesso
 *       400:
 *         description: Dados inválidos
 *       503:
 *         description: Kafka não está conectado
 *       500:
 *         description: Erro ao enviar mensagem
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
router.post('/send', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req, res) => {
  try {
    const { topic, messages } = req.body;

    if (!topic)                  return res.status(400).json({ error: 'Topic é obrigatório' });
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'Messages deve ser um array' });

    if (!isKafkaConnected()) {
      return res.status(503).json({ error: 'Kafka não conectado - mensagem não enviada', topic });
    }

    await sendMessage(topic, messages);

    res.json({ message: 'Mensagens enviadas com sucesso', topic, messageCount: messages.length });
  } catch (error: unknown) {
    logger.error({ error }, '[KAFKA] Erro ao enviar mensagem');
    res.status(500).json({
      error:   'Erro ao enviar mensagem ao Kafka',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * @swagger
 * /api/kafka/config:
 *   get:
 *     summary: Obtém a configuração atual do Kafka
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuração retornada com sucesso
 *       404:
 *         description: Kafka não configurado
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
router.get('/config', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const config = getKafkaConfig();
    if (!config) return res.status(404).json({ error: 'Kafka não configurado', message: 'KAFKA_BROKER_URL não está definida' });
    res.json(config);
  } catch (error: unknown) {
    logger.error({ error }, '[KAFKA] Erro ao obter configuração');
    res.status(500).json({ error: 'Erro ao obter configuração do Kafka' });
  }
});

export default router;