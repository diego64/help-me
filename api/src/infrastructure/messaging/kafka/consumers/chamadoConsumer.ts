import fs from 'fs';
import handlebars from 'handlebars';
import { Consumer, EachMessagePayload } from 'kafkajs';
import { logger } from '../../../../shared/config/logger';
import { kafka } from '../client';
import { transporter } from '../../../email/email.service';

export class ConsumerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ConsumerError';
  }
}

export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly templatePath: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

export class EmailError extends Error {
  constructor(
    message: string,
    public readonly chamadoId: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'EmailError';
  }
}

export interface ChamadoData {
  id: string;
  nomeUsuario: string;
  emailUsuario: string;
  assunto: string;
  dataAbertura: string;
  dataEncerramento?: string;
  status: 'ABERTO' | 'ENCERRADO' | string;
}

let consumerInstance: Consumer | null = null;
let isRunning = false;

function validarTemplate(templatePath: string): void {
  if (!templatePath || typeof templatePath !== 'string') {
    throw new TemplateError(
      'Caminho do template é obrigatório',
      templatePath || ''
    );
  }

  if (!fs.existsSync(templatePath)) {
    throw new TemplateError(
      `Template não encontrado: ${templatePath}`,
      templatePath
    );
  }
}

function validarDadosChamado(chamado: any): asserts chamado is ChamadoData {
  if (!chamado || typeof chamado !== 'object') {
    throw new ConsumerError(
      'Dados do chamado são obrigatórios',
      'INVALID_DATA'
    );
  }

  const camposObrigatorios = ['id', 'nomeUsuario', 'emailUsuario', 'assunto', 'status'];
  const camposFaltantes = camposObrigatorios.filter(campo => !chamado[campo]);

  if (camposFaltantes.length > 0) {
    throw new ConsumerError(
      `Campos obrigatórios ausentes: ${camposFaltantes.join(', ')}`,
      'MISSING_FIELDS'
    );
  }

  // Validação de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(chamado.emailUsuario)) {
    throw new ConsumerError(
      'Email do usuário inválido',
      'INVALID_EMAIL'
    );
  }
}

export function renderTemplate(templatePath: string, data: object): string {
  try {
    logger.debug({ templatePath }, 'Renderizando template');

    validarTemplate(templatePath);

    const templateStr = fs.readFileSync(templatePath, 'utf-8');
    
    if (!templateStr || templateStr.trim().length === 0) {
      throw new TemplateError(
        'Template vazio',
        templatePath
      );
    }

    const template = handlebars.compile(templateStr);
    const rendered = template(data);

    logger.debug({ templatePath }, 'Template renderizado com sucesso');
    return rendered;
  } catch (error) {
    if (error instanceof TemplateError) {
      logger.error({ 
        err: error, 
        templatePath,
        code: 'TEMPLATE_ERROR'
      }, 'Erro ao renderizar template');
      throw error;
    }

    logger.error({ err: error, templatePath }, 'Erro ao renderizar template');
    throw new TemplateError(
      'Falha ao renderizar template',
      templatePath,
      error instanceof Error ? error : undefined
    );
  }
}

