import { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      user?: {
        id: string;
        email: string;
        name?: string;
      };
    }
  }
}

export {};