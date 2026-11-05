import { Prisma } from '../../generated/prisma/client.js';

const isWriteConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2034';

// Runs a transaction again when Postgres aborted it over a deadlock or write conflict (P2034).
// Such a run had no effect, so trying again is safe; other errors are passed on at once.
export const retryOnConflict = async <T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isWriteConflict(error) || attempt >= attempts) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 20 * attempt + Math.random() * 30),
      );
    }
  }
};
