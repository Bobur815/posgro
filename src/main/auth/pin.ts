import * as bcrypt from 'bcryptjs';
import { getPrismaClient } from '../database/sqlite-client';

/**
 * Quick-login PINs, shared by the till's own login (`ipc/auth-handlers.ts`) and by a main terminal
 * answering its satellites (`local-server/routes/satellite.ts`) — one copy of the rules, because a
 * PIN that unlocks one path and not the other would be a support call nobody could explain.
 */

/** A quick-login PIN is 1 to 4 digits — short by design; see §6.10 for what that costs on a wire. */
export const PIN_PATTERN = /^\d{1,4}$/;

type Prisma = ReturnType<typeof getPrismaClient>;
type PinCandidate = { id: string; pin: string | null };

/**
 * Active users of this terminal's store that carry a PIN.
 *
 * The store scope matters: a terminal caches users from whichever store it was last set up
 * against, and a stale row from another store must never be able to unlock this one.
 */
export async function usersWithPin(
  prisma: Prisma,
  extra: { excludeUserId?: string } = {},
): Promise<PinCandidate[]> {
  const localConfig = await prisma.localConfig.findUnique({ where: { id: 'config' } });
  const storeId = localConfig?.storeId;

  return prisma.user.findMany({
    where: {
      active: true,
      pin: { not: null },
      ...(storeId ? { storeId } : {}),
      ...(extra.excludeUserId ? { id: { not: extra.excludeUserId } } : {}),
    },
    select: { id: true, pin: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** The user whose PIN this is, or null. Compares against every candidate — PINs are not unique by construction. */
export async function findUserIdByPin(prisma: Prisma, pin: string): Promise<string | null> {
  for (const candidate of await usersWithPin(prisma)) {
    if (candidate.pin && (await bcrypt.compare(pin, candidate.pin))) return candidate.id;
  }
  return null;
}

/**
 * Hash a PIN for `userId`, rejecting a PIN another active user already owns.
 *
 * Two people sharing a PIN would make PIN login ambiguous — whoever was created first would
 * silently take over the other's session, including their shift and their name on the receipt.
 */
export async function hashNewPin(prisma: Prisma, pin: string, userId: string): Promise<string> {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error('auth.errors.invalid_pin_format');
  }
  for (const candidate of await usersWithPin(prisma, { excludeUserId: userId })) {
    if (candidate.pin && (await bcrypt.compare(pin, candidate.pin))) {
      throw new Error('auth.errors.pin_taken');
    }
  }
  return bcrypt.hash(pin, 10);
}
