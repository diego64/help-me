import {
  describe,
  it,
  expect,
  vi,
  beforeEach
} from 'vitest';
import { registrarAcaoNoHistorico, buscarHistorico } from '../../services/chamado.service';
import { salvarHistoricoChamado, listarHistoricoChamado } from '../../repositories/chamadoAtualizacao.repository';
import { HistoricoChamadoInput } from '../../../@types/historicoChamado';

vi.mock('../../repositories/chamadoAtualizacao.repository', () => ({
  salvarHistoricoChamado: vi.fn(),
  listarHistoricoChamado: vi.fn(),
}));

describe('ChamadoAtualizacao Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registrarAcaoNoHistorico', () => {
    it('deve chamar salvarHistoricoChamado com os parâmetros corretos', async () => {
      // Arrange
      const mockHistorico: HistoricoChamadoInput = {
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'EM_ATENDIMENTO',
        descricao: 'Chamado assumido pelo técnico',
        autorId: 'user-456',
        autorNome: 'João Silva',
        autorEmail: 'joao@email.com',
      };

      vi.mocked(salvarHistoricoChamado).mockResolvedValue({
        _id: 'hist-mock-1',
        ...mockHistorico,
        dataHora: new Date(),
      } as any);

      // Act
      await registrarAcaoNoHistorico(mockHistorico);

      // Assert
      expect(salvarHistoricoChamado).toHaveBeenCalledTimes(1);
      expect(salvarHistoricoChamado).toHaveBeenCalledWith(mockHistorico);
    });

    it('deve propagar erro quando salvarHistoricoChamado falhar', async () => {
      // Arrange
      const mockHistorico: HistoricoChamadoInput = {
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'CANCELADO',
        descricao: 'Chamado cancelado',
        autorId: 'user-789',
        autorNome: 'Maria Santos',
        autorEmail: 'maria@email.com',
      };

      const erro = new Error('Erro ao salvar no MongoDB');
      vi.mocked(salvarHistoricoChamado).mockRejectedValue(erro);

      // Act & Assert
      await expect(registrarAcaoNoHistorico(mockHistorico)).rejects.toThrow(
        'Erro ao salvar no MongoDB'
      );
      expect(salvarHistoricoChamado).toHaveBeenCalledWith(mockHistorico);
    });

    it('deve registrar ação do tipo REABERTURA', async () => {
      // Arrange
      const mockHistorico: HistoricoChamadoInput = {
        chamadoId: 'chamado-456',
        tipo: 'REABERTURA',
        de: 'ENCERRADO',
        para: 'REABERTO',
        descricao: 'Chamado reaberto pelo usuário',
        autorId: 'user-111',
        autorNome: 'Pedro Costa',
        autorEmail: 'pedro@email.com',
      };

      vi.mocked(salvarHistoricoChamado).mockResolvedValue({
        _id: 'hist-mock-2',
        ...mockHistorico,
        dataHora: new Date(),
      } as any);

      // Act
      await registrarAcaoNoHistorico(mockHistorico);

      // Assert
      expect(salvarHistoricoChamado).toHaveBeenCalledWith(mockHistorico);
    });

    it('deve registrar ação com descricao vazia', async () => {
      // Arrange
      const mockHistorico: HistoricoChamadoInput = {
        chamadoId: 'chamado-789',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'ENCERRADO',
        descricao: '',
        autorId: 'user-222',
        autorNome: 'Ana Lima',
        autorEmail: 'ana@email.com',
      };

      vi.mocked(salvarHistoricoChamado).mockResolvedValue({
        _id: 'hist-mock-3',
        ...mockHistorico,
        dataHora: new Date(),
      } as any);

      // Act
      await registrarAcaoNoHistorico(mockHistorico);

      // Assert
      expect(salvarHistoricoChamado).toHaveBeenCalledWith(mockHistorico);
    });
  });

  describe('buscarHistorico', () => {
    it('deve retornar histórico completo do chamado com múltiplos registros', async () => {
      // Arrange
      const chamadoId = 'chamado-789';
      const mockHistorico = [
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
          dataHora: new Date('2024-01-01T10:00:00Z'),
        },
        {
          _id: 'hist-2',
          chamadoId: 'chamado-789',
          tipo: 'STATUS',
          de: 'ABERTO',
          para: 'EM_ATENDIMENTO',
          descricao: 'Técnico assumiu o chamado',
          autorId: 'user-2',
          autorNome: 'Maria Santos',
          autorEmail: 'maria@email.com',
          dataHora: new Date('2024-01-02T14:30:00Z'),
        },
        {
          _id: 'hist-3',
          chamadoId: 'chamado-789',
          tipo: 'STATUS',
          de: 'EM_ATENDIMENTO',
          para: 'ENCERRADO',
          descricao: 'Problema resolvido',
          autorId: 'user-2',
          autorNome: 'Maria Santos',
          autorEmail: 'maria@email.com',
          dataHora: new Date('2024-01-03T16:45:00Z'),
        },
      ];

      vi.mocked(listarHistoricoChamado).mockResolvedValue(mockHistorico as any);

      // Act
      const resultado = await buscarHistorico(chamadoId);

      // Assert
      expect(listarHistoricoChamado).toHaveBeenCalledTimes(1);
      expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
      expect(resultado).toEqual(mockHistorico);
      expect(resultado).toHaveLength(3);
      expect(resultado[0].tipo).toBe('STATUS');
      expect(resultado[0].para).toBe('ABERTO');
    });

    it('deve retornar array vazio quando chamado não possuir histórico', async () => {
      // Arrange
      const chamadoId = 'chamado-sem-historico';
      vi.mocked(listarHistoricoChamado).mockResolvedValue([] as any);

      // Act
      const resultado = await buscarHistorico(chamadoId);

      // Assert
      expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
      expect(resultado).toEqual([]);
      expect(resultado).toHaveLength(0);
    });

    it('deve propagar erro quando listarHistoricoChamado falhar', async () => {
      // Arrange
      const chamadoId = 'chamado-erro';
      const erro = new Error('Erro de conexão com MongoDB');
      vi.mocked(listarHistoricoChamado).mockRejectedValue(erro);

      // Act & Assert
      await expect(buscarHistorico(chamadoId)).rejects.toThrow(
        'Erro de conexão com MongoDB'
      );
      expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
    });

    it('deve buscar histórico com ID válido de formato UUID', async () => {
      // Arrange
      const chamadoId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const mockHistorico = [
        {
          _id: 'hist-uuid-1',
          chamadoId: chamadoId,
          tipo: 'REABERTURA',
          de: 'ENCERRADO',
          para: 'REABERTO',
          descricao: 'Chamado reaberto',
          autorId: 'user-1',
          autorNome: 'Carlos Mendes',
          autorEmail: 'carlos@email.com',
          dataHora: new Date('2024-01-05T09:15:00Z'),
        },
      ];

      vi.mocked(listarHistoricoChamado).mockResolvedValue(mockHistorico as any);

      // Act
      const resultado = await buscarHistorico(chamadoId);

      // Assert
      expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].chamadoId).toBe(chamadoId);
    });

    it('deve retornar histórico ordenado por data', async () => {
      // Arrange
      const chamadoId = 'chamado-123';
      const mockHistorico = [
        {
          _id: 'hist-1',
          chamadoId: 'chamado-123',
          tipo: 'STATUS',
          de: null,
          para: 'ABERTO',
          descricao: 'Criado',
          autorId: 'user-1',
          autorNome: 'João',
          autorEmail: 'joao@email.com',
          dataHora: new Date('2024-01-01T10:00:00Z'),
        },
        {
          _id: 'hist-2',
          chamadoId: 'chamado-123',
          tipo: 'STATUS',
          de: 'ABERTO',
          para: 'EM_ATENDIMENTO',
          descricao: 'Assumido',
          autorId: 'user-2',
          autorNome: 'Maria',
          autorEmail: 'maria@email.com',
          dataHora: new Date('2024-01-02T11:00:00Z'),
        },
      ];

      vi.mocked(listarHistoricoChamado).mockResolvedValue(mockHistorico as any);

      // Act
      const resultado = await buscarHistorico(chamadoId);

      // Assert
      expect(resultado[0].dataHora.getTime()).toBeLessThan(
        resultado[1].dataHora.getTime()
      );
    });

    it('deve propagar erro de timeout do MongoDB', async () => {
      // Arrange
      const chamadoId = 'chamado-timeout';
      const erro = new Error('MongoDB connection timeout');
      vi.mocked(listarHistoricoChamado).mockRejectedValue(erro);

      // Act & Assert
      await expect(buscarHistorico(chamadoId)).rejects.toThrow(
        'MongoDB connection timeout'
      );
    });
  });
});