export async function sendChamadoAbertoEmail(chamado: ChamadoData): Promise<void> {
  try {
    validarDadosChamado(chamado);
    
    logger.debug({ chamadoId: chamado.id }, 'Enviando email de chamado aberto');

    const html = renderTemplate('src/templates/chamado-aberto.hbs', {
      nomeUsuario: chamado.nomeUsuario,
      idChamado: chamado.id,
      assuntoChamado: chamado.assunto,
      dataAbertura: chamado.dataAbertura,
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
      to: chamado.emailUsuario,
      subject: `Seu chamado #${chamado.id} foi aberto!`,
      html,
    };

    await transporter.sendMail(mailOptions);

    logger.info(
      {
        chamadoId: chamado.id,
        emailUsuario: chamado.emailUsuario,
        status: 'ABERTO',
      },
      'Email de chamado aberto enviado com sucesso'
    );
  } catch (error) {
    if (error instanceof ConsumerError || error instanceof TemplateError) {
      logger.error(
        {
          err: error,
          chamadoId: chamado?.id,
          emailUsuario: chamado?.emailUsuario,
        },
        'Erro de validação ao enviar email de chamado aberto'
      );
      throw error;
    }

    logger.error(
      {
        err: error,
        chamadoId: chamado?.id,
        emailUsuario: chamado?.emailUsuario,
      },
      'Erro ao enviar email de chamado aberto'
    );

    throw new EmailError(
      'Falha ao enviar email de chamado aberto',
      chamado?.id || 'unknown',
      error instanceof Error ? error : undefined
    );
  }
}

export async function sendChamadoEncerradoEmail(chamado: ChamadoData): Promise<void> {
  try {
    validarDadosChamado(chamado);
    
    logger.debug({ chamadoId: chamado.id }, 'Enviando email de chamado encerrado');

    if (!chamado.dataEncerramento) {
      throw new ConsumerError(
        'Data de encerramento é obrigatória para chamados encerrados',
        'MISSING_ENCERRAMENTO_DATE'
      );
    }

    const html = renderTemplate('src/templates/chamado-encerrado.hbs', {
      nomeUsuario: chamado.nomeUsuario,
      idChamado: chamado.id,
      assuntoChamado: chamado.assunto,
      dataAbertura: chamado.dataAbertura,
      dataEncerramento: chamado.dataEncerramento,
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
      to: chamado.emailUsuario,
      subject: `Seu chamado #${chamado.id} foi encerrado`,
      html,
    };

    await transporter.sendMail(mailOptions);

    logger.info(
      {
        chamadoId: chamado.id,
        emailUsuario: chamado.emailUsuario,
        status: 'ENCERRADO',
      },
      'Email de chamado encerrado enviado com sucesso'
    );
  } catch (error) {
    if (error instanceof ConsumerError || error instanceof TemplateError) {
      logger.error(
        {
          err: error,
          chamadoId: chamado?.id,
          emailUsuario: chamado?.emailUsuario,
        },
        'Erro de validação ao enviar email de chamado encerrado'
      );
      throw error;
    }

    logger.error(
      {
        err: error,
        chamadoId: chamado?.id,
        emailUsuario: chamado?.emailUsuario,
      },
      'Erro ao enviar email de chamado encerrado'
    );

    throw new EmailError(
      'Falha ao enviar email de chamado encerrado',
      chamado?.id || 'unknown',
      error instanceof Error ? error : undefined
    );
  }
}

// Processa uma mensagem do Kafka
export async function processKafkaMessage(payload: EachMessagePayload): Promise<void> {
  const { topic, partition, message } = payload;

  try {
    if (!message.value) {
      logger.warn({ topic, partition }, 'Mensagem sem valor recebida');
      return;
    }

    const data = JSON.parse(message.value.toString());

    logger.debug(
      {
        topic,
        partition,
        offset: message.offset,
        chamadoId: data?.id,
        status: data?.status,
      },
      'Mensagem recebida do Kafka'
    );

    if (data.status === 'ABERTO') {
      await sendChamadoAbertoEmail(data);
    } else if (data.status === 'ENCERRADO') {
      await sendChamadoEncerradoEmail(data);
    } else {
      logger.warn(
        {
          topic,
          partition,
          status: data?.status,
          chamadoId: data?.id,
        },
        'Status de chamado não tratado'
      );
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        topic,
        partition,
        offset: message.offset,
      },
      'Erro ao processar mensagem do Kafka'
    );
    // Não propaga o erro para não parar o consumer
  }
}

// Inicia o consumer do Kafka
export async function startChamadoConsumer(): Promise<void> {
  try {
    if (isRunning) {
      logger.warn('Consumer já está em execução');
      return;
    }

    // Criar consumer apenas se não existir
    if (!consumerInstance) {
      consumerInstance = kafka.consumer({ groupId: 'chamado-group' });
      logger.debug('Consumer instance criada');
    }

    await consumerInstance.connect();
    logger.info('Kafka Consumer conectado');

    await consumerInstance.subscribe({ topic: 'chamado-status', fromBeginning: false });
    logger.info({ topic: 'chamado-status' }, 'Inscrito no tópico Kafka');

    await consumerInstance.run({
      eachMessage: processKafkaMessage,
    });

    isRunning = true;
    logger.info('Kafka Consumer iniciado com sucesso');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao iniciar Kafka Consumer');
    
    // Limpar estado em caso de erro
    consumerInstance = null;
    isRunning = false;

    throw new ConsumerError(
      'Falha ao iniciar Kafka Consumer',
      'START_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

// Para o consumer do Kafka
export async function stopChamadoConsumer(): Promise<void> {
  if (!consumerInstance || !isRunning) {
    logger.debug('Consumer não está em execução');
    return;
  }

  try {
    logger.info('Parando Kafka Consumer...');

    await consumerInstance.stop();
    await consumerInstance.disconnect();

    logger.info('Kafka Consumer parado com sucesso');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao parar Kafka Consumer');
    throw new ConsumerError(
      'Falha ao parar Kafka Consumer',
      'STOP_ERROR',
      error instanceof Error ? error : undefined
    );
  } finally {
    consumerInstance = null;
    isRunning = false;
  }
}

// Verifica se o consumer está em execução
export function isChamadoConsumerRunning(): boolean {
  return isRunning;
}

// Reseta o estado do consumer (útil para testes)
export function resetConsumerState(): void {
  consumerInstance = null;
  isRunning = false;
}