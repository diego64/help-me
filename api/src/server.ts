import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import tecnicoRoutes from './routes/technical';
import userRoutes from './routes/user';
import serviceRoutes from './routes/service';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/technical', tecnicoRoutes);
app.use('/user', userRoutes);
app.use('/services', serviceRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
