import { Router } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcrypt';
import multer from 'multer';
import {
  authMiddleware,
  authorizeRoles,
  AuthRequest
} from '../middleware/auth';

export const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Técnicos
 *   description: Gerenciamento de usuários técnicos e seus horários de atendimento
 */

// ==========================================
// CONFIGURAÇÃO DE UPLOAD DE IMAGEM DO AVATAR
// ==========================================

const upload = multer({ dest: 'uploads/' });

// ========================================
// CRIAÇÃO DO PERFIL TECNICO
// ========================================

/**
 * @swagger
 * /api/tecnicos:
 *   post:
 *     summary: Cria um novo usuário técnico
 *     description: Cadastra um técnico no sistema com perfil TECNICO e setor TECNOLOGIA_INFORMACAO. Automaticamente cria um horário padrão de expediente (08:00 às 16:00). Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - sobrenome
 *               - email
 *               - password
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Nome do técnico
 *               sobrenome:
 *                 type: string
 *                 description: Sobrenome do técnico
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email do técnico
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Senha do técnico
 *               telefone:
 *                 type: string
 *                 description: Telefone do técnico (opcional)
 *               ramal:
 *                 type: string
 *                 description: Ramal do técnico (opcional)
 *     responses:
 *       200:
 *         description: Técnico criado com sucesso
 *       400:
 *         description: Dados inválidos ou senha não fornecida
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.post('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { nome, sobrenome, email, password, telefone, ramal } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const tecnico = await prisma.usuario.create({
      data: {
        nome,
        sobrenome,
        email,
        password: hashedPassword,
        telefone,
        ramal,
        regra: 'TECNICO',
        setor: 'TECNOLOGIA_INFORMACAO',
      },
    });

    // Criar horários padrão
    await prisma.expediente.create({ data: { usuarioId: tecnico.id, entrada: '08:00', saida: '16:00' } });

    res.json(tecnico);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ========================================
// LISTAGEM DE TODOS OS TECNICOS
// ========================================

/**
 * @swagger
 * /api/tecnicos:
 *   get:
 *     summary: Lista todos os técnicos
 *     description: Retorna todos os usuários com perfil TECNICO, incluindo informações de disponibilidade. Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de técnicos retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   nome:
 *                     type: string
 *                   sobrenome:
 *                     type: string
 *                   email:
 *                     type: string
 *                   telefone:
 *                     type: string
 *                     nullable: true
 *                   ramal:
 *                     type: string
 *                     nullable: true
 *                   regra:
 *                     type: string
 *                     enum: [TECNICO]
 *                   setor:
 *                     type: string
 *                   tecnicoDisponibilidade:
 *                     type: object
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.get('/', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const tecnicos = await prisma.usuario.findMany({
    where: { regra: 'TECNICO' },
    include: { tecnicoDisponibilidade: true },
  });
  res.json(tecnicos);
});

// ========================================
// EDIÇÃO DO PERFIL DO TECNICO
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   put:
 *     summary: Atualiza os dados de um técnico
 *     description: Permite editar informações cadastrais do técnico (nome, sobrenome, email, telefone e ramal). Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do técnico a ser atualizado
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               sobrenome:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               telefone:
 *                 type: string
 *               ramal:
 *                 type: string
 *     responses:
 *       200:
 *         description: Técnico atualizado com sucesso
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou TECNICO)
 */
router.put('/:id', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { nome, sobrenome, email, telefone, ramal } = req.body;

  try {
    const tecnico = await prisma.usuario.update({
      where: { id },
      data: { nome, sobrenome, email, telefone, ramal },
    });
    res.json(tecnico);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ========================================
// ALTERAÇÃO DE SENHA
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}/password:
 *   put:
 *     summary: Altera a senha de um técnico
 *     description: Permite redefinir a senha de um técnico. A senha é criptografada antes de ser armazenada. Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do técnico
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Nova senha
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       400:
 *         description: Senha não fornecida ou erro de validação
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou TECNICO)
 */
router.put('/:id/password', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.usuario.update({ where: { id }, data: { password: hashedPassword } });
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ========================================================
// ALTERAÇÃO DE HORÁRIO DE DISPONIBILIDADE PARA ATENDIMENTO
// ========================================================

/**
 * @swagger
 * /api/tecnicos/{id}/horarios:
 *   put:
 *     summary: Atualiza o horário de expediente do técnico
 *     description: Define ou atualiza o horário de disponibilidade do técnico para atendimento. Remove horários anteriores e cria novo expediente. Técnicos só podem assumir chamados dentro deste horário. Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do técnico
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entrada
 *               - saida
 *             properties:
 *               entrada:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *                 description: Horário de entrada (formato HH:MM)
 *                 example: "08:00"
 *               saida:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *                 description: Horário de saída (formato HH:MM)
 *                 example: "17:00"
 *     responses:
 *       200:
 *         description: Horário atualizado com sucesso
 *       400:
 *         description: Campos obrigatórios não fornecidos ou formato inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou TECNICO)
 */
router.put('/:id/horarios', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { entrada, saida }: { entrada: string; saida: string } = req.body;

  if (!entrada || !saida) return res.status(400).json({ error: 'Campos entrada e saida são obrigatórios.' });

  try {
    // Deletar horários antigos
    await prisma.expediente.deleteMany({ where: { usuarioId: id } });

    // Criar novos horários
    const horario = await prisma.expediente.create({ data: { usuarioId: id, entrada, saida } });

    res.json({ message: 'Horário de disponibilidade atualizado com sucesso', horario });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ========================================
// UPLOAD DO AVATAR (FOTO DE PERFIL)
// ========================================

/**
 * @swagger
 * /api/tecnicos/{id}/avatar:
 *   post:
 *     summary: Faz upload da foto de perfil do técnico
 *     description: Permite enviar uma imagem de avatar/foto de perfil para o técnico. O arquivo é salvo no servidor e o caminho é armazenado no banco de dados. Requer autenticação e perfil ADMIN ou TECNICO.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do técnico
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - avatar
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo de imagem do avatar
 *     responses:
 *       200:
 *         description: Imagem enviada com sucesso
 *       400:
 *         description: Arquivo não enviado ou erro no upload
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN ou TECNICO)
 */
router.post('/:id/avatar', authMiddleware, authorizeRoles('ADMIN', 'TECNICO'), upload.single('avatar'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Arquivo não enviado' });

  try {
    const tecnico = await prisma.usuario.update({ where: { id }, data: { avatarUrl: file.path } });
    res.json({ message: 'Imagem enviada com sucesso', tecnico });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// EXCLUSÃO DO TECNICO (COM OS HORÁRIOS DE ATENDIMENTO INCLUSO)
// ============================================================

/**
 * @swagger
 * /api/tecnicos/{id}:
 *   delete:
 *     summary: Exclui um técnico
 *     description: Remove permanentemente o técnico e todos os seus horários de expediente associados do sistema. Esta ação é irreversível. Requer autenticação e perfil ADMIN.
 *     tags: [Técnicos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do técnico a ser excluído
 *     responses:
 *       200:
 *         description: Técnico e horários excluídos com sucesso
 *       400:
 *         description: Erro ao excluir técnico
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer perfil ADMIN)
 */
router.delete('/:id', authMiddleware, authorizeRoles('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    await prisma.expediente.deleteMany({ where: { usuarioId: id } });
    await prisma.usuario.delete({ where: { id } });

    res.json({ message: 'Técnico e horários associados foram excluídos com sucesso.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;