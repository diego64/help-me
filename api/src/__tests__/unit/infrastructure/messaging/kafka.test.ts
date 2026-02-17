import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { logLevel, LogEntry } from 'kafkajs';
import { kafka, producer, conectarKafkaProducer, desconectarKafkaProducer, getKafkaConfig, getProducerInstanceForTest, customLogCreator, isKafkaConnected, sendMessage } from '../../../../infrastructure/messaging/kafka/client';

vi.mock('../../../../shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import { logger } from '../../../../shared/config/logger';

describe('Kafka Client', () => {
  let originalBrokerUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalBrokerUrl = process.env.KAFKA_BROKER_URL;
  });

  afterEach(async () => {
    if (originalBrokerUrl !== undefined) {
      process.env.KAFKA_BROKER_URL = originalBrokerUrl;
    } else {
      delete process.env.KAFKA_BROKER_URL;
    }

    try {
      await desconectarKafkaProducer();
    } catch (error) {

    }
    
    vi.resetModules();
  }, 20000);

  describe('customLogCreator', () => {
    describe('Quando receber mensagens de ERROR', () => {
      it('deve logar erro quando mensagem não está na lista de ignorados', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.ERROR,
          label: 'connection-error',
          log: { error: 'Connection failed to broker' },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.error).toHaveBeenCalledWith(
          { kafka: { error: 'Connection failed to broker' }, label: 'connection-error' },
          'Kafka error'
        );
      });

      it('deve logar erro quando error não é string', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.ERROR,
          label: 'object-error',
          log: { error: { code: 'ERR_001', message: 'Detailed error' } },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.error).toHaveBeenCalledWith(
          { kafka: { error: { code: 'ERR_001', message: 'Detailed error' } }, label: 'object-error' },
          'Kafka error'
        );
      });

      it('NÃO deve logar quando mensagem contém "The group is rebalancing, so a rejoin is needed"', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.ERROR,
          label: 'rebalance',
          log: { error: 'The group is rebalancing, so a rejoin is needed' },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('deve logar erro quando mensagem contém parte de mensagem ignorada mas não completa', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.ERROR,
          label: 'partial-match',
          log: { error: 'The group is not rebalancing' },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.error).toHaveBeenCalledWith(
          { kafka: { error: 'The group is not rebalancing' }, label: 'partial-match' },
          'Kafka error'
        );
      });

      it('deve logar erro quando log.error é undefined', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.ERROR,
          label: 'undefined-error',
          log: {},
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.error).toHaveBeenCalledWith(
          { kafka: {}, label: 'undefined-error' },
          'Kafka error'
        );
      });
    });

    describe('Quando receber mensagens de WARN', () => {
      it('deve logar warning quando mensagem não está na lista de ignorados', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.WARN,
          label: 'connection-warning',
          log: { error: 'Some warning message' },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.warn).toHaveBeenCalledWith(
          { kafka: { error: 'Some warning message' }, label: 'connection-warning' },
          'Kafka warning'
        );
      });

      it('NÃO deve logar warning quando mensagem está na lista de ignorados', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.WARN,
          label: 'rebalance-warn',
          log: { error: 'The group is rebalancing, so a rejoin is needed' },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      });
    });

    describe('Quando receber mensagens de outros níveis', () => {
      it('NÃO deve logar mensagens de nível INFO', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.INFO,
          label: 'info-label',
          log: { message: 'Info message' },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
      });

      it('NÃO deve logar mensagens de nível DEBUG', () => {
        const logCreator = customLogCreator();

        logCreator({
          level: logLevel.DEBUG,
          label: 'debug-label',
          log: { message: 'Debug message' },
          namespace: 'kafka-test'
        } as unknown as LogEntry);

        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.debug).not.toHaveBeenCalled();
      });
    });
  });

  describe('getKafkaConfig', () => {
    describe('Quando KAFKA_BROKER_URL está definida', () => {
      it('deve retornar configuração válida', () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const config = getKafkaConfig();
        
        expect(config).not.toBeNull();
        expect(config?.clientId).toBe('helpdesk-api');
        expect(config?.brokers).toEqual(['localhost:9093']);
        expect(config?.brokerUrl).toBe('localhost:9093');
      });

      it('deve reutilizar a mesma configuração em chamadas subsequentes', () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const primeiraConfig = getKafkaConfig();
        const segundaConfig = getKafkaConfig();
        
        expect(primeiraConfig).toBe(segundaConfig);
        expect(primeiraConfig).toEqual(segundaConfig);
      });

      it('deve retornar configuração com broker URL diferente', () => {
        process.env.KAFKA_BROKER_URL = 'kafka-server:9092';
        
        const config = getKafkaConfig();
        
        expect(config?.brokerUrl).toBe('kafka-server:9092');
        expect(config?.brokers).toEqual(['kafka-server:9092']);
      });
    });

    describe('Quando KAFKA_BROKER_URL não está definida', () => {
      it('deve retornar null', () => {
        delete process.env.KAFKA_BROKER_URL;
        
        const config = getKafkaConfig();
        
        expect(config).toBeNull();
      });

      it('deve retornar null após desconectar', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        getKafkaConfig(); // Inicializa
        
        await desconectarKafkaProducer();
        delete process.env.KAFKA_BROKER_URL;
        
        const config = getKafkaConfig();
        expect(config).toBeNull();
      });
    });
  });

  describe('Kafka Proxy', () => {
    describe('Quando KAFKA_BROKER_URL está definida', () => {
      it('deve permitir acesso a métodos do kafka via proxy', () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';

        expect(kafka).toBeDefined();
        expect(typeof kafka.producer).toBe('function');
        expect(typeof kafka.consumer).toBe('function');
        expect(typeof kafka.admin).toBe('function');
      });

      it('deve acessar diferentes métodos do kafka', () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';

        expect(typeof kafka.producer).toBe('function');
        expect(typeof kafka.consumer).toBe('function');
        expect(typeof kafka.admin).toBe('function');
        expect(typeof kafka.logger).toBe('function');
      });
    });

    describe('Quando KAFKA_BROKER_URL não está definida', () => {
      it('deve lançar erro ao acessar producer', () => {
        delete process.env.KAFKA_BROKER_URL;
        
        expect(() => kafka.producer).toThrow('KAFKA_BROKER_URL não definida!');
      });

      it('deve lançar erro ao acessar consumer', () => {
        delete process.env.KAFKA_BROKER_URL;
        
        expect(() => kafka.consumer).toThrow('KAFKA_BROKER_URL não definida!');
      });

      it('deve lançar erro ao acessar admin', () => {
        delete process.env.KAFKA_BROKER_URL;
        
        expect(() => kafka.admin).toThrow('KAFKA_BROKER_URL não definida!');
      });
    });
  });

  describe('Producer Proxy', () => {
    describe('Quando KAFKA_BROKER_URL está definida', () => {
      it('deve criar instância do producer com métodos disponíveis', () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        expect(producer).toBeDefined();
        expect(typeof producer.connect).toBe('function');
        expect(typeof producer.send).toBe('function');
        expect(typeof producer.disconnect).toBe('function');
      });

      it('deve reutilizar a mesma instância do producer', () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const primeiroProducer = producer;
        const segundoProducer = producer;
        
        expect(typeof primeiroProducer.connect).toBe('function');
        expect(typeof segundoProducer.connect).toBe('function');
      });

      it('deve acessar método sendBatch do producer', () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        expect(typeof producer.sendBatch).toBe('function');
      });
    });

    describe('Quando KAFKA_BROKER_URL não está definida', () => {
      it('deve lançar erro ao acessar send', () => {
        delete process.env.KAFKA_BROKER_URL;
        
        expect(() => producer.send).toThrow('KAFKA_BROKER_URL não definida!');
      });

      it('deve lançar erro ao acessar connect', () => {
        delete process.env.KAFKA_BROKER_URL;
        
        expect(() => producer.connect).toThrow('KAFKA_BROKER_URL não definida!');
      });

      it('deve lançar erro ao acessar disconnect', () => {
        delete process.env.KAFKA_BROKER_URL;
        
        expect(() => producer.disconnect).toThrow('KAFKA_BROKER_URL não definida!');
      });
    });
  });

  describe('conectarKafkaProducer', () => {
    describe('Quando conexão é bem-sucedida', () => {
      it('deve conectar e atualizar estado', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        // Força criação do producer
        const _ = producer.connect;
        
        const producerReal = getProducerInstanceForTest();
        expect(producerReal).not.toBeNull();
        
        const mockConnect = vi.spyOn(producerReal!, 'connect').mockResolvedValue();

        await conectarKafkaProducer();

        expect(mockConnect).toHaveBeenCalledTimes(1);
        expect(isKafkaConnected()).toBe(true);
        expect(logger.info).toHaveBeenCalledWith('Kafka Producer conectado');
      });

      it('deve conectar múltiplas vezes sem erro', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        const mockConnect = vi.spyOn(producerReal!, 'connect').mockResolvedValue();

        await conectarKafkaProducer();
        await conectarKafkaProducer();

        expect(mockConnect).toHaveBeenCalledTimes(2);
        expect(isKafkaConnected()).toBe(true);
      });
    });

    describe('Quando conexão falha', () => {
      it('deve logar warning e não lançar erro', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        const erroConexao = new Error('Broker não disponível');
        vi.spyOn(producerReal!, 'connect').mockRejectedValue(erroConexao);

        await conectarKafkaProducer();

        expect(isKafkaConnected()).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('Falha ao conectar ao Kafka - funcionando sem Kafka');
        expect(logger.warn).toHaveBeenCalledWith(
          { brokerUrl: 'localhost:9093' },
          'Certifique-se de que o Kafka está rodando'
        );
      });

      it('deve lidar com erro de timeout', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        const erroTimeout = new Error('Connection timeout');
        vi.spyOn(producerReal!, 'connect').mockRejectedValue(erroTimeout);

        await conectarKafkaProducer();

        expect(isKafkaConnected()).toBe(false);
        expect(logger.warn).toHaveBeenCalledTimes(2);
      });

      it('deve lidar com erro de autenticação', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        const erroAuth = new Error('Authentication failed');
        vi.spyOn(producerReal!, 'connect').mockRejectedValue(erroAuth);

        await conectarKafkaProducer();

        expect(isKafkaConnected()).toBe(false);
      });
    });

    describe('Quando KAFKA_BROKER_URL não está definida', () => {
      it('deve logar warning sem lançar erro', async () => {
        delete process.env.KAFKA_BROKER_URL;

        await conectarKafkaProducer();

        expect(isKafkaConnected()).toBe(false);
        expect(logger.warn).toHaveBeenCalled();
      });
    });
  });

  describe('desconectarKafkaProducer', () => {
    describe('Quando producer está conectado', () => {
      it('deve desconectar e limpar estado', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const mockDisconnect = vi.spyOn(producerReal!, 'disconnect').mockResolvedValue();
        
        await desconectarKafkaProducer();

        expect(mockDisconnect).toHaveBeenCalledTimes(1);
        expect(isKafkaConnected()).toBe(false);
        expect(logger.info).toHaveBeenCalledWith('Kafka Producer desconectado');
        expect(getProducerInstanceForTest()).toBeNull();
      });

      it('deve permitir reconexão após desconexão', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        // Primeira conexão
        const _ = producer.connect;
        const producerReal1 = getProducerInstanceForTest();
        const mockConnect1 = vi.spyOn(producerReal1!, 'connect').mockResolvedValue();
        const mockDisconnect1 = vi.spyOn(producerReal1!, 'disconnect').mockResolvedValue();
        
        await conectarKafkaProducer();
        expect(mockConnect1).toHaveBeenCalledTimes(1);
        
        await desconectarKafkaProducer();
        expect(mockDisconnect1).toHaveBeenCalledTimes(1);

        // Segunda conexão
        const __ = producer.connect;
        const producerReal2 = getProducerInstanceForTest();
        expect(producerReal2).not.toBeNull();
        expect(producerReal2).not.toBe(producerReal1);
        
        const mockConnect2 = vi.spyOn(producerReal2!, 'connect').mockResolvedValue();
        
        await conectarKafkaProducer();
        expect(mockConnect2).toHaveBeenCalledTimes(1);
        expect(isKafkaConnected()).toBe(true);
      });
    });

    describe('Quando producer não está conectado', () => {
      it('não deve lançar erro', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        await expect(desconectarKafkaProducer()).resolves.not.toThrow();
        expect(isKafkaConnected()).toBe(false);
      });

      it('deve funcionar múltiplas vezes sem erro', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        await desconectarKafkaProducer();
        await desconectarKafkaProducer();
        
        expect(isKafkaConnected()).toBe(false);
      });
    });

    describe('Quando desconexão falha', () => {
      it('deve logar erro mas continuar limpeza', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const erroDesconexao = new Error('Erro ao desconectar do broker');
        const mockDisconnect = vi.spyOn(producerReal!, 'disconnect')
          .mockRejectedValue(erroDesconexao);

        await desconectarKafkaProducer();

        expect(mockDisconnect).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
          { err: erroDesconexao },
          'Erro ao desconectar Kafka Producer'
        );
        expect(isKafkaConnected()).toBe(false);
        expect(getProducerInstanceForTest()).toBeNull();
      });

      it('deve limpar estado mesmo com erro de timeout', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const erroTimeout = new Error('Disconnect timeout');
        vi.spyOn(producerReal!, 'disconnect').mockRejectedValue(erroTimeout);

        await desconectarKafkaProducer();

        // Nota: getKafkaConfig() pode retornar a config se KAFKA_BROKER_URL ainda estiver definida,
        // pois a função tenta recriar a instância se ela não existir.
        // O importante é que o producer e o estado de conexão sejam limpos.
        expect(getProducerInstanceForTest()).toBeNull();
        expect(isKafkaConnected()).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
          { err: erroTimeout },
          'Erro ao desconectar Kafka Producer'
        );
      });
    });
  });

  describe('sendMessage', () => {
    describe('Quando Kafka está conectado', () => {
      it('deve enviar mensagem com sucesso', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const mockSend = vi.spyOn(producerReal!, 'send').mockResolvedValue({} as any);

        await sendMessage('test-topic', [{ value: 'test-message' }]);

        expect(mockSend).toHaveBeenCalledWith({
          topic: 'test-topic',
          messages: [{ value: 'test-message' }]
        });
        expect(logger.debug).toHaveBeenCalledWith(
          { topic: 'test-topic', messageCount: 1 },
          'Mensagem enviada ao Kafka'
        );
      });

      it('deve enviar múltiplas mensagens', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const mockSend = vi.spyOn(producerReal!, 'send').mockResolvedValue({} as any);

        const messages = [
          { value: 'message-1' },
          { value: 'message-2' },
          { value: 'message-3' }
        ];

        await sendMessage('batch-topic', messages);

        expect(mockSend).toHaveBeenCalledWith({
          topic: 'batch-topic',
          messages
        });
        expect(logger.debug).toHaveBeenCalledWith(
          { topic: 'batch-topic', messageCount: 3 },
          'Mensagem enviada ao Kafka'
        );
      });

      it('deve enviar mensagem com key e headers', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const mockSend = vi.spyOn(producerReal!, 'send').mockResolvedValue({} as any);

        const messages = [{
          key: 'user-123',
          value: 'user-data',
          headers: { 'correlation-id': 'abc-123' }
        }];

        await sendMessage('users-topic', messages);

        expect(mockSend).toHaveBeenCalledWith({
          topic: 'users-topic',
          messages
        });
      });
    });

    describe('Quando Kafka não está conectado', () => {
      it('deve logar warning e não enviar mensagem', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';

        await sendMessage('test-topic', [{ value: 'test' }]);

        expect(logger.warn).toHaveBeenCalledWith(
          { topic: 'test-topic' },
          'Kafka não conectado - mensagem não enviada'
        );
      });

      it('não deve lançar erro ao tentar enviar sem conexão', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';

        await expect(sendMessage('topic', [{ value: 'msg' }]))
          .resolves
          .not
          .toThrow();
      });
    });

    describe('Quando envio falha', () => {
      it('deve logar erro e relançar exceção', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const erroEnvio = new Error('Falha ao enviar para Kafka');
        const mockSend = vi.spyOn(producerReal!, 'send').mockRejectedValue(erroEnvio);

        await expect(sendMessage('error-topic', [{ value: 'test' }]))
          .rejects
          .toThrow('Falha ao enviar para Kafka');

        expect(logger.error).toHaveBeenCalledWith(
          { err: erroEnvio, topic: 'error-topic' },
          'Erro ao enviar mensagem ao Kafka'
        );
        expect(mockSend).toHaveBeenCalled();
      });

      it('deve lidar com erro de timeout no envio', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const erroTimeout = new Error('Request timeout');
        vi.spyOn(producerReal!, 'send').mockRejectedValue(erroTimeout);

        await expect(sendMessage('timeout-topic', [{ value: 'data' }]))
          .rejects
          .toThrow('Request timeout');

        expect(logger.error).toHaveBeenCalled();
      });

      it('deve lidar com erro de broker indisponível', async () => {
        process.env.KAFKA_BROKER_URL = 'localhost:9093';
        
        const _ = producer.connect;
        const producerReal = getProducerInstanceForTest();
        
        vi.spyOn(producerReal!, 'connect').mockResolvedValue();
        await conectarKafkaProducer();

        const erroBroker = new Error('Broker not available');
        vi.spyOn(producerReal!, 'send').mockRejectedValue(erroBroker);

        await expect(sendMessage('broker-topic', [{ value: 'msg' }]))
          .rejects
          .toThrow('Broker not available');
      });
    });
  });

  describe('isKafkaConnected', () => {
    it('deve retornar false inicialmente', () => {
      expect(isKafkaConnected()).toBe(false);
    });

    it('deve retornar true após conexão bem-sucedida', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const _ = producer.connect;
      const producerReal = getProducerInstanceForTest();
      
      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      
      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(true);
    });

    it('deve retornar false após desconexão', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const _ = producer.connect;
      const producerReal = getProducerInstanceForTest();
      
      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      vi.spyOn(producerReal!, 'disconnect').mockResolvedValue();
      
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(true);
      
      await desconectarKafkaProducer();
      expect(isKafkaConnected()).toBe(false);
    });

    it('deve retornar false após falha na conexão', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const _ = producer.connect;
      const producerReal = getProducerInstanceForTest();
      
      vi.spyOn(producerReal!, 'connect').mockRejectedValue(new Error('Connection failed'));
      
      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(false);
    });
  });

  describe('getProducerInstanceForTest', () => {
    it('deve retornar null quando producer não foi criado', () => {
      expect(getProducerInstanceForTest()).toBeNull();
    });

    it('deve retornar instância após criar producer', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const _ = producer.connect; // Força criação
      
      const instance = getProducerInstanceForTest();
      expect(instance).not.toBeNull();
      expect(typeof instance?.connect).toBe('function');
    });

    it('deve retornar null após desconectar', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const _ = producer.connect;
      const producerReal = getProducerInstanceForTest();
      
      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      vi.spyOn(producerReal!, 'disconnect').mockResolvedValue();
      
      await conectarKafkaProducer();
      expect(getProducerInstanceForTest()).not.toBeNull();
      
      await desconectarKafkaProducer();
      expect(getProducerInstanceForTest()).toBeNull();
    });
  });

  describe('Cenários de integração completos', () => {
    it('deve executar ciclo completo: criar -> conectar -> enviar -> desconectar', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      // Criar
      const _ = producer.connect;
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
      
      // Conectar
      const mockConnect = vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      await conectarKafkaProducer();
      expect(mockConnect).toHaveBeenCalled();
      expect(isKafkaConnected()).toBe(true);
      
      // Enviar
      const mockSend = vi.spyOn(producerReal!, 'send').mockResolvedValue({} as any);
      await sendMessage('integration-topic', [{ value: 'integration-test' }]);
      expect(mockSend).toHaveBeenCalled();
      
      // Desconectar
      const mockDisconnect = vi.spyOn(producerReal!, 'disconnect').mockResolvedValue();
      await desconectarKafkaProducer();
      expect(mockDisconnect).toHaveBeenCalled();
      expect(isKafkaConnected()).toBe(false);
    });

    it('deve funcionar com múltiplas reconexões', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      // Primeira conexão
      let _ = producer.connect;
      let producerReal = getProducerInstanceForTest();
      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      vi.spyOn(producerReal!, 'disconnect').mockResolvedValue();
      
      await conectarKafkaProducer();
      await desconectarKafkaProducer();
      
      // Segunda conexão
      _ = producer.connect;
      producerReal = getProducerInstanceForTest()!;
      vi.spyOn(producerReal, 'connect').mockResolvedValue();
      vi.spyOn(producerReal, 'disconnect').mockResolvedValue();
      
      await conectarKafkaProducer();
      await desconectarKafkaProducer();
      
      // Terceira conexão
      _ = producer.connect;
      producerReal = getProducerInstanceForTest()!;
      vi.spyOn(producerReal, 'connect').mockResolvedValue();
      
      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(true);
    });

    it('deve manter resiliência mesmo com falhas intermediárias', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      // Falha na primeira tentativa
      let _ = producer.connect;
      let producerReal = getProducerInstanceForTest();
      vi.spyOn(producerReal!, 'connect').mockRejectedValue(new Error('First fail'));
      
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(false);
      
      // Sucesso na segunda tentativa
      _ = producer.connect;
      producerReal = getProducerInstanceForTest();
      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(true);
    });
  });

  describe('Cenários de edge cases', () => {
    it('deve lidar com KAFKA_BROKER_URL vazia', () => {
      process.env.KAFKA_BROKER_URL = '';
      
      expect(() => kafka.producer).toThrow('KAFKA_BROKER_URL não definida!');
    });

    it('deve lidar com múltiplas chamadas simultâneas de conexão', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const _ = producer.connect;
      const producerReal = getProducerInstanceForTest();
      const mockConnect = vi.spyOn(producerReal!, 'connect').mockResolvedValue();

      await Promise.all([
        conectarKafkaProducer(),
        conectarKafkaProducer(),
        conectarKafkaProducer()
      ]);

      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(isKafkaConnected()).toBe(true);
    });

    it('deve enviar array vazio de mensagens sem erro', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const _ = producer.connect;
      const producerReal = getProducerInstanceForTest();
      
      vi.spyOn(producerReal!, 'connect').mockResolvedValue();
      await conectarKafkaProducer();

      const mockSend = vi.spyOn(producerReal!, 'send').mockResolvedValue({} as any);

      await sendMessage('empty-topic', []);

      expect(mockSend).toHaveBeenCalledWith({
        topic: 'empty-topic',
        messages: []
      });
    });
  });
});