import {
  Router,
  Request,
  Response
} from 'express';
import { ChamadoStatus } from '@prisma/client';
import { producer } from '../services/kafka';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

export const router: Router = Router();

const KAFKA_TOPIC_CHAMADO = 'chamado-status';
const KAFKA_TIMEOUT = 5000; // 5 segundos
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EventoChamado {
  status: ChamadoStatus;
  nomeUsuario: string;
  emailUsuario: string;
  assunto: string;
  id: string;
  OS?: string;
  descricao?: string;
  dataAbertura: string;
  dataEncerramento?: string;
  tecnicoNome?: string;
  tecnicoEmail?: string;
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
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function enviarEventoKafka(
  evento: EventoChamado,
  tentativas = 3
): Promise<void> {
  let ultimoErro: Error | null = null;

  for (let i = 0; i < tentativas; i++) {
    try {
      await producer.send({
        topic: KAFKA_TOPIC_CHAMADO,
        messages: [
          {
            key: evento.id, // Particiona por ID do chamado
            value: JSON.stringify(evento),
            headers: {
              'event-type': 'chamado-status',
              'event-version': '1.0',
              'timestamp': Date.now().toString(),
            },
          },
        ],
        timeout: KAFKA_TIMEOUT,
      });

      return; // Sucesso
    } catch (err) {
      ultimoErro = err as Error;
      console.error(`[KAFKA SEND ERROR] Tentativa ${i + 1}/${tentativas}:`, err);

      // Aguarda antes de tentar novamente (exponential backoff)
      if (i < tentativas - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  throw ultimoErro || new Error('Falha ao enviar evento após múltiplas tentativas');
}

/**
 * @swagger
 * tags:
 *   name: Kafka
 *   description: Endpoints de integração e teste com Apache Kafka
 */

// ========================================
// ENVIAR EVENTO DE TESTE
// ========================================

/**
 * @swagger
 * /api/kafka/chamado-teste:
 *   post:
 *     summary: Envia um evento de teste para o Kafka
 *     description: Publica um evento de chamado no tópico 'chamado-status' do Kafka para fins de teste e desenvolvimento. Útil para validar a integração com o sistema de mensageria e o fluxo de notificações por email. Requer autenticação e perfil ADMIN.
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
 *               OS:
 *                 type: string
 *                 default: "INC0001"
 *                 description: Número da OS
 *               descricao:
 *                 type: string
 *                 description: Descrição do chamado
 *               dataAbertura:
 *                 type: string
 *                 description: Data de abertura (formato ISO ou pt-BR)
 *               dataEncerramento:
 *                 type: string
 *                 description: Data de encerramento (opcional)
 *               tecnicoNome:
 *                 type: string
 *                 description: Nome do técnico (opcional)
 *               tecnicoEmail:
 *                 type: string
 *                 format: email
 *                 description: Email do técnico (opcional)
 *     responses:
 *       200:
 *         description: Evento enviado com sucesso para o Kafka
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Evento enviado com sucesso para Kafka
 *                 evento:
 *                   type: object
 *                   description: Dados do evento enviado
 *       400:
 *         description: Dados inválidos (email, status, etc)
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer ADMIN)
 *       500:
 *         description: Falha ao enviar evento para o Kafka
 */
router.post(
  '/chamado-teste',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        status = ChamadoStatus.ENCERRADO,
        nomeUsuario = 'Usuário Teste',
        emailUsuario = 'teste@mailtrap.io',
        assunto = 'Chamado Encerrado',
        id = '123',
        OS = 'INC0001',
        descricao,
        dataAbertura,
        dataEncerramento,
        tecnicoNome,
        tecnicoEmail,
      } = req.body;

      if (!validarStatus(status)) {
        return res.status(400).json({
          error: 'Status inválido',
          statusValidos: Object.values(ChamadoStatus),
        });
      }

      if (!validarEmail(emailUsuario)) {
        return res.status(400).json({
          error: 'Email do usuário inválido',
        });
      }

      if (tecnicoEmail && !validarEmail(tecnicoEmail)) {
        return res.status(400).json({
          error: 'Email do técnico inválido',
        });
      }

      if (!id || !nomeUsuario || !assunto) {
        return res.status(400).json({
          error: 'Campos obrigatórios: id, nomeUsuario, assunto',
        });
      }

      const agora = new Date();
      const evento: EventoChamado = {
        status,
        nomeUsuario,
        emailUsuario,
        assunto,
        id,
        OS,
        descricao,
        dataAbertura: dataAbertura || formatarDataBR(agora),
        dataEncerramento: dataEncerramento || undefined,
        tecnicoNome,
        tecnicoEmail,
      };

      await enviarEventoKafka(evento);

      console.log('[KAFKA EVENT SENT]', {
        topic: KAFKA_TOPIC_CHAMADO,
        id: evento.id,
        status: evento.status,
      });

      res.json({
        success: true,
        message: 'Evento enviado com sucesso para Kafka',
        evento: {
          id: evento.id,
          OS: evento.OS,
          status: evento.status,
          topic: KAFKA_TOPIC_CHAMADO,
        },
      });
    } catch (err: any) {
      console.error('[KAFKA TEST ERROR]', err);

      res.status(500).json({
        error: 'Falha ao enviar evento para Kafka',
        message: err.message,
      });
    }
  }
);

// ========================================
// ENVIAR EVENTO REAL (A PARTIR DO CHAMADO)
// ========================================

/**
 * @swagger
 * /api/kafka/chamado/{id}/notificar:
 *   post:
 *     summary: Envia notificação de um chamado real para o Kafka
 *     description: Publica um evento de status de um chamado existente no sistema para o Kafka. Útil para reenviar notificações ou forçar processamento. Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do chamado
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assunto:
 *                 type: string
 *                 description: Assunto customizado (opcional)
 *     responses:
 *       200:
 *         description: Evento enviado com sucesso
 *       400:
 *         description: Chamado não encontrado ou inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Falha ao enviar evento
 */
router.post(
  '/chamado/:id/notificar',
  authMiddleware,
  authorizeRoles('ADMIN', 'TECNICO'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { assunto } = req.body;

      const { prisma } = await import('../lib/prisma');

      const chamado = await prisma.chamado.findUnique({
        where: { id },
        include: {
          usuario: {
            select: {
              nome: true,
              sobrenome: true,
              email: true,
            },
          },
          tecnico: {
            select: {
              nome: true,
              sobrenome: true,
              email: true,
            },
          },
        },
      });

      if (!chamado) {
        return res.status(404).json({
          error: 'Chamado não encontrado',
        });
      }

      // Preparar evento
      const evento: EventoChamado = {
        status: chamado.status,
        nomeUsuario: `${chamado.usuario.nome} ${chamado.usuario.sobrenome}`,
        emailUsuario: chamado.usuario.email,
        assunto: assunto || `Chamado ${chamado.OS} - ${chamado.status}`,
        id: chamado.id,
        OS: chamado.OS,
        descricao: chamado.descricao,
        dataAbertura: formatarDataBR(chamado.geradoEm),
        dataEncerramento: chamado.encerradoEm
          ? formatarDataBR(chamado.encerradoEm)
          : undefined,
        tecnicoNome: chamado.tecnico
          ? `${chamado.tecnico.nome} ${chamado.tecnico.sobrenome}`
          : undefined,
        tecnicoEmail: chamado.tecnico?.email,
      };

      await enviarEventoKafka(evento);

      console.log('[KAFKA NOTIFICATION SENT]', {
        chamadoId: chamado.id,
        OS: chamado.OS,
        status: chamado.status,
      });

      res.json({
        success: true,
        message: 'Notificação enviada com sucesso',
        chamado: {
          id: chamado.id,
          OS: chamado.OS,
          status: chamado.status,
        },
      });
    } catch (err: any) {
      console.error('[KAFKA NOTIFICATION ERROR]', err);

      res.status(500).json({
        error: 'Falha ao enviar notificação',
        message: err.message,
      });
    }
  }
);

// ========================================
// HEALTH CHECK DO KAFKA
// ========================================

/**
 * @swagger
 * /api/kafka/health:
 *   get:
 *     summary: Verifica a saúde da conexão com Kafka
 *     description: Retorna o status da conexão com o Kafka e informações sobre o producer. Útil para monitoramento e troubleshooting.
 *     tags: [Kafka]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kafka está saudável
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 connected:
 *                   type: boolean
 *                   example: true
 *                 topic:
 *                   type: string
 *                   example: chamado-status
 *       503:
 *         description: Kafka não está acessível
 */
router.get(
  '/health',
  authMiddleware,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      // Tenta enviar um evento de teste vazio para verificar conexão
      await producer.send({
        topic: KAFKA_TOPIC_CHAMADO,
        messages: [
          {
            key: 'health-check',
            value: JSON.stringify({
              type: 'health-check',
              timestamp: Date.now(),
            }),
          },
        ],
        timeout: 3000,
      });

      res.json({
        status: 'healthy',
        connected: true,
        topic: KAFKA_TOPIC_CHAMADO,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[KAFKA HEALTH ERROR]', err);

      res.status(503).json({
        status: 'unhealthy',
        connected: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;