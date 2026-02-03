import { Router } from 'express';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import chamadoRoutes from './chamado.routes';
import envioEmailTesteRoutes from './envio-email-teste.routes';
import filaDeChamadosRoutes from './fila-de-chamados.routes';
import servicoRoutes from './servico.routes';
import tecnicoRoutes from './tecnico.routes';
import usuarioRoutes from './usuario.routes';

const router = Router();

// Rotas públicas
router.use('/auth', authRoutes);
router.use('/envio-email-teste', envioEmailTesteRoutes);

// Rotas protegidas (requerem autenticação)
router.use('/admin', adminRoutes);
router.use('/chamados', chamadoRoutes);
router.use('/fila-chamados', filaDeChamadosRoutes);
router.use('/servicos', servicoRoutes);
router.use('/tecnicos', tecnicoRoutes);
router.use('/usuarios', usuarioRoutes);

// Rota de health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rota 404 para rotas não encontradas dentro de /api
router.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

export default router;