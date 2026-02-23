import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nodemailer from 'nodemailer';

const sendMailMock = vi.fn();
const verifyMock = vi.fn();
const createTransportMock = vi.fn(() => ({
  sendMail: sendMailMock,
  verify: verifyMock,
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

vi.mock('@shared/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ENV_ORIGINAL = process.env;

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env = {
      ...ENV_ORIGINAL,
      SMTP_HOST: 'smtp.test.com',
      SMTP_PORT: '587',
      SMTP_USER: 'test@example.com',
      SMTP_PASS: 'test-password',
      SMTP_FROM: '"Test Sender" <sender@test.com>',
      SMTP_SECURE: 'false',
    };

    vi.mocked(nodemailer.createTransport).mockImplementation(
      createTransportMock as any
    );
  });

  afterEach(() => {
    process.env = ENV_ORIGINAL;
  });

  describe('createEmailTransporter', () => {
    it('deve criar transporter com configurações corretas do ambiente', async () => {
      await import('@infrastructure/email/email.service');

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'test-password',
        },
      });
    });

    it('deve criar transporter com porta como número', async () => {
      process.env.SMTP_PORT = '465';

      await import('@infrastructure/email/email.service');

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
        })
      );
    });

    it('deve criar transporter com secure true quando SMTP_SECURE for "true"', async () => {
      process.env.SMTP_SECURE = 'true';

      await import('@infrastructure/email/email.service');

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: true,
        })
      );
    });

    it('deve criar transporter com secure false quando SMTP_SECURE não for "true"', async () => {
      process.env.SMTP_SECURE = 'false';

      await import('@infrastructure/email/email.service');

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: false,
        })
      );
    });

    it('deve lançar erro quando SMTP_HOST estiver ausente', async () => {
      delete process.env.SMTP_HOST;

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('Variáveis de ambiente SMTP ausentes');
    });

    it('deve lançar erro quando SMTP_PORT estiver ausente', async () => {
      delete process.env.SMTP_PORT;

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('SMTP_PORT');
    });

    it('deve lançar erro quando SMTP_USER estiver ausente', async () => {
      delete process.env.SMTP_USER;

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('SMTP_USER');
    });

    it('deve lançar erro quando SMTP_PASS estiver ausente', async () => {
      delete process.env.SMTP_PASS;

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('SMTP_PASS');
    });

    it('deve lançar erro quando múltiplas variáveis estiverem ausentes', async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;

      const { EmailServiceError } = await import(
        '@infrastructure/email/email.service'
      ).catch(e => ({ EmailServiceError: e.constructor }));

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow();
    });

    it('deve lançar erro quando SMTP_PORT não for um número', async () => {
      process.env.SMTP_PORT = 'invalid';

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('SMTP_PORT inválida');
    });

    it('deve lançar erro quando SMTP_PORT for zero', async () => {
      process.env.SMTP_PORT = '0';

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('SMTP_PORT inválida');
    });

    it('deve lançar erro quando SMTP_PORT for negativa', async () => {
      process.env.SMTP_PORT = '-1';

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('SMTP_PORT inválida');
    });

    it('deve lançar erro quando SMTP_PORT for maior que 65535', async () => {
      process.env.SMTP_PORT = '65536';

      await expect(async () => {
        await import('@infrastructure/email/email.service');
      }).rejects.toThrow('SMTP_PORT inválida');
    });

    it('deve aceitar porta 1 como válida', async () => {
      process.env.SMTP_PORT = '1';

      await import('@infrastructure/email/email.service');

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 1,
        })
      );
    });

    it('deve aceitar porta 65535 como válida', async () => {
      process.env.SMTP_PORT = '65535';

      await import('@infrastructure/email/email.service');

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 65535,
        })
      );
    });
  });

  describe('sendEmail', () => {
    it('deve enviar email com sucesso usando SMTP_FROM do ambiente', async () => {
      const mockResponse = {
        messageId: 'test-message-id-123',
        accepted: ['recipient@test.com'],
        rejected: [],
      };
      sendMailMock.mockResolvedValue(mockResponse);

      const { sendEmail } = await import('@infrastructure/email/email.service');

      const destinatario = 'recipient@test.com';
      const assunto = 'Teste de Email';
      const conteudoHtml = '<h1>Olá Mundo!</h1>';

      const resultado = await sendEmail(destinatario, assunto, conteudoHtml);

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith({
        from: '"Test Sender" <sender@test.com>',
        to: destinatario,
        subject: assunto,
        html: conteudoHtml,
      });
      expect(resultado).toEqual(mockResponse);
    });

    it('deve usar remetente padrão quando SMTP_FROM não estiver definido', async () => {
      delete process.env.SMTP_FROM;

      sendMailMock.mockResolvedValue({ messageId: 'test-id', accepted: [], rejected: [] });

      const { sendEmail } = await import('@infrastructure/email/email.service');

      await sendEmail('test@test.com', 'Assunto', '<p>Conteúdo</p>');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Help Me" <noreply@helpme.com>',
        })
      );
    });

    it('deve enviar email com múltiplos destinatários', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'test-id', accepted: [], rejected: [] });
      const { sendEmail } = await import('@infrastructure/email/email.service');

      const destinatarios = 'user1@test.com, user2@test.com, user3@test.com';
      const assunto = 'Email para múltiplos destinatários';
      const html = '<p>Conteúdo do email</p>';

      await sendEmail(destinatarios, assunto, html);

      expect(sendMailMock).toHaveBeenCalledWith({
        from: '"Test Sender" <sender@test.com>',
        to: destinatarios,
        subject: assunto,
        html,
      });
    });

    it('deve enviar email com HTML complexo', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'test-id', accepted: [], rejected: [] });
      const { sendEmail } = await import('@infrastructure/email/email.service');

      const htmlComplexo = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .header { background-color: #007bff; color: white; padding: 20px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Bem-vindo!</h1>
            </div>
            <p>Este é um email de teste com HTML complexo.</p>
          </body>
        </html>
      `;

      await sendEmail('user@test.com', 'HTML Complexo', htmlComplexo);

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: htmlComplexo,
        })
      );
    });

    it('deve enviar email com HTML vazio', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'test-id', accepted: [], rejected: [] });
      const { sendEmail } = await import('@infrastructure/email/email.service');

      await sendEmail('user@test.com', 'Assunto Vazio', '');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '',
        })
      );
    });

    it('deve enviar email com subject vazio', async () => {
      sendMailMock.mockResolvedValue({ messageId: 'test-id', accepted: [], rejected: [] });
      const { sendEmail } = await import('@infrastructure/email/email.service');

      await sendEmail('user@test.com', '', '<p>Conteúdo</p>');

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '',
        })
      );
    });

    it('deve retornar informações completas do envio bem-sucedido', async () => {
      const mockResponse = {
        messageId: '<abc123@mail.server.com>',
        accepted: ['user@test.com'],
        rejected: [],
        response: '250 2.0.0 OK 1234567890',
        envelope: {
          from: 'sender@test.com',
          to: ['user@test.com'],
        },
      };
      sendMailMock.mockResolvedValue(mockResponse);

      const { sendEmail } = await import('@infrastructure/email/email.service');

      const resultado = await sendEmail('user@test.com', 'Teste Completo', '<p>Teste</p>');

      expect(resultado).toEqual(mockResponse);
      expect(resultado.messageId).toBe('<abc123@mail.server.com>');
      expect(resultado.accepted).toContain('user@test.com');
      expect(resultado.rejected).toHaveLength(0);
    });

    describe('Validações', () => {
      it('deve lançar erro quando destinatário for null', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(sendEmail(null as any, 'Assunto', '<p>HTML</p>')).rejects.toThrow(
          EmailValidationError
        );
        await expect(sendEmail(null as any, 'Assunto', '<p>HTML</p>')).rejects.toThrow(
          'Destinatário é obrigatório'
        );
      });

      it('deve lançar erro quando destinatário for undefined', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(
          sendEmail(undefined as any, 'Assunto', '<p>HTML</p>')
        ).rejects.toThrow(EmailValidationError);
      });

      it('deve lançar erro quando destinatário não for string', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(sendEmail(123 as any, 'Assunto', '<p>HTML</p>')).rejects.toThrow(
          'Destinatário deve ser uma string'
        );
      });

      it('deve lançar erro quando destinatário estiver vazio', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(sendEmail('', 'Assunto', '<p>HTML</p>')).rejects.toThrow(
          'Destinatário não pode estar vazio'
        );
      });

      it('deve lançar erro quando destinatário for apenas espaços', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(sendEmail('   ', 'Assunto', '<p>HTML</p>')).rejects.toThrow(
          EmailValidationError
        );
      });

      it('deve lançar erro quando email for inválido', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(
          sendEmail('email-invalido', 'Assunto', '<p>HTML</p>')
        ).rejects.toThrow('Email inválido');
      });

      it('deve lançar erro quando email não tiver @', async () => {
        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(sendEmail('emailsemarroba', 'Assunto', '<p>HTML</p>')).rejects.toThrow(
          'Email inválido'
        );
      });

      it('deve lançar erro quando email não tiver domínio', async () => {
        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(sendEmail('email@', 'Assunto', '<p>HTML</p>')).rejects.toThrow(
          'Email inválido'
        );
      });

      it('deve lançar erro quando um dos múltiplos emails for inválido', async () => {
        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(
          sendEmail('valid@test.com, invalid-email', 'Assunto', '<p>HTML</p>')
        ).rejects.toThrow('Email inválido');
      });

      it('deve lançar erro quando subject for null', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(
          sendEmail('test@test.com', null as any, '<p>HTML</p>')
        ).rejects.toThrow(EmailValidationError);
        await expect(
          sendEmail('test@test.com', null as any, '<p>HTML</p>')
        ).rejects.toThrow('Assunto é obrigatório');
      });

      it('deve lançar erro quando subject for undefined', async () => {
        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(
          sendEmail('test@test.com', undefined as any, '<p>HTML</p>')
        ).rejects.toThrow('Assunto é obrigatório');
      });

      it('deve lançar erro quando subject não for string', async () => {
        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(sendEmail('test@test.com', 123 as any, '<p>HTML</p>')).rejects.toThrow(
          'Assunto deve ser uma string'
        );
      });

      it('deve lançar erro quando html for null', async () => {
        const { sendEmail, EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(
          sendEmail('test@test.com', 'Assunto', null as any)
        ).rejects.toThrow(EmailValidationError);
        await expect(
          sendEmail('test@test.com', 'Assunto', null as any)
        ).rejects.toThrow('Conteúdo HTML é obrigatório');
      });

      it('deve lançar erro quando html for undefined', async () => {
        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(
          sendEmail('test@test.com', 'Assunto', undefined as any)
        ).rejects.toThrow('Conteúdo HTML é obrigatório');
      });

      it('deve lançar erro quando html não for string', async () => {
        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(sendEmail('test@test.com', 'Assunto', 123 as any)).rejects.toThrow(
          'Conteúdo HTML deve ser uma string'
        );
      });
    });

    describe('Erros de Envio', () => {
      it('deve propagar EmailServiceError quando sendMail falhar', async () => {
        const erro = new Error('Falha ao enviar email: SMTP connection failed');
        sendMailMock.mockRejectedValue(erro);

        const { sendEmail, EmailServiceError } = await import(
          '@infrastructure/email/email.service'
        );

        const erroCapturado = await sendEmail(
          'test@test.com',
          'Assunto',
          '<p>Teste</p>'
        ).catch(e => e);

        expect(erroCapturado).toBeInstanceOf(EmailServiceError);
        expect(erroCapturado.message).toBe('Falha ao enviar email');
        expect(erroCapturado.code).toBe('SEND_EMAIL_ERROR');
        expect(erroCapturado.originalError).toBe(erro);
      });

      it('deve propagar erro de autenticação SMTP', async () => {
        const erro = new Error('Invalid login: 535 Authentication failed');
        sendMailMock.mockRejectedValue(erro);

        const { sendEmail, EmailServiceError } = await import(
          '@infrastructure/email/email.service'
        );

        await expect(sendEmail('test@test.com', 'Assunto', '<p>Teste</p>')).rejects.toThrow(
          EmailServiceError
        );
      });

      it('deve propagar erro de destinatário rejeitado', async () => {
        const erro = new Error('Recipient address rejected');
        sendMailMock.mockRejectedValue(erro);

        const { sendEmail } = await import('@infrastructure/email/email.service');

        await expect(sendEmail('test@test.com', 'Assunto', '<p>Teste</p>')).rejects.toThrow(
          'Falha ao enviar email'
        );
      });
    });
  });

  describe('verifyEmailTransporter', () => {
    it('deve verificar conexão SMTP com sucesso', async () => {
      verifyMock.mockResolvedValue(true);

      const { verifyEmailTransporter } = await import(
        '@infrastructure/email/email.service'
      );

      const resultado = await verifyEmailTransporter();

      expect(verifyMock).toHaveBeenCalled();
      expect(resultado).toBe(true);
    });

    it('deve lançar EmailServiceError quando verificação falhar', async () => {
      const erro = new Error('SMTP connection failed');
      verifyMock.mockRejectedValue(erro);

      const { verifyEmailTransporter, EmailServiceError } = await import(
        '@infrastructure/email/email.service'
      );

      const erroCapturado = await verifyEmailTransporter().catch(e => e);

      expect(erroCapturado).toBeInstanceOf(EmailServiceError);
      expect(erroCapturado.message).toBe('Falha ao verificar conexão SMTP');
      expect(erroCapturado.code).toBe('VERIFY_ERROR');
      expect(erroCapturado.originalError).toBe(erro);
    });
  });

  describe('Classes de Erro', () => {
    describe('EmailServiceError', () => {
      it('deve criar erro com todas as propriedades', async () => {
        const { EmailServiceError } = await import(
          '@infrastructure/email/email.service'
        );

        const originalError = new Error('Original');
        const erro = new EmailServiceError('Mensagem', 'CODE', originalError);

        expect(erro.message).toBe('Mensagem');
        expect(erro.code).toBe('CODE');
        expect(erro.originalError).toBe(originalError);
        expect(erro.name).toBe('EmailServiceError');
      });

      it('deve criar erro sem originalError', async () => {
        const { EmailServiceError } = await import(
          '@infrastructure/email/email.service'
        );

        const erro = new EmailServiceError('Mensagem', 'CODE');

        expect(erro.originalError).toBeUndefined();
      });
    });

    describe('EmailValidationError', () => {
      it('deve criar erro com todas as propriedades', async () => {
        const { EmailValidationError } = await import(
          '@infrastructure/email/email.service'
        );

        const erro = new EmailValidationError('Email inválido', 'to');

        expect(erro.message).toBe('Email inválido');
        expect(erro.field).toBe('to');
        expect(erro.name).toBe('EmailValidationError');
      });
    });
  });
});