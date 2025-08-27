import { Request } from 'express';
import { User } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      rateLimit: {
        limit: number;
        current: number;
        remaining: number;
        resetTime: number;
      };
    }
  }
}
