import { Router } from 'express';
import { conectarKafkaProducer, desconectarKafkaProducer, isKafkaConnected, sendMessage, getKafkaConfig } from '@infrastructure/messaging/kafka/client';
import { authMiddleware, authorizeRoles } from '@infrastructure/http/middlewares/auth';

export const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Kafka
 *   description: Gerenciamento e monitoramento do Kafka Producer
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     KafkaConfig:
 *       type: object
 *       properties:
 *         clientId:
 *           type: string
 *           example: helpdesk-api
 *         brokers:
 *           type: array
 *           items:
 *             type: string
 *           example: ["localhost:9093"]
 *         brokerUrl:
 *           type: string
 *           example: localhost:9093
 *     
 *     KafkaStatus:
 *       type: object
 *       properties:
 *         connected:
 *           type: boolean
 *           example: true
 *         config:
 *           $ref: '#/components/schemas/KafkaConfig'
 *     
 *     KafkaMessage:
 *       type: object
 *       properties:
 *         key:
 *           type: string
 *           description: Chave opcional para particionamento
 *           example: user-123
 *         value:
 *           type: string
 *           description: Conteúdo da mensagem (geralmente JSON stringificado)
 *           example: '{"event":"user.created","userId":"123"}'
 *         headers:
 *           type: object
 *           description: Headers opcionais da mensagem
 *           additionalProperties:
 *             type: string
 *           example:
 *             correlation-id: abc-123
 *             event-type: user.created
 *     
 *     SendMessageRequest:
 *       type: object
 *       required:
 *         - topic
 *         - messages
 *       properties:
 *         topic:
 *           type: string
 *           description: Nome do tópico Kafka
 *           example: chamados-events
 *         messages:
 *           type: array
 *           description: Array de mensagens a serem enviadas
 *           items:
 *             $ref: '#/components/schemas/KafkaMessage'
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Erro ao processar requisição
 */

/**
 * @swagger
 * /api/kafka/status:
 *   get:
 *     summary: Verifica o status da conexão com o Kafka
 *     description: Retorna informações sobre o estado atual da conexão com o Kafka Producer e sua configuração
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status do Kafka retornado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KafkaStatus'
 *             examples:
 *               conectado:
 *                 summary: Kafka conectado
 *                 value:
 *                   connected: true
 *                   config:
 *                     clientId: helpdesk-api
 *                     brokers: ["localhost:9093"]
 *                     brokerUrl: localhost:9093
 *               desconectado:
 *                 summary: Kafka desconectado
 *                 value:
 *                   connected: false
 *                   config: null
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou TECNICO)
 */
