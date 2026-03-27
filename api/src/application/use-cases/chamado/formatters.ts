import { PrioridadeChamado } from '@prisma/client';
import { CHAMADO_INCLUDE as _CHAMADO_INCLUDE } from './selects';

export const DESCRICAO_PRIORIDADE: Record<PrioridadeChamado, string> = {
  P1: 'Alta Prioridade',
  P2: 'Urgente',
  P3: 'Urgente',
  P4: 'Baixa Prioridade',
  P5: 'Baixa Prioridade',
};

export function formatarChamadoResposta(chamado: any) {
  return {
    id:                    chamado.id,
    OS:                    chamado.OS,
    descricao:             chamado.descricao,
    descricaoEncerramento: chamado.descricaoEncerramento,
    status:                chamado.status,
    prioridade:            chamado.prioridade,
    prioridadeDescricao:   chamado.prioridade
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
    tecnico: chamado.tecnico
      ? {
          id:    chamado.tecnicoId,
          nome:  chamado.tecnico.nome,
          email: chamado.tecnico.email,
        }
      : null,
    servicos: chamado.servicos?.map((s: any) => ({
      id:   s.servico.id,
      nome: s.servico.nome,
    })) || [],
  };
}