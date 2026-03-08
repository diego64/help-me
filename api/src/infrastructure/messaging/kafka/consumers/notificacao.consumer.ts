import { Consumer, EachMessagePayload } from 'kafkajs';
import { logger } from '@shared/config/logger';
import { kafka } from '@infrastructure/messaging/kafka/client';
import { transporter } from '@infrastructure/email/email.service';
import NotificacaoModel, { TipoEvento } from '@infrastructure/database/mongodb/notificacao.model';
import { emitirParaUsuario, emitirParaTecnicos } from '@infrastructure/websocket/socket';
import { EventoNotificacao, TOPICO_NOTIFICACOES } from '../producers/notificacao.producer';
import fs from 'fs';
import handlebars from 'handlebars';
import path from 'path';

let consumerInstance: Consumer | null = null;
let isRunning = false;

function renderTemplate(templateName: string, data: object): string {
  const templatePath = path.resolve(`src/templates/${templateName}.hbs`);

  if (!fs.existsSync(templatePath)) {
    logger.warn({ templatePath }, 'Template não encontrado — usando fallback texto');
    return Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  const templateStr = fs.readFileSync(templatePath, 'utf-8');
  return handlebars.compile(templateStr)(data);
}

function tituloPorTipo(tipo: TipoEvento, OS: string): string {
  const titulos: Record<TipoEvento, string> = {
    CHAMADO_ABERTO:       `Novo chamado ${OS} disponível`,
    CHAMADO_ATRIBUIDO:    `Chamado ${OS} atribuído a você`,
    CHAMADO_TRANSFERIDO:  `Chamado ${OS} transferido para você`,
    CHAMADO_REABERTO:     `Chamado ${OS} foi reaberto`,
    PRIORIDADE_ALTERADA:  `Prioridade do chamado ${OS} alterada`,
    SLA_VENCENDO:         `SLA do chamado ${OS} está vencendo`,
    CHAMADO_ENCERRADO:    `Chamado ${OS} encerrado`,
  };
  return titulos[tipo] ?? `Atualização no chamado ${OS}`;
}

function mensagemPorTipo(tipo: TipoEvento, OS: string, dados: Record<string, any>): string {
  switch (tipo) {
    case 'CHAMADO_ABERTO':
      return `O chamado ${OS} (${dados.prioridade}) foi aberto por ${dados.usuarioNome} — ${dados.servicos?.join(', ')}`;
    case 'CHAMADO_ATRIBUIDO':
      return `O chamado ${OS} de ${dados.usuarioNome} foi atribuído a você`;
    case 'CHAMADO_TRANSFERIDO':
      return `O chamado ${OS} foi transferido de ${dados.tecnicoAnteriorNome} para você. Motivo: ${dados.motivo}`;
    case 'CHAMADO_REABERTO':
      return `O chamado ${OS} foi reaberto por ${dados.usuarioNome}`;
    case 'PRIORIDADE_ALTERADA':
      return `A prioridade do chamado ${OS} foi alterada de ${dados.prioridadeAnterior} para ${dados.prioridadeNova} por ${dados.alteradoPorNome}`;
    case 'SLA_VENCENDO':
      return `O chamado ${OS} está há ${dados.horasAberto}h sem resolução — SLA em risco`;
    case 'CHAMADO_ENCERRADO':
      return `O chamado ${OS} foi encerrado`;
    default:
      return `Atualização no chamado ${OS}`;
  }
}

async function salvarNotificacoes(evento: EventoNotificacao): Promise<void> {
  const docs = evento.destinatarios.map(dest => ({
    destinatarioId:    dest.id,
    destinatarioEmail: dest.email,
    tipo:       evento.tipo,
    titulo:     tituloPorTipo(evento.tipo, evento.chamadoOS),
    mensagem:   mensagemPorTipo(evento.tipo, evento.chamadoOS, {
      ...evento.dados,
      prioridade: evento.chamadoPrioridade,
    }),
    chamadoId:   evento.chamadoId,
    chamadoOS:   evento.chamadoOS,
    dadosExtras: evento.dados,
    lida:        false,
    criadoEm:    new Date(),
  }));

  await NotificacaoModel.insertMany(docs);
  logger.debug({ tipo: evento.tipo, qtd: docs.length }, 'Notificações salvas no MongoDB');
}

async function enviarEmails(evento: EventoNotificacao): Promise<void> {
  const templateMap: Partial<Record<TipoEvento, string>> = {
    CHAMADO_ABERTO:      'chamado-aberto-tecnico',
    CHAMADO_ATRIBUIDO:   'chamado-atribuido',
    CHAMADO_TRANSFERIDO: 'chamado-transferido',
    CHAMADO_REABERTO:    'chamado-reaberto',
    PRIORIDADE_ALTERADA: 'prioridade-alterada',
    SLA_VENCENDO:        'sla-vencendo',
    CHAMADO_ENCERRADO:   'chamado-encerrado',
  };

  const templateName = templateMap[evento.tipo];
  if (!templateName) return;

  const assunto = tituloPorTipo(evento.tipo, evento.chamadoOS);

  await Promise.allSettled(
    evento.destinatarios.map(async (dest) => {
      try {
        const html = renderTemplate(templateName, {
          nomeDestinatario: dest.nome,
          chamadoOS:        evento.chamadoOS,
          prioridade:       evento.chamadoPrioridade,
          ...evento.dados,
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
          to: dest.email,
          subject: assunto,
          html,
        });

        logger.info({ tipo: evento.tipo, destinatario: dest.email,
          chamadoOS: evento.chamadoOS }, 'E-mail enviado');
      } catch (err) {
        logger.error({ err, tipo: evento.tipo, destinatario: dest.email },
          'Erro ao enviar e-mail');
      }
    })
  );
}

function emitirSocketNotificacoes(evento: EventoNotificacao): void {
  const payload = {
    tipo:        evento.tipo,
    chamadoId:   evento.chamadoId,
    chamadoOS:   evento.chamadoOS,
    prioridade:  evento.chamadoPrioridade,
    titulo:      tituloPorTipo(evento.tipo, evento.chamadoOS),
    mensagem:    mensagemPorTipo(evento.tipo, evento.chamadoOS, {
      ...evento.dados,
      prioridade: evento.chamadoPrioridade,
    }),
    timestamp:   evento.timestamp,
  };

  if (evento.tipo === 'CHAMADO_ABERTO') {
    // Emite para sala de técnicos (todos os técnicos conectados recebem)
    emitirParaTecnicos('notificacao', payload);
  } else {
    // Emite apenas para o técnico destinatário
    evento.destinatarios.forEach(dest => {
      emitirParaUsuario(dest.id, 'notificacao', payload);
    });
  }

  logger.debug({ tipo: evento.tipo, destinatarios: evento.destinatarios.length },
    'Notificação emitida via Socket.IO');
}

export async function processarMensagemNotificacao(payload: EachMessagePayload): Promise<void> {
  const { topic, partition, message } = payload;

  if (!message.value) {
    logger.warn({ topic, partition }, 'Mensagem sem valor');
    return;
  }

  let evento: EventoNotificacao;

  try {
    evento = JSON.parse(message.value.toString()) as EventoNotificacao;
  } catch (err) {
    logger.error({ err, topic }, 'Erro ao parsear mensagem Kafka');
    return;
  }

  logger.debug({ tipo: evento.tipo, chamadoOS: evento.chamadoOS,
    destinatarios: evento.destinatarios.length }, 'Processando notificação');

  // Executar em paralelo: MongoDB + e-mail + Socket.IO
  const [mongoResult, emailResult] = await Promise.allSettled([
    salvarNotificacoes(evento),
    enviarEmails(evento),
  ]);

  if (mongoResult.status === 'rejected') {
    logger.error({ err: mongoResult.reason, tipo: evento.tipo }, 'Erro ao salvar notificação no MongoDB');
  }

  if (emailResult.status === 'rejected') {
    logger.error({ err: emailResult.reason, tipo: evento.tipo }, 'Erro ao enviar e-mails');
  }

  // Socket.IO é síncrono — não bloqueia
  try {
    emitirSocketNotificacoes(evento);
  } catch (err) {
    logger.error({ err, tipo: evento.tipo }, 'Erro ao emitir Socket.IO');
  }
}

export async function startNotificacaoConsumer(): Promise<void> {
  if (isRunning) {
    logger.warn('Consumer de notificações já está em execução');
    return;
  }

  try {
    consumerInstance = kafka.consumer({
      groupId: 'helpme-notificacoes-group',
      sessionTimeout: 60000,
      heartbeatInterval: 5000,
      maxWaitTimeInMs: 5000,
    });

    await consumerInstance.connect();
    logger.info('Consumer de notificações conectado');

    await consumerInstance.subscribe({
      topic: TOPICO_NOTIFICACOES,
      fromBeginning: false,
    });

    await consumerInstance.run({ eachMessage: processarMensagemNotificacao });

    isRunning = true;
    logger.info({ topic: TOPICO_NOTIFICACOES }, 'Consumer de notificações iniciado');
  } catch (err) {
    consumerInstance = null;
    isRunning = false;
    logger.error({ err }, 'Erro ao iniciar consumer de notificações');
    throw err;
  }
}

export async function stopNotificacaoConsumer(): Promise<void> {
  if (!consumerInstance || !isRunning) return;

  try {
    await consumerInstance.stop();
    await consumerInstance.disconnect();
    logger.info('Consumer de notificações parado');
  } catch (err) {
    logger.error({ err }, 'Erro ao parar consumer de notificações');
  } finally {
    consumerInstance = null;
    isRunning = false;
  }
}

export function isNotificacaoConsumerRunning(): boolean {
  return isRunning;
}