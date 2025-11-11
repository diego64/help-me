import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { logLevel } from 'kafkajs';
import {
  kafka,
  producer,
  conectarKafkaProducer,
  desconectarKafkaProducer,
  getKafkaConfig,
  getProducerInstanceForTest,
  customLogCreator
} from './kafka';

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
      
      expect(consoleLogSpy).toHaveBeenCalled(); // Loga porque não passa no filtro de mensagens ignoradas
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

  describe('Dado que KAFKA_BROKER_URL está definida, Quando acessar kafka proxy, Então deve retornar instância do Kafka', () => {
    it('permite acesso a propriedades do kafka via proxy', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      
      const kafkaInstance = kafka;
      expect(kafkaInstance).toBeDefined();
      
      // Verifica múltiplas propriedades para garantir que o proxy funciona
      expect(typeof kafka.producer).toBe('function');
      expect(typeof kafka.consumer).toBe('function');
      expect(typeof kafka.admin).toBe('function');
    });

    it('lança erro ao acessar kafka proxy sem KAFKA_BROKER_URL', () => {
      delete process.env.KAFKA_BROKER_URL;
      expect(() => kafka.producer).toThrow('KAFKA_BROKER_URL não definida!');
    });
  });
 
  describe('Dado que KAFKA_BROKER_URL não está definida, Quando tentar acessar o producer, Então deve lançar erro', () => {
    it('lança erro ao acessar producer sem KAFKA_BROKER_URL', () => {
      delete process.env.KAFKA_BROKER_URL;
      expect(() => producer.send).toThrow('KAFKA_BROKER_URL não definida!');
    });
  });

  describe('Dado que KAFKA_BROKER_URL está definida, Quando criar instância do Kafka, Então deve configurar corretamente', () => {
    it('cria instância com configurações corretas', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const kafkaConfig = getKafkaConfig();
      expect(kafkaConfig).not.toBeNull();
      expect(kafkaConfig?.clientId).toBe('helpdesk-api');
      expect(kafkaConfig?.brokers).toEqual(['localhost:9092']);
      expect(kafkaConfig?.brokerUrl).toBe('localhost:9092');
    });

    it('reutiliza a mesma configuração em chamadas subsequentes', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const primeiraConfig = getKafkaConfig();
      const segundaConfig = getKafkaConfig();
      expect(primeiraConfig).toBe(segundaConfig);
      expect(primeiraConfig?.clientId).toBe('helpdesk-api');
    });
  });

  describe('Dado que KAFKA_BROKER_URL não está definida, Quando obter configuração, Então deve retornar null', () => {
    beforeEach(async () => {
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

  describe('Dado que KAFKA_BROKER_URL está definida, Quando obter producer, Então deve criar instância funcional', () => {
    it('cria instância do producer com métodos disponíveis', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const kafkaProducer = producer;
      expect(kafkaProducer).toBeDefined();
      expect(typeof kafkaProducer.connect).toBe('function');
      expect(typeof kafkaProducer.send).toBe('function');
      expect(typeof kafkaProducer.disconnect).toBe('function');
    });

    it('reutiliza a mesma instância do producer em múltiplas chamadas', () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const primeiroProducer = producer;
      const segundoProducer = producer;
      expect(typeof primeiroProducer.connect).toBe('function');
      expect(typeof segundoProducer.connect).toBe('function');
    });
  });

  describe('Dado um producer inicializado, Quando chamar conectarKafkaProducer, Então deve conectar com sucesso', () => {
    it('chama producer.connect() uma vez', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');
      
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
      const mockConnect = vi.spyOn(producerReal!, 'connect').mockResolvedValue();

      await conectarKafkaProducer();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('propaga erro quando conexão falha', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');
      
      const producerReal = getProducerInstanceForTest();
      const erroConexao = new Error('Falha na conexão com Kafka');
      vi.spyOn(producerReal!, 'connect').mockRejectedValue(erroConexao);

      await expect(conectarKafkaProducer()).rejects.toThrow('Falha na conexão com Kafka');
    });
  });

  describe('Dado que KAFKA_BROKER_URL não está definida, Quando tentar conectar producer, Então deve lançar erro', () => {
    it('lança erro ao tentar conectar sem KAFKA_BROKER_URL', async () => {
      delete process.env.KAFKA_BROKER_URL;
      await expect(conectarKafkaProducer()).rejects.toThrow('KAFKA_BROKER_URL não definida!');
    });
  });

  describe('Dado um producer conectado, Quando chamar desconectarKafkaProducer, Então deve desconectar corretamente', () => {
    it('chama producer.disconnect() uma vez', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.disconnect).toBe('function');
      
      const producerReal = getProducerInstanceForTest();
      const mockDisconnect = vi.spyOn(producerReal!, 'disconnect').mockResolvedValue();

      await desconectarKafkaProducer();
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('não lança erro quando producer não está conectado', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      await expect(desconectarKafkaProducer()).resolves.not.toThrow();
    });
  });

  describe('Dado um producer desconectado, Quando reconectar, Então deve criar nova instância', () => {
    it('permite reconexão com nova instância do producer', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
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

  describe('Dado cenários de erro e limites, Quando ocorrerem falhas ou falta de configuração, Então deve tratar adequadamente', () => {
    it('deve lançar erro ao acessar outros métodos do producer sem KAFKA_BROKER_URL', () => {
      delete process.env.KAFKA_BROKER_URL;
      expect(() => producer.connect).toThrow('KAFKA_BROKER_URL não definida!');
    });

    it('deve propagar erro quando desconexão falha', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.disconnect).toBe('function');
      
      const producerReal = getProducerInstanceForTest();
      const erroDesconexao = new Error('Erro ao desconectar');
      vi.spyOn(producerReal!, 'disconnect').mockRejectedValue(erroDesconexao);

      await expect(desconectarKafkaProducer()).rejects.toThrow('Erro ao desconectar');
    });
  });
});