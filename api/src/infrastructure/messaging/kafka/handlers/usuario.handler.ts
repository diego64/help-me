import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { Regra } from '@prisma/client';

/**
 * Payload recebido do auth-service
 * Espelha o UsuarioEventPayload do auth-service
 */
interface UsuarioEventPayload {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: Regra;
  ativo: boolean;
  geradoEm: string;
  atualizadoEm: string;
  deletadoEm?: string;
  _metadata: {
    topic: string;
    timestamp: string;
    service: string;
    version: string;
  };
}

/**
 * Cria o usuário na API principal quando criado no auth-service
 * Usa upsert para garantir idempotência — mensagem duplicada não quebra
 */
export async function handleUsuarioCriado(
  payload: unknown,
  correlationId?: string
): Promise<void> {
  const data = payload as UsuarioEventPayload;

  try {
    await prisma.usuario.upsert({
      where: { id: data.id },
      create: {
        id:        data.id,
        nome:      data.nome,
        sobrenome: data.sobrenome,
        email:     data.email,
        regra:     data.regra,
        ativo:     data.ativo,
      },
      update: {
        nome:      data.nome,
        sobrenome: data.sobrenome,
        email:     data.email,
        regra:     data.regra,
        ativo:     data.ativo,
      },
    });

    logger.info(
      { usuarioId: data.id, email: data.email, correlationId },
      '[USUARIO HANDLER] Usuário criado na API principal'
    );
  } catch (err) {
    logger.error(
      { err, usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Erro ao criar usuário'
    );
    throw err;
  }
}

/**
 * Atualiza nome, email e regra — campos sincronizados do auth-service
 * Campos de negócio (setor, nivel, telefone) não são sobrescritos
 */
export async function handleUsuarioAtualizado(
  payload: unknown,
  correlationId?: string
): Promise<void> {
  const data = payload as UsuarioEventPayload;

  try {
    await prisma.usuario.update({
      where: { id: data.id },
      data: {
        nome:      data.nome,
        sobrenome: data.sobrenome,
        email:     data.email,
        regra:     data.regra,
        ativo:     data.ativo,
      },
    });

    logger.info(
      { usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Usuário atualizado na API principal'
    );
  } catch (err) {
    logger.error(
      { err, usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Erro ao atualizar usuário'
    );
    throw err;
  }
}

/**
 * Desativa o usuário — suspende acesso ao helpdesk
 */
export async function handleUsuarioDesativado(
  payload: unknown,
  correlationId?: string
): Promise<void> {
  const data = payload as UsuarioEventPayload;

  try {
    await prisma.usuario.update({
      where: { id: data.id },
      data:  { ativo: false },
    });

    logger.info(
      { usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Usuário desativado na API principal'
    );
  } catch (err) {
    logger.error(
      { err, usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Erro ao desativar usuário'
    );
    throw err;
  }
}

/**
 * Soft delete — arquiva o usuário na API principal
 */
export async function handleUsuarioDeletado(
  payload: unknown,
  correlationId?: string
): Promise<void> {
  const data = payload as UsuarioEventPayload;

  try {
    await prisma.usuario.update({
      where: { id: data.id },
      data: {
        ativo:      false,
        deletadoEm: data.deletadoEm ? new Date(data.deletadoEm) : new Date(),
      },
    });

    logger.info(
      { usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Usuário deletado na API principal'
    );
  } catch (err) {
    logger.error(
      { err, usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Erro ao deletar usuário'
    );
    throw err;
  }
}

/**
 * Reativa o usuário — restaura acesso ao helpdesk
 */
export async function handleUsuarioReativado(
  payload: unknown,
  correlationId?: string
): Promise<void> {
  const data = payload as UsuarioEventPayload;

  try {
    await prisma.usuario.update({
      where: { id: data.id },
      data: {
        ativo:      true,
        deletadoEm: null,
      },
    });

    logger.info(
      { usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Usuário reativado na API principal'
    );
  } catch (err) {
    logger.error(
      { err, usuarioId: data.id, correlationId },
      '[USUARIO HANDLER] Erro ao reativar usuário'
    );
    throw err;
  }
}