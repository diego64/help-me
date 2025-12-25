import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nodemailer from 'nodemailer';

// ========================================
// MOCK DO NODEMAILER
// ========================================

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({
  sendMail: sendMailMock,
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

// ========================================
// SETUP DE VARIÁVEIS DE AMBIENTE
// ========================================

const ENV_ORIGINAL = process.env;

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Configurar variáveis de ambiente para os testes
    process.env = {
      ...ENV_ORIGINAL,
      SMTP_HOST: 'smtp.test.com',
      SMTP_PORT: '587',
      SMTP_USER: 'test@example.com',
      SMTP_PASS: 'test-password',
      SMTP_FROM: '"Test Sender" <sender@test.com>',
    };

    // Configurar o mock do createTransport
    vi.mocked(nodemailer.createTransport).mockImplementation(createTransportMock as any);
  });

  afterEach(() => {
    // Restaurar variáveis de ambiente
    process.env = ENV_ORIGINAL;
    
    // Limpar o cache de módulos para reimportar com novas envs
    vi.resetModules();
  });

  // ==========================================================================
  // TESTES: Criação do Transporter
  // ==========================================================================

  describe('transporter', () => {
    it('deve criar transporter com configurações corretas do ambiente', async () => {
      // Arrange & Act
      await import('../../services/emailService');

      // Assert
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
      // Arrange
      process.env.SMTP_PORT = '465';
      vi.resetModules();

      // Act
      await import('../../services/emailService');

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
        })
      );
    });

    it('deve criar transporter com secure false por padrão', async () => {
      // Arrange & Act
      await import('../../services/emailService');

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: false,
        })
      );
    });
  });

  // ==========================================================================
  // TESTES: Função sendEmail
  // ==========================================================================

  describe('sendEmail', () => {
    it('deve enviar email com sucesso usando SMTP_FROM do ambiente', async () => {
      // Arrange
      const mockResponse = {
        messageId: 'test-message-id-123',
        accepted: ['recipient@test.com'],
        rejected: [],
      };
      sendMailMock.mockResolvedValue(mockResponse);

      const { sendEmail } = await import('../../services/emailService');

      const destinatario = 'recipient@test.com';
      const assunto = 'Teste de Email';
      const conteudoHtml = '<h1>Olá Mundo!</h1>';

      // Act
      const resultado = await sendEmail(destinatario, assunto, conteudoHtml);

      // Assert
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
      // Arrange
      delete process.env.SMTP_FROM;
      vi.resetModules();

      sendMailMock.mockResolvedValue({ messageId: 'test-id' });

      const { sendEmail } = await import('../../services/emailService');

      // Act
      await sendEmail('test@test.com', 'Assunto', '<p>Conteúdo</p>');

      // Assert
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Help Me" <noreply@helpme.com>',
        })
      );
    });

    it('deve enviar email com múltiplos destinatários', async () => {
      // Arrange
      sendMailMock.mockResolvedValue({ messageId: 'test-id' });
      const { sendEmail } = await import('../../services/emailService');

      const destinatarios = 'user1@test.com, user2@test.com, user3@test.com';
      const assunto = 'Email para múltiplos destinatários';
      const html = '<p>Conteúdo do email</p>';

      // Act
      await sendEmail(destinatarios, assunto, html);

      // Assert
      expect(sendMailMock).toHaveBeenCalledWith({
        from: '"Test Sender" <sender@test.com>',
        to: destinatarios,
        subject: assunto,
        html,
      });
    });

    it('deve enviar email com HTML complexo', async () => {
      // Arrange
      sendMailMock.mockResolvedValue({ messageId: 'test-id' });
      const { sendEmail } = await import('../../services/emailService');

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

      // Act
      await sendEmail('user@test.com', 'HTML Complexo', htmlComplexo);

      // Assert
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: htmlComplexo,
        })
      );
    });

    it('deve propagar erro quando sendMail falhar', async () => {
      // Arrange
      const erro = new Error('Falha ao enviar email: SMTP connection failed');
      sendMailMock.mockRejectedValue(erro);

      const { sendEmail } = await import('../../services/emailService');

      // Act & Assert
      await expect(
        sendEmail('test@test.com', 'Assunto', '<p>Teste</p>')
      ).rejects.toThrow('Falha ao enviar email: SMTP connection failed');

      expect(sendMailMock).toHaveBeenCalled();
    });

    it('deve propagar erro de autenticação SMTP', async () => {
      // Arrange
      const erro = new Error('Invalid login: 535 Authentication failed');
      sendMailMock.mockRejectedValue(erro);

      const { sendEmail } = await import('../../services/emailService');

      // Act & Assert
      await expect(
        sendEmail('test@test.com', 'Assunto', '<p>Teste</p>')
      ).rejects.toThrow('Invalid login: 535 Authentication failed');
    });

    it('deve propagar erro de destinatário inválido', async () => {
      // Arrange
      const erro = new Error('Recipient address rejected');
      sendMailMock.mockRejectedValue(erro);

      const { sendEmail } = await import('../../services/emailService');

      // Act & Assert
      await expect(
        sendEmail('invalid-email', 'Assunto', '<p>Teste</p>')
      ).rejects.toThrow('Recipient address rejected');
    });

    it('deve retornar informações completas do envio bem-sucedido', async () => {
      // Arrange
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

      const { sendEmail } = await import('../../services/emailService');

      // Act
      const resultado = await sendEmail(
        'user@test.com',
        'Teste Completo',
        '<p>Teste</p>'
      );

      // Assert
      expect(resultado).toEqual(mockResponse);
      expect(resultado.messageId).toBe('<abc123@mail.server.com>');
      expect(resultado.accepted).toContain('user@test.com');
      expect(resultado.rejected).toHaveLength(0);
    });

    it('deve enviar email vazio quando HTML estiver vazio', async () => {
      // Arrange
      sendMailMock.mockResolvedValue({ messageId: 'test-id' });
      const { sendEmail } = await import('../../services/emailService');

      // Act
      await sendEmail('user@test.com', 'Assunto Vazio', '');

      // Assert
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '',
        })
      );
    });

    it('deve enviar email quando subject estiver vazio', async () => {
      // Arrange
      sendMailMock.mockResolvedValue({ messageId: 'test-id' });
      const { sendEmail } = await import('../../services/emailService');

      // Act
      await sendEmail('user@test.com', '', '<p>Conteúdo</p>');

      // Assert
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '',
        })
      );
    });
  });
});