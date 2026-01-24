import { kafka } from '../services/kafka';
import { transporter } from '../services/emailService';
import { logger } from '../utils/logger';
import fs from 'fs';
import handlebars from 'handlebars';
import { Consumer } from 'kafkajs';

// Armazenar a instância do consumer
let consumerInstance: Consumer | null = null;
let isRunning = false;

function renderTemplate(templatePath: string, data: object): string {
  try {
    const templateStr = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(templateStr);
    return template(data);
  } catch (error) {
    logger.error({ err: error, templatePath }, 'Erro ao renderizar template');
    throw error;
  }
}

async function sendChamadoAbertoEmail(chamado: any): Promise<void> {
  try {
    const html = renderTemplate(
      'src/templates/chamado-aberto.hbs',
      {
        nomeUsuario: chamado.nomeUsuario,
        idChamado: chamado.id,
        assuntoChamado: chamado.assunto,
        dataAbertura: chamado.dataAbertura
      }
    );

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
      to: chamado.emailUsuario,
      subject: `Seu chamado #${chamado.id} foi aberto!`,
      html
    });

    logger.info(
      { 
        chamadoId: chamado.id, 
        emailUsuario: chamado.emailUsuario,
        status: 'ABERTO'
      }, 
      'Email de chamado aberto enviado com sucesso'
    );
  } catch (error) {
    logger.error(
      { 
        err: error, 
        chamadoId: chamado.id, 
        emailUsuario: chamado.emailUsuario 
      }, 
      'Erro ao enviar email de chamado aberto'
    );
    throw error;
  }
}

async function sendChamadoEncerradoEmail(chamado: any): Promise<void> {
  try {
    const html = renderTemplate(
      'src/templates/chamado-encerrado.hbs',
      {
        nomeUsuario: chamado.nomeUsuario,
        idChamado: chamado.id,
        assuntoChamado: chamado.assunto,
        dataAbertura: chamado.dataAbertura,
        dataEncerramento: chamado.dataEncerramento
      }
    );

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
      to: chamado.emailUsuario,
      subject: `Seu chamado #${chamado.id} foi encerrado`,
      html
    });

    logger.info(
      { 
        chamadoId: chamado.id, 
        emailUsuario: chamado.emailUsuario,
        status: 'ENCERRADO'
      }, 
      'Email de chamado encerrado enviado com sucesso'
    );
  } catch (error) {
    logger.error(
      { 
        err: error, 
        chamadoId: chamado.id, 
        emailUsuario: chamado.emailUsuario 
      }, 
      'Erro ao enviar email de chamado encerrado'
    );
    throw error;
  }
}

export async function startChamadoConsumer(): Promise<void> {
  try {
    // Criar consumer apenas se não existir
    if (!consumerInstance) {
      consumerInstance = kafka.consumer({ groupId: 'chamado-group' });
      logger.debug('Consumer instance criada');
    }

    await consumerInstance.connect();
    logger.info('Kafka Consumer conectado');

    await consumerInstance.subscribe({ topic: 'chamado-status' });
    logger.info({ topic: 'chamado-status' }, 'Inscrito no tópico Kafka');

    await consumerInstance.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const data = JSON.parse(message.value!.toString());
          
          logger.debug(
            { 
              topic, 
              partition, 
              offset: message.offset,
              chamadoId: data.id,
              status: data.status 
            }, 
            'Mensagem recebida do Kafka'
          );

          if (data.status === 'ABERTO') {
            await sendChamadoAbertoEmail(data);
          }

          if (data.status === 'ENCERRADO') {
            await sendChamadoEncerradoEmail(data);
          }
        } catch (error) {
          logger.error(
            { 
              err: error, 
              topic, 
              partition, 
              offset: message.offset 
            }, 
            'Erro ao processar mensagem do Kafka'
          );
        }
      }
    });

    isRunning = true;
    logger.info('Kafka Consumer iniciado com sucesso');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao iniciar Kafka Consumer');
    throw error;
  }
}

export async function stopChamadoConsumer(): Promise<void> {
  if (consumerInstance && isRunning) {
    try {
      logger.info('Parando Kafka Consumer...');
      
      await consumerInstance.stop();
      await consumerInstance.disconnect();
      
      logger.info('Kafka Consumer parado com sucesso');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao parar Kafka Consumer');
      throw error;
    }
  }

  consumerInstance = null;
  isRunning = false;
}

export function isChamadoConsumerRunning(): boolean {
  return isRunning;
}