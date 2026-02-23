import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import { logger } from '@shared/config/logger';

export class EmailServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'EmailServiceError';
  }
}

export class EmailValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = 'EmailValidationError';
  }
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response?: string;
  envelope?: {
    from: string;
    to: string[];
  };
}

function validateSmtpConfig(): void {
  const requiredVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new EmailServiceError(
      `Variáveis de ambiente SMTP ausentes: ${missing.join(', ')}`,
      'MISSING_SMTP_CONFIG'
    );
  }

  const port = Number(process.env.SMTP_PORT);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new EmailServiceError(
      `SMTP_PORT inválida: ${process.env.SMTP_PORT}. Deve ser um número entre 1 e 65535`,
      'INVALID_SMTP_PORT'
    );
  }
}

function validateEmail(email: string, fieldName: string): void {
  if (!email || typeof email !== 'string') {
    throw new EmailValidationError(
      `${fieldName} é obrigatório`,
      fieldName
    );
  }

  // Validação básica de formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = email.split(',').map(e => e.trim());

  for (const singleEmail of emails) {
    if (singleEmail && !emailRegex.test(singleEmail)) {
      throw new EmailValidationError(
        `Email inválido: ${singleEmail}`,
        fieldName
      );
    }
  }
}

function validateEmailParams(to: string, subject: string, html: string): void {
  if (to === undefined || to === null) {
    throw new EmailValidationError(
      'Destinatário é obrigatório',
      'to'
    );
  }

  if (typeof to !== 'string') {
    throw new EmailValidationError(
      'Destinatário deve ser uma string',
      'to'
    );
  }

  if (to.trim().length === 0) {
    throw new EmailValidationError(
      'Destinatário não pode estar vazio',
      'to'
    );
  }

  validateEmail(to, 'to');

  if (subject === undefined || subject === null) {
    throw new EmailValidationError(
      'Assunto é obrigatório',
      'subject'
    );
  }

  if (typeof subject !== 'string') {
    throw new EmailValidationError(
      'Assunto deve ser uma string',
      'subject'
    );
  }

  if (html === undefined || html === null) {
    throw new EmailValidationError(
      'Conteúdo HTML é obrigatório',
      'html'
    );
  }

  if (typeof html !== 'string') {
    throw new EmailValidationError(
      'Conteúdo HTML deve ser uma string',
      'html'
    );
  }
}

function createEmailTransporter(): Transporter {
  try {
    validateSmtpConfig();

    const config = {
      host: process.env.SMTP_HOST!,
      port: Number(process.env.SMTP_PORT!),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    };

    logger.debug({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.auth.user,
    }, 'Criando transporter de email');

    return nodemailer.createTransport(config);
  } catch (error) {
    if (error instanceof EmailServiceError) {
      logger.error({ err: error }, 'Erro ao validar configuração SMTP');
      throw error;
    }

    logger.error({ err: error }, 'Erro ao criar transporter de email');
    throw new EmailServiceError(
      'Falha ao criar transporter de email',
      'TRANSPORTER_CREATE_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

export const transporter = createEmailTransporter();

/**
 * Envia um email
 * @param to - Destinatário(s) do email
 * @param subject - Assunto do email
 * @param html - Conteúdo HTML do email
 * @returns Resultado do envio
 * @throws {EmailValidationError} Se os parâmetros forem inválidos
 * @throws {EmailServiceError} Se houver erro no envio
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<EmailResult> {
  try {
    validateEmailParams(to, subject, html);
    
    logger.debug({
      to,
      subject,
      htmlLength: html.length,
    }, 'Iniciando envio de email');

    const mailOptions: SendMailOptions = {
      from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
      to,
      subject,
      html,
    };

    const result = await transporter.sendMail(mailOptions);

    logger.info({
      messageId: result.messageId,
      to,
      subject,
      accepted: result.accepted,
      rejected: result.rejected,
    }, 'Email enviado com sucesso');

    return result as EmailResult;
  } catch (error) {
    if (error instanceof EmailValidationError) {
      logger.error({
        err: error,
        field: error.field,
        to,
      }, 'Erro de validação ao enviar email');
      throw error;
    }

    logger.error({
      err: error,
      to,
      subject,
    }, 'Erro ao enviar email');

    throw new EmailServiceError(
      'Falha ao enviar email',
      'SEND_EMAIL_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

export async function verifyEmailTransporter(): Promise<boolean> {
  try {
    logger.debug('Verificando conexão SMTP');
    await transporter.verify();
    logger.info('Conexão SMTP verificada com sucesso');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao verificar conexão SMTP');
    throw new EmailServiceError(
      'Falha ao verificar conexão SMTP',
      'VERIFY_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}