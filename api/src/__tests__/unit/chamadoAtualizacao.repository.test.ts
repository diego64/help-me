import { 
  describe,
  it,
  expect,
  vi,
  beforeEach
} from 'vitest';
import {
  salvarHistoricoChamado,
  listarHistoricoChamado
} from '../../repositories/chamadoAtualizacao.repository';
import ChamadoAtualizacao from '../../models/chamadoAtualizacao.model';

vi.mock('../../models/chamadoAtualizacao.model', () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(),
  },
}));

const dadosHistoricoEntrada = {
  chamadoId: 'abc',
  tipo: 'atualizacao',
  de: 'open',
  para: 'close',
  descricao: 'Teste de atualização',
  autorId: 'usr',
  autorNome: 'Nome',
  autorEmail: 'mail@dom.com',
};

const historicoSalvo = {
  _id: '1',
  chamadoId: 'abc'
};

const listaHistoricos = [
  {
    chamadoId: 'abc',
    descricao: 'teste'
  }
];


beforeEach(() => {
  vi.clearAllMocks();
  
  vi.mocked(ChamadoAtualizacao.create).mockResolvedValue(historicoSalvo as any);
  
  const mockSort = vi.fn().mockResolvedValue(listaHistoricos);
  vi.mocked(ChamadoAtualizacao.find).mockReturnValue({ sort: mockSort } as any);
});


describe('salvarHistoricoChamado', () => {
  it('deve retornar o histórico criado quando dados válidos forem fornecidos', async () => {
    // Arrange
    
    // Act
    const resultado = await salvarHistoricoChamado(dadosHistoricoEntrada);
    
    // Assert
    expect(ChamadoAtualizacao.create).toHaveBeenCalledWith(dadosHistoricoEntrada);
    expect(ChamadoAtualizacao.create).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual(historicoSalvo);
  });

  it('deve chamar o método create com todos os campos corretos do histórico', async () => {
    // Arrange

    // Act
    await salvarHistoricoChamado(dadosHistoricoEntrada);
    
    // Assert
    expect(ChamadoAtualizacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: 'abc',
        tipo: 'atualizacao',
        de: 'open',
        para: 'close',
        descricao: 'Teste de atualização',
        autorId: 'usr',
        autorNome: 'Nome',
        autorEmail: 'mail@dom.com',
      })
    );
  });

  it('deve propagar o erro quando ocorrer falha na criação do histórico', async () => {
    // Arrange
    const erroConexao = new Error('Database connection failed');
    vi.mocked(ChamadoAtualizacao.create).mockRejectedValueOnce(erroConexao);
    
    // Act & Assert
    await expect(salvarHistoricoChamado(dadosHistoricoEntrada)).rejects.toThrow(
      'Database connection failed'
    );
    expect(ChamadoAtualizacao.create).toHaveBeenCalledWith(dadosHistoricoEntrada);
  });
});

describe('listarHistoricoChamado', () => {
  it('deve retornar lista de históricos ordenados quando chamado ID válido for fornecido', async () => {
    // Arrange
    const chamadoId = 'abc';
    
    // Act
    const resultado = await listarHistoricoChamado(chamadoId);
    
    // Assert
    expect(ChamadoAtualizacao.find).toHaveBeenCalledWith({ chamadoId: 'abc' });
    expect(ChamadoAtualizacao.find).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual(listaHistoricos);
  });

  it('deve buscar históricos usando o ID correto do chamado', async () => {
    // Arrange
    const chamadoIdEspecifico = 'chamado-123';
    
    // Act
    await listarHistoricoChamado(chamadoIdEspecifico);
    
    // Assert
    expect(ChamadoAtualizacao.find).toHaveBeenCalledWith({
      chamadoId: 'chamado-123'
    });
  });

  it('deve ordenar os resultados por dataHora em ordem crescente', async () => {
    // Arrange
    const chamadoId = 'abc';
    const mockSort = vi.fn().mockResolvedValue(listaHistoricos);
    vi.mocked(ChamadoAtualizacao.find).mockReturnValue({ sort: mockSort } as any);
    
    // Act
    await listarHistoricoChamado(chamadoId);
    
    // Assert
    expect(mockSort).toHaveBeenCalledWith({ dataHora: 1 });
  });

  it('deve retornar lista vazia quando não existir histórico para o chamado', async () => {
    // Arrange
    const chamadoSemHistorico = 'chamado-sem-historico';
    const mockSort = vi.fn().mockResolvedValue([]);
    vi.mocked(ChamadoAtualizacao.find).mockReturnValue({ sort: mockSort } as any);
    
    // Act
    const resultado = await listarHistoricoChamado(chamadoSemHistorico);
    
    // Assert
    expect(resultado).toEqual([]);
    expect(resultado).toHaveLength(0);
  });

  it('deve propagar o erro quando ocorrer falha na busca do histórico', async () => {
    // Arrange
    const erroConsulta = new Error('Database query failed');
    const mockSort = vi.fn().mockRejectedValue(erroConsulta);
    vi.mocked(ChamadoAtualizacao.find).mockReturnValue({ sort: mockSort } as any);
    
    // Act & Assert
    await expect(listarHistoricoChamado('abc')).rejects.toThrow(
      'Database query failed'
    );
  });
});