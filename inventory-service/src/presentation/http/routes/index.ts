import { Router } from 'express';
import inventarioRoutes from './inventario.routes';
import categoriaRoutes from './categoria.routes';
import fornecedorRoutes from './fornecedor.routes';
import compraRoutes from './compra.routes';
import baixaRoutes from './baixa.routes';
import reembolsoRoutes from './reembolso.routes';

const router: Router = Router();

router.use('/inventario', inventarioRoutes);
router.use('/categorias', categoriaRoutes);
router.use('/fornecedores', fornecedorRoutes);
router.use('/compras', compraRoutes);
router.use('/baixas', baixaRoutes);
router.use('/reembolsos', reembolsoRoutes);

export default router;
