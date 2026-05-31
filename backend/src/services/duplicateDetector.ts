import { getPool, sql } from '../config/db';
import type { ParsedTransaction } from './csvParser';

export interface TxWithAccount extends ParsedTransaction {
  accountId: number;
}

export async function filterDuplicates(txs: TxWithAccount[]): Promise<{
  unique: TxWithAccount[];
  duplicateCount: number;
}> {
  if (txs.length === 0) return { unique: [], duplicateCount: 0 };

  const pool = getPool();
  const unique: TxWithAccount[] = [];
  let duplicateCount = 0;

  for (const tx of txs) {
    const result = await pool.request()
      .input('accountId',   sql.Int,           tx.accountId)
      .input('date',        sql.Date,           tx.date)
      .input('amount',      sql.Decimal(12, 2), tx.amount)
      .input('description', sql.NVarChar(500),  tx.description)
      .query(`
        SELECT COUNT(*) AS cnt FROM transactions
        WHERE account_id = @accountId
          AND date        = @date
          AND amount      = @amount
          AND description = @description
      `);

    const cnt = (result.recordset[0] as { cnt: number } | undefined)?.cnt ?? 0;
    if (cnt === 0) {
      unique.push(tx);
    } else {
      duplicateCount++;
    }
  }

  return { unique, duplicateCount };
}
