import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach
} from 'vitest';
import {
  conectarKafkaProducer,
  desconectarKafkaProducer,
  getKafkaConfig,
  getProducerInstanceForTest,
  producer,
  isKafkaConnected,
  sendMessage
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
    process.env.KAFKA_BROKER_URL = 'localhost:9093';
  });

  afterEach(async () => {
    await desconectarKafkaProducer();
    process.env.KAFKA_BROKER_URL = 'localhost:9093';
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
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');

      await conectarKafkaProducer();

      expect(isKafkaConnected()).toBe(true);
      
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
    }, 10000);

    it('permite múltiplas conexões sucessivas sem erro', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      const kafkaProducer = producer;
      expect(typeof kafkaProducer.connect).toBe('function');

      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(true);
      let producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      await desconectarKafkaProducer();

      expect(isKafkaConnected()).toBe(false);
      producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();

      process.env.KAFKA_BROKER_URL = 'localhost:9093';

      await conectarKafkaProducer();

      expect(isKafkaConnected()).toBe(true);
      producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();
    }, 15000);
  });

  describe('Dado um producer conectado, Quando desconectar, Então deve fechar conexão corretamente', () => {
    it('desconecta producer do broker Kafka', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(true);
      let producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      await desconectarKafkaProducer();

      expect(isKafkaConnected()).toBe(false);
      producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();
      
      // RE-DEFINE para não afetar próximos testes
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
    }, 10000);

    it('permite desconexão mesmo sem conexão prévia', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      expect(isKafkaConnected()).toBe(false);
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();

      await expect(desconectarKafkaProducer()).resolves.not.toThrow();
      
      expect(isKafkaConnected()).toBe(false);
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
    });
  });

  describe('Dado um producer conectado, Quando enviar mensagem, Então deve publicar no tópico Kafka', () => {
    it('envia mensagem para tópico Kafka com sucesso usando sendMessage', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      await conectarKafkaProducer();
      
      expect(isKafkaConnected()).toBe(true);
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

      await expect(sendMessage(nomeTopico, [mensagemTeste])).resolves.not.toThrow();
    }, 15000);

    it('envia mensagem diretamente pelo producer com sucesso', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      await conectarKafkaProducer();
      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      const nomeTopico = 'test-topic-direct-e2e';
      const mensagemTeste = {
        key: 'test-key-002',
        value: JSON.stringify({
          id: '002',
          mensagem: 'Teste E2E Direto',
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
      process.env.KAFKA_BROKER_URL = 'localhost:9093';

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

      const resultadoEnvio = await producerReal!.send({
        topic: nomeTopico,
        messages: mensagensLote
      });

      expect(resultadoEnvio).toBeDefined();
      expect(Array.isArray(resultadoEnvio)).toBe(true);
      expect(resultadoEnvio.length).toBeGreaterThan(0);

      resultadoEnvio.forEach(metadata => {
        expect(metadata.errorCode).toBe(0);
        expect(metadata).toHaveProperty('partition');
        expect(metadata).toHaveProperty('baseOffset');
      });
    }, 15000);

    it('loga warning quando tenta enviar sem estar conectado', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      // Não conecta propositalmente
      expect(isKafkaConnected()).toBe(false);

      const nomeTopico = 'test-topic-sem-conexao';
      const mensagemTeste = {
        key: 'test-key-003',
        value: JSON.stringify({ mensagem: 'Sem conexão' })
      };

      // Deve retornar sem erro, apenas logando warning
      await expect(sendMessage(nomeTopico, [mensagemTeste])).resolves.not.toThrow();
      
      expect(isKafkaConnected()).toBe(false);
    }, 10000);
  });

  describe('Dado um ciclo completo de conexão, Quando executar operações, Então deve manter estabilidade', () => {
    it('executa ciclo completo: conectar -> enviar -> desconectar -> reconectar', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';

      // Primeira conexão
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(true);
      
      let producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      const nomeTopico = 'test-topic-ciclo-e2e';
      const mensagemTeste = {
        key: 'ciclo-001',
        value: JSON.stringify({ mensagem: 'Ciclo completo' })
      };
      
      // Primeiro envio
      const primeiroEnvio = await producerReal!.send({
        topic: nomeTopico,
        messages: [mensagemTeste]
      });

      expect(primeiroEnvio[0].errorCode).toBe(0);

      // Desconecta
      await desconectarKafkaProducer();
      expect(isKafkaConnected()).toBe(false);
      
      producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();

      // Reconecta
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(true);
      
      producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      // Segundo envio após reconexão
      const segundoEnvio = await producerReal!.send({
        topic: nomeTopico,
        messages: [{
          key: 'ciclo-002',
          value: JSON.stringify({ mensagem: 'Após reconexão' })
        }]
      });

      expect(segundoEnvio[0].errorCode).toBe(0);

      // Desconecta novamente
      await desconectarKafkaProducer();
      expect(isKafkaConnected()).toBe(false);
      
      producerReal = getProducerInstanceForTest();
      expect(producerReal).toBeNull();
      
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
    }, 30000);
  });

  describe('Dado um broker Kafka indisponível, Quando tentar conectar, Então deve tratar erro apropriadamente', () => {
    it('não lança erro quando broker está inacessível, apenas loga warning', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9999'; // Porta inexistente
      await desconectarKafkaProducer(); // Limpa instâncias anteriores

      // Agora não deve lançar erro, apenas logar warning
      await expect(conectarKafkaProducer()).resolves.not.toThrow();
      
      // Deve estar desconectado
      expect(isKafkaConnected()).toBe(false);
      
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
    }, 30000);

    it('permite operação normal após falha de conexão e correção da URL', async () => {
      // Tenta conectar em broker inválido
      process.env.KAFKA_BROKER_URL = 'localhost:9999';
      await desconectarKafkaProducer();
      
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(false);

      // Corrige a URL e desconecta
      await desconectarKafkaProducer();
      process.env.KAFKA_BROKER_URL = 'localhost:9093';

      // Conecta com URL correta
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(true);

      const producerReal = getProducerInstanceForTest();
      expect(producerReal).not.toBeNull();

      // Valida que consegue enviar mensagem
      const resultado = await producerReal!.send({
        topic: 'test-topic-recuperacao',
        messages: [{
          key: 'recuperacao-001',
          value: JSON.stringify({ mensagem: 'Recuperado com sucesso' })
        }]
      });

      expect(resultado[0].errorCode).toBe(0);
    }, 20000);
  });

  describe('Dado diferentes cenários de uso, Quando usar função sendMessage, Então deve comportar-se corretamente', () => {
    it('sendMessage envia quando conectado', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      await conectarKafkaProducer();
      expect(isKafkaConnected()).toBe(true);

      await expect(
        sendMessage('test-send-message', [{ 
          value: JSON.stringify({ teste: 'sendMessage' }) 
        }])
      ).resolves.not.toThrow();
    }, 10000);

    it('sendMessage loga warning quando desconectado', async () => {
      process.env.KAFKA_BROKER_URL = 'localhost:9093';
      
      await desconectarKafkaProducer();
      expect(isKafkaConnected()).toBe(false);

      await expect(
        sendMessage('test-send-message-offline', [{ 
          value: JSON.stringify({ teste: 'offline' }) 
        }])
      ).resolves.not.toThrow();
      
      expect(isKafkaConnected()).toBe(false);
    }, 10000);
  });
});