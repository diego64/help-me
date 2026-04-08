import { Setor } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { cacheDel } from '@infrastructure/database/redis/client';
import { logger } from '@shared/config/logger';
import { UsuarioError } from './errors';
import { USUARIO_SELECT, REGRAS_USUARIO } from './selects';

interface AtualizarUsuarioInput {
  id: string;
  nome?: string;
  sobrenome?: string;
  email?: string;
  telefone?: string;
  ramal?: string;
  setor?: string;
  solicitanteRegra: string;
}

export async function atualizarUsuarioUseCase(input: AtualizarUsuarioInput) {
  const { id, nome, sobrenome, email, telefone, ramal, setor, solicitanteRegra } = input;

  try {
    const usuario = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true, email: true, deletadoEm: true },
    });

    if (!usuario || !REGRAS_USUARIO.includes(usuario.regra as any)) throw new UsuarioError('Usuário não encontrado', 'NOT_FOUND', 404);
    if (usuario.deletadoEm) throw new UsuarioError('Não é possível editar um usuário deletado', 'DELETED', 400);

    const data: Record<string, unknown> = {};

    if (nome      !== undefined) data.nome      = nome.trim();
    if (sobrenome !== undefined) data.sobrenome  = sobrenome.trim();
    if (telefone  !== undefined) data.telefone   = telefone?.trim()  || null;
    if (ramal     !== undefined) data.ramal      = ramal?.trim()     || null;
    if (setor     !== undefined && solicitanteRegra === 'ADMIN') data.setor = setor as Setor;

    if (email !== undefined) {
      const emailLower = email.toLowerCase();
      if (emailLower !== usuario.email) {
        const existente = await prisma.usuario.findUnique({ where: { email: emailLower } });
        if (existente && existente.id !== id) throw new UsuarioError('Email já está em uso', 'EMAIL_IN_USE', 409);
        data.email = emailLower;
      }
    }

    if (Object.keys(data).length === 0) {
      return await prisma.usuario.findUnique({ where: { id }, select: USUARIO_SELECT });
    }

    const updated = await prisma.usuario.update({ where: { id }, data, select: USUARIO_SELECT });

    await cacheDel('usuarios:list').catch((err: unknown) => logger.error({ err }, '[USUARIO] Erro ao invalidar cache'));

    logger.info({ usuarioId: id, email: updated?.email }, '[USUARIO] Atualizado');

    return updated;
  } catch (error) {
    if (error instanceof UsuarioError) throw error;
    logger.error({ error, usuarioId: id }, '[USUARIO] Erro ao atualizar');
    throw new UsuarioError('Erro ao atualizar usuário', 'UPDATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}