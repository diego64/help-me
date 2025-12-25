import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from 'vitest';
import ChamadoAtualizacao from '../../models/chamadoAtualizacao.model';
import {
  listarHistoricoChamado,
  salvarHistoricoChamado,
} from '../../repositories/chamadoAtualizacao.repository';

describe('ChamadoAtualizacao Repository', () => {
  // ========================================
  // DADOS DE TESTES
  // ========================================
  
  const createMockHistorico = () => ({
    _id: 'fake_mongo_id',
    chamadoId: 'chamado123',
    tipo: 'ATENDIMENTO',
    de: 'aberto',
    para: 'em_andamento',
    descricao: 'Atualização de status',
    autorId: 'user-1',
    autorNome: 'Teste',
    autorEmail: 'teste@teste.com',
    dataHora: new Date('2023-01-01T10:00:00Z'),
    createdAt: new Date('2023-01-01T10:00:00Z'),
    updatedAt: new Date('2023-01-01T10:00:00Z'),
    toObject: function () {
      return { ...this };
    },
  });

  // ========================================
  // CONFIGURAÇÃO E LIMPEZA
  // ========================================

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================
  // Testes de salvarHistoricoChamado
  // ========================================

  describe('salvarHistoricoChamado', () => {
    it('Dado um conjunto válido de dados de histórico, quando salvarHistoricoChamado é chamado, então registra no banco e retorna o histórico salvo completo', async () => {
      // Arrange
      const mockHistorico = createMockHistorico();
      const expectedHistoricoData = {
        chamadoId: mockHistorico.chamadoId,
        tipo: mockHistorico.tipo,
        de: mockHistorico.de,
        para: mockHistorico.para,
        descricao: mockHistorico.descricao,
        autorId: mockHistorico.autorId,
        autorNome: mockHistorico.autorNome,
        autorEmail: mockHistorico.autorEmail,
      };

      const createSpy = vi
        .spyOn(ChamadoAtualizacao, 'create')
        .mockResolvedValue(mockHistorico as any);

      const { _id, toObject, createdAt, updatedAt, ...inputData } = mockHistorico;

      // Act
      const result = await salvarHistoricoChamado(inputData);

      // Assert
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith(expectedHistoricoData);
      expect(result).toMatchObject({
        _id: mockHistorico._id,
        chamadoId: mockHistorico.chamadoId,
        tipo: mockHistorico.tipo,
        de: mockHistorico.de,
        para: mockHistorico.para,
        descricao: mockHistorico.descricao,
        autorId: mockHistorico.autorId,
        autorNome: mockHistorico.autorNome,
        autorEmail: mockHistorico.autorEmail,
      });
    });
  });

  // ========================================
  // Testes de listarHistoricoChamado
  // ========================================

  describe('listarHistoricoChamado', () => {
    it('Dado um ID de chamado válido, quando listarHistoricoChamado é chamado, então retorna a lista de históricos do chamado ordenada por data crescente e completa', async () => {
      // Arrange
      const chamadoId = 'chamado123';
      const olderDate = new Date('2023-01-01T10:00:00Z');
      const newerDate = new Date('2023-01-01T12:00:00Z');

      const mockHistoricoList = [
        { ...createMockHistorico(), dataHora: olderDate },
        { ...createMockHistorico(), dataHora: newerDate },
      ];

      const sortSpy = vi.fn().mockResolvedValue(mockHistoricoList as any);
      const findSpy = vi
        .spyOn(ChamadoAtualizacao, 'find')
        .mockReturnValueOnce({ sort: sortSpy } as any);

      // Act
      const result = await listarHistoricoChamado(chamadoId);

      // Assert - Execução da query
      expect(findSpy).toHaveBeenCalledTimes(1);
      expect(findSpy).toHaveBeenCalledWith({ chamadoId });
      expect(sortSpy).toHaveBeenCalledTimes(1);
      expect(sortSpy).toHaveBeenCalledWith({ dataHora: 1 });

      // Assert - Estrutura do resultado
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);

      // Assert - Conteúdo do resultado
      expect(result).toEqual(mockHistoricoList);
      expect(result[0].dataHora).toEqual(olderDate);
      expect(result[1].dataHora).toEqual(newerDate);

      // Assert - Ordem de classificação
      expect(result[0].dataHora.getTime()).toBeLessThan(
        result[1].dataHora.getTime()
      );
    });
  });
});