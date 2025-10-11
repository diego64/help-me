import express from 'express';
import authRoutes from './routes/auth';
import usersList from './routes/users-list';
import adminRoutes from './routes/admin';
import tecnicoRoutes from './routes/technical';
import userRoutes from './routes/user';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/user-list', usersList);
app.use('/admin', adminRoutes);
app.use('/technical', tecnicoRoutes);
app.use('/user', userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
