import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { blobFor, blobsFor, blobUrl } from './storage.js';

export type UserRow = typeof users.$inferSelect;

/** `current_user.account.users.index_by(&:id)` + avatar_url já resolvido (evita N+1). */
export async function accountUsersMap(accountId: number): Promise<Map<number, UserRow & { avatarUrl: string | null }>> {
  const rows = await db.select().from(users).where(eq(users.accountId, accountId));
  const avatars = await blobsFor('User', rows.map(r => r.id), 'avatar');
  return new Map(rows.map(r => {
    const b = avatars.get(r.id)?.[0];
    return [r.id, { ...r, avatarUrl: b ? blobUrl(b) : null }];
  }));
}

export async function usersByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(users).where(inArray(users.id, ids));
}

export const fullName = (u: Pick<UserRow, 'firstName' | 'lastName'>) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();

export async function avatarUrl(userId: number): Promise<string | null> {
  const blob = await blobFor('User', userId, 'avatar');
  return blob ? blobUrl(blob) : null;
}
