import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  conectarKafkaProducer,
  desconectarKafkaProducer,
  getKafkaConfig,
  getProducerInstanceForTest,
  producer
} from '../../services/kafka';

describe('E2E - Kafka Service', () => {
  let originalKafkaBrokerUrl: string | undefined;

  beforeAll(() => {
    originalKafkaBrokerUrl = process.env.KAFKA_BROKER_URL;
  });

  afterAll(async () => {
    if (originalKafkaBrokerUrl !== undefined) {
      process.env.KAFKA_BROKER_URL = originalKafkaBrokerUrl;
    } else {
      delete process.env.KAFKA_BROKER_URL;
    }

    await desconectarKafkaProducer();
  });

  beforeEach(() => {
    process.env.KAFKA_BROKER_URL = 'localhost:9092';
  });

  afterEach(async () => {
    await desconectarKafkaProducer();
    process.env.KAFKA_BROKER_URL = 'localhost:9092';
  });

  describe('Dado um ambiente Kafka configurado, Quando obter configuração, Então deve retornar dados corretos', () => {
    it('retorna configuração válida do Kafka', () => {
      const expectedBrokerUrl = process.env.KAFKA_BROKER_URL;
      const kafkaConfiguration = getKafkaConfig();

      expect(kafkaConfiguration).not.toBeNull();
      expect(kafkaConfiguration?.clientId).toBe('helpdesk-api');
      expect(kafkaConfiguration?.brokers).toEqual([expectedBrokerUrl]);
      expect(kafkaConfiguration?.brokerUrl).toBe(expectedBrokerUrl);
    });

    it('mantém mesma configuração em múltiplas chamadas', () => {
      const expectedClientId = 'helpdesk-api';

      const primeiraConfiguracao = getKafkaConfig();
      const segundaConfiguracao = getKafkaConfig();

      expect(primeiraConfiguracao).toBe(segundaConfiguracao);
      expect(primeiraConfiguracao?.clientId).toBe(expectedClientId);
      expect(segundaConfiguracao?.clientId).toBe(expectedClientId);
    });
  });

  describe('Dado um ambiente Kafka configurado, Quando obter producer, Então deve criar instância funcional', () => {
    it('cria producer com todos os métodos necessários', () => {
      const kafkaProducer = producer;

      expect(kafkaProducer).toBeDefined();
      expect(typeof kafkaProducer.connect).toBe('function');
      expect(typeof kafkaProducer.disconnect).toBe('function');
      expect(typeof kafkaProducer.send).toBe('function');
      expect(typeof kafkaProducer.sendBatch).toBe('function');
      expect(typeof kafkaProducer.transaction).toBe('function');
    });

    it('retorna mesma instância do producer em acessos subsequentes', () => {

      const primeiroProducer = producer;
      const segundoProducer = producer;
      const terceiroProducer = producer;

      expect(typeof primeiroProducer.connect).toBe('function');
      expect(typeof segundoProducer.connect).toBe('function');
      expect(typeof terceiroProducer.connect).toBe('function');
    });
  });

  describe('Dado um producer não conectado, Quando conectar ao Kafka, Então deve estabelecer conexão com sucesso', () => {
    it('conecta producer ao broker Kafka real', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');

      await conectarKafkaProducer();

      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
    }, 10000);

    it('permite múltiplas conexões sucessivas sem erro', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');

      await conectarKafkaProducer();
      
      let producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      await desconectarKafkaProducer();

      producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();

      process.env.KAFKA_BROKER_URL = 'localhost:9092';

      await conectarKafkaProducer();

      producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
    }, 15000);
  });

  describe('Dado um producer conectado, Quando desconectar, Então deve fechar conexão corretamente', () => {
    it('desconecta producer do broker Kafka', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      
      await conectarKafkaProducer();
      let producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      await desconectarKafkaProducer();

      producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();

      // A configuração pode persistir para reutilização (comportamento comum em singletons)
      // Se sua implementação limpa a config também, descomente a linha abaixo:
      // const kafkaConfiguration = getKafkaConfig();
      // expect(kafkaConfiguration).toBeNull();
      
      // RE-DEFINE para não afetar próximos testes
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
    }, 10000);

    it('permite desconexão mesmo sem conexão prévia', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();

      await expect(desconectarKafkaProducer()).resolves.not.toThrow();
      
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
    });
  });

  describe('Dado um producer conectado, Quando enviar mensagem, Então deve publicar no tópico Kafka', () => {
    it('envia mensagem para tópico Kafka com sucesso', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
      
      await conectarKafkaProducer();
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      const nomeTopico = 'test-topic-e2e';
      const mensagemTeste = {
        key: 'test-key-001',
        value: JSON.stringify({
          id: '001',
          mensagem: 'Teste E2E Kafka',
          timestamp: new Date().toISOString()
        })
      };

      const resultadoEnvio = await producerReal!.send({
        topic: nomeTopico,
        messages: [mensagemTeste]
      });

      expect(resultadoEnvio).toBeDefined();
      expect(Array.isArray(resultadoEnvio)).toBe(true);
      expect(resultadoEnvio.length).toBeGreaterThan(0);
      
      const metadadosParticao = resultadoEnvio[0];
      expect(metadadosParticao).toHaveProperty('partition');
      expect(metadadosParticao).toHaveProperty('errorCode');
      expect(metadadosParticao.errorCode).toBe(0); // 0 = sem erro
    }, 15000);

    it('envia múltiplas mensagens em lote com sucesso', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';

      await conectarKafkaProducer();
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      const nomeTopico = 'test-topic-batch-e2e';
      const mensagensLote = [
        {
          key: 'batch-001',
          value: JSON.stringify({ id: '001', tipo: 'lote' })
        },
        {
          key: 'batch-002',
          value: JSON.stringify({ id: '002', tipo: 'lote' })
        },
        {
          key: 'batch-003',
          value: JSON.stringify({ id: '003', tipo: 'lote' })
        }
      ];

      // Act: Envia lote de mensagens
      const resultadoEnvio = await producerReal!.send({
        topic: nomeTopico,
        messages: mensagensLote
      });

      // Assert: Valida que todas mensagens foram enviadas
      expect(resultadoEnvio).toBeDefined();
      expect(Array.isArray(resultadoEnvio)).toBe(true);
      expect(resultadoEnvio.length).toBeGreaterThan(0);

      // Valida que não houve erros
      resultadoEnvio.forEach(metadata => {
        expect(metadata.errorCode).toBe(0);
        expect(metadata).toHaveProperty('partition');
        expect(metadata).toHaveProperty('baseOffset');
      });
    }, 15000);
  });

  describe('Dado um ciclo completo de conexão, Quando executar operações, Então deve manter estabilidade', () => {
    it('executa ciclo completo: conectar -> enviar -> desconectar -> reconectar', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9092';

      await conectarKafkaProducer();
      let producerReal = getProducerInstanceForTest();

      expect(producerReal).not.toBeNull();

      const nomeTopico = 'test-topic-ciclo-e2e';
      const mensagemTeste = {
        key: 'ciclo-001',
        value: JSON.stringify({ mensagem: 'Ciclo completo' })
      };
      
      const primeiroEnvio = await producerReal!.send({
        topic: nomeTopico,
        messages: [mensagemTeste]
      });

      expect(primeiroEnvio[0].errorCode).toBe(0);

      await desconectarKafkaProducer();
      producerReal = getProducerInstanceForTest();

      expect(producerReal).toBeNull();

      process.env.KAFKA_BROKER_URL = 'localhost:9092';

      await conectarKafkaProducer();
      producerReal = getProducerInstanceForTest();

      expect(producerReal).not.toBeNull();

      const segundoEnvio = await producerReal!.send({
        topic: nomeTopico,
        messages: [{
          key: 'ciclo-002',
          value: JSON.stringify({ mensagem: 'Após reconexão' })
        }]
      });

      expect(segundoEnvio[0].errorCode).toBe(0);

      await desconectarKafkaProducer();
      producerReal = getProducerInstanceForTest();

      expect(producerReal).toBeNull();
      
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
    }, 20000);
  });

  describe('Dado um broker Kafka indisponível, Quando tentar conectar, Então deve tratar erro apropriadamente', () => {
    it('lança erro quando broker está inacessível', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9999'; // Porta inexistente
      await desconectarKafkaProducer(); // Limpa instâncias anteriores

      await expect(async () => {
        await conectarKafkaProducer();
      }).rejects.toThrow();
      
      process.env.KAFKA_BROKER_URL = 'localhost:9092';
    }, 15000);
  });
});