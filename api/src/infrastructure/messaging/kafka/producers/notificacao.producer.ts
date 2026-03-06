import { sendMessage, isKafkaConnected } from '../client';
import { logger } from '@shared/config/logger';
import { TipoEvento } from '@infrastructure/database/mongodb/notificacao.model';

export const TOPICO_NOTIFICACOES = 'helpme.notificacoes';

export interface EventoNotificacao {
  tipo: TipoEvento;
  chamadoId: string;
  chamadoOS: string;
  chamadoPrioridade: string;
  timestamp: string;
  // Destinatários
  destinatarios: {
    id: string;
    email: string;
    nome: string;
    nivel?: string | null;
  }[];
  // Dados do evento
  dados: Record<string, any>;
}

async function publicar(evento: EventoNotificacao): Promise<void> {
  if (!isKafkaConnected()) {
    logger.warn({ tipo: evento.tipo, chamadoId: evento.chamadoId },
      'Kafka não conectado — evento não publicado');
    return;
  }

  await sendMessage(TOPICO_NOTIFICACOES, [{
    key: evento.chamadoId,
    value: JSON.stringify(evento),
    headers: { tipo: evento.tipo },
  }]);

  logger.debug({ tipo: evento.tipo, chamadoId: evento.chamadoId,
    destinatarios: evento.destinatarios.length }, 'Evento publicado no Kafka');
}

export async function publicarChamadoAberto(params: {
  chamadoId: string;
  chamadoOS: string;
  prioridade: string;
  descricao: string;
  usuarioNome: string;
  usuarioSetor: string;
  servicos: string[];
  tecnicos: { id: string; email: string; nome: string; nivel: string }[];
}): Promise<void> {
  await publicar({
    tipo: 'CHAMADO_ABERTO',
    chamadoId: params.chamadoId,
    chamadoOS: params.chamadoOS,
    chamadoPrioridade: params.prioridade,
    timestamp: new Date().toISOString(),
    destinatarios: params.tecnicos,
    dados: {
      descricao: params.descricao,
      usuarioNome: params.usuarioNome,
      usuarioSetor: params.usuarioSetor,
      servicos: params.servicos,
    },
  });
}

export async function publicarChamadoAtribuido(params: {
  chamadoId: string;
  chamadoOS: string;
  prioridade: string;
  descricao: string;
  tecnico: { id: string; email: string; nome: string; nivel?: string | null };
  usuarioNome: string;
}): Promise<void> {
  await publicar({
    tipo: 'CHAMADO_ATRIBUIDO',
    chamadoId: params.chamadoId,
    chamadoOS: params.chamadoOS,
    chamadoPrioridade: params.prioridade,
    timestamp: new Date().toISOString(),
    destinatarios: [params.tecnico],
    dados: {
      descricao: params.descricao,
      usuarioNome: params.usuarioNome,
    },
  });
}

export async function publicarChamadoTransferido(params: {
  chamadoId: string;
  chamadoOS: string;
  prioridade: string;
  motivo: string;
  tecnicoAnteriorNome: string;
  tecnicoNovo: { id: string; email: string; nome: string; nivel?: string | null };
}): Promise<void> {
  await publicar({
    tipo: 'CHAMADO_TRANSFERIDO',
    chamadoId: params.chamadoId,
    chamadoOS: params.chamadoOS,
    chamadoPrioridade: params.prioridade,
    timestamp: new Date().toISOString(),
    destinatarios: [params.tecnicoNovo],
    dados: {
      motivo: params.motivo,
      tecnicoAnteriorNome: params.tecnicoAnteriorNome,
    },
  });
}

export async function publicarChamadoReaberto(params: {
  chamadoId: string;
  chamadoOS: string;
  prioridade: string;
  descricao: string;
  usuarioNome: string;
  tecnico: { id: string; email: string; nome: string; nivel?: string | null } | null;
}): Promise<void> {
  if (!params.tecnico) {
    logger.warn({ chamadoId: params.chamadoId }, 'Chamado reaberto sem técnico — notificação não enviada');
    return;
  }

  await publicar({
    tipo: 'CHAMADO_REABERTO',
    chamadoId: params.chamadoId,
    chamadoOS: params.chamadoOS,
    chamadoPrioridade: params.prioridade,
    timestamp: new Date().toISOString(),
    destinatarios: [params.tecnico],
    dados: {
      descricao: params.descricao,
      usuarioNome: params.usuarioNome,
    },
  });
}

export async function publicarPrioridadeAlterada(params: {
  chamadoId: string;
  chamadoOS: string;
  prioridadeAnterior: string;
  prioridadeNova: string;
  tecnico: { id: string; email: string; nome: string; nivel?: string | null } | null;
  alteradoPorNome: string;
}): Promise<void> {
  if (!params.tecnico) return;

  await publicar({
    tipo: 'PRIORIDADE_ALTERADA',
    chamadoId: params.chamadoId,
    chamadoOS: params.chamadoOS,
    chamadoPrioridade: params.prioridadeNova,
    timestamp: new Date().toISOString(),
    destinatarios: [params.tecnico],
    dados: {
      prioridadeAnterior: params.prioridadeAnterior,
      prioridadeNova: params.prioridadeNova,
      alteradoPorNome: params.alteradoPorNome,
    },
  });
}

export async function publicarSLAVencendo(params: {
  chamadoId: string;
  chamadoOS: string;
  prioridade: string;
  horasAberto: number;
  tecnico: { id: string; email: string; nome: string; nivel?: string | null };
}): Promise<void> {
  await publicar({
    tipo: 'SLA_VENCENDO',
    chamadoId: params.chamadoId,
    chamadoOS: params.chamadoOS,
    chamadoPrioridade: params.prioridade,
    timestamp: new Date().toISOString(),
    destinatarios: [params.tecnico],
    dados: { horasAberto: params.horasAberto },
  });
}