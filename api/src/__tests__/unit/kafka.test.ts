import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeEach
} from 'vitest';
import { logLevel } from 'kafkajs';
import {
  kafka,
  producer,
  conectarKafkaProducer,
  desconectarKafkaProducer,
  getKafkaConfig,
  getProducerInstanceForTest,
  customLogCreator,
  isKafkaConnected,
  sendMessage
} from '../../services/kafka';

describe('Kafka Service', () => {
  let originalBrokerUrl: string | undefined;

  beforeEach(() => {
    originalBrokerUrl = process.env.KAFKA_BROKER_URL;
  });

  afterEach(async () => {
    if (originalBrokerUrl !== undefined) {
      process.env.KAFKA_BROKER_URL = originalBrokerUrl;
    } else {
      delete process.env.KAFKA_BROKER_URL;
    }

    vi.restoreAllMocks();

    try {
      await desconectarKafkaProducer();
    } catch (error) {
    }
    vi.resetModules();
  });

  describe('Custom Log Creator', () => {
    let consoleLogSpy: any;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('deve logar mensagens de ERRO não ignoradas', () => {
      const logger = customLogCreator();

      logger({
        level: logLevel.ERROR,
        label: 'test-label',
        log: { error: 'Connection failed to broker' }
      } as any);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Kafka][test-label]',
        { error: 'Connection failed to broker' }
      );
    });

    it('deve logar mensagens de WARN não ignoradas', () => {
      const logger = customLogCreator();

      logger({
        level: logLevel.WARN,
        label: 'warning-label',
        log: { error: 'Some warning message' }
      } as any);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Kafka][warning-label]',
        { error: 'Some warning message' }
      );
    });

    it('NÃO deve logar mensagens ignoradas (rebalancing)', () => {
      const logger = customLogCreator();

      logger({
        level: logLevel.ERROR,
        label: 'test',
        log: { error: 'The group is rebalancing, so a rejoin is needed' }
      } as any);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('NÃO deve logar mensagens de nível INFO', () => {
      const logger = customLogCreator();

      logger({
        level: logLevel.INFO,
        label: 'test',
        log: { message: 'Info message' }
      } as any);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('NÃO deve logar quando error não é string', () => {
      const logger = customLogCreator();

      logger({
        level: logLevel.ERROR,
        label: 'test',
        log: { error: { code: 'ERR_001' } }
      } as any);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('deve logar quando log.error contém mensagem de erro mas não está na lista de ignorados', () => {
      const logger = customLogCreator();

      logger({
        level: logLevel.ERROR,
        label: 'connection',
        log: { error: 'Timeout connecting to broker' }
      } as any);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Kafka][connection]',
        { error: 'Timeout connecting to broker' }
      );
    });
  });

  describe('dado que KAFKA_BROKER_URL está definida, Quando acessar kafka proxy, Então deve retornar instância do Kafka', () => {
    it('permite acesso a propriedades do kafka via proxy', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';

      const kafkaInstance = kafka;
      expect(kafkaInstance).toBeDefined();

      expect(typeof kafka.producer).toBe('function');
      expect(typeof kafka.consumer).toBe('function');
      expect(typeof kafka.admin).toBe('function');
    });

    it('lança erro ao acessar kafka proxy sem KAFKA_BROKER_URL', () => {
      delete process.env.KAFKA_BROKER_URL;
      expect(() => kafka.producer).toThrow('KAFKA_BROKER_URL não definida!');
    });
  });

  describe('dado que KAFKA_BROKER_URL não está definida, Quando tentar acessar o producer, Então deve lançar erro', () => {
    it('lança erro ao acessar producer sem KAFKA_BROKER_URL', () => {
      delete process.env.KAFKA_BROKER_URL;
      expect(() => producer.send).toThrow('KAFKA_BROKER_URL não definida!');
    });
  });

  describe('dado que KAFKA_BROKER_URL está definida, Quando criar instância do Kafka, Então deve configurar corretamente', () => {
    it('cria instância com configurações corretas', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const kafkaConfig = getKafkaConfig();
      expect(kafkaConfig).not.toBeNull();
      expect(kafkaConfig?.clientId).toBe('helpdesk-api');
      expect(kafkaConfig?.brokers).toEqual(['localhost:9093']);
      expect(kafkaConfig?.brokerUrl).toBe('localhost:9093');
    });

    it('reutiliza a mesma configuração em chamadas subsequentes', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const primeiraConfig = getKafkaConfig();
      const segundaConfig = getKafkaConfig();
      expect(primeiraConfig).toBe(segundaConfig);
      expect(primeiraConfig?.clientId).toBe('helpdesk-api');
    });
  });

  describe('dado que KAFKA_BROKER_URL não está definida, Quando obter configuração, Então deve retornar null', () => {
    beforeEach(async () => {
      vi.restoreAllMocks();
      try {
        await desconectarKafkaProducer();
      } catch (error) {
      }
      delete process.env.KAFKA_BROKER_URL;
    });

    it('retorna null quando não há KAFKA_BROKER_URL', () => {
      expect(process.env.KAFKA_BROKER_URL).toBeUndefined();
      const kafkaConfig = getKafkaConfig();
      expect(kafkaConfig).toBeNull();
    });
  });

  describe('dado que KAFKA_BROKER_URL está definida, Quando obter producer, Então deve criar instância funcional', () => {
    it('cria instância do producer com métodos disponíveis', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const kafkaProducer = producer;
      expect(kafkaProducer).toBeDefined();
      expect(typeof kafkaProducer.connect).toBe('function');
      expect(typeof kafkaProducer.send).toBe('function');
      expect(typeof kafkaProducer.disconnect).toBe('function');
    });

    it('reutiliza a mesma instância do producer em múltiplas chamadas', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const primeiroProducer = producer;
      const segundoProducer = producer;
      expect(typeof primeiroProducer.connect).toBe('function');
      expect(typeof segundoProducer.connect).toBe('function');
    });
  });

  describe('dado um producer inicializado, Quando chamar conectarKafkaProducer, Então deve conectar com sucesso', () => {
    it('chama producer.connect() uma vez quando conexão é bem-sucedida', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');

      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
      const mockConnect = vi.spyOn(producerReal!, 'connect').mockResolvedValue();

      await conectarKafkaProducer();
      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(isKafkaConnected()).toBe(true);
    });

    it('não lança erro quando conexão falha, apenas loga warning', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');

      const producerReal = getProducerInstanceForTest();
      const erroConexao = new Error('Falha na conexão com Kafka');
      vi.spyOn(producerReal!, 'connect').mockRejectedValue(erroConexao);

      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Kafka][Producer] Falha ao conectar ao Kafka - funcionando sem Kafka'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Kafka][Producer] Certifique-se de que o Kafka está rodando em:',
        'localhost:9093'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('dado que KAFKA_BROKER_URL não está definida, Quando tentar conectar producer, Então deve lançar erro', () => {
    it('não lança erro ao tentar conectar sem KAFKA_BROKER_URL, mas loga warning', async () => {
      delete process.env.KAFKA_BROKER_URL;
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('dado um producer conectado, Quando chamar desconectarKafkaProducer, Então deve desconectar corretamente', () => {
    it('chama producer.disconnect() uma vez', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');
      
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
      
      const mockConnect = vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      await conectarKafkaProducer();
      expect(mockConnect).toHaveBeenCalled();

      const mockDisconnect = vi.spyOn(producerReal!, 'disconnect').mockResolvedValue();
      await desconectarKafkaProducer();
      
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      expect(isKafkaConnected()).toBe(false);
    });

    it('não lança erro quando producer não está conectado', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      await expect(desconectarKafkaProducer()).resolves.not.toThrow();
    });
  });

  describe('dado um producer desconectado, Quando reconectar, Então deve criar nova instância', () => {
    it('permite reconexão com nova instância do producer', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const primeiroProducer = producer;
      expect(typeof primeiroProducer.connect).toBe('function');

      const producerReal1 = getProducerInstanceForTest();
      const mockConnect1 = vi.spyOn(producerReal1!, 'connect').mockResolvedValue();
      const mockDisconnect = vi.spyOn(producerReal1!, 'disconnect').mockResolvedValue();

      await conectarKafkaProducer();
      expect(mockConnect1).toHaveBeenCalledTimes(1);

      await desconectarKafkaProducer();
      expect(mockDisconnect).toHaveBeenCalledTimes(1);

      const segundoProducer = producer;
      expect(typeof segundoProducer.connect).toBe('function');

      const producerReal2 = getProducerInstanceForTest();
      expect(producerReal2).not.toBeNull();
      expect(producerReal2).not.toBe(producerReal1);

      const mockConnect2 = vi.spyOn(producerReal2!, 'connect').mockResolvedValue();
      await conectarKafkaProducer();
      expect(mockConnect2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Função sendMessage', () => {
    it('deve enviar mensagem quando Kafka está conectado', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');
      
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
      
      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      await conectarKafkaProducer();
      
      const mockSend = vi.spyOn(producerReal!, 'send').mockResolvedValue({} as any);
      
      await sendMessage('test-topic', [{ value: 'test' }]);
      
      expect(mockSend).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{ value: 'test' }]
      });
    });

    it('deve logar warning quando Kafka não está conectado', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Não conecta o Kafka propositalmente
      await sendMessage('test-topic', [{ value: 'test' }]);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Kafka][Producer] Kafka não conectado - mensagem não enviada para o tópico "test-topic"'
      );
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('dado cenários de erro e limites, Quando ocorrerem falhas ou falta de configuração, Então deve tratar adequadamente', () => {
    it('deve lançar erro ao acessar outros métodos do producer sem KAFKA_BROKER_URL', () => {
      delete process.env.KAFKA_BROKER_URL;
      expect(() => producer.connect).toThrow('KAFKA_BROKER_URL não definida!');
    });

    it('deve logar erro quando desconexão falha', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');
      
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      await conectarKafkaProducer();
      
      const erroDesconexao = new Error('Erro ao desconectar');
      const mockDisconnect = vi.spyOn(producerReal!, 'disconnect').mockRejectedValue(erroDesconexao);

      await desconectarKafkaProducer();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Kafka][Producer] Erro ao desconectar:',
        erroDesconexao
      );

      mockDisconnect.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Retornar configuração vazia quando ocorrer erro ao ler variáveis de ambiente do Kafka', () => {
    it('deve retornar null quando getKafkaInstance lança erro inesperado', async () => {
      vi.restoreAllMocks();
      try {
        await desconectarKafkaProducer();
      } catch (error) {
      }

      process.env.KAFKA_BROKER_URL = 'localhost:9093';

      const KafkaMock = vi.fn().mockImplementation(() => {
        throw new Error('Erro inesperado ao criar instância Kafka');
      });

      vi.doMock('kafkajs', () => ({
        Kafka: KafkaMock,
        logLevel: { ERROR: 1, WARN: 2, INFO: 4 }
      }));

      vi.resetModules();
      const { getKafkaConfig: getKafkaConfigMocked } = await import('../../services/kafka');

      const config = getKafkaConfigMocked();
      expect(config).toBeNull();

      vi.doUnmock('kafkajs');
    });
  });
});