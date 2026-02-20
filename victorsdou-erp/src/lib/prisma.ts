import { PrismaClient } from '@prisma/client';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Singleton: prevent multiple instances in development hot-reload
const prisma =
  global.__prisma ??
  new PrismaClient({
    log:
      config.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

if (config.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export { prisma };
export type { PrismaClient };
