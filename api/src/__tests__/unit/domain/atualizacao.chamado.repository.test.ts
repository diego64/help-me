import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { salvarHistoricoChamado, listarHistoricoChamado, RepositoryError } from '../../../infrastructure/repositories/atualizacao.chamado.repository';
import AtualizacaoDoChamado from '../../../infrastructure/database/mongodb/atualizacao.chamado.model';
import { HistoricoChamadoInput } from '../../../shared/@types/historicoChamado';
import { logger } from '../../../shared/config/logger';

vi.mock('../../../infrastructure/database/mongodb/atualizacao.chamado.model', () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock('../../../shared/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Repository - AtualizacaoChamado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('salvarHistoricoChamado', () => {
    const dadosValidos: HistoricoChamadoInput = {
      chamadoId: 'chamado-123',
      tipo: 'STATUS',
      de: 'ABERTO',
      para: 'EM_ATENDIMENTO',
      descricao: 'Chamado iniciado',
      autorId: 'user-456',
      autorNome: 'João Silva',
      autorEmail: 'joao@email.com',
    };

    const documentoMongoose = {
      _id: {
        toString: () => 'hist-mongo-id-1',
      },
      chamadoId: 'chamado-123',
      tipo: 'STATUS',
      de: 'ABERTO',
      para: 'EM_ATENDIMENTO',
      descricao: 'Chamado iniciado',
      autorId: 'user-456',
      autorNome: 'João Silva',
      autorEmail: 'joao@email.com',
      dataHora: new Date('2024-01-15T10:30:00Z'),
    };

    describe('Casos de Sucesso', () => {
      it('deve salvar histórico com todos os campos preenchidos', async () => {
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          documentoMongoose as any
        );

        const resultado = await salvarHistoricoChamado(dadosValidos);

        expect(AtualizacaoDoChamado.create).toHaveBeenCalledTimes(1);
        expect(AtualizacaoDoChamado.create).toHaveBeenCalledWith({
          chamadoId: dadosValidos.chamadoId,
          tipo: dadosValidos.tipo,
          de: dadosValidos.de,
          para: dadosValidos.para,
          descricao: dadosValidos.descricao,
          autorId: dadosValidos.autorId,
          autorNome: dadosValidos.autorNome,
          autorEmail: dadosValidos.autorEmail,
        });
        expect(resultado._id).toBe('hist-mongo-id-1');
        expect(typeof resultado._id).toBe('string');
        expect(resultado.chamadoId).toBe(dadosValidos.chamadoId);
        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Histórico salvo com sucesso no MongoDB',
          })
        );
      });

      it('deve salvar histórico com campo "de" como null', async () => {
        const dadosComDeNull = { ...dadosValidos, de: null };
        const docComDeNull = { ...documentoMongoose, de: null };
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          docComDeNull as any
        );

        const resultado = await salvarHistoricoChamado(dadosComDeNull);

        expect(AtualizacaoDoChamado.create).toHaveBeenCalledWith(
          expect.objectContaining({ de: null })
        );
        expect(resultado.de).toBe(null);
      });

      it('deve salvar histórico com campo "para" como null', async () => {
        const dadosComParaNull = { ...dadosValidos, para: null };
        const docComParaNull = { ...documentoMongoose, para: null };
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          docComParaNull as any
        );

        const resultado = await salvarHistoricoChamado(dadosComParaNull);

        expect(AtualizacaoDoChamado.create).toHaveBeenCalledWith(
          expect.objectContaining({ para: null })
        );
        expect(resultado.para).toBe(null);
      });

      it('deve salvar histórico com campo "de" como undefined (convertido para null)', async () => {
        const dadosComDeUndefined = { ...dadosValidos, de: undefined };
        const docComDeNull = { ...documentoMongoose, de: undefined };
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          docComDeNull as any
        );

        const resultado = await salvarHistoricoChamado(dadosComDeUndefined);

        expect(AtualizacaoDoChamado.create).toHaveBeenCalledWith(
          expect.objectContaining({ de: null })
        );
        expect(resultado.de).toBe(null);
      });

      it('deve salvar histórico com campo "para" como undefined (convertido para null)', async () => {
        const dadosComParaUndefined = { ...dadosValidos, para: undefined };
        const docComParaNull = { ...documentoMongoose, para: undefined };
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          docComParaNull as any
        );

        const resultado = await salvarHistoricoChamado(dadosComParaUndefined);

        expect(AtualizacaoDoChamado.create).toHaveBeenCalledWith(
          expect.objectContaining({ para: null })
        );
        expect(resultado.para).toBe(null);
      });

      it('deve salvar histórico com descricao vazia (convertida para string vazia)', async () => {
        const dadosSemDescricao = { ...dadosValidos, descricao: undefined };
        const docSemDescricao = { ...documentoMongoose, descricao: undefined };
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          docSemDescricao as any
        );

        const resultado = await salvarHistoricoChamado(dadosSemDescricao);

        expect(AtualizacaoDoChamado.create).toHaveBeenCalledWith(
          expect.objectContaining({ descricao: '' })
        );
        expect(resultado.descricao).toBe('');
      });

      it('deve salvar histórico com descricao fornecida', async () => {
        const descricaoDetalhada = 'Atualização completa do status';
        const dadosComDescricao = {
          ...dadosValidos,
          descricao: descricaoDetalhada,
        };
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          documentoMongoose as any
        );

        await salvarHistoricoChamado(dadosComDescricao);

        expect(AtualizacaoDoChamado.create).toHaveBeenCalledWith(
          expect.objectContaining({ descricao: descricaoDetalhada })
        );
      });

      it('deve converter _id de ObjectId para string', async () => {
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          documentoMongoose as any
        );

        const resultado = await salvarHistoricoChamado(dadosValidos);

        expect(resultado._id).toBe('hist-mongo-id-1');
        expect(typeof resultado._id).toBe('string');
      });
    });

    describe('Validações de Entrada', () => {
      it('deve lançar erro quando dados forem null', async () => {
        const erro = await salvarHistoricoChamado(null as any).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.message).toBe('Dados do histórico são obrigatórios');
        expect(erro.code).toBe('INVALID_INPUT');
        expect(AtualizacaoDoChamado.create).not.toHaveBeenCalled();
      });

      it('deve lançar erro quando dados forem undefined', async () => {
        const erro = await salvarHistoricoChamado(undefined as any).catch(
          (e) => e
        );

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.message).toBe('Dados do histórico são obrigatórios');
        expect(erro.code).toBe('INVALID_INPUT');
      });

      it('deve lançar erro quando dados não forem um objeto', async () => {
        const erro = await salvarHistoricoChamado('string' as any).catch(
          (e) => e
        );

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('INVALID_INPUT');
      });

      it('deve lançar erro quando chamadoId estiver vazio', async () => {
        const dadosInvalidos = { ...dadosValidos, chamadoId: '' };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.message).toContain('chamadoId');
        expect(erro.code).toBe('MISSING_REQUIRED_FIELDS');
      });

      it('deve lançar erro quando chamadoId for apenas espaços', async () => {
        const dadosInvalidos = { ...dadosValidos, chamadoId: '   ' };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro.message).toContain('chamadoId');
      });

      it('deve lançar erro quando tipo estiver vazio', async () => {
        const dadosInvalidos = { ...dadosValidos, tipo: '' };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro.message).toContain('tipo');
        expect(erro.code).toBe('MISSING_REQUIRED_FIELDS');
      });

      it('deve lançar erro quando tipo for apenas espaços', async () => {
        const dadosInvalidos = { ...dadosValidos, tipo: '  ' };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro.message).toContain('tipo');
      });

      it('deve lançar erro quando autorId estiver vazio', async () => {
        const dadosInvalidos = { ...dadosValidos, autorId: '' };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro.message).toContain('autorId');
      });

      it('deve lançar erro quando autorNome estiver vazio', async () => {
        const dadosInvalidos = { ...dadosValidos, autorNome: '' };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro.message).toContain('autorNome');
      });

      it('deve lançar erro quando autorEmail estiver vazio', async () => {
        const dadosInvalidos = { ...dadosValidos, autorEmail: '' };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro.message).toContain('autorEmail');
      });

      it('deve lançar erro com múltiplos campos obrigatórios ausentes', async () => {
        const dadosInvalidos = {
          ...dadosValidos,
          chamadoId: '',
          tipo: '',
          autorId: '',
        };

        const erro = await salvarHistoricoChamado(dadosInvalidos).catch(
          (e) => e
        );

        expect(erro.message).toContain('chamadoId');
        expect(erro.message).toContain('tipo');
        expect(erro.message).toContain('autorId');
      });

      it('deve lançar erro quando objeto estiver vazio', async () => {
        const erro = await salvarHistoricoChamado({} as any).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('MISSING_REQUIRED_FIELDS');
      });
    });

    describe('Tratamento de Erros do MongoDB', () => {
      it('deve lançar RepositoryError quando create falhar', async () => {
        const erroMongo = new Error('Conexão com MongoDB perdida');
        vi.mocked(AtualizacaoDoChamado.create).mockRejectedValue(erroMongo);

        const erro = await salvarHistoricoChamado(dadosValidos).catch(
          (e) => e
        );

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('DATABASE_ERROR');
        expect(erro.message).toBe('Falha ao salvar histórico no banco de dados');
        expect(erro.originalError).toBe(erroMongo);
      });

      it('deve logar erro quando create falhar', async () => {
        const erroMongo = new Error('Timeout');
        vi.mocked(AtualizacaoDoChamado.create).mockRejectedValue(erroMongo);

        await salvarHistoricoChamado(dadosValidos).catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro ao salvar histórico no MongoDB',
            error: 'Timeout',
          })
        );
      });

      it('deve tratar erro não-Error do MongoDB', async () => {
        vi.mocked(AtualizacaoDoChamado.create).mockRejectedValue('Erro string');

        const erro = await salvarHistoricoChamado(dadosValidos).catch(
          (e) => e
        );

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.originalError).toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Erro desconhecido' })
        );
      });

      it('deve logar erro de validação', async () => {
        await salvarHistoricoChamado({ ...dadosValidos, chamadoId: '' }).catch(
          () => {}
        );

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro de validação ao salvar histórico',
            code: 'MISSING_REQUIRED_FIELDS',
          })
        );
      });
    });

    describe('Logging', () => {
      it('deve logar início do salvamento', async () => {
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          documentoMongoose as any
        );

        await salvarHistoricoChamado(dadosValidos);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Iniciando salvamento de histórico no MongoDB',
            chamadoId: dadosValidos.chamadoId,
          })
        );
      });

      it('deve logar sucesso com ID do documento', async () => {
        vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(
          documentoMongoose as any
        );

        await salvarHistoricoChamado(dadosValidos);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Histórico salvo com sucesso no MongoDB',
            historicoId: 'hist-mongo-id-1',
          })
        );
      });
    });
  });

  describe('listarHistoricoChamado', () => {
    const chamadoId = 'chamado-789';
    const historicosMongoose = [
      {
        _id: { toString: () => 'hist-1' },
        chamadoId: 'chamado-789',
        tipo: 'STATUS',
        de: null,
        para: 'ABERTO',
        descricao: 'Criado',
        autorId: 'user-1',
        autorNome: 'João',
        autorEmail: 'joao@email.com',
        dataHora: new Date('2024-01-01'),
      },
      {
        _id: { toString: () => 'hist-2' },
        chamadoId: 'chamado-789',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'EM_ATENDIMENTO',
        descricao: 'Em andamento',
        autorId: 'user-2',
        autorNome: 'Maria',
        autorEmail: 'maria@email.com',
        dataHora: new Date('2024-01-02'),
      },
    ];

    describe('Casos de Sucesso', () => {
      it('deve buscar e retornar históricos ordenados por dataHora', async () => {
        const mockSort = vi.fn().mockResolvedValue(historicosMongoose);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        const resultado = await listarHistoricoChamado(chamadoId);

        expect(AtualizacaoDoChamado.find).toHaveBeenCalledTimes(1);
        expect(AtualizacaoDoChamado.find).toHaveBeenCalledWith({ chamadoId });
        expect(mockSort).toHaveBeenCalledWith({ dataHora: 1 });
        expect(resultado).toHaveLength(2);
        expect(resultado[0]._id).toBe('hist-1');
        expect(resultado[1]._id).toBe('hist-2');
        expect(typeof resultado[0]._id).toBe('string');
        expect(typeof resultado[1]._id).toBe('string');
      });

      it('deve retornar array vazio quando não houver histórico', async () => {
        const mockSort = vi.fn().mockResolvedValue([]);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        const resultado = await listarHistoricoChamado(chamadoId);

        expect(resultado).toEqual([]);
        expect(resultado).toHaveLength(0);
        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ totalRegistros: 0 })
        );
      });

      it('deve buscar histórico com apenas um registro', async () => {
        const historicoUnico = [historicosMongoose[0]];
        const mockSort = vi.fn().mockResolvedValue(historicoUnico);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        const resultado = await listarHistoricoChamado(chamadoId);

        expect(resultado).toHaveLength(1);
        expect(resultado[0]._id).toBe('hist-1');
      });

      it('deve fazer trim no chamadoId antes de buscar', async () => {
        const chamadoIdComEspacos = '  chamado-789  ';
        const mockSort = vi.fn().mockResolvedValue([]);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        await listarHistoricoChamado(chamadoIdComEspacos);

        expect(AtualizacaoDoChamado.find).toHaveBeenCalledWith({
          chamadoId: 'chamado-789',
        });
      });

      it('deve buscar com chamadoId contendo caracteres especiais', async () => {
        const chamadoIdEspecial = 'chamado-123_ABC-xyz';
        const mockSort = vi.fn().mockResolvedValue([]);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        await listarHistoricoChamado(chamadoIdEspecial);

        expect(AtualizacaoDoChamado.find).toHaveBeenCalledWith({
          chamadoId: chamadoIdEspecial,
        });
      });

      it('deve converter todos os _id de ObjectId para string', async () => {
        const mockSort = vi.fn().mockResolvedValue(historicosMongoose);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        const resultado = await listarHistoricoChamado(chamadoId);

        resultado.forEach((historico) => {
          expect(typeof historico._id).toBe('string');
        });
      });
    });

    describe('Validações de Entrada', () => {
      it('deve lançar erro quando chamadoId for string vazia', async () => {
        const erro = await listarHistoricoChamado('').catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.message).toBe(
          'ID do chamado é obrigatório e deve ser uma string válida'
        );
        expect(erro.code).toBe('INVALID_CHAMADO_ID');
        expect(AtualizacaoDoChamado.find).not.toHaveBeenCalled();
      });

      it('deve lançar erro quando chamadoId for apenas espaços', async () => {
        const erro = await listarHistoricoChamado('   ').catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('INVALID_CHAMADO_ID');
      });

      it('deve lançar erro quando chamadoId for null', async () => {
        const erro = await listarHistoricoChamado(null as any).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('INVALID_CHAMADO_ID');
      });

      it('deve lançar erro quando chamadoId for undefined', async () => {
        const erro = await listarHistoricoChamado(undefined as any).catch(
          (e) => e
        );

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('INVALID_CHAMADO_ID');
      });

      it('deve lançar erro quando chamadoId for número', async () => {
        const erro = await listarHistoricoChamado(123 as any).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.message).toContain('deve ser uma string válida');
      });

      it('deve lançar erro quando chamadoId for objeto', async () => {
        const erro = await listarHistoricoChamado({} as any).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('INVALID_CHAMADO_ID');
      });
    });

    describe('Tratamento de Erros do MongoDB', () => {
      it('deve lançar RepositoryError quando find falhar', async () => {
        const erroMongo = new Error('Conexão perdida');
        const mockSort = vi.fn().mockRejectedValue(erroMongo);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        const erro = await listarHistoricoChamado(chamadoId).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.code).toBe('DATABASE_ERROR');
        expect(erro.message).toBe('Falha ao buscar histórico no banco de dados');
        expect(erro.originalError).toBe(erroMongo);
      });

      it('deve lançar RepositoryError quando sort falhar', async () => {
        const erroMongo = new Error('Sort timeout');
        const mockSort = vi.fn().mockRejectedValue(erroMongo);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        const erro = await listarHistoricoChamado(chamadoId).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.originalError).toBe(erroMongo);
      });

      it('deve logar erro quando find/sort falhar', async () => {
        const erroMongo = new Error('Database error');
        const mockSort = vi.fn().mockRejectedValue(erroMongo);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        await listarHistoricoChamado(chamadoId).catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro ao buscar histórico no MongoDB',
            error: 'Database error',
          })
        );
      });

      it('deve tratar erro não-Error do MongoDB', async () => {
        const mockSort = vi.fn().mockRejectedValue('String de erro');
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        const erro = await listarHistoricoChamado(chamadoId).catch((e) => e);

        expect(erro).toBeInstanceOf(RepositoryError);
        expect(erro.originalError).toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'Erro desconhecido' })
        );
      });

      it('deve logar erro de validação', async () => {
        await listarHistoricoChamado('').catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro de validação ao buscar histórico',
            code: 'INVALID_CHAMADO_ID',
          })
        );
      });
    });

    describe('Logging', () => {
      it('deve logar início da busca', async () => {
        const mockSort = vi.fn().mockResolvedValue([]);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        await listarHistoricoChamado(chamadoId);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Iniciando busca de histórico no MongoDB',
            chamadoId,
          })
        );
      });

      it('deve logar sucesso com total de registros', async () => {
        const mockSort = vi.fn().mockResolvedValue(historicosMongoose);
        vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
          sort: mockSort,
        } as any);

        await listarHistoricoChamado(chamadoId);

        expect(logger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Histórico recuperado do MongoDB',
            totalRegistros: 2,
          })
        );
      });
    });
  });

  describe('Função converterParaDocumento (indireta)', () => {
    const dadosValidos: HistoricoChamadoInput = {
      chamadoId: 'chamado-123',
      tipo: 'STATUS',
      de: 'ABERTO',
      para: 'FECHADO',
      descricao: 'Teste',
      autorId: 'user-1',
      autorNome: 'João',
      autorEmail: 'joao@email.com',
    };

    it('deve converter ObjectId para string no salvarHistoricoChamado', async () => {
      const mockDoc = {
        _id: { toString: () => 'converted-id' },
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'FECHADO',
        descricao: 'Teste',
        autorId: 'user-1',
        autorNome: 'João',
        autorEmail: 'joao@email.com',
        dataHora: new Date(),
      };

      vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(mockDoc as any);

      const resultado = await salvarHistoricoChamado(dadosValidos);

      expect(resultado._id).toBe('converted-id');
      expect(typeof resultado._id).toBe('string');
    });

    it('deve tratar campos opcionais como null no salvarHistoricoChamado', async () => {
      const mockDoc = {
        _id: { toString: () => 'id' },
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        autorId: 'user-1',
        dataHora: new Date(),
      };

      const dadosSemOpcionais = {
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        autorId: 'user-1',
        autorNome: 'Nome',
        autorEmail: 'email@test.com',
      };

      vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(mockDoc as any);

      const resultado = await salvarHistoricoChamado(dadosSemOpcionais);

      expect(resultado.de).toBe(null);
      expect(resultado.para).toBe(null);
      expect(resultado.descricao).toBe('');
    });

    it('deve converter ObjectId para string no listarHistoricoChamado', async () => {
      const mockDocs = [
        {
          _id: { toString: () => 'converted-id-1' },
          chamadoId: 'chamado-123',
          tipo: 'STATUS',
          de: 'ABERTO',
          para: 'FECHADO',
          descricao: 'Teste',
          autorId: 'user-1',
          autorNome: 'João',
          autorEmail: 'joao@email.com',
          dataHora: new Date(),
        },
      ];

      const mockSort = vi.fn().mockResolvedValue(mockDocs);
      vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
        sort: mockSort,
      } as any);

      const resultado = await listarHistoricoChamado('chamado-123');

      expect(resultado[0]._id).toBe('converted-id-1');
      expect(typeof resultado[0]._id).toBe('string');
    });

    it('deve tratar campos opcionais como null no listarHistoricoChamado', async () => {
      const mockDocs = [
        {
          _id: { toString: () => 'id' },
          chamadoId: 'chamado-123',
          tipo: 'STATUS',
          autorId: 'user-1',
          dataHora: new Date(),
        },
      ];

      const mockSort = vi.fn().mockResolvedValue(mockDocs);
      vi.mocked(AtualizacaoDoChamado.find).mockReturnValue({
        sort: mockSort,
      } as any);

      const resultado = await listarHistoricoChamado('chamado-123');

      expect(resultado[0].de).toBe(null);
      expect(resultado[0].para).toBe(null);
      expect(resultado[0].descricao).toBe('');
      expect(resultado[0].autorNome).toBe('');
      expect(resultado[0].autorEmail).toBe('');
    });

    it('deve tratar campos undefined como valores padrão', async () => {
      const mockDoc = {
        _id: { toString: () => 'id' },
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        autorId: 'user-1',
        de: undefined,
        para: undefined,
        descricao: undefined,
        autorNome: undefined,
        autorEmail: undefined,
        dataHora: new Date(),
      };

      vi.mocked(AtualizacaoDoChamado.create).mockResolvedValue(mockDoc as any);

      const dadosMinimos = {
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        autorId: 'user-1',
        autorNome: 'Nome',
        autorEmail: 'email@test.com',
      };

      const resultado = await salvarHistoricoChamado(dadosMinimos);

      expect(resultado.de).toBe(null);
      expect(resultado.para).toBe(null);
      expect(resultado.descricao).toBe('');
      expect(resultado.autorNome).toBe('');
      expect(resultado.autorEmail).toBe('');
    });
  });

  describe('RepositoryError', () => {
    it('deve criar erro com todas as propriedades', () => {
      const originalError = new Error('Erro original');
      const erro = new RepositoryError('Mensagem', 'CODE', originalError);

      expect(erro.message).toBe('Mensagem');
      expect(erro.code).toBe('CODE');
      expect(erro.originalError).toBe(originalError);
      expect(erro.name).toBe('RepositoryError');
    });

    it('deve criar erro sem originalError', () => {
      const erro = new RepositoryError('Mensagem', 'CODE');

      expect(erro.originalError).toBeUndefined();
    });
  });
});