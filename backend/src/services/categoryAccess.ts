import { getPool, sql } from '../config/db';

// Category ids are sequential, so a request could name another user's custom
// category by guessing its id. Anything that WRITES a category reference must
// first check the id is visible to the requester: a shared system category
// (user_id IS NULL) or one they created themselves.

/** True if this category id is a system category or belongs to this user. */
export async function categoryUsableByUser(userId: number, categoryId: number): Promise<boolean> {
  const res = await getPool().request()
    .input('id', sql.Int, categoryId)
    .input('userId', sql.Int, userId)
    .query('SELECT 1 AS ok FROM categories WHERE id = @id AND (user_id = @userId OR user_id IS NULL)');
  return res.recordset.length > 0;
}

/** Of the given ids, the subset that are system categories or this user's own. */
export async function filterUsableCategoryIds(userId: number, categoryIds: number[]): Promise<Set<number>> {
  if (categoryIds.length === 0) return new Set();
  const request = getPool().request().input('userId', sql.Int, userId);
  categoryIds.forEach((id, i) => request.input(`c${i}`, sql.Int, id));
  const res = await request.query(`
    SELECT id FROM categories
    WHERE id IN (${categoryIds.map((_, i) => `@c${i}`).join(',')})
      AND (user_id = @userId OR user_id IS NULL)
  `);
  return new Set((res.recordset as { id: number }[]).map(r => r.id));
}
