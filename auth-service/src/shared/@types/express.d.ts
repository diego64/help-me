import { Logger } from 'pino';
import { Regra } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      usuario?: {
        id: string;
        email: string;
        nome: string;
        sobrenome: string;
        regra: Regra;
      };
    }
  }
}

export {};