import 'server-only';
import { PrismaClient } from '@prisma/client';
import { env, isProduction } from './env';

/**
 * A single PrismaClient per process. Next.js dev discards module state on every
 * hot reload, which would otherwise open a new connection pool each time until
 * PostgreSQL refuses them.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

if (!isProduction) globalForPrisma.prisma = db;

/** Prisma error codes worth branching on. */
export const PRISMA_ERROR = {
  UNIQUE_VIOLATION: 'P2002',
  FOREIGN_KEY_VIOLATION: 'P2003',
  NOT_FOUND: 'P2025',
  /** Raised when one of our CHECK constraints rejects a write. */
  CONSTRAINT_VIOLATION: 'P2004',
} as const;

export function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
