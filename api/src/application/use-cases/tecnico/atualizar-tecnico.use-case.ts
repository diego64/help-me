import { Regra, Setor } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { logger } from '@shared/config/logger';
import { TecnicoError } from './errors';
import { TECNICO_SELECT } from './selects';

interface AtualizarTecnicoInput {
  id: string;
  nome?: string;
  sobrenome?: string;
  email?: string;
  telefone?: string;
  ramal?: string;
  setor?: string;
  solicitanteRegra: string;
}

export async function atualizarTecnicoUseCase(input: AtualizarTecnicoInput) {
  const { id, nome, sobrenome, email, telefone, ramal, setor, solicitanteRegra } = input;

  try {
    const tecnico = await prisma.usuario.findUnique({
      where:  { id },
      select: { id: true, regra: true, email: true, deletadoEm: true },
    });

    if (!tecnico || tecnico.regra !== Regra.TECNICO) throw new TecnicoError('Técnico não encontrado', 'NOT_FOUND', 404);
    if (tecnico.deletadoEm) throw new TecnicoError('Não é possível editar um técnico deletado', 'DELETED', 400);

    const data: Record<string, unknown> = {};

    if (nome      !== undefined) data.nome      = nome.trim();
    if (sobrenome !== undefined) data.sobrenome  = sobrenome.trim();
    if (telefone  !== undefined) data.telefone   = telefone?.trim()  || null;
    if (ramal     !== undefined) data.ramal      = ramal?.trim()     || null;
    if (setor     !== undefined && solicitanteRegra === 'ADMIN') data.setor = setor as Setor;

    if (email !== undefined) {
      const emailLower = email.toLowerCase();
      if (emailLower !== tecnico.email) {
        const existente = await prisma.usuario.findUnique({ where: { email: emailLower } });
        if (existente && existente.id !== id) throw new TecnicoError('Email já está em uso', 'EMAIL_IN_USE', 409);
        data.email = emailLower;
      }
    }

    if (Object.keys(data).length === 0) {
      return await prisma.usuario.findUnique({ where: { id }, select: TECNICO_SELECT });
    }

    const updated = await prisma.usuario.update({ where: { id }, data, select: TECNICO_SELECT });

    logger.info({ tecnicoId: id, email: updated?.email }, '[TECNICO] Atualizado');

    return updated;
  } catch (error) {
    if (error instanceof TecnicoError) throw error;
    logger.error({ error, tecnicoId: id }, '[TECNICO] Erro ao atualizar');
    throw new TecnicoError('Erro ao atualizar técnico', 'UPDATE_ERROR', 500,
      error instanceof Error ? error : undefined
    );
  }
}