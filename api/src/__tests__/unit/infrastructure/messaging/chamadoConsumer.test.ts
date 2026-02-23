import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import handlebars from 'handlebars';
import { EachMessagePayload } from 'kafkajs';

vi.mock('fs');
vi.mock('handlebars');

vi.mock('@infrastructure/messaging/kafka/client', () => ({
  kafka: {
    consumer: vi.fn(),
  },
}));

vi.mock('@infrastructure/email/email.service', () => ({
  transporter: {
    sendMail: vi.fn(),
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

import {
  startChamadoConsumer,
  stopChamadoConsumer,
  isChamadoConsumerRunning,
  resetConsumerState,
  renderTemplate,
  sendChamadoAbertoEmail,
  sendChamadoEncerradoEmail,
  processKafkaMessage,
  ConsumerError,
  TemplateError,
  EmailError,
  ChamadoData,
} from '@infrastructure/messaging/kafka/consumers/chamadoConsumer';

import { kafka } from '@infrastructure/messaging/kafka/client';
import { transporter } from '@infrastructure/email/email.service';
import { logger } from '@shared/config/logger';

const createMockPayload = (
  data: any,
  hasValue = true,
  overrides: Partial<EachMessagePayload> = {}
): EachMessagePayload => ({
  topic: 'chamado-status',
  partition: 0,
  message: {
    key: null,
    value: hasValue ? Buffer.from(JSON.stringify(data)) : null,
    timestamp: '1234567890',
    size: 100,
    attributes: 0,
    offset: '0',
    headers: undefined,
  },
  heartbeat: async () => {},
  pause: () => () => {},
  ...overrides,
});

describe('ChamadoConsumer', () => {
  let mockConsumer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    resetConsumerState();

    mockConsumer = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(kafka.consumer).mockReturnValue(mockConsumer);

    process.env.SMTP_FROM = '"Help Me Test" <test@helpme.com>';
  });

  afterEach(() => {
    resetConsumerState();
  });

  describe('renderTemplate', () => {
    const templatePath = 'src/templates/test.hbs';
    const mockData = { nome: 'João', id: '123' };

    it('deve renderizar template com sucesso', () => {
      const templateContent = 'Olá {{nome}}, seu ID é {{id}}';
      const compiledTemplate = vi.fn().mockReturnValue('Olá João, seu ID é 123');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(templateContent);
      vi.mocked(handlebars.compile).mockReturnValue(compiledTemplate);

      const resultado = renderTemplate(templatePath, mockData);

      expect(fs.existsSync).toHaveBeenCalledWith(templatePath);
      expect(fs.readFileSync).toHaveBeenCalledWith(templatePath, 'utf-8');
      expect(handlebars.compile).toHaveBeenCalledWith(templateContent);
      expect(compiledTemplate).toHaveBeenCalledWith(mockData);
      expect(resultado).toBe('Olá João, seu ID é 123');
      expect(logger.debug).toHaveBeenCalledWith(
        { templatePath },
        'Template renderizado com sucesso'
      );
    });

    it('deve lançar erro quando templatePath for vazio', () => {
      expect(() => renderTemplate('', mockData)).toThrow(TemplateError);
      expect(() => renderTemplate('', mockData)).toThrow(
        'Caminho do template é obrigatório'
      );
    });

    it('deve lançar erro quando templatePath não for string', () => {
      expect(() => renderTemplate(null as any, mockData)).toThrow(TemplateError);
      expect(() => renderTemplate(undefined as any, mockData)).toThrow(TemplateError);
    });

    it('deve lançar erro quando template não existir', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => renderTemplate(templatePath, mockData)).toThrow(TemplateError);
      expect(() => renderTemplate(templatePath, mockData)).toThrow(
        `Template não encontrado: ${templatePath}`
      );
    });

    it('deve lançar erro quando template estiver vazio', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('');

      expect(() => renderTemplate(templatePath, mockData)).toThrow(TemplateError);
      expect(() => renderTemplate(templatePath, mockData)).toThrow('Template vazio');
    });

    it('deve lançar erro quando template tiver apenas espaços', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('   ');

      expect(() => renderTemplate(templatePath, mockData)).toThrow('Template vazio');
    });

    it('deve lançar TemplateError quando readFileSync falhar', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Erro de leitura');
      });

      expect(() => renderTemplate(templatePath, mockData)).toThrow(TemplateError);
      expect(logger.error).toHaveBeenCalled();
    });

    it('deve lançar TemplateError quando handlebars.compile falhar', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('template content');
      vi.mocked(handlebars.compile).mockImplementation(() => {
        throw new Error('Erro de compilação');
      });

      expect(() => renderTemplate(templatePath, mockData)).toThrow(TemplateError);
    });

    it('deve logar erro ao falhar renderização', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      try {
        renderTemplate(templatePath, mockData);
      } catch (_) {}

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          templatePath,
          code: 'TEMPLATE_ERROR',
        }),
        'Erro ao renderizar template'
      );
    });
  });

  describe('sendChamadoAbertoEmail', () => {
    const chamadoValido: ChamadoData = {
      id: 'chamado-123',
      nomeUsuario: 'João Silva',
      emailUsuario: 'joao@email.com',
      assunto: 'Problema no sistema',
      dataAbertura: '2024-01-15T10:00:00Z',
      status: 'ABERTO',
    };

    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<p>Template</p>');
      vi.mocked(handlebars.compile).mockReturnValue(
        vi.fn().mockReturnValue('<p>Email HTML</p>')
      );
    });

    it('deve enviar email de chamado aberto com sucesso', async () => {
      vi.mocked(transporter.sendMail).mockResolvedValue({ messageId: '123' } as any);

      await sendChamadoAbertoEmail(chamadoValido);

      expect(transporter.sendMail).toHaveBeenCalledWith({
        from: '"Help Me Test" <test@helpme.com>',
        to: chamadoValido.emailUsuario,
        subject: `Seu chamado #${chamadoValido.id} foi aberto!`,
        html: '<p>Email HTML</p>',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          chamadoId: chamadoValido.id,
          status: 'ABERTO',
        }),
        'Email de chamado aberto enviado com sucesso'
      );
    });

    it('deve usar SMTP_FROM padrão quando variável de ambiente não existir', async () => {
      delete process.env.SMTP_FROM;
      vi.mocked(transporter.sendMail).mockResolvedValue({ messageId: '123' } as any);

      await sendChamadoAbertoEmail(chamadoValido);

      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Help Me" <noreply@helpme.com>',
        })
      );
    });

    it('deve lançar erro quando dados do chamado forem null', async () => {
      await expect(sendChamadoAbertoEmail(null as any)).rejects.toThrow(ConsumerError);
      await expect(sendChamadoAbertoEmail(null as any)).rejects.toThrow(
        'Dados do chamado são obrigatórios'
      );
    });

    it('deve lançar erro quando dados do chamado forem undefined', async () => {
      await expect(sendChamadoAbertoEmail(undefined as any)).rejects.toThrow(ConsumerError);
    });

    it('deve lançar erro quando id estiver ausente', async () => {
      const chamadoInvalido = { ...chamadoValido, id: '' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido as any)).rejects.toThrow(ConsumerError);
      await expect(sendChamadoAbertoEmail(chamadoInvalido as any)).rejects.toThrow(
        'Campos obrigatórios ausentes'
      );
    });

    it('deve lançar erro quando nomeUsuario estiver ausente', async () => {
      const chamadoInvalido = { ...chamadoValido, nomeUsuario: '' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido as any)).rejects.toThrow(
        'Campos obrigatórios ausentes'
      );
    });

    it('deve lançar erro quando emailUsuario estiver ausente', async () => {
      const chamadoInvalido = { ...chamadoValido, emailUsuario: '' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido as any)).rejects.toThrow(
        'Campos obrigatórios ausentes'
      );
    });

    it('deve lançar erro quando assunto estiver ausente', async () => {
      const chamadoInvalido = { ...chamadoValido, assunto: '' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido as any)).rejects.toThrow(
        'Campos obrigatórios ausentes'
      );
    });

    it('deve lançar erro quando status estiver ausente', async () => {
      const chamadoInvalido = { ...chamadoValido, status: '' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido as any)).rejects.toThrow(
        'Campos obrigatórios ausentes'
      );
    });

    it('deve lançar erro quando múltiplos campos estiverem ausentes', async () => {
      const chamadoInvalido = {
        ...chamadoValido,
        id: '',
        nomeUsuario: '',
        emailUsuario: '',
      };

      const erro = await sendChamadoAbertoEmail(chamadoInvalido as any).catch((e) => e);

      expect(erro).toBeInstanceOf(ConsumerError);
      expect(erro.message).toContain('id');
      expect(erro.message).toContain('nomeUsuario');
      expect(erro.message).toContain('emailUsuario');
    });

    it('deve lançar erro quando email for inválido', async () => {
      const chamadoInvalido = { ...chamadoValido, emailUsuario: 'email-invalido' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido)).rejects.toThrow(ConsumerError);
      await expect(sendChamadoAbertoEmail(chamadoInvalido)).rejects.toThrow(
        'Email do usuário inválido'
      );
    });

    it('deve lançar erro quando email não tiver @', async () => {
      const chamadoInvalido = { ...chamadoValido, emailUsuario: 'emailsemarroba' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido)).rejects.toThrow(
        'Email do usuário inválido'
      );
    });

    it('deve lançar erro quando email não tiver domínio', async () => {
      const chamadoInvalido = { ...chamadoValido, emailUsuario: 'email@' };

      await expect(sendChamadoAbertoEmail(chamadoInvalido)).rejects.toThrow(
        'Email do usuário inválido'
      );
    });

    it('deve lançar EmailError quando transporter.sendMail falhar', async () => {
      const erroEmail = new Error('SMTP connection failed');
      vi.mocked(transporter.sendMail).mockRejectedValue(erroEmail);

      const erro = await sendChamadoAbertoEmail(chamadoValido).catch((e) => e);

      expect(erro).toBeInstanceOf(EmailError);
      expect(erro.message).toBe('Falha ao enviar email de chamado aberto');
      expect(erro.chamadoId).toBe(chamadoValido.id);
      expect(erro.originalError).toBe(erroEmail);
    });

    it('deve logar erro quando sendMail falhar', async () => {
      vi.mocked(transporter.sendMail).mockRejectedValue(new Error('SMTP error'));

      await sendChamadoAbertoEmail(chamadoValido).catch(() => {});

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          chamadoId: chamadoValido.id,
          emailUsuario: chamadoValido.emailUsuario,
        }),
        'Erro ao enviar email de chamado aberto'
      );
    });

    it('deve propagar TemplateError quando renderTemplate falhar', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(sendChamadoAbertoEmail(chamadoValido)).rejects.toThrow(TemplateError);
    });

    it('deve logar erro de validação', async () => {
      await sendChamadoAbertoEmail(null as any).catch(() => {});

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(ConsumerError),
        }),
        'Erro de validação ao enviar email de chamado aberto'
      );
    });
  });

  describe('sendChamadoEncerradoEmail', () => {
    const chamadoValido: ChamadoData = {
      id: 'chamado-456',
      nomeUsuario: 'Maria Santos',
      emailUsuario: 'maria@email.com',
      assunto: 'Problema resolvido',
      dataAbertura: '2024-01-15T10:00:00Z',
      dataEncerramento: '2024-01-16T15:30:00Z',
      status: 'ENCERRADO',
    };

    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<p>Template</p>');
      vi.mocked(handlebars.compile).mockReturnValue(
        vi.fn().mockReturnValue('<p>Email HTML Encerrado</p>')
      );
    });

    it('deve enviar email de chamado encerrado com sucesso', async () => {
      vi.mocked(transporter.sendMail).mockResolvedValue({ messageId: '456' } as any);

      await sendChamadoEncerradoEmail(chamadoValido);

      expect(transporter.sendMail).toHaveBeenCalledWith({
        from: '"Help Me Test" <test@helpme.com>',
        to: chamadoValido.emailUsuario,
        subject: `Seu chamado #${chamadoValido.id} foi encerrado`,
        html: '<p>Email HTML Encerrado</p>',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          chamadoId: chamadoValido.id,
          status: 'ENCERRADO',
        }),
        'Email de chamado encerrado enviado com sucesso'
      );
    });

    it('deve lançar erro quando dataEncerramento estiver ausente', async () => {
      const chamadoSemDataEncerramento = { ...chamadoValido, dataEncerramento: undefined };

      await expect(
        sendChamadoEncerradoEmail(chamadoSemDataEncerramento as any)
      ).rejects.toThrow(ConsumerError);
      await expect(
        sendChamadoEncerradoEmail(chamadoSemDataEncerramento as any)
      ).rejects.toThrow('Data de encerramento é obrigatória');
    });

    it('deve lançar erro quando dados do chamado forem inválidos', async () => {
      await expect(sendChamadoEncerradoEmail(null as any)).rejects.toThrow(ConsumerError);
    });

    it('deve lançar erro quando email for inválido', async () => {
      const chamadoInvalido = { ...chamadoValido, emailUsuario: 'invalido' };

      await expect(sendChamadoEncerradoEmail(chamadoInvalido)).rejects.toThrow(
        'Email do usuário inválido'
      );
    });

    it('deve lançar EmailError quando transporter.sendMail falhar', async () => {
      const erroEmail = new Error('Network error');
      vi.mocked(transporter.sendMail).mockRejectedValue(erroEmail);

      const erro = await sendChamadoEncerradoEmail(chamadoValido).catch((e) => e);

      expect(erro).toBeInstanceOf(EmailError);
      expect(erro.message).toBe('Falha ao enviar email de chamado encerrado');
      expect(erro.originalError).toBe(erroEmail);
    });

    it('deve usar SMTP_FROM padrão quando não configurado', async () => {
      delete process.env.SMTP_FROM;
      vi.mocked(transporter.sendMail).mockResolvedValue({ messageId: '789' } as any);

      await sendChamadoEncerradoEmail(chamadoValido);

      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Help Me" <noreply@helpme.com>',
        })
      );
    });

    it('deve logar erro de validação', async () => {
      const chamadoSemData = { ...chamadoValido, dataEncerramento: undefined };

      await sendChamadoEncerradoEmail(chamadoSemData as any).catch(() => {});

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(ConsumerError),
        }),
        'Erro de validação ao enviar email de chamado encerrado'
      );
    });
  });

  describe('processKafkaMessage', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<p>Template</p>');
      vi.mocked(handlebars.compile).mockReturnValue(
        vi.fn().mockReturnValue('<p>Email</p>')
      );
      vi.mocked(transporter.sendMail).mockResolvedValue({ messageId: '1' } as any);
    });

    it('deve processar mensagem de chamado ABERTO', async () => {
      const chamado = {
        id: 'chamado-123',
        nomeUsuario: 'João',
        emailUsuario: 'joao@email.com',
        assunto: 'Teste',
        dataAbertura: '2024-01-15',
        status: 'ABERTO',
      };

      await processKafkaMessage(createMockPayload(chamado));

      expect(transporter.sendMail).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          chamadoId: chamado.id,
          status: 'ABERTO',
        }),
        'Mensagem recebida do Kafka'
      );
    });

    it('deve processar mensagem de chamado ENCERRADO', async () => {
      const chamado = {
        id: 'chamado-456',
        nomeUsuario: 'Maria',
        emailUsuario: 'maria@email.com',
        assunto: 'Resolvido',
        dataAbertura: '2024-01-15',
        dataEncerramento: '2024-01-16',
        status: 'ENCERRADO',
      };

      await processKafkaMessage(createMockPayload(chamado));

      expect(transporter.sendMail).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ENCERRADO' }),
        'Mensagem recebida do Kafka'
      );
    });

    it('deve logar warning quando mensagem não tiver valor', async () => {
      await processKafkaMessage(createMockPayload({}, false));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'chamado-status' }),
        'Mensagem sem valor recebida'
      );
      expect(transporter.sendMail).not.toHaveBeenCalled();
    });

    it('deve logar warning para status não tratado', async () => {
      const chamado = {
        id: 'chamado-789',
        nomeUsuario: 'Pedro',
        emailUsuario: 'pedro@email.com',
        assunto: 'Outro',
        dataAbertura: '2024-01-15',
        status: 'EM_ATENDIMENTO',
      };

      await processKafkaMessage(createMockPayload(chamado));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'EM_ATENDIMENTO',
          chamadoId: chamado.id,
        }),
        'Status de chamado não tratado'
      );
      expect(transporter.sendMail).not.toHaveBeenCalled();
    });

    it('deve capturar erro ao processar mensagem inválida', async () => {
      const payloadInvalido = createMockPayload({ status: 'ABERTO' }); // faltam campos

      await processKafkaMessage(payloadInvalido);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Erro ao processar mensagem do Kafka'
      );
    });

    it('deve capturar erro ao processar JSON inválido', async () => {
      const payload: EachMessagePayload = {
        topic: 'chamado-status',
        partition: 0,
        message: {
          key: null,
          value: Buffer.from('JSON inválido {{{'),
          timestamp: '1234567890',
          size: 100,
          attributes: 0,
          offset: '0',
          headers: undefined,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      };

      await processKafkaMessage(payload);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Erro ao processar mensagem do Kafka'
      );
    });

    it('não deve propagar erro para não parar o consumer', async () => {
      vi.mocked(transporter.sendMail).mockRejectedValue(new Error('Email error'));

      const chamado = {
        id: 'chamado-error',
        nomeUsuario: 'Test',
        emailUsuario: 'test@email.com',
        assunto: 'Error test',
        dataAbertura: '2024-01-15',
        status: 'ABERTO',
      };

      await expect(
        processKafkaMessage(createMockPayload(chamado))
      ).resolves.not.toThrow();
    });
  });

  describe('startChamadoConsumer', () => {
    it('deve iniciar consumer com sucesso', async () => {
      await startChamadoConsumer();

      expect(kafka.consumer).toHaveBeenCalledWith({ groupId: 'chamado-group' });
      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'chamado-status',
        fromBeginning: false,
      });
      expect(mockConsumer.run).toHaveBeenCalledWith({
        eachMessage: expect.any(Function),
      });
      expect(isChamadoConsumerRunning()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Kafka Consumer iniciado com sucesso');
    });

    it('deve logar cada etapa do processo', async () => {
      await startChamadoConsumer();

      expect(logger.debug).toHaveBeenCalledWith('Consumer instance criada');
      expect(logger.info).toHaveBeenCalledWith('Kafka Consumer conectado');
      expect(logger.info).toHaveBeenCalledWith(
        { topic: 'chamado-status' },
        'Inscrito no tópico Kafka'
      );
    });

    it('deve reutilizar consumer instance existente', async () => {
      await startChamadoConsumer();
      resetConsumerState();

      await startChamadoConsumer();

      expect(kafka.consumer).toHaveBeenCalled();
    });

    it('não deve criar novo consumer se já estiver rodando', async () => {
      await startChamadoConsumer();

      vi.clearAllMocks();

      await startChamadoConsumer();

      expect(logger.warn).toHaveBeenCalledWith('Consumer já está em execução');
      expect(kafka.consumer).not.toHaveBeenCalled();
      expect(mockConsumer.connect).not.toHaveBeenCalled();
    });

    it('deve lançar ConsumerError quando connect falhar', async () => {
      const erroConexao = new Error('Kafka connection failed');
      mockConsumer.connect.mockRejectedValue(erroConexao);

      const erro = await startChamadoConsumer().catch((e) => e);

      expect(erro).toBeInstanceOf(ConsumerError);
      expect(erro.code).toBe('START_ERROR');
      expect(erro.originalError).toBe(erroConexao);
      expect(isChamadoConsumerRunning()).toBe(false);
    });

    it('deve lançar erro quando subscribe falhar', async () => {
      mockConsumer.subscribe.mockRejectedValue(new Error('Subscribe error'));

      await expect(startChamadoConsumer()).rejects.toThrow(ConsumerError);
      expect(isChamadoConsumerRunning()).toBe(false);
    });

    it('deve lançar erro quando run falhar', async () => {
      mockConsumer.run.mockRejectedValue(new Error('Run error'));

      await expect(startChamadoConsumer()).rejects.toThrow(ConsumerError);
      expect(isChamadoConsumerRunning()).toBe(false);
    });

    it('deve limpar estado quando falhar ao iniciar', async () => {
      mockConsumer.connect.mockRejectedValue(new Error('Connection error'));

      await startChamadoConsumer().catch(() => {});

      expect(isChamadoConsumerRunning()).toBe(false);
    });

    it('deve logar erro ao falhar', async () => {
      const erro = new Error('Start failed');
      mockConsumer.connect.mockRejectedValue(erro);

      await startChamadoConsumer().catch(() => {});

      expect(logger.error).toHaveBeenCalledWith(
        { err: erro },
        'Erro ao iniciar Kafka Consumer'
      );
    });
  });

  describe('stopChamadoConsumer', () => {
    beforeEach(async () => {
      await startChamadoConsumer();
    });

    it('deve parar consumer com sucesso', async () => {
      await stopChamadoConsumer();

      expect(mockConsumer.stop).toHaveBeenCalled();
      expect(mockConsumer.disconnect).toHaveBeenCalled();
      expect(isChamadoConsumerRunning()).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Kafka Consumer parado com sucesso');
    });

    it('deve logar antes de parar', async () => {
      await stopChamadoConsumer();

      expect(logger.info).toHaveBeenCalledWith('Parando Kafka Consumer...');
    });

    it('não deve fazer nada se consumer não estiver rodando', async () => {
      await stopChamadoConsumer();

      vi.clearAllMocks();

      await stopChamadoConsumer();

      expect(logger.debug).toHaveBeenCalledWith('Consumer não está em execução');
      expect(mockConsumer.stop).not.toHaveBeenCalled();
    });

    it('deve lançar ConsumerError quando stop falhar', async () => {
      const erroStop = new Error('Stop failed');
      mockConsumer.stop.mockRejectedValue(erroStop);

      const erro = await stopChamadoConsumer().catch((e) => e);

      expect(erro).toBeInstanceOf(ConsumerError);
      expect(erro.code).toBe('STOP_ERROR');
      expect(erro.originalError).toBe(erroStop);
    });

    it('deve lançar erro quando disconnect falhar', async () => {
      mockConsumer.disconnect.mockRejectedValue(new Error('Disconnect error'));

      await expect(stopChamadoConsumer()).rejects.toThrow(ConsumerError);
    });

    it('deve limpar estado mesmo em caso de erro', async () => {
      mockConsumer.stop.mockRejectedValue(new Error('Error'));

      await stopChamadoConsumer().catch(() => {});

      expect(isChamadoConsumerRunning()).toBe(false);
    });

    it('deve logar erro ao falhar', async () => {
      const erro = new Error('Stop error');
      mockConsumer.stop.mockRejectedValue(erro);

      await stopChamadoConsumer().catch(() => {});

      expect(logger.error).toHaveBeenCalledWith(
        { err: erro },
        'Erro ao parar Kafka Consumer'
      );
    });
  });

  describe('isChamadoConsumerRunning', () => {
    it('deve retornar false quando consumer não estiver rodando', () => {
      expect(isChamadoConsumerRunning()).toBe(false);
    });

    it('deve retornar true quando consumer estiver rodando', async () => {
      await startChamadoConsumer();

      expect(isChamadoConsumerRunning()).toBe(true);
    });

    it('deve retornar false após parar consumer', async () => {
      await startChamadoConsumer();
      await stopChamadoConsumer();

      expect(isChamadoConsumerRunning()).toBe(false);
    });
  });

  describe('resetConsumerState', () => {
    it('deve resetar estado do consumer', async () => {
      await startChamadoConsumer();

      resetConsumerState();

      expect(isChamadoConsumerRunning()).toBe(false);
    });
  });

  describe('Classes de Erro', () => {
    describe('ConsumerError', () => {
      it('deve criar erro com todas as propriedades', () => {
        const originalError = new Error('Original');
        const erro = new ConsumerError('Mensagem', 'CODE', originalError);

        expect(erro.message).toBe('Mensagem');
        expect(erro.code).toBe('CODE');
        expect(erro.originalError).toBe(originalError);
        expect(erro.name).toBe('ConsumerError');
      });

      it('deve criar erro sem originalError', () => {
        const erro = new ConsumerError('Mensagem', 'CODE');

        expect(erro.originalError).toBeUndefined();
      });
    });

    describe('TemplateError', () => {
      it('deve criar erro com todas as propriedades', () => {
        const originalError = new Error('Original');
        const erro = new TemplateError('Mensagem', '/path/to/template', originalError);

        expect(erro.message).toBe('Mensagem');
        expect(erro.templatePath).toBe('/path/to/template');
        expect(erro.originalError).toBe(originalError);
        expect(erro.name).toBe('TemplateError');
      });

      it('deve criar erro sem originalError', () => {
        const erro = new TemplateError('Mensagem', '/path');

        expect(erro.originalError).toBeUndefined();
      });
    });

    describe('EmailError', () => {
      it('deve criar erro com todas as propriedades', () => {
        const originalError = new Error('Original');
        const erro = new EmailError('Mensagem', 'chamado-123', originalError);

        expect(erro.message).toBe('Mensagem');
        expect(erro.chamadoId).toBe('chamado-123');
        expect(erro.originalError).toBe(originalError);
        expect(erro.name).toBe('EmailError');
      });

      it('deve criar erro sem originalError', () => {
        const erro = new EmailError('Mensagem', 'chamado-456');

        expect(erro.originalError).toBeUndefined();
      });
    });
  });
});