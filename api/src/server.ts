import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import tecnicoRoutes from './routes/tecnico.routes';
import usuarioRoutes from './routes/usuario.routes';
import servicoRoutes from './routes/servico..routes';
import chamadoRoutes from './routes/chamado.routes'
import filaDeChamadosRoutes from './routes/fila-de-chamados.routes';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/tecnico', tecnicoRoutes);
app.use('/usuario', usuarioRoutes);
app.use('/servico', servicoRoutes);
app.use('/chamado', chamadoRoutes);
app.use('/filadechamados', filaDeChamadosRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
