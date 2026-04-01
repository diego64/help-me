import { Router, IRouter } from 'express';
import authRoutes from './auth.routes';
import usuarioRoutes from './usuario.routes';

const router: IRouter = Router();

router.use('/sessao', authRoutes);
router.use('/usuarios', usuarioRoutes);

export default router;