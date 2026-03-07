import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const kafkaConsumerMock = {
  connect:    vi.fn(),
  disconnect: vi.fn(),
  subscribe:  vi.fn(),
  run:        vi.fn(),
  stop:       vi.fn(),
};

vi.mock('@shared/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@infrastructure/messaging/kafka/client', () => ({
  kafka: {
    consumer: vi.fn(() => kafkaConsumerMock),
  },
}));

vi.mock('@infrastructure/email/email.service', () => ({
  transporter: {
    sendMail: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync:   vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('<p>{{nomeUsuario}}</p>'),
  },
}));

vi.mock('handlebars', () => ({
  default: {
    compile: vi.fn(() => vi.fn().mockReturnValue('<p>João Silva</p>')),
  },
}));

import fs from 'fs';
import handlebars  from 'handlebars';

import {
  renderTemplate,
  sendChamadoAbertoEmail,
  sendChamadoEncerradoEmail,
  processKafkaMessage,
  startChamadoConsumer,
  stopChamadoConsumer,
  isChamadoConsumerRunning,
  resetConsumerState,
  ConsumerError,
  TemplateError,
  EmailError,
  type ChamadoData,
} from '@infrastructure/messaging/kafka/consumers/chamado.consumer';

import { logger } from '@shared/config/logger';
import { kafka } from '@infrastructure/messaging/kafka/client';
import { transporter } from '@infrastructure/email/email.service';

const fsMock       = vi.mocked(fs);
const handlebarsM  = vi.mocked(handlebars);
const loggerMock   = vi.mocked(logger);
const kafkaMock    = vi.mocked(kafka);
const transporterM = vi.mocked(transporter);

const chamadoAbertoValido: ChamadoData = {
  id:           'ch-001',
  nomeUsuario:  'João Silva',
  emailUsuario: 'joao@empresa.com',
  assunto:      'Computador não liga',
  dataAbertura: '2025-01-01T10:00:00.000Z',
  status:       'ABERTO',
};

const chamadoEncerradoValido: ChamadoData = {
  ...chamadoAbertoValido,
  status:           'ENCERRADO',
  dataEncerramento: '2025-01-02T15:00:00.000Z',
};

function makeMensagemKafka(payload: object | null, offset = '0') {
  return {
    topic:     'chamado-status',
    partition: 0,
    message: {
      offset,
      value: payload ? Buffer.from(JSON.stringify(payload)) : null,
    },
  } as unknown as Parameters<typeof processKafkaMessage>[0];
}

beforeEach(() => {
  vi.clearAllMocks();

  // Restaura comportamento padrão dos mocks de fs e handlebars após clearAllMocks
  fsMock.existsSync   = vi.fn().mockReturnValue(true);
  fsMock.readFileSync = vi.fn().mockReturnValue('<p>{{nomeUsuario}}</p>') as any;

  const compiledFn    = vi.fn().mockReturnValue('<p>João Silva</p>');
  handlebarsM.compile = vi.fn().mockReturnValue(compiledFn);

  transporterM.sendMail = vi.fn().mockResolvedValue({ messageId: 'ok' });

  // Restaura mocks do consumer Kafka
  kafkaConsumerMock.connect    = vi.fn().mockResolvedValue(undefined);
  kafkaConsumerMock.disconnect = vi.fn().mockResolvedValue(undefined);
  kafkaConsumerMock.subscribe  = vi.fn().mockResolvedValue(undefined);
  kafkaConsumerMock.run        = vi.fn().mockResolvedValue(undefined);
  kafkaConsumerMock.stop       = vi.fn().mockResolvedValue(undefined);

  // Reseta estado do consumer SEM interagir com o Kafka real
  resetConsumerState();
});

afterEach(() => {
  resetConsumerState();
});

