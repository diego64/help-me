import { Usuario } from '@prisma/client';
import { publishEvent, KAFKA_TOPICS } from '../producers/producer';

/**
 * Payload base de todos os eventos de usuário
 * Inclui apenas dados necessários — sem dados sensíveis como senha
 * Inspirado em: GDPR data minimization principle
 */
interface UsuarioEventPayload {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: string;
  ativo: boolean;
  geradoEm: string;
  atualizadoEm: string;
}

interface SenhaAlteradaPayload {
  usuarioId: string;
  email: string;
  alteradoEm: string;
}

/**
 * Serializa um usuário para o payload do evento
 * Remove campos sensíveis (password, refreshToken)
 * Inspirado em: GDPR data minimization, event-driven best practices
 */
function toEventPayload(usuario: Usuario): UsuarioEventPayload {
  return {
    id: usuario.id,
    nome: usuario.nome,
    sobrenome: usuario.sobrenome,
    email: usuario.email,
    regra: usuario.regra,
    ativo: usuario.ativo,
    geradoEm: usuario.geradoEm.toISOString(),
    atualizadoEm: usuario.atualizadoEm.toISOString(),
  };
}

/**
 * PUBLICADORES DE EVENTOS
 * Um função por evento — clara, testável, reutilizável
 * Inspirado em: Uber domain events, Confluent event modeling
 */

/**
 * Publica evento quando um novo usuário é criado
 * Consumido por: api (para criar perfil de técnico/usuário no helpdesk)
 */
export async function publishUsuarioCriado(
  usuario: Usuario,
  correlationId?: string
): Promise<void> {
  await publishEvent(
    KAFKA_TOPICS.USUARIO_CRIADO,
    usuario.id,
    toEventPayload(usuario),
    { ...(correlationId && { 'x-correlation-id': correlationId }) }
  );
}

/**
 * Publica evento quando dados do usuário são atualizados
 * Consumido por: api (para sincronizar nome/email no perfil do helpdesk)
 */
export async function publishUsuarioAtualizado(
  usuario: Usuario,
  correlationId?: string
): Promise<void> {
  await publishEvent(
    KAFKA_TOPICS.USUARIO_ATUALIZADO,
    usuario.id,
    toEventPayload(usuario),
    { ...(correlationId && { 'x-correlation-id': correlationId }) }
  );
}

/**
 * Publica evento quando um usuário é desativado (ativo = false)
 * Consumido por: api (para suspender acesso ao helpdesk)
 */
export async function publishUsuarioDesativado(
  usuario: Usuario,
  correlationId?: string
): Promise<void> {
  await publishEvent(
    KAFKA_TOPICS.USUARIO_DESATIVADO,
    usuario.id,
    toEventPayload(usuario),
    { ...(correlationId && { 'x-correlation-id': correlationId }) }
  );
}

/**
 * Publica evento quando um usuário é deletado (soft delete)
 * Consumido por: api (para arquivar dados do helpdesk)
 */
export async function publishUsuarioDeletado(
  usuario: Usuario,
  correlationId?: string
): Promise<void> {
  await publishEvent(
    KAFKA_TOPICS.USUARIO_DELETADO,
    usuario.id,
    {
      ...toEventPayload(usuario),
      deletadoEm: usuario.deletadoEm?.toISOString() ?? new Date().toISOString(),
    },
    { ...(correlationId && { 'x-correlation-id': correlationId }) }
  );
}

/**
 * Publica evento quando um usuário é reativado
 * Consumido por: api (para restaurar acesso ao helpdesk)
 */
export async function publishUsuarioReativado(
  usuario: Usuario,
  correlationId?: string
): Promise<void> {
  await publishEvent(
    KAFKA_TOPICS.USUARIO_REATIVADO,
    usuario.id,
    toEventPayload(usuario),
    { ...(correlationId && { 'x-correlation-id': correlationId }) }
  );
}

/**
 * Publica evento quando a senha de um usuário é alterada
 * Consumido por: api (para invalidar sessões ativas se necessário)
 * NOTA: Não inclui a senha — apenas a notificação da alteração
 */
export async function publishSenhaAlterada(
  usuario: Usuario,
  correlationId?: string
): Promise<void> {
  const payload: SenhaAlteradaPayload = {
    usuarioId: usuario.id,
    email: usuario.email,
    alteradoEm: new Date().toISOString(),
  };

  await publishEvent(
    KAFKA_TOPICS.SENHA_ALTERADA,
    usuario.id,
    payload,
    { ...(correlationId && { 'x-correlation-id': correlationId }) }
  );
}