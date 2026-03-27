import { Router } from 'express';
import type { Router as RouterType } from 'express';
import adminRoutes from './admin.routes';
import chamadoRoutes from './chamado.routes';
import fila from './fila.routes';
import notificacaoRoutes from './notificacao.routes';
import servicoRoutes from './servico.routes';
import tecnicoRoutes from './tecnico.routes';
import usuarioRoutes from './usuario.routes';
import kafkaRoutes from './kafka.routes';
import kafkaNotificacaoRoutes from './kafka-notificacao.routes';

const router: RouterType = Router();

router.use('/admin', adminRoutes);
router.use('/chamados', chamadoRoutes);
router.use('/fila-chamados', fila);
router.use('/notificacoes', notificacaoRoutes);
router.use('/servicos', servicoRoutes);
router.use('/tecnicos', tecnicoRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/kafka', kafkaRoutes);
router.use('/kafka-notificacoes', kafkaNotificacaoRoutes);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

export default router;