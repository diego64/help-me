import { Regra } from '@prisma/client';
import { prisma } from '@infrastructure/database/prisma/client';
import { hashPassword, validarForcaSenha } from '@shared/config/password';
import { logger } from '@shared/config/logger';
import {
  BadRequestError,
  ConflictError,
  ValidationError,
} from '@infrastructure/http/middlewares/error.middleware';
import { publishUsuarioCriado } from '@infrastructure/messaging/kafka/events/usuario.events';

interface CriarUsuarioInput {
  nome: string;
  sobrenome: string;
  email: string;
  password: string;
  regra: Regra;
}

interface CriarUsuarioOutput {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  regra: Regra;
  ativo: boolean;
  geradoEm: Date;
}

/**
 * Cria um novo usuário no auth-service
 *
 * FLUXO:
 * 1. Valida campos obrigatórios
 * 2. Valida formato do email
 * 3. Valida força da senha
 * 4. Verifica duplicidade de email (incluindo soft deleted)
 * 5. Cria usuário com hash da senha
 * 6. Publica evento no Kafka
 *
 * SEGURANÇA:
 * - Senha hasheada com PBKDF2-SHA512
 * - Validação de força da senha
 * - Reativação automática se email já existia (soft deleted)
 */
export async function criarUsuarioUseCase(
  input: CriarUsuarioInput,
  correlationId?: string
): Promise<CriarUsuarioOutput> {
  const { nome, sobrenome, email, password, regra } = input;

  if (!nome || !sobrenome || !email || !password || !regra) {
    throw new BadRequestError('Campos obrigatórios: nome, sobrenome, email, password, regra.');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new BadRequestError('Email inválido.');
  }

  const validacaoSenha = validarForcaSenha(password);
  if (!validacaoSenha.ehValida) {
    throw new ValidationError('Senha não atende aos requisitos de segurança.', {
      erros: validacaoSenha.erros,
      sugestoes: validacaoSenha.sugestoes,
    });
  }

  const usuarioExistente = await prisma.usuario.findUnique({
    where: { email },
  });

  if (usuarioExistente) {
    // Reativa se estava soft deleted
    if (usuarioExistente.deletadoEm) {
      const hashedPassword = hashPassword(password);

      const usuarioReativado = await prisma.usuario.update({
        where: { email },
        data: {
          nome,
          sobrenome,
          password: hashedPassword,
          regra,
          ativo: true,
          deletadoEm: null,
          refreshToken: null,
        },
      });

      await publishUsuarioCriado(usuarioReativado, correlationId);

      logger.info({ userId: usuarioReativado.id, email }, '[USUARIO] Usuário reativado');

      return {
        id: usuarioReativado.id,
        nome: usuarioReativado.nome,
        sobrenome: usuarioReativado.sobrenome,
        email: usuarioReativado.email,
        regra: usuarioReativado.regra,
        ativo: usuarioReativado.ativo,
        geradoEm: usuarioReativado.geradoEm,
      };
    }

    throw new ConflictError('Email já cadastrado.');
  }

  const hashedPassword = hashPassword(password);

  const usuario = await prisma.usuario.create({
    data: {
      nome,
      sobrenome,
      email,
      password: hashedPassword,
      regra,
    },
  });

  await publishUsuarioCriado(usuario, correlationId);

  logger.info({ userId: usuario.id, email, regra }, '[USUARIO] Usuário criado com sucesso');

  return {
    id: usuario.id,
    nome: usuario.nome,
    sobrenome: usuario.sobrenome,
    email: usuario.email,
    regra: usuario.regra,
    ativo: usuario.ativo,
    geradoEm: usuario.geradoEm,
  };
}