import { describe, it, expect } from 'vitest';
import { ChamadoStatus } from '@prisma/client';

describe('Rotas do Chamado', () => {
  describe('Validação da descrição', () => {
    const validarDescricao = (descricao: any): { valida: boolean; erro?: string } => {
      if (!descricao || typeof descricao !== 'string') {
        return { valida: false, erro: 'Descrição é obrigatória' };
      }

      const trimmed = descricao.trim();
      
      if (trimmed.length === 0) {
        return { valida: false, erro: 'Descrição é obrigatória' };
      }

      if (trimmed.length < 10) {
        return { valida: false, erro: 'Descrição deve ter no mínimo 10 caracteres' };
      }

      if (trimmed.length > 5000) {
        return { valida: false, erro: 'Descrição deve ter no máximo 5000 caracteres' };
      }

      return { valida: true };
    };

    it('deve retornar erro quando descrição for null', () => {
      const resultado = validarDescricao(null);
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toBe('Descrição é obrigatória');
    });

    it('deve retornar erro quando descrição for undefined', () => {
      const resultado = validarDescricao(undefined);
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toBe('Descrição é obrigatória');
    });

    it('deve retornar erro quando descrição for número', () => {
      const resultado = validarDescricao(12345);
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toBe('Descrição é obrigatória');
    });

    it('deve retornar erro quando descrição for vazia', () => {
      const resultado = validarDescricao('');
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toBe('Descrição é obrigatória');
    });

    it('deve retornar erro quando descrição for apenas espaços', () => {
      const resultado = validarDescricao('   ');
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toBe('Descrição é obrigatória');
    });

    it('deve retornar erro quando descrição tiver menos de 10 caracteres', () => {
      const resultado = validarDescricao('Curta');
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toContain('no mínimo 10 caracteres');
    });

    it('deve retornar erro quando descrição tiver exatamente 9 caracteres', () => {
      const resultado = validarDescricao('123456789');
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toContain('no mínimo 10 caracteres');
    });

    it('deve retornar erro quando descrição tiver mais de 5000 caracteres', () => {
      const descricaoLonga = 'a'.repeat(5001);
      const resultado = validarDescricao(descricaoLonga);
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toContain('no máximo 5000 caracteres');
    });

    it('deve aceitar descrição com exatamente 10 caracteres', () => {
      const resultado = validarDescricao('1234567890');
      expect(resultado.valida).toBe(true);
      expect(resultado.erro).toBeUndefined();
    });

    it('deve aceitar descrição com exatamente 5000 caracteres', () => {
      const descricaoMax = 'a'.repeat(5000);
      const resultado = validarDescricao(descricaoMax);
      expect(resultado.valida).toBe(true);
      expect(resultado.erro).toBeUndefined();
    });

    it('deve aceitar descrição válida', () => {
      const resultado = validarDescricao('Descrição válida com mais de 10 caracteres');
      expect(resultado.valida).toBe(true);
      expect(resultado.erro).toBeUndefined();
    });

    it('deve trimmar descrição antes de validar', () => {
      const resultado = validarDescricao('   Descrição válida   ');
      expect(resultado.valida).toBe(true);
    });
  });

  describe('Validação da padronização de serviços', () => {
    const normalizarServicos = (servico: any): string[] => {
      if (!servico) return [];

      // Se for string, converte para array
      const servicosArray = Array.isArray(servico) ? servico : [servico];

      // Filtra apenas strings válidas e remove duplicatas
      return [...new Set(
        servicosArray
          .filter((s) => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim())
      )];
    };

    it('deve retornar array vazio quando serviço for null', () => {
      const resultado = normalizarServicos(null);
      expect(resultado).toEqual([]);
    });

    it('deve retornar array vazio quando serviço for undefined', () => {
      const resultado = normalizarServicos(undefined);
      expect(resultado).toEqual([]);
    });

    it('deve converter string única em array', () => {
      const resultado = normalizarServicos('Suporte Técnico');
      expect(resultado).toEqual(['Suporte Técnico']);
    });

    it('deve filtrar valores não-string', () => {
      const resultado = normalizarServicos([123, null, 'Suporte', {}, []]);
      expect(resultado).toEqual(['Suporte']);
    });

    it('deve filtrar strings vazias', () => {
      const resultado = normalizarServicos(['Suporte', '', '  ', 'Manutenção']);
      expect(resultado).toEqual(['Suporte', 'Manutenção']);
    });

    it('deve trimmar strings', () => {
      const resultado = normalizarServicos(['  Suporte  ', 'Manutenção  ']);
      expect(resultado).toEqual(['Suporte', 'Manutenção']);
    });

    it('deve remover duplicatas', () => {
      const resultado = normalizarServicos(['Suporte', 'Suporte', 'Manutenção']);
      expect(resultado).toEqual(['Suporte', 'Manutenção']);
    });

    it('deve remover duplicatas após trimming', () => {
      const resultado = normalizarServicos(['Suporte', '  Suporte  ']);
      expect(resultado).toEqual(['Suporte']);
    });

    it('deve processar array misto corretamente', () => {
      const resultado = normalizarServicos([
        'Suporte Técnico',
        null,
        123,
        '',
        '  Manutenção  ',
        'Suporte Técnico',
        '   ',
      ]);
      expect(resultado).toEqual(['Suporte Técnico', 'Manutenção']);
    });
  });

  describe('Geração de ordem de serviço (OS)', () => {
    const gerarProximoNumeroOS = (ultimaOS: string | null): string => {
      if (!ultimaOS) {
        return 'INC0001';
      }

      // Extrair número da última OS
      const numeroAtual = parseInt(ultimaOS.replace('INC', ''), 10);

      // Se não for um número válido, começar do INC0001
      if (isNaN(numeroAtual)) {
        return 'INC0001';
      }

      // Incrementar e formatar com padding de 4 dígitos
      const proximoNumero = numeroAtual + 1;
      return `INC${proximoNumero.toString().padStart(4, '0')}`;
    };

    it('deve gerar INC0001 quando não houver última OS', () => {
      const resultado = gerarProximoNumeroOS(null);
      expect(resultado).toBe('INC0001');
    });

    it('deve incrementar número corretamente', () => {
      const resultado = gerarProximoNumeroOS('INC0001');
      expect(resultado).toBe('INC0002');
    });

    it('deve gerar INC0001 quando última OS for inválida', () => {
      const resultado = gerarProximoNumeroOS('INCabc');
      expect(resultado).toBe('INC0001');
    });

    it('deve manter padding de 4 dígitos', () => {
      const resultado = gerarProximoNumeroOS('INC0099');
      expect(resultado).toBe('INC0100');
    });

    it('deve funcionar com números grandes', () => {
      const resultado = gerarProximoNumeroOS('INC9999');
      expect(resultado).toBe('INC10000');
    });

    it('deve lidar com string vazia', () => {
      const resultado = gerarProximoNumeroOS('');
      expect(resultado).toBe('INC0001');
    });
  });
  
  describe('Validação do status', () => {
    const validarTransicaoStatus = (
      statusAtual: ChamadoStatus,
      novoStatus: ChamadoStatus
    ): { valida: boolean; erro?: string } => {
      // Cancelado não pode ser alterado
      if (statusAtual === ChamadoStatus.CANCELADO) {
        return { valida: false, erro: 'Chamados cancelados não podem ser alterados' };
      }

      // Não pode mudar para ABERTO ou REABERTO manualmente
      if (novoStatus === ChamadoStatus.ABERTO || novoStatus === ChamadoStatus.REABERTO) {
        return { valida: false, erro: 'Status inválido para transição manual' };
      }

      return { valida: true };
    };

    it('deve rejeitar alteração de chamado cancelado', () => {
      const resultado = validarTransicaoStatus(
        ChamadoStatus.CANCELADO,
        ChamadoStatus.EM_ATENDIMENTO
      );
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toContain('cancelados não podem ser alterados');
    });

    it('deve rejeitar transição para ABERTO', () => {
      const resultado = validarTransicaoStatus(
        ChamadoStatus.EM_ATENDIMENTO,
        ChamadoStatus.ABERTO
      );
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toContain('Status inválido');
    });

    it('deve rejeitar transição para REABERTO', () => {
      const resultado = validarTransicaoStatus(
        ChamadoStatus.EM_ATENDIMENTO,
        ChamadoStatus.REABERTO
      );
      expect(resultado.valida).toBe(false);
      expect(resultado.erro).toContain('Status inválido');
    });

    it('deve aceitar transição válida para EM_ATENDIMENTO', () => {
      const resultado = validarTransicaoStatus(
        ChamadoStatus.ABERTO,
        ChamadoStatus.EM_ATENDIMENTO
      );
      expect(resultado.valida).toBe(true);
    });

    it('deve aceitar transição válida para ENCERRADO', () => {
      const resultado = validarTransicaoStatus(
        ChamadoStatus.EM_ATENDIMENTO,
        ChamadoStatus.ENCERRADO
      );
      expect(resultado.valida).toBe(true);
    });

    it('deve aceitar transição válida para CANCELADO', () => {
      const resultado = validarTransicaoStatus(
        ChamadoStatus.ABERTO,
        ChamadoStatus.CANCELADO
      );
      expect(resultado.valida).toBe(true);
    });
  });
  
  describe('Validação de expediente', () => {
    interface Expediente {
      entrada: Date;
      saida: Date;
      ativo: boolean;
      deletadoEm: Date | null;
    }

    const estaNoExpediente = (
      expedientes: Expediente[],
      horaAtual: Date
    ): boolean => {
      // Filtrar apenas expedientes válidos
      const expedientesValidos = expedientes.filter(
        (exp) => exp.ativo && !exp.deletadoEm
      );

      if (expedientesValidos.length === 0) {
        return false;
      }

      const horaAtualMinutos = horaAtual.getHours() * 60 + horaAtual.getMinutes();

      return expedientesValidos.some((exp) => {
        const entradaMinutos = exp.entrada.getHours() * 60 + exp.entrada.getMinutes();
        const saidaMinutos = exp.saida.getHours() * 60 + exp.saida.getMinutes();

        return horaAtualMinutos >= entradaMinutos && horaAtualMinutos <= saidaMinutos;
      });
    };

    it('deve retornar false quando não houver expedientes', () => {
      const resultado = estaNoExpediente([], new Date());
      expect(resultado).toBe(false);
    });

    it('deve retornar false quando expedientes estiverem inativos', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(9, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: false,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(10, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(false);
    });

    it('deve retornar false quando expedientes estiverem deletados', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(9, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: new Date(),
        },
      ];
      const horaAtual = new Date(new Date().setHours(10, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(false);
    });

    it('deve retornar false quando hora atual for antes do expediente', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(9, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(8, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(false);
    });

    it('deve retornar false quando hora atual for após o expediente', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(9, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(19, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(false);
    });

    it('deve retornar true quando hora atual estiver dentro do expediente', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(9, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(10, 30, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(true);
    });

    it('deve retornar true quando hora for exatamente no início do expediente', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(9, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(9, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(true);
    });

    it('deve retornar true quando hora for exatamente no fim do expediente', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(9, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(18, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(true);
    });

    it('deve funcionar com múltiplos expedientes', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(8, 0, 0)),
          saida: new Date(new Date().setHours(12, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
        {
          entrada: new Date(new Date().setHours(14, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(15, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(true);
    });

    it('deve retornar false no intervalo entre expedientes', () => {
      const expedientes = [
        {
          entrada: new Date(new Date().setHours(8, 0, 0)),
          saida: new Date(new Date().setHours(12, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
        {
          entrada: new Date(new Date().setHours(14, 0, 0)),
          saida: new Date(new Date().setHours(18, 0, 0)),
          ativo: true,
          deletadoEm: null,
        },
      ];
      const horaAtual = new Date(new Date().setHours(13, 0, 0));

      const resultado = estaNoExpediente(expedientes, horaAtual);
      expect(resultado).toBe(false);
    });
  });
  
  describe('Validação do prazo de reabertura', () => {
    const podeReabrir = (encerradoEm: Date | null): { pode: boolean; erro?: string } => {
      if (!encerradoEm) {
        return { pode: false, erro: 'Data de encerramento não encontrada' };
      }

      const agora = new Date();
      const diferencaMs = agora.getTime() - encerradoEm.getTime();
      const diferencaHoras = diferencaMs / (1000 * 60 * 60);

      if (diferencaHoras > 48) {
        return { pode: false, erro: 'Prazo de 48 horas excedido' };
      }

      return { pode: true };
    };

    it('deve retornar erro quando não houver data de encerramento', () => {
      const resultado = podeReabrir(null);
      expect(resultado.pode).toBe(false);
      expect(resultado.erro).toContain('Data de encerramento não encontrada');
    });

    it('deve retornar erro quando exceder 48 horas', () => {
      const encerradoEm = new Date(Date.now() - 49 * 3600 * 1000);
      const resultado = podeReabrir(encerradoEm);
      expect(resultado.pode).toBe(false);
      expect(resultado.erro).toContain('48 horas');
    });

    it('deve aceitar exatamente 48 horas', () => {
      const encerradoEm = new Date(Date.now() - 48 * 3600 * 1000);
      const resultado = podeReabrir(encerradoEm);
      expect(resultado.pode).toBe(true);
    });

    it('deve aceitar menos de 48 horas', () => {
      const encerradoEm = new Date(Date.now() - 24 * 3600 * 1000);
      const resultado = podeReabrir(encerradoEm);
      expect(resultado.pode).toBe(true);
    });

    it('deve aceitar recém encerrado', () => {
      const encerradoEm = new Date(Date.now() - 30 * 60 * 1000); // 30 minutos
      const resultado = podeReabrir(encerradoEm);
      expect(resultado.pode).toBe(true);
    });

    it('deve rejeitar 48h + 1 minuto', () => {
      const encerradoEm = new Date(Date.now() - (48 * 3600 + 60) * 1000);
      const resultado = podeReabrir(encerradoEm);
      expect(resultado.pode).toBe(false);
    });
  });
  
  describe('Validação de permissionamento', () => {
    interface Usuario {
      id: string;
      regra: 'ADMIN' | 'TECNICO' | 'USUARIO';
    }

    const podeEditarChamado = (
      usuario: Usuario,
      chamadoUsuarioId: string
    ): boolean => {
      // Admin pode editar qualquer chamado
      if (usuario.regra === 'ADMIN') {
        return true;
      }

      // Outros só podem editar seus próprios chamados
      return usuario.id === chamadoUsuarioId;
    };

    it('deve permitir admin editar qualquer chamado', () => {
      const admin = { id: 'admin-1', regra: 'ADMIN' as const };
      const resultado = podeEditarChamado(admin, 'outro-usuario');
      expect(resultado).toBe(true);
    });

    it('deve permitir usuário editar próprio chamado', () => {
      const usuario = { id: 'user-1', regra: 'USUARIO' as const };
      const resultado = podeEditarChamado(usuario, 'user-1');
      expect(resultado).toBe(true);
    });

    it('deve impedir usuário de editar chamado de outro', () => {
      const usuario = { id: 'user-1', regra: 'USUARIO' as const };
      const resultado = podeEditarChamado(usuario, 'user-2');
      expect(resultado).toBe(false);
    });

    it('deve permitir técnico editar próprio chamado', () => {
      const tecnico = { id: 'tech-1', regra: 'TECNICO' as const };
      const resultado = podeEditarChamado(tecnico, 'tech-1');
      expect(resultado).toBe(true);
    });

    it('deve impedir técnico de editar chamado de outro', () => {
      const tecnico = { id: 'tech-1', regra: 'TECNICO' as const };
      const resultado = podeEditarChamado(tecnico, 'user-2');
      expect(resultado).toBe(false);
    });
  });
  
  describe('Validação dos dados do chamado', () => {
    interface ChamadoCompleto {
      id: string;
      OS: string;
      descricao: string;
      descricaoEncerramento: string | null;
      status: ChamadoStatus;
      geradoEm: Date;
      atualizadoEm: Date;
      encerradoEm: Date | null;
      usuario: { id: string; nome: string; sobrenome: string; email: string } | null;
      tecnico: { id: string; nome: string; sobrenome: string; email: string } | null;
      servicos?: { servico: { id: string; nome: string } }[];
    }

    const formatarChamadoResposta = (chamado: ChamadoCompleto) => {
      return {
        id: chamado.id,
        OS: chamado.OS,
        descricao: chamado.descricao,
        descricaoEncerramento: chamado.descricaoEncerramento,
        status: chamado.status,
        geradoEm: chamado.geradoEm.toISOString(),
        atualizadoEm: chamado.atualizadoEm.toISOString(),
        encerradoEm: chamado.encerradoEm?.toISOString() ?? null,
        usuario: chamado.usuario
          ? {
              id: chamado.usuario.id,
              nome: chamado.usuario.nome,
              sobrenome: chamado.usuario.sobrenome,
              email: chamado.usuario.email,
            }
          : null,
        tecnico: chamado.tecnico
          ? {
              id: chamado.tecnico.id,
              nome: chamado.tecnico.nome,
              sobrenome: chamado.tecnico.sobrenome,
              email: chamado.tecnico.email,
            }
          : null,
        servicos: chamado.servicos?.map((s) => ({
          id: s.servico.id,
          nome: s.servico.nome,
        })) ?? [],
      };
    };

    it('deve formatar chamado completo corretamente', () => {
      const chamado: ChamadoCompleto = {
        id: 'chamado-1',
        OS: 'INC0001',
        descricao: 'Descrição do chamado',
        descricaoEncerramento: null,
        status: ChamadoStatus.ABERTO,
        geradoEm: new Date('2025-01-01'),
        atualizadoEm: new Date('2025-01-01'),
        encerradoEm: null,
        usuario: {
          id: 'user-1',
          nome: 'João',
          sobrenome: 'Silva',
          email: 'joao@example.com',
        },
        tecnico: null,
        servicos: [
          { servico: { id: 'serv-1', nome: 'Suporte' } },
        ],
      };

      const resultado = formatarChamadoResposta(chamado);

      expect(resultado.id).toBe('chamado-1');
      expect(resultado.OS).toBe('INC0001');
      expect(resultado.usuario).toEqual({
        id: 'user-1',
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@example.com',
      });
      expect(resultado.tecnico).toBeNull();
      expect(resultado.servicos).toEqual([{ id: 'serv-1', nome: 'Suporte' }]);
    });

    it('deve formatar datas em ISO string', () => {
      const chamado: ChamadoCompleto = {
        id: 'chamado-1',
        OS: 'INC0001',
        descricao: 'Teste',
        descricaoEncerramento: null,
        status: ChamadoStatus.ABERTO,
        geradoEm: new Date('2025-01-01T10:00:00Z'),
        atualizadoEm: new Date('2025-01-01T11:00:00Z'),
        encerradoEm: null,
        usuario: null,
        tecnico: null,
      };

      const resultado = formatarChamadoResposta(chamado);

      expect(resultado.geradoEm).toBe('2025-01-01T10:00:00.000Z');
      expect(resultado.atualizadoEm).toBe('2025-01-01T11:00:00.000Z');
      expect(resultado.encerradoEm).toBeNull();
    });

    it('deve retornar array vazio quando servicos for undefined', () => {
      const chamado: ChamadoCompleto = {
        id: 'chamado-1',
        OS: 'INC0001',
        descricao: 'Teste',
        descricaoEncerramento: null,
        status: ChamadoStatus.ABERTO,
        geradoEm: new Date(),
        atualizadoEm: new Date(),
        encerradoEm: null,
        usuario: null,
        tecnico: null,
        servicos: undefined,
      };

      const resultado = formatarChamadoResposta(chamado);
      expect(resultado.servicos).toEqual([]);
    });
  });
});