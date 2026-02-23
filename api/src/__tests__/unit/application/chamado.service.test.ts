import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registrarAcaoNoHistorico, buscarHistorico, HistoricoChamadoError } from '@application/use-cases/chamado/chamado.service';
import { salvarHistoricoChamado, listarHistoricoChamado } from '@infrastructure/repositories/atualizacao.chamado.repository';
import { HistoricoChamadoInput } from '@shared/@types/historicoChamado';
import { logger } from '@shared/config/logger';

vi.mock('@infrastructure/repositories/atualizacao.chamado.repository', () => ({
  salvarHistoricoChamado: vi.fn(),
  listarHistoricoChamado: vi.fn(),
}));

vi.mock('@shared/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ChamadoService - Histórico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registrarAcaoNoHistorico', () => {
    const mockHistoricoValido: HistoricoChamadoInput = {
      chamadoId: 'chamado-123',
      tipo: 'STATUS',
      de: 'ABERTO',
      para: 'EM_ATENDIMENTO',
      descricao: 'Chamado movido para Em Atendimento',
      autorId: 'user-456',
      autorNome: 'João Silva',
      autorEmail: 'joao@email.com',
    };

    describe('Casos de Sucesso', () => {
      it('deve registrar uma ação no histórico com todos os campos válidos', async () => {
        vi.mocked(salvarHistoricoChamado).mockResolvedValue({
          _id: 'hist-mock-1',
          ...mockHistoricoValido,
          dataHora: new Date(),
        } as any);

        await registrarAcaoNoHistorico(mockHistoricoValido);

        expect(salvarHistoricoChamado).toHaveBeenCalledTimes(1);
        expect(salvarHistoricoChamado).toHaveBeenCalledWith(mockHistoricoValido);
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Iniciando registro de ação no histórico',
            chamadoId: mockHistoricoValido.chamadoId,
          })
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Ação registrada no histórico com sucesso',
          })
        );
      });

      it('deve registrar ação com campo "de" como null', async () => {
        const historicoComDeNull = {
          ...mockHistoricoValido,
          de: null,
        };

        vi.mocked(salvarHistoricoChamado).mockResolvedValue({} as any);

        await registrarAcaoNoHistorico(historicoComDeNull);

        expect(salvarHistoricoChamado).toHaveBeenCalledWith(historicoComDeNull);
      });

      it('deve registrar ação com campo "para" como null', async () => {
        const historicoComParaNull = {
          ...mockHistoricoValido,
          para: null,
        };

        vi.mocked(salvarHistoricoChamado).mockResolvedValue({} as any);

        await registrarAcaoNoHistorico(historicoComParaNull);

        expect(salvarHistoricoChamado).toHaveBeenCalledWith(historicoComParaNull);
      });

      it('deve registrar ação com descricao vazia', async () => {
        const historicoSemDescricao = {
          ...mockHistoricoValido,
          descricao: '',
        };

        vi.mocked(salvarHistoricoChamado).mockResolvedValue({} as any);

        await registrarAcaoNoHistorico(historicoSemDescricao);

        expect(salvarHistoricoChamado).toHaveBeenCalledWith(historicoSemDescricao);
      });
    });

    describe('Validações de Entrada', () => {
      it('deve lançar erro quando chamadoId estiver vazio', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          chamadoId: '',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          HistoricoChamadoError
        );
        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'chamadoId é obrigatório'
        );
        expect(salvarHistoricoChamado).not.toHaveBeenCalled();
      });

      it('deve lançar erro quando chamadoId for apenas espaços', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          chamadoId: '   ',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'chamadoId é obrigatório'
        );
      });

      it('deve lançar erro quando tipo estiver vazio', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          tipo: '',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'tipo é obrigatório'
        );
      });

      it('deve lançar erro quando tipo for apenas espaços', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          tipo: '  ',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'tipo é obrigatório'
        );
      });

      it('deve lançar erro quando autorId estiver vazio', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          autorId: '',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'autorId é obrigatório'
        );
      });

      it('deve lançar erro quando autorNome estiver vazio', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          autorNome: '',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'autorNome é obrigatório'
        );
      });

      it('deve lançar erro quando autorEmail estiver vazio', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          autorEmail: '',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'autorEmail é obrigatório'
        );
      });

      it('deve lançar erro quando autorEmail for inválido', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          autorEmail: 'email-invalido',
        };

        await expect(registrarAcaoNoHistorico(historicoInvalido)).rejects.toThrow(
          'autorEmail deve ser um email válido'
        );
      });

      it('deve lançar erro com múltiplas validações falhas', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          chamadoId: '',
          tipo: '',
          autorId: '',
        };

        const erro = await registrarAcaoNoHistorico(historicoInvalido).catch((e) => e);

        expect(erro).toBeInstanceOf(HistoricoChamadoError);
        expect(erro.message).toContain('chamadoId é obrigatório');
        expect(erro.message).toContain('tipo é obrigatório');
        expect(erro.message).toContain('autorId é obrigatório');
        expect(erro.code).toBe('VALIDATION_ERROR');
      });

      it('deve validar email com formato válido mas domínio incomum', async () => {
        const historicoComEmailValido = {
          ...mockHistoricoValido,
          autorEmail: 'teste@dominio.com.br',
        };

        vi.mocked(salvarHistoricoChamado).mockResolvedValue({} as any);

        await expect(
          registrarAcaoNoHistorico(historicoComEmailValido)
        ).resolves.not.toThrow();
      });
    });

    describe('Tratamento de Erros do Repositório', () => {
      it('deve propagar HistoricoChamadoError com código REPOSITORY_ERROR quando repositório falhar', async () => {
        const erro = new Error('Erro de conexão com MongoDB');
        vi.mocked(salvarHistoricoChamado).mockRejectedValue(erro);

        const erroCapturado = await registrarAcaoNoHistorico(
          mockHistoricoValido
        ).catch((e) => e);

        expect(erroCapturado).toBeInstanceOf(HistoricoChamadoError);
        expect(erroCapturado.code).toBe('REPOSITORY_ERROR');
        expect(erroCapturado.message).toBe('Falha ao registrar ação no histórico');
        expect(erroCapturado.originalError).toBe(erro);
      });

      it('deve logar erro quando repositório falhar', async () => {
        const erro = new Error('Timeout no banco');
        vi.mocked(salvarHistoricoChamado).mockRejectedValue(erro);

        await registrarAcaoNoHistorico(mockHistoricoValido).catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro ao registrar ação no histórico',
            error: 'Timeout no banco',
          })
        );
      });

      it('deve tratar erro não-Error do repositório', async () => {
        vi.mocked(salvarHistoricoChamado).mockRejectedValue('String de erro');

        const erroCapturado = await registrarAcaoNoHistorico(
          mockHistoricoValido
        ).catch((e) => e);

        expect(erroCapturado).toBeInstanceOf(HistoricoChamadoError);
        expect(erroCapturado.originalError).toBeUndefined();
      });

      it('deve logar erro de validação antes de lançar', async () => {
        const historicoInvalido = {
          ...mockHistoricoValido,
          chamadoId: '',
        };

        await registrarAcaoNoHistorico(historicoInvalido).catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro de validação ao registrar histórico',
          })
        );
      });
    });
  });

  describe('buscarHistorico', () => {
    const chamadoId = 'chamado-789';
    const mockHistoricoCompleto = [
      {
        _id: 'hist-1',
        chamadoId: 'chamado-789',
        tipo: 'STATUS',
        de: null,
        para: 'ABERTO',
        descricao: 'Chamado criado',
        autorId: 'user-1',
        autorNome: 'João Silva',
        autorEmail: 'joao@email.com',
        dataHora: new Date('2024-01-01'),
      },
      {
        _id: 'hist-2',
        chamadoId: 'chamado-789',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'EM_ATENDIMENTO',
        descricao: 'Status alterado',
        autorId: 'user-2',
        autorNome: 'Maria Santos',
        autorEmail: 'maria@email.com',
        dataHora: new Date('2024-01-02'),
      },
      {
        _id: 'hist-3',
        chamadoId: 'chamado-789',
        tipo: 'COMENTARIO',
        de: null,
        para: null,
        descricao: 'Comentário adicionado',
        autorId: 'user-1',
        autorNome: 'João Silva',
        autorEmail: 'joao@email.com',
        dataHora: new Date('2024-01-03'),
      },
    ];

    describe('Casos de Sucesso', () => {
      it('deve buscar e retornar o histórico completo do chamado', async () => {
        vi.mocked(listarHistoricoChamado).mockResolvedValue(
          mockHistoricoCompleto as any
        );

        const resultado = await buscarHistorico(chamadoId);

        expect(listarHistoricoChamado).toHaveBeenCalledTimes(1);
        expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
        expect(resultado).toEqual(mockHistoricoCompleto);
        expect(resultado).toHaveLength(3);
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Histórico recuperado com sucesso',
            totalRegistros: 3,
          })
        );
      });

      it('deve retornar array vazio quando chamado não tem histórico', async () => {
        vi.mocked(listarHistoricoChamado).mockResolvedValue([] as any);

        const resultado = await buscarHistorico(chamadoId);

        expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
        expect(resultado).toEqual([]);
        expect(resultado).toHaveLength(0);
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            totalRegistros: 0,
          })
        );
      });

      it('deve retornar histórico com um único registro', async () => {
        const historicoUnico = [mockHistoricoCompleto[0]];
        vi.mocked(listarHistoricoChamado).mockResolvedValue(historicoUnico as any);

        const resultado = await buscarHistorico(chamadoId);

        expect(resultado).toHaveLength(1);
        expect(resultado[0]._id).toBe('hist-1');
      });
    });

    describe('Validações de Entrada', () => {
      it('deve lançar erro quando chamadoId estiver vazio', async () => {
        await expect(buscarHistorico('')).rejects.toThrow(HistoricoChamadoError);
        await expect(buscarHistorico('')).rejects.toThrow(
          'chamadoId é obrigatório'
        );
        expect(listarHistoricoChamado).not.toHaveBeenCalled();
      });

      it('deve lançar erro quando chamadoId for apenas espaços', async () => {
        await expect(buscarHistorico('   ')).rejects.toThrow(
          'chamadoId é obrigatório'
        );
      });

      it('deve validar chamadoId com caracteres especiais', async () => {
        const chamadoIdEspecial = 'chamado-123-abc_456';
        vi.mocked(listarHistoricoChamado).mockResolvedValue([] as any);

        await expect(buscarHistorico(chamadoIdEspecial)).resolves.not.toThrow();
        expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoIdEspecial);
      });
    });

    describe('Tratamento de Erros do Repositório', () => {
      it('deve propagar HistoricoChamadoError quando repositório falhar', async () => {
        const erro = new Error('Erro ao buscar no MongoDB');
        vi.mocked(listarHistoricoChamado).mockRejectedValue(erro);

        const erroCapturado = await buscarHistorico(chamadoId).catch((e) => e);

        expect(erroCapturado).toBeInstanceOf(HistoricoChamadoError);
        expect(erroCapturado.code).toBe('REPOSITORY_ERROR');
        expect(erroCapturado.message).toBe('Falha ao buscar histórico do chamado');
        expect(erroCapturado.originalError).toBe(erro);
      });

      it('deve logar erro quando repositório falhar', async () => {
        const erro = new Error('Conexão perdida');
        vi.mocked(listarHistoricoChamado).mockRejectedValue(erro);

        await buscarHistorico(chamadoId).catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro ao buscar histórico',
            error: 'Conexão perdida',
            chamadoId,
          })
        );
      });

      it('deve tratar erro não-Error do repositório', async () => {
        vi.mocked(listarHistoricoChamado).mockRejectedValue(
          'Erro inesperado'
        );

        const erroCapturado = await buscarHistorico(chamadoId).catch((e) => e);

        expect(erroCapturado).toBeInstanceOf(HistoricoChamadoError);
        expect(erroCapturado.originalError).toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Erro desconhecido',
          })
        );
      });

      it('deve logar erro de validação antes de lançar', async () => {
        await buscarHistorico('').catch(() => {});

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Erro de validação ao buscar histórico',
          })
        );
      });
    });

    describe('Logging', () => {
      it('deve logar início da busca de histórico', async () => {
        vi.mocked(listarHistoricoChamado).mockResolvedValue([] as any);

        await buscarHistorico(chamadoId);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Iniciando busca de histórico',
            chamadoId,
          })
        );
      });

      it('deve logar sucesso com total de registros', async () => {
        vi.mocked(listarHistoricoChamado).mockResolvedValue(
          mockHistoricoCompleto as any
        );

        await buscarHistorico(chamadoId);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'Histórico recuperado com sucesso',
            chamadoId,
            totalRegistros: 3,
          })
        );
      });
    });
  });

  describe('HistoricoChamadoError', () => {
    it('deve criar erro com todas as propriedades', () => {
      const originalError = new Error('Erro original');
      const erro = new HistoricoChamadoError(
        'Mensagem de erro',
        'TEST_CODE',
        originalError
      );

      expect(erro.message).toBe('Mensagem de erro');
      expect(erro.code).toBe('TEST_CODE');
      expect(erro.originalError).toBe(originalError);
      expect(erro.name).toBe('HistoricoChamadoError');
    });

    it('deve criar erro sem originalError', () => {
      const erro = new HistoricoChamadoError('Mensagem', 'CODE');

      expect(erro.originalError).toBeUndefined();
    });
  });
});