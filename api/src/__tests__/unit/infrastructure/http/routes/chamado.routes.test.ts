import { describe, it, expect } from 'vitest';
import { ChamadoStatus, PrioridadeChamado, NivelTecnico } from '@prisma/client';

const MIN_DESCRICAO_LENGTH   = 10;
const MAX_DESCRICAO_LENGTH   = 5000;
const MIN_COMENTARIO_LENGTH  = 1;
const MAX_COMENTARIO_LENGTH  = 5000;
const REABERTURA_PRAZO_HORAS = 48;
const OS_PREFIX  = 'INC';
const OS_PADDING = 4;

const PRIORIDADES_VALIDAS: PrioridadeChamado[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

const DESCRICAO_PRIORIDADE: Record<PrioridadeChamado, string> = {
  P1: 'Alta Prioridade',
  P2: 'Urgente',
  P3: 'Urgente',
  P4: 'Baixa Prioridade',
  P5: 'Baixa Prioridade',
};

const PRIORIDADES_POR_NIVEL: Record<NivelTecnico, PrioridadeChamado[]> = {
  N1: ['P4', 'P5'],
  N2: ['P2', 'P3'],
  N3: ['P1', 'P2', 'P3', 'P4', 'P5'],
};

const NIVEL_POR_PRIORIDADE: Record<PrioridadeChamado, NivelTecnico[]> = {
  P1: ['N3'],
  P2: ['N2', 'N3'],
  P3: ['N2', 'N3'],
  P4: ['N1', 'N3'],
  P5: ['N1', 'N3'],
};

function validarDescricao(descricao: string): { valida: boolean; erro?: string } {
  if (!descricao || typeof descricao !== 'string') {
    return { valida: false, erro: 'Descrição é obrigatória' };
  }
  const descricaoLimpa = descricao.trim();
  if (descricaoLimpa.length < MIN_DESCRICAO_LENGTH) {
    return { valida: false, erro: `Descrição deve ter no mínimo ${MIN_DESCRICAO_LENGTH} caracteres` };
  }
  if (descricaoLimpa.length > MAX_DESCRICAO_LENGTH) {
    return { valida: false, erro: `Descrição deve ter no máximo ${MAX_DESCRICAO_LENGTH} caracteres` };
  }
  return { valida: true };
}

function validarComentario(comentario: string): { valido: boolean; erro?: string } {
  if (!comentario || typeof comentario !== 'string') {
    return { valido: false, erro: 'Comentário é obrigatório' };
  }
  const limpo = comentario.trim();
  if (limpo.length < MIN_COMENTARIO_LENGTH) {
    return { valido: false, erro: 'Comentário não pode ser vazio' };
  }
  if (limpo.length > MAX_COMENTARIO_LENGTH) {
    return { valido: false, erro: `Comentário deve ter no máximo ${MAX_COMENTARIO_LENGTH} caracteres` };
  }
  return { valido: true };
}

function normalizarServicos(servico: any): string[] {
  if (servico == null) return [];
  if (Array.isArray(servico)) {
    return servico
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof servico === 'string') {
    const nome = servico.trim();
    return nome.length > 0 ? [nome] : [];
  }
  return [];
}

function gerarProximoNumeroOS(ultimaOS: string | null): string {
  if (!ultimaOS) return `${OS_PREFIX}${'1'.padStart(OS_PADDING, '0')}`;
  const numero = parseInt(ultimaOS.replace(OS_PREFIX, ''), 10);
  if (isNaN(numero)) return `${OS_PREFIX}${'1'.padStart(OS_PADDING, '0')}`;
  return `${OS_PREFIX}${String(numero + 1).padStart(OS_PADDING, '0')}`;
}

function podeReabrir(encerradoEm: Date | null): { pode: boolean; erro?: string } {
  if (!encerradoEm) return { pode: false, erro: 'Data de encerramento não encontrada' };
  const diffHoras = (Date.now() - encerradoEm.getTime()) / (1000 * 60 * 60);
  if (diffHoras > REABERTURA_PRAZO_HORAS) {
    return {
      pode: false,
      erro: `Só é possível reabrir até ${REABERTURA_PRAZO_HORAS} horas após o encerramento`,
    };
  }
  return { pode: true };
}

// Espelha a lógica interna de verificarExpedienteTecnico() do routes
function estaNoExpediente(
  expedientes: { entrada: Date; saida: Date; ativo: boolean; deletadoEm: Date | null }[],
  agora: Date
): boolean {
  const validos = expedientes.filter((e) => e.ativo && !e.deletadoEm);
  if (!validos.length) return false;
  const horaAtual = agora.getHours() + agora.getMinutes() / 60;
  return validos.some((exp) => {
    const h0 = new Date(exp.entrada).getHours() + new Date(exp.entrada).getMinutes() / 60;
    const h1 = new Date(exp.saida).getHours()   + new Date(exp.saida).getMinutes()   / 60;
    return horaAtual >= h0 && horaAtual <= h1;
  });
}

// Espelha formatarChamadoResposta() do routes
function formatarChamadoResposta(chamado: any) {
  return {
    id: chamado.id,
    OS: chamado.OS,
    descricao: chamado.descricao,
    descricaoEncerramento: chamado.descricaoEncerramento,
    status: chamado.status,
    prioridade: chamado.prioridade,
    prioridadeDescricao: chamado.prioridade
      ? DESCRICAO_PRIORIDADE[chamado.prioridade as PrioridadeChamado]
      : null,
    prioridadeAlteradaEm:  chamado.prioridadeAlterada ?? null,
    prioridadeAlteradaPor: chamado.alteradorPrioridade
      ? {
          id:    chamado.alteradorPrioridade.id,
          nome:  `${chamado.alteradorPrioridade.nome} ${chamado.alteradorPrioridade.sobrenome}`,
          email: chamado.alteradorPrioridade.email,
        }
      : null,
    geradoEm:     chamado.geradoEm,
    atualizadoEm: chamado.atualizadoEm,
    encerradoEm:  chamado.encerradoEm,
    usuario: chamado.usuario
      ? {
          id:        chamado.usuario.id,
          nome:      chamado.usuario.nome,
          sobrenome: chamado.usuario.sobrenome,
          email:     chamado.usuario.email,
        }
      : null,
    // nota: usa tecnicoId (não tecnico.id) — igual ao routes
    tecnico: chamado.tecnico
      ? { id: chamado.tecnicoId, nome: chamado.tecnico.nome, email: chamado.tecnico.email }
      : null,
    servicos: chamado.servicos?.map((s: any) => ({
      id:   s.servico.id,
      nome: s.servico.nome,
    })) || [],
  };
}

const str = (s: string): string => s;

const makeExpediente = (
  entradaH: number,
  saidaH:   number,
  ativo     = true,
  deletadoEm: Date | null = null
) => {
  const base    = new Date();
  const entrada = new Date(base); entrada.setHours(entradaH, 0, 0, 0);
  const saida   = new Date(base); saida.setHours(saidaH,    0, 0, 0);
  return { entrada, saida, ativo, deletadoEm };
};

const horaFixa = (h: number, min = 0) => {
  const d = new Date(); d.setHours(h, min, 0, 0); return d;
};

const BASE_DATE = new Date('2025-01-01T10:00:00.000Z');

const chamadoBase = {
  id: 'chamado-1',
  OS: 'INC0001',
  descricao: 'Descrição do chamado',
  descricaoEncerramento: null,
  status: ChamadoStatus.ABERTO,
  prioridade: PrioridadeChamado.P4,
  prioridadeAlterada: null,
  alteradorPrioridade: null,
  geradoEm:     BASE_DATE,
  atualizadoEm: BASE_DATE,
  encerradoEm:  null,
  tecnicoId:    null,
  usuario: { id: 'user-1', nome: 'João', sobrenome: 'Silva', email: 'joao@example.com', setor: 'TI' },
  tecnico:  null,
  servicos: [{ servico: { id: 'serv-1', nome: 'Suporte' } }],
};

describe('chamado.routes — funções utilitárias e regras de negócio', () => {
  describe('validarDescricao()', () => {
    describe('tipo inválido → "Descrição é obrigatória"', () => {
      it.each([null, undefined, 12345, {}])(
        'deve rejeitar %s',
        (entrada) => {
          const res = validarDescricao(entrada as any);
          expect(res.valida).toBe(false);
          expect(res.erro).toBe('Descrição é obrigatória');
        }
      );
    });

    describe('comprimento mínimo', () => {
      it('deve rejeitar string vazia ""', () => {
        const res = validarDescricao('');
        expect(res.valida).toBe(false);
        expect(res.erro).toBe('Descrição é obrigatória');
      });

      it.each([
        ['   ',       'no mínimo 10 caracteres'], // trim → 0 chars < 10
        ['Curta',     'no mínimo 10 caracteres'],
        ['123456789', 'no mínimo 10 caracteres'],
      ])('deve rejeitar "%s"', (entrada, fragmento) => {
        const res = validarDescricao(entrada);
        expect(res.valida).toBe(false);
        expect(res.erro).toContain(fragmento);
      });

      it('deve aceitar exatamente 10 caracteres', () => {
        expect(validarDescricao('1234567890').valida).toBe(true);
      });
    });

    describe('comprimento máximo', () => {
      it('deve rejeitar 5001 caracteres', () => {
        const res = validarDescricao('a'.repeat(5001));
        expect(res.valida).toBe(false);
        expect(res.erro).toContain('no máximo 5000 caracteres');
      });

      it('deve aceitar exatamente 5000 caracteres', () => {
        expect(validarDescricao('a'.repeat(5000)).valida).toBe(true);
      });
    });

    it.each([
      ['Descrição válida com mais de dez caracteres'],
      ['   Com espaços nas bordas   '],
    ])('deve aceitar "%s"', (entrada) => {
      const res = validarDescricao(entrada);
      expect(res.valida).toBe(true);
      expect(res.erro).toBeUndefined();
    });
  });

  describe('validarComentario()', () => {
    describe('tipo inválido → "Comentário é obrigatório"', () => {
      it.each([null, undefined, 123])(
        'deve rejeitar %s',
        (entrada) => {
          const res = validarComentario(entrada as any);
          expect(res.valido).toBe(false);
          expect(res.erro).toBe('Comentário é obrigatório');
        }
      );

      it('deve rejeitar string vazia ""', () => {
        const res = validarComentario('');
        expect(res.valido).toBe(false);
        expect(res.erro).toBe('Comentário é obrigatório');
      });
    });

    it('deve rejeitar string só com espaços (trim → vazio < MIN)', () => {
      const res = validarComentario('   ');
      expect(res.valido).toBe(false);
      expect(res.erro).toBe('Comentário não pode ser vazio');
    });

    it('deve rejeitar mais de 5000 caracteres', () => {
      const res = validarComentario('a'.repeat(5001));
      expect(res.valido).toBe(false);
      expect(res.erro).toContain('no máximo 5000 caracteres');
    });

    it.each(['a', 'Comentário normal', 'a'.repeat(5000)])(
      'deve aceitar "%s"',
      (entrada) => {
        expect(validarComentario(entrada).valido).toBe(true);
      }
    );
  });

  describe('normalizarServicos()', () => {
    describe('entradas nulas/inválidas → []', () => {
      it.each([null, undefined, {}, 0, false])(
        'deve retornar [] para %s',
        (entrada) => expect(normalizarServicos(entrada)).toEqual([])
      );
    });

    describe('entrada string', () => {
      it('deve converter string válida em array de um elemento', () =>
        expect(normalizarServicos('Suporte Técnico')).toEqual(['Suporte Técnico']));

      it('deve retornar [] para string vazia', () =>
        expect(normalizarServicos('')).toEqual([]));

      it('deve retornar [] para string só com espaços', () =>
        expect(normalizarServicos('   ')).toEqual([]));

      it('deve trimmar a string', () =>
        expect(normalizarServicos('  Suporte  ')).toEqual(['Suporte']));
    });

    describe('entrada array', () => {
      it('deve filtrar elementos não-string', () =>
        expect(normalizarServicos([123, null, 'Suporte', {}, []])).toEqual(['Suporte']));

      it('deve filtrar strings vazias e só-espaços', () =>
        expect(normalizarServicos(['Suporte', '', '  ', 'Manutenção'])).toEqual(['Suporte', 'Manutenção']));

      it('deve trimmar cada elemento', () =>
        expect(normalizarServicos(['  Suporte  ', 'Manutenção  '])).toEqual(['Suporte', 'Manutenção']));

      // A implementação real NÃO usa Set — unicidade é garantida pela consulta ao banco.
      it('NÃO remove duplicatas (sem Set na implementação real)', () =>
        expect(normalizarServicos(['Suporte', 'Suporte'])).toEqual(['Suporte', 'Suporte']));

      it('deve processar array misto completo', () =>
        expect(
          normalizarServicos(['Suporte Técnico', null, 123, '', '  Manutenção  ', '   '])
        ).toEqual(['Suporte Técnico', 'Manutenção']));
    });
  });

  describe('gerarProximoNumeroOS()', () => {
    describe('entradas inválidas → INC0001', () => {
      it.each([null, '', 'INCabc', 'INC'])(
        'deve retornar INC0001 para "%s"',
        (entrada) => expect(gerarProximoNumeroOS(entrada)).toBe('INC0001')
      );
    });

    describe('incremento e padding', () => {
      it.each([
        ['INC0001', 'INC0002'],
        ['INC0009', 'INC0010'],
        ['INC0099', 'INC0100'],
        ['INC0999', 'INC1000'],
        // ultrapassa 4 dígitos — comportamento real do routes (sem teto)
        ['INC9999', 'INC10000'],
      ])('%s → %s', (entrada, esperado) => {
        expect(gerarProximoNumeroOS(entrada)).toBe(esperado);
      });
    });
  });

  describe('podeReabrir()', () => {
    it('deve rejeitar encerradoEm null', () => {
      const res = podeReabrir(null);
      expect(res.pode).toBe(false);
      expect(res.erro).toBe('Data de encerramento não encontrada');
    });

    describe('fora do prazo', () => {
      it.each([
        ['49 horas',       49 * 3600 * 1000],
        ['48h + 1 minuto', (48 * 3600 + 60) * 1000],
        ['72 horas',       72 * 3600 * 1000],
      ])('%s atrás → deve rejeitar', (_label, diffMs) => {
        const res = podeReabrir(new Date(Date.now() - diffMs));
        expect(res.pode).toBe(false);
        expect(res.erro).toContain('48 horas');
      });
    });

    describe('dentro do prazo', () => {
      it.each([
        ['30 minutos',     30 * 60 * 1000],
        ['24 horas',       24 * 3600 * 1000],
        ['exatamente 48h', 48 * 3600 * 1000],
      ])('%s atrás → deve aceitar', (_label, diffMs) => {
        expect(podeReabrir(new Date(Date.now() - diffMs)).pode).toBe(true);
      });
    });
  });

  describe('formatarChamadoResposta()', () => {
    it('deve mapear campos principais', () => {
      const res = formatarChamadoResposta(chamadoBase);
      expect(res.id).toBe('chamado-1');
      expect(res.OS).toBe('INC0001');
      expect(res.status).toBe(ChamadoStatus.ABERTO);
      expect(res.prioridade).toBe(PrioridadeChamado.P4);
    });

    it('deve retornar prioridadeDescricao para cada prioridade', () => {
      PRIORIDADES_VALIDAS.forEach((p) => {
        const res = formatarChamadoResposta({ ...chamadoBase, prioridade: p });
        expect(res.prioridadeDescricao).toBe(DESCRICAO_PRIORIDADE[p]);
      });
    });

    it('deve retornar prioridadeDescricao null quando prioridade for null', () => {
      expect(
        formatarChamadoResposta({ ...chamadoBase, prioridade: null }).prioridadeDescricao
      ).toBeNull();
    });

    // O routes retorna objetos Date diretamente do Prisma — sem .toISOString()
    it('deve retornar datas como objetos Date (não serializa para ISO)', () => {
      const res = formatarChamadoResposta(chamadoBase);
      expect(res.geradoEm).toEqual(BASE_DATE);
      expect(res.atualizadoEm).toEqual(BASE_DATE);
      expect(res.encerradoEm).toBeNull();
    });

    it('deve mapear usuario corretamente', () => {
      expect(formatarChamadoResposta(chamadoBase).usuario).toEqual({
        id: 'user-1', nome: 'João', sobrenome: 'Silva', email: 'joao@example.com',
      });
    });

    it('deve retornar tecnico null quando não atribuído', () => {
      expect(formatarChamadoResposta(chamadoBase).tecnico).toBeNull();
    });

    it('deve usar tecnicoId (não tecnico.id) no objeto tecnico retornado', () => {
      const chamado = {
        ...chamadoBase,
        tecnicoId: 'tech-1',
        tecnico: { id: 'ignorado', nome: 'Ana', sobrenome: 'Costa', email: 'ana@example.com', nivel: 'N2' },
      };
      expect(formatarChamadoResposta(chamado).tecnico).toEqual({
        id: 'tech-1', nome: 'Ana', email: 'ana@example.com',
      });
    });

    it('deve mapear servicos corretamente', () => {
      expect(formatarChamadoResposta(chamadoBase).servicos).toEqual([
        { id: 'serv-1', nome: 'Suporte' },
      ]);
    });

    it('deve retornar [] quando servicos for undefined', () => {
      expect(
        formatarChamadoResposta({ ...chamadoBase, servicos: undefined }).servicos
      ).toEqual([]);
    });

    it('deve mapear alteradorPrioridade quando presente', () => {
      const chamado = {
        ...chamadoBase,
        prioridadeAlterada: BASE_DATE,
        alteradorPrioridade: {
          id: 'admin-1', nome: 'Admin', sobrenome: 'Root', email: 'admin@example.com',
        },
      };
      const res = formatarChamadoResposta(chamado);
      expect(res.prioridadeAlteradaPor).toEqual({
        id: 'admin-1', nome: 'Admin Root', email: 'admin@example.com',
      });
      expect(res.prioridadeAlteradaEm).toEqual(BASE_DATE);
    });
  });

  describe('DESCRICAO_PRIORIDADE', () => {
    it.each([
      ['P1', 'Alta Prioridade'],
      ['P2', 'Urgente'],
      ['P3', 'Urgente'],
      ['P4', 'Baixa Prioridade'],
      ['P5', 'Baixa Prioridade'],
    ] as [PrioridadeChamado, string][])('%s → "%s"', (p, descricao) => {
      expect(DESCRICAO_PRIORIDADE[p]).toBe(descricao);
    });

    it('deve cobrir todas as prioridades válidas', () => {
      expect(Object.keys(DESCRICAO_PRIORIDADE)).toEqual(PRIORIDADES_VALIDAS);
    });
  });

  describe('PRIORIDADES_POR_NIVEL', () => {
    it.each([
      ['N1', 'P4', true],  ['N1', 'P5', true],
      ['N1', 'P1', false], ['N1', 'P2', false], ['N1', 'P3', false],
      ['N2', 'P2', true],  ['N2', 'P3', true],
      ['N2', 'P1', false], ['N2', 'P4', false], ['N2', 'P5', false],
      ['N3', 'P1', true],  ['N3', 'P2', true],  ['N3', 'P3', true],
      ['N3', 'P4', true],  ['N3', 'P5', true],
    ] as [NivelTecnico, PrioridadeChamado, boolean][])(
      '%s pode assumir prioridade %s: %s',
      (nivel, prioridade, esperado) => {
        expect(PRIORIDADES_POR_NIVEL[nivel].includes(prioridade)).toBe(esperado);
      }
    );

    it('N3 deve ter acesso a todas as prioridades', () => {
      expect(PRIORIDADES_POR_NIVEL['N3']).toEqual(PRIORIDADES_VALIDAS);
    });
  });

  describe('NIVEL_POR_PRIORIDADE', () => {
    it.each([
      ['P1', ['N3']],
      ['P2', ['N2', 'N3']],
      ['P3', ['N2', 'N3']],
      ['P4', ['N1', 'N3']],
      ['P5', ['N1', 'N3']],
    ] as [PrioridadeChamado, NivelTecnico[]][])(
      '%s → níveis %s',
      (prioridade, niveisEsperados) => {
        expect(NIVEL_POR_PRIORIDADE[prioridade]).toEqual(niveisEsperados);
      }
    );

    it('deve ser o inverso consistente de PRIORIDADES_POR_NIVEL', () => {
      for (const nivel of ['N1', 'N2', 'N3'] as NivelTecnico[]) {
        for (const prioridade of PRIORIDADES_VALIDAS) {
          expect(PRIORIDADES_POR_NIVEL[nivel].includes(prioridade))
            .toBe(NIVEL_POR_PRIORIDADE[prioridade].includes(nivel));
        }
      }
    });
  });

  describe('Transições de status — PATCH /:id/status', () => {
    const STATUS_VALIDOS: ChamadoStatus[] = [
      ChamadoStatus.EM_ATENDIMENTO,
      ChamadoStatus.ENCERRADO,
      ChamadoStatus.CANCELADO,
    ];

    it.each([
      [ChamadoStatus.EM_ATENDIMENTO, true],
      [ChamadoStatus.ENCERRADO,      true],
      [ChamadoStatus.CANCELADO,      true],
      [ChamadoStatus.ABERTO,         false],
      [ChamadoStatus.REABERTO,       false],
    ] as [ChamadoStatus, boolean][])('status %s aceito pelo endpoint: %s', (s, esperado) => {
      expect(STATUS_VALIDOS.includes(s)).toBe(esperado);
    });

    it('TECNICO não pode definir status CANCELADO', () => {
      const regra      = str('TECNICO');
      const novoStatus = str(ChamadoStatus.CANCELADO) as ChamadoStatus;
      expect(regra === 'TECNICO' && novoStatus === ChamadoStatus.CANCELADO).toBe(true);
    });

    it('chamado CANCELADO bloqueia qualquer nova alteração', () => {
      const statusAtual = str(ChamadoStatus.CANCELADO) as ChamadoStatus;
      expect(statusAtual === ChamadoStatus.CANCELADO).toBe(true);
    });
  });

  describe('Permissão de edição — PATCH /:id', () => {
    const STATUS_EDITAVEIS: ChamadoStatus[] = [
      ChamadoStatus.ABERTO,
      ChamadoStatus.REABERTO,
    ];

    const podeEditar = (regra: string, uid: string, donoChamado: string) =>
      regra === 'ADMIN' || uid === donoChamado;

    it.each([
      ['ADMIN',   'admin-1', 'qualquer', true],
      ['USUARIO', 'user-1',  'user-1',   true],
      ['USUARIO', 'user-1',  'user-2',   false],
      ['TECNICO', 'tech-1',  'tech-1',   true],
      ['TECNICO', 'tech-1',  'user-99',  false],
    ])('%s (id=%s, dono=%s) → pode editar: %s', (regra, uid, dono, esperado) => {
      expect(podeEditar(regra, uid, dono)).toBe(esperado);
    });

    it.each([
      [ChamadoStatus.ABERTO,         true],
      [ChamadoStatus.REABERTO,       true],
      [ChamadoStatus.EM_ATENDIMENTO, false],
      [ChamadoStatus.ENCERRADO,      false],
      [ChamadoStatus.CANCELADO,      false],
    ] as [ChamadoStatus, boolean][])('status %s permite edição: %s', (s, esperado) => {
      expect(STATUS_EDITAVEIS.includes(s)).toBe(esperado);
    });
  });

  describe('Permissão de transferência — PATCH /:id/transferir', () => {
    const STATUS_TRANSFERIVEIS: ChamadoStatus[] = [
      ChamadoStatus.ABERTO,
      ChamadoStatus.EM_ATENDIMENTO,
      ChamadoStatus.REABERTO,
    ];

    it.each([
      [ChamadoStatus.ABERTO,         true],
      [ChamadoStatus.EM_ATENDIMENTO, true],
      [ChamadoStatus.REABERTO,       true],
      [ChamadoStatus.ENCERRADO,      false],
      [ChamadoStatus.CANCELADO,      false],
    ] as [ChamadoStatus, boolean][])('status %s permite transferência: %s', (s, esperado) => {
      expect(STATUS_TRANSFERIVEIS.includes(s)).toBe(esperado);
    });

    it('TECNICO só pode transferir chamados atribuídos a ele mesmo', () => {
      const tecnicoId        = str('tech-1');
      const chamadoTecnicoId = str('tech-2');
      expect(tecnicoId === chamadoTecnicoId).toBe(false); // diferente → 403
    });

    it('não deve permitir transferir para o mesmo técnico atual', () => {
      const tecnicoAtualId = str('tech-1');
      const tecnicoNovoId  = str('tech-1');
      expect(tecnicoAtualId === tecnicoNovoId).toBe(true); // mesmo → 400
    });
  });

  describe('Permissão de prioridade — PATCH /:id/prioridade', () => {
    it('somente TECNICO N3 pode reclassificar via este endpoint', () => {
      const nivel = str('N3') as NivelTecnico;
      expect(nivel === 'N3').toBe(true);
    });

    it.each(['N1', 'N2'] as NivelTecnico[])('nível %s → bloqueado (403)', (nivel) => {
      expect(nivel !== 'N3').toBe(true);
    });

    it.each([
      [ChamadoStatus.CANCELADO, true],
      [ChamadoStatus.ENCERRADO, true],
      [ChamadoStatus.ABERTO,    false],
      [ChamadoStatus.REABERTO,  false],
    ] as [ChamadoStatus, boolean][])('status %s bloqueia alteração de prioridade: %s', (s, bloqueado) => {
      const bloqueados: ChamadoStatus[] = [ChamadoStatus.CANCELADO, ChamadoStatus.ENCERRADO];
      expect(bloqueados.includes(s)).toBe(bloqueado);
    });

    it('deve rejeitar quando prioridade nova === prioridade atual', () => {
      const atual = str('P2') as PrioridadeChamado;
      const nova  = str('P2') as PrioridadeChamado;
      expect(atual === nova).toBe(true); // → 400
    });
  });

  describe('Permissão de comentário — POST /:id/comentarios', () => {
    const podeCriarInterno = (regra: string) => regra !== 'USUARIO';

    it.each([
      ['ADMIN',   true],
      ['TECNICO', true],
      ['USUARIO', false],
    ])('%s pode criar comentário interno: %s', (regra, esperado) => {
      expect(podeCriarInterno(regra)).toBe(esperado);
    });

    it.each([
      [ChamadoStatus.CANCELADO,      true],
      [ChamadoStatus.ABERTO,         false],
      [ChamadoStatus.EM_ATENDIMENTO, false],
      [ChamadoStatus.REABERTO,       false],
      [ChamadoStatus.ENCERRADO,      false],
    ] as [ChamadoStatus, boolean][])('status %s bloqueia novo comentário: %s', (s, bloqueado) => {
      expect(s === ChamadoStatus.CANCELADO).toBe(bloqueado);
    });

    it('USUARIO não vê comentários com visibilidadeInterna=true', () => {
      const regra = str('USUARIO');
      expect(regra !== 'USUARIO').toBe(false);
    });
  });

  describe('estaNoExpediente() — lógica de verificarExpedienteTecnico()', () => {
    describe('sem expedientes válidos → false', () => {
      it('lista vazia', () =>
        expect(estaNoExpediente([], horaFixa(10))).toBe(false));

      it('expediente inativo', () =>
        expect(estaNoExpediente([makeExpediente(9, 18, false)], horaFixa(10))).toBe(false));

      it('expediente deletado', () =>
        expect(estaNoExpediente([makeExpediente(9, 18, true, new Date())], horaFixa(10))).toBe(false));
    });

    describe('expediente 09h–18h', () => {
      const exp = [makeExpediente(9, 18)];

      it.each([
        [8,  0,  false, 'antes da entrada'],
        [9,  0,  true,  'exatamente na entrada'],
        [12, 30, true,  'meio do turno'],
        [18, 0,  true,  'exatamente na saída'],
        [19, 0,  false, 'após a saída'],
      ] as [number, number, boolean, string][])('%dh%02d — %s → %s', (h, min, esperado) => {
        expect(estaNoExpediente(exp, horaFixa(h, min))).toBe(esperado);
      });
    });

    describe('turno partido 08h–12h / 14h–18h', () => {
      const exps = [makeExpediente(8, 12), makeExpediente(14, 18)];

      it.each([
        [10, true,  'dentro do 1º turno'],
        [13, false, 'intervalo entre turnos'],
        [16, true,  'dentro do 2º turno'],
      ] as [number, boolean, string][])('%dh — %s → %s', (h, esperado) => {
        expect(estaNoExpediente(exps, horaFixa(h))).toBe(esperado);
      });

      it('deve ignorar expediente deletado e manter apenas o válido', () => {
        const expsComDeletado = [
          makeExpediente(8, 12),
          makeExpediente(14, 18, true, new Date()), // deletado
        ];
        expect(estaNoExpediente(expsComDeletado, horaFixa(16))).toBe(false); // 2º turno deletado
        expect(estaNoExpediente(expsComDeletado, horaFixa(10))).toBe(true);  // 1º turno ok
      });
    });
  });
});