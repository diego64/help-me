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
    it('deve registrar uma ação no histórico do chamado', async () => {
      // Arrange
      const mockHistorico: HistoricoChamadoInput = {
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'EM_ATENDIMENTO',
        descricao: 'Chamado movido para Em Andamento',
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

    it('deve propagar erro se o repositório falhar', async () => {
      // Arrange
      const mockHistorico: HistoricoChamadoInput = {
        chamadoId: 'chamado-123',
        tipo: 'STATUS',
        de: 'ABERTO',
        para: 'CANCELADO',
        descricao: 'Teste de erro',
        autorId: 'user-456',
        autorNome: 'Maria Santos',
        autorEmail: 'maria@email.com',
      };

      const erro = new Error('Erro ao salvar no banco de dados');
      vi.mocked(salvarHistoricoChamado).mockRejectedValue(erro);

      // Act & Assert
      await expect(registrarAcaoNoHistorico(mockHistorico)).rejects.toThrow(
        'Erro ao salvar no banco de dados'
      );
      expect(salvarHistoricoChamado).toHaveBeenCalledWith(mockHistorico);
    });
  });

  describe('buscarHistorico', () => {
    it('deve buscar e retornar o histórico completo do chamado', async () => {
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
          dataHora: new Date('2024-01-01'),
        },
        {
          _id: 'hist-2',
          chamadoId: 'chamado-789',
          tipo: 'STATUS',
          de: 'ABERTO',
          para: 'EM_ATENDIMENTO',
          descricao: 'Status alterado para Em Andamento',
          autorId: 'user-2',
          autorNome: 'Maria Santos',
          autorEmail: 'maria@email.com',
          dataHora: new Date('2024-01-02'),
        },
      ];

      vi.mocked(listarHistoricoChamado).mockResolvedValue(mockHistorico as any);

      // Act
      const resultado = await buscarHistorico(chamadoId);

      // Assert
      expect(listarHistoricoChamado).toHaveBeenCalledTimes(1);
      expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
      expect(resultado).toEqual(mockHistorico);
      expect(resultado).toHaveLength(2);
    });

    it('deve retornar array vazio quando chamado não tem histórico', async () => {
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

    it('deve propagar erro se o repositório falhar', async () => {
      // Arrange
      const chamadoId = 'chamado-erro';
      const erro = new Error('Erro ao buscar histórico');
      vi.mocked(listarHistoricoChamado).mockRejectedValue(erro);

      // Act & Assert
      await expect(buscarHistorico(chamadoId)).rejects.toThrow('Erro ao buscar histórico');
      expect(listarHistoricoChamado).toHaveBeenCalledWith(chamadoId);
    });
  });
});