router.get('/status', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req, res) => {
  try {
    const connected = isKafkaConnected();
    const config = getKafkaConfig();
    
    res.json({
      connected,
      config
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar status do Kafka' });
  }
});

/**
 * @swagger
 * /api/kafka/connect:
 *   post:
 *     summary: Conecta ao Kafka Producer
 *     description: Estabelece conexão com o Kafka broker. Se a conexão falhar, a API continuará funcionando sem Kafka
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conexão estabelecida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Kafka Producer conectado com sucesso
 *                 connected:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Falha ao conectar (mas a API continua funcionando)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Falha ao conectar ao Kafka - funcionando sem Kafka
 *                 connected:
 *                   type: boolean
 *                   example: false
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.post('/connect', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    await conectarKafkaProducer();
    const connected = isKafkaConnected();
    
    res.json({
      message: connected 
        ? 'Kafka Producer conectado com sucesso' 
        : 'Falha ao conectar ao Kafka - funcionando sem Kafka',
      connected
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao conectar ao Kafka',
      connected: false 
    });
  }
});

/**
 * @swagger
 * /api/kafka/disconnect:
 *   post:
 *     summary: Desconecta do Kafka Producer
 *     description: Encerra a conexão com o Kafka broker de forma segura
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Desconexão realizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Kafka Producer desconectado com sucesso
 *                 connected:
 *                   type: boolean
 *                   example: false
 *       500:
 *         description: Erro ao desconectar
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.post('/disconnect', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    await desconectarKafkaProducer();
    
    res.json({
      message: 'Kafka Producer desconectado com sucesso',
      connected: false
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao desconectar do Kafka' });
  }
});

/**
 * @swagger
 * /api/kafka/send:
 *   post:
 *     summary: Envia mensagens para um tópico Kafka
 *     description: |
 *       Envia uma ou mais mensagens para um tópico específico do Kafka.
 *       
 *       **Observações importantes:**
 *       - O Kafka deve estar conectado antes de enviar mensagens
 *       - Se não estiver conectado, a mensagem será descartada com um warning
 *       - Mensagens podem conter key, value e headers opcionais
 *       - O value geralmente é um JSON stringificado
 *       - Múltiplas mensagens podem ser enviadas em batch
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendMessageRequest'
 *           examples:
 *             mensagem_simples:
 *               summary: Mensagem simples
 *               value:
 *                 topic: chamados-events
 *                 messages:
 *                   - value: '{"event":"chamado.created","chamadoId":"123"}'
 *             
 *             mensagem_com_key:
 *               summary: Mensagem com key (para particionamento)
 *               value:
 *                 topic: users-topic
 *                 messages:
 *                   - key: user-123
 *                     value: '{"event":"user.updated","userId":"123","name":"João Silva"}'
 *             
 *             mensagem_com_headers:
 *               summary: Mensagem com headers
 *               value:
 *                 topic: chamados-events
 *                 messages:
 *                   - key: chamado-456
 *                     value: '{"event":"chamado.assigned","chamadoId":"456","tecnicoId":"789"}'
 *                     headers:
 *                       correlation-id: abc-123-def-456
 *                       event-type: chamado.assigned
 *                       timestamp: '2026-02-09T10:30:00Z'
 *             
 *             multiplas_mensagens:
 *               summary: Múltiplas mensagens em batch
 *               value:
 *                 topic: batch-topic
 *                 messages:
 *                   - value: '{"event":"message-1"}'
 *                   - value: '{"event":"message-2"}'
 *                   - value: '{"event":"message-3"}'
 *             
 *             array_vazio:
 *               summary: Array vazio (válido mas não faz nada)
 *               value:
 *                 topic: empty-topic
 *                 messages: []
 *     responses:
 *       200:
 *         description: Mensagem(ns) enviada(s) com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Mensagens enviadas com sucesso
 *                 topic:
 *                   type: string
 *                   example: chamados-events
 *                 messageCount:
 *                   type: integer
 *                   example: 3
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               topic_ausente:
 *                 summary: Tópico não informado
 *                 value:
 *                   error: Topic é obrigatório
 *               messages_ausente:
 *                 summary: Messages não informado
 *                 value:
 *                   error: Messages deve ser um array
 *       503:
 *         description: Kafka não está conectado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Kafka não conectado - mensagem não enviada
 *                 topic:
 *                   type: string
 *                   example: chamados-events
 *       500:
 *         description: Erro ao enviar mensagem
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Erro ao enviar mensagem ao Kafka
 *                 details:
 *                   type: string
 *                   example: Request timeout
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou TECNICO)
 */
router.post('/send', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req, res) => {
  try {
    const { topic, messages } = req.body;
    
    // Validações
    if (!topic) {
      return res.status(400).json({ error: 'Topic é obrigatório' });
    }
    
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages deve ser um array' });
    }
    
    // Verifica se está conectado
    if (!isKafkaConnected()) {
      return res.status(503).json({ 
        error: 'Kafka não conectado - mensagem não enviada',
        topic 
      });
    }
    
    // Envia mensagens
    await sendMessage(topic, messages);
    
    res.json({
      message: 'Mensagens enviadas com sucesso',
      topic,
      messageCount: messages.length
    });
    
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Erro ao enviar mensagem ao Kafka',
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/kafka/config:
 *   get:
 *     summary: Obtém a configuração atual do Kafka
 *     description: Retorna as configurações do cliente Kafka, incluindo brokers e clientId
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuração retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KafkaConfig'
 *             example:
 *               clientId: helpdesk-api
 *               brokers: ["localhost:9093"]
 *               brokerUrl: localhost:9093
 *       404:
 *         description: Kafka não configurado (KAFKA_BROKER_URL não definida)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Kafka não configurado
 *                 message:
 *                   type: string
 *                   example: KAFKA_BROKER_URL não está definida
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.get('/config', authMiddleware, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const config = getKafkaConfig();
    
    if (!config) {
      return res.status(404).json({ 
        error: 'Kafka não configurado',
        message: 'KAFKA_BROKER_URL não está definida'
      });
    }
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter configuração do Kafka' });
  }
});