describe('renderTemplate', () => {
  describe('Casos de sucesso', () => {
    it('deve renderizar template com os dados fornecidos', () => {
      const resultado = renderTemplate('src/templates/chamado-aberto.hbs', { nome: 'João' });
      expect(resultado).toBe('<p>João Silva</p>');
      expect(fsMock.existsSync).toHaveBeenCalledWith('src/templates/chamado-aberto.hbs');
      expect(fsMock.readFileSync).toHaveBeenCalledWith('src/templates/chamado-aberto.hbs', 'utf-8');
      expect(handlebarsM.compile).toHaveBeenCalledWith('<p>{{nomeUsuario}}</p>');
    });

    it('deve logar debug no início e no fim da renderização', () => {
      renderTemplate('src/templates/chamado-aberto.hbs', {});
      expect(loggerMock.debug).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validações de caminho', () => {
    it('deve lançar TemplateError para caminho vazio', () => {
      expect(() => renderTemplate('', {})).toThrow(TemplateError);
    });

    it('deve lançar TemplateError com mensagem correta para caminho vazio', () => {
      try {
        renderTemplate('', {});
      } catch (e) {
        expect(e).toBeInstanceOf(TemplateError);
        expect((e as TemplateError).message).toBe('Caminho do template é obrigatório');
        expect((e as TemplateError).templatePath).toBe('');
      }
    });

    it('deve lançar TemplateError quando template não existe no fs', () => {
      fsMock.existsSync = vi.fn().mockReturnValue(false);
      expect(() => renderTemplate('src/templates/inexistente.hbs', {})).toThrow(TemplateError);
    });

    it('deve lançar TemplateError com mensagem correta para template inexistente', () => {
      fsMock.existsSync = vi.fn().mockReturnValue(false);
      try {
        renderTemplate('src/templates/inexistente.hbs', {});
      } catch (e) {
        expect((e as TemplateError).message).toContain('Template não encontrado');
        expect((e as TemplateError).templatePath).toBe('src/templates/inexistente.hbs');
      }
    });

    it('deve lançar TemplateError para template com conteúdo em branco', () => {
      fsMock.readFileSync = vi.fn().mockReturnValue('   ') as any;
      expect(() => renderTemplate('src/templates/chamado-aberto.hbs', {})).toThrow(TemplateError);
    });

    it('deve lançar TemplateError com mensagem "Template vazio"', () => {
      fsMock.readFileSync = vi.fn().mockReturnValue('') as any;
      try {
        renderTemplate('src/templates/chamado-aberto.hbs', {});
      } catch (e) {
        expect((e as TemplateError).message).toBe('Template vazio');
      }
    });
  });

  describe('Erros inesperados', () => {
    it('deve embrulhar erro genérico do readFileSync em TemplateError com originalError', () => {
      const erroIo = new Error('EACCES: permission denied');
      // Substitui diretamente sem depender do estado acumulado
      fsMock.readFileSync = vi.fn().mockImplementation(() => { throw erroIo; }) as any;

      try {
        renderTemplate('src/templates/chamado-aberto.hbs', {});
      } catch (e) {
        expect(e).toBeInstanceOf(TemplateError);
        expect((e as TemplateError).originalError).toBe(erroIo);
        expect((e as TemplateError).message).toBe('Falha ao renderizar template');
      }
    });

    it('deve logar error ao capturar TemplateError', () => {
      fsMock.existsSync = vi.fn().mockReturnValue(false);
      try { renderTemplate('x.hbs', {}); } catch {}
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});

describe('sendChamadoAbertoEmail', () => {
  describe('Casos de sucesso', () => {
    it('deve enviar email com destinatário e assunto corretos', async () => {
      await sendChamadoAbertoEmail(chamadoAbertoValido);

      expect(transporterM.sendMail).toHaveBeenCalledOnce();
      const mailArg = (transporterM.sendMail as any).mock.calls[0][0];
      expect(mailArg.to).toBe('joao@empresa.com');
      expect(mailArg.subject).toContain('ch-001');
      expect(mailArg.subject).toContain('aberto');
    });

    it('deve logar info após envio bem-sucedido', async () => {
      await sendChamadoAbertoEmail(chamadoAbertoValido);
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ chamadoId: 'ch-001', status: 'ABERTO' }),
        expect.any(String)
      );
    });

    it('deve usar SMTP_FROM do env quando definido', async () => {
      process.env.SMTP_FROM = 'suporte@empresa.com';
      await sendChamadoAbertoEmail(chamadoAbertoValido);
      const mailArg = (transporterM.sendMail as any).mock.calls[0][0];
      expect(mailArg.from).toBe('suporte@empresa.com');
      delete process.env.SMTP_FROM;
    });

    it('deve usar remetente padrão quando SMTP_FROM não está definido', async () => {
      delete process.env.SMTP_FROM;
      await sendChamadoAbertoEmail(chamadoAbertoValido);
      const mailArg = (transporterM.sendMail as any).mock.calls[0][0];
      expect(mailArg.from).toContain('noreply@helpme.com');
    });
  });

  describe('Validações', () => {
    it('deve lançar ConsumerError para chamado nulo', async () => {
      await expect(sendChamadoAbertoEmail(null as any)).rejects.toThrow(ConsumerError);
    });

    it('deve lançar ConsumerError com code MISSING_FIELDS para campos faltantes', async () => {
      const incompleto = { id: 'ch-001', status: 'ABERTO' } as any;
      try {
        await sendChamadoAbertoEmail(incompleto);
      } catch (e) {
        expect((e as ConsumerError).code).toBe('MISSING_FIELDS');
      }
    });

    it('deve lançar ConsumerError com code INVALID_EMAIL para email inválido', async () => {
      const invalido = { ...chamadoAbertoValido, emailUsuario: 'nao-e-email' };
      try {
        await sendChamadoAbertoEmail(invalido);
      } catch (e) {
        expect((e as ConsumerError).code).toBe('INVALID_EMAIL');
      }
    });
  });

  describe('Erros de envio', () => {
    it('deve lançar EmailError quando transporter falhar', async () => {
      transporterM.sendMail = vi.fn().mockRejectedValue(new Error('SMTP error'));
      await expect(sendChamadoAbertoEmail(chamadoAbertoValido)).rejects.toThrow(EmailError);
    });

    it('deve incluir chamadoId e originalError no EmailError', async () => {
      const erroSmtp = new Error('Connection refused');
      transporterM.sendMail = vi.fn().mockRejectedValue(erroSmtp);
      try {
        await sendChamadoAbertoEmail(chamadoAbertoValido);
      } catch (e) {
        expect((e as EmailError).chamadoId).toBe('ch-001');
        expect((e as EmailError).originalError).toBe(erroSmtp);
      }
    });

    it('deve propagar TemplateError diretamente sem embrulhar em EmailError', async () => {
      fsMock.existsSync = vi.fn().mockReturnValue(false);
      await expect(sendChamadoAbertoEmail(chamadoAbertoValido)).rejects.toThrow(TemplateError);
      await expect(sendChamadoAbertoEmail(chamadoAbertoValido)).rejects.not.toThrow(EmailError);
    });
  });
});

describe('sendChamadoEncerradoEmail', () => {
  describe('Casos de sucesso', () => {
    it('deve enviar email com destinatário e assunto corretos', async () => {
      await sendChamadoEncerradoEmail(chamadoEncerradoValido);

      expect(transporterM.sendMail).toHaveBeenCalledOnce();
      const mailArg = (transporterM.sendMail as any).mock.calls[0][0];
      expect(mailArg.to).toBe('joao@empresa.com');
      expect(mailArg.subject).toContain('ch-001');
      expect(mailArg.subject).toContain('encerrado');
    });

    it('deve logar info após envio bem-sucedido', async () => {
      await sendChamadoEncerradoEmail(chamadoEncerradoValido);
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ chamadoId: 'ch-001', status: 'ENCERRADO' }),
        expect.any(String)
      );
    });
  });

  describe('Validações', () => {
    it('deve lançar ConsumerError para chamado nulo', async () => {
      await expect(sendChamadoEncerradoEmail(null as any)).rejects.toThrow(ConsumerError);
    });

    it('deve lançar ConsumerError com code MISSING_ENCERRAMENTO_DATE', async () => {
      const semData = { ...chamadoEncerradoValido, dataEncerramento: undefined };
      try {
        await sendChamadoEncerradoEmail(semData);
      } catch (e) {
        expect((e as ConsumerError).code).toBe('MISSING_ENCERRAMENTO_DATE');
      }
    });

    it('deve lançar ConsumerError com code INVALID_EMAIL', async () => {
      const invalido = { ...chamadoEncerradoValido, emailUsuario: 'invalido' };
      try {
        await sendChamadoEncerradoEmail(invalido);
      } catch (e) {
        expect((e as ConsumerError).code).toBe('INVALID_EMAIL');
      }
    });
  });

  describe('Erros de envio', () => {
    it('deve lançar EmailError quando transporter falhar', async () => {
      transporterM.sendMail = vi.fn().mockRejectedValue(new Error('SMTP error'));
      await expect(sendChamadoEncerradoEmail(chamadoEncerradoValido)).rejects.toThrow(EmailError);
    });

    it('deve incluir chamadoId correto no EmailError', async () => {
      transporterM.sendMail = vi.fn().mockRejectedValue(new Error('SMTP error'));
      try {
        await sendChamadoEncerradoEmail(chamadoEncerradoValido);
      } catch (e) {
        expect((e as EmailError).chamadoId).toBe('ch-001');
      }
    });

    it('deve propagar ConsumerError diretamente sem embrulhar em EmailError', async () => {
      const semData = { ...chamadoEncerradoValido, dataEncerramento: undefined };
      await expect(sendChamadoEncerradoEmail(semData)).rejects.toThrow(ConsumerError);
      await expect(sendChamadoEncerradoEmail(semData)).rejects.not.toThrow(EmailError);
    });
  });
});

describe('processKafkaMessage', () => {
  describe('Mensagens válidas', () => {
    it('deve chamar sendChamadoAbertoEmail para status ABERTO', async () => {
      await processKafkaMessage(makeMensagemKafka(chamadoAbertoValido));
      expect(transporterM.sendMail).toHaveBeenCalledOnce();
    });

    it('deve chamar sendChamadoEncerradoEmail para status ENCERRADO', async () => {
      await processKafkaMessage(makeMensagemKafka(chamadoEncerradoValido));
      expect(transporterM.sendMail).toHaveBeenCalledOnce();
    });

    it('deve logar warn para status não tratado', async () => {
      const payload = { ...chamadoAbertoValido, status: 'EM_ATENDIMENTO' };
      await processKafkaMessage(makeMensagemKafka(payload));
      expect(transporterM.sendMail).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EM_ATENDIMENTO' }),
        expect.any(String)
      );
    });
  });

  describe('Mensagens inválidas', () => {
    it('deve logar warn e não processar mensagem com value null', async () => {
      await processKafkaMessage(makeMensagemKafka(null));
      expect(transporterM.sendMail).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'chamado-status' }),
        expect.any(String)
      );
    });

    it('não deve propagar erro quando sendMail falhar (consumer não pode parar)', async () => {
      transporterM.sendMail = vi.fn().mockRejectedValue(new Error('SMTP down'));
      await expect(
        processKafkaMessage(makeMensagemKafka(chamadoAbertoValido))
      ).resolves.toBeUndefined();
    });

    it('não deve propagar erro quando JSON for inválido', async () => {
      const payloadInvalido = {
        topic:     'chamado-status',
        partition: 0,
        message:   { offset: '0', value: Buffer.from('{ json invalido') },
      } as unknown as Parameters<typeof processKafkaMessage>[0];

      await expect(processKafkaMessage(payloadInvalido)).resolves.toBeUndefined();
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('deve logar error quando ocorrer exceção no processamento', async () => {
      transporterM.sendMail = vi.fn().mockRejectedValue(new Error('falha'));
      await processKafkaMessage(makeMensagemKafka(chamadoAbertoValido));
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});

describe('startChamadoConsumer', () => {
  describe('Casos de sucesso', () => {
    it('deve conectar, subscrever e iniciar o consumer', async () => {
      await startChamadoConsumer();

      expect(kafkaMock.consumer).toHaveBeenCalledWith({ groupId: 'chamado-group' });
      expect(kafkaConsumerMock.connect).toHaveBeenCalledOnce();
      expect(kafkaConsumerMock.subscribe).toHaveBeenCalledWith({
        topic: 'chamado-status',
        fromBeginning: false,
      });
      expect(kafkaConsumerMock.run).toHaveBeenCalledWith(
        expect.objectContaining({ eachMessage: expect.any(Function) })
      );
    });

    it('deve marcar isChamadoConsumerRunning como true após iniciar', async () => {
      await startChamadoConsumer();
      expect(isChamadoConsumerRunning()).toBe(true);
    });

    it('deve logar warn e retornar sem reconectar se já estiver em execução', async () => {
      await startChamadoConsumer();
      vi.clearAllMocks();

      // Restaura mocks do consumer após clearAllMocks para o segundo start não travar
      kafkaConsumerMock.connect    = vi.fn().mockResolvedValue(undefined);
      kafkaConsumerMock.disconnect = vi.fn().mockResolvedValue(undefined);
      kafkaConsumerMock.subscribe  = vi.fn().mockResolvedValue(undefined);
      kafkaConsumerMock.run        = vi.fn().mockResolvedValue(undefined);
      kafkaConsumerMock.stop       = vi.fn().mockResolvedValue(undefined);

      await startChamadoConsumer();

      expect(kafkaConsumerMock.connect).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith('Consumer já está em execução');
    });
  });

  describe('Erros', () => {
    it('deve lançar ConsumerError com code START_ERROR quando connect falhar', async () => {
      kafkaConsumerMock.connect = vi.fn().mockRejectedValue(new Error('Broker unavailable'));
      try {
        await startChamadoConsumer();
      } catch (e) {
        expect(e).toBeInstanceOf(ConsumerError);
        expect((e as ConsumerError).code).toBe('START_ERROR');
      }
    });

    it('deve incluir originalError no ConsumerError de start', async () => {
      const erroOriginal = new Error('Broker unavailable');
      kafkaConsumerMock.connect = vi.fn().mockRejectedValue(erroOriginal);
      try {
        await startChamadoConsumer();
      } catch (e) {
        expect((e as ConsumerError).originalError).toBe(erroOriginal);
      }
    });

    it('deve resetar isRunning para false após falha no start', async () => {
      kafkaConsumerMock.connect = vi.fn().mockRejectedValue(new Error('erro'));
      try { await startChamadoConsumer(); } catch {}
      expect(isChamadoConsumerRunning()).toBe(false);
    });
  });
});

describe('stopChamadoConsumer', () => {
  describe('Casos de sucesso', () => {
    it('deve parar e desconectar o consumer em execução', async () => {
      await startChamadoConsumer();
      await stopChamadoConsumer();

      expect(kafkaConsumerMock.stop).toHaveBeenCalledOnce();
      expect(kafkaConsumerMock.disconnect).toHaveBeenCalledOnce();
    });

    it('deve marcar isChamadoConsumerRunning como false após parar', async () => {
      await startChamadoConsumer();
      await stopChamadoConsumer();
      expect(isChamadoConsumerRunning()).toBe(false);
    });

    it('deve retornar sem erro se consumer não estiver em execução', async () => {
      await expect(stopChamadoConsumer()).resolves.toBeUndefined();
      expect(kafkaConsumerMock.stop).not.toHaveBeenCalled();
    });
  });

  describe('Erros', () => {
    it('deve lançar ConsumerError com code STOP_ERROR quando stop falhar', async () => {
      await startChamadoConsumer();
      kafkaConsumerMock.stop = vi.fn().mockRejectedValue(new Error('stop error'));
      try {
        await stopChamadoConsumer();
      } catch (e) {
        expect(e).toBeInstanceOf(ConsumerError);
        expect((e as ConsumerError).code).toBe('STOP_ERROR');
      }
    });

    it('deve resetar estado mesmo quando stop lançar erro (bloco finally)', async () => {
      await startChamadoConsumer();
      kafkaConsumerMock.stop = vi.fn().mockRejectedValue(new Error('erro'));
      try { await stopChamadoConsumer(); } catch {}
      expect(isChamadoConsumerRunning()).toBe(false);
    });
  });
});

describe('isChamadoConsumerRunning', () => {
  it('deve retornar false quando consumer não foi iniciado', () => {
    expect(isChamadoConsumerRunning()).toBe(false);
  });

  it('deve retornar true após iniciar', async () => {
    await startChamadoConsumer();
    expect(isChamadoConsumerRunning()).toBe(true);
  });

  it('deve retornar false após parar', async () => {
    await startChamadoConsumer();
    await stopChamadoConsumer();
    expect(isChamadoConsumerRunning()).toBe(false);
  });
});

describe('resetConsumerState', () => {
  it('deve resetar isRunning para false', async () => {
    await startChamadoConsumer();
    resetConsumerState();
    expect(isChamadoConsumerRunning()).toBe(false);
  });

  it('deve permitir reiniciar o consumer após reset', async () => {
    await startChamadoConsumer();
    resetConsumerState();
    vi.clearAllMocks();

    // Restaura mocks do consumer após clearAllMocks
    kafkaConsumerMock.connect    = vi.fn().mockResolvedValue(undefined);
    kafkaConsumerMock.disconnect = vi.fn().mockResolvedValue(undefined);
    kafkaConsumerMock.subscribe  = vi.fn().mockResolvedValue(undefined);
    kafkaConsumerMock.run        = vi.fn().mockResolvedValue(undefined);
    kafkaConsumerMock.stop       = vi.fn().mockResolvedValue(undefined);

    await startChamadoConsumer();
    expect(kafkaConsumerMock.connect).toHaveBeenCalledOnce();
  });
});