import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '@shared/config/logger';
import jwt from 'jsonwebtoken';

let io: SocketIOServer | null = null;

// Map de usuarioId -> socketId para emissão direta
const usuarioSockets = new Map<string, Set<string>>();

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  // Middleware de autenticação JWT
  io.use((socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Token não fornecido'));
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) return next(new Error('JWT_SECRET não configurado'));

      const decoded = jwt.verify(token, secret) as any;
      (socket as any).usuarioId = decoded.id || decoded.sub;
      (socket as any).usuarioRegra = decoded.regra;

      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const usuarioId = (socket as any).usuarioId as string;

    // Registrar socket do usuário
    if (!usuarioSockets.has(usuarioId)) {
      usuarioSockets.set(usuarioId, new Set());
    }
    usuarioSockets.get(usuarioId)!.add(socket.id);

    // Entrar na sala pessoal
    socket.join(`usuario:${usuarioId}`);

    // Técnicos entram na sala de técnicos (para chamados abertos)
    if ((socket as any).usuarioRegra === 'TECNICO') {
      socket.join('tecnicos');
    }

    logger.debug({ usuarioId, socketId: socket.id }, 'Socket conectado');

    socket.on('disconnect', () => {
      const sockets = usuarioSockets.get(usuarioId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) usuarioSockets.delete(usuarioId);
      }
      logger.debug({ usuarioId, socketId: socket.id }, 'Socket desconectado');
    });

    // Cliente pode marcar notificação como lida via socket
    socket.on('notificacao:lida', (notificacaoId: string) => {
      logger.debug({ usuarioId, notificacaoId }, 'Notificação marcada como lida via socket');
    });
  });

  logger.info('Socket.IO inicializado');
  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO não inicializado');
  return io;
}

// Emite notificação para um usuário específico
export function emitirParaUsuario(usuarioId: string, evento: string, dados: any): void {
  if (!io) {
    logger.warn({ usuarioId, evento }, 'Socket.IO não inicializado — notificação não emitida');
    return;
  }
  io.to(`usuario:${usuarioId}`).emit(evento, dados);
}

// Emite para todos os técnicos conectados
export function emitirParaTecnicos(evento: string, dados: any): void {
  if (!io) return;
  io.to('tecnicos').emit(evento, dados);
}

export function getUsuarioSockets(): Map<string, Set<string>> {
  return usuarioSockets;
}