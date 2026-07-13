import { Router, Response } from 'express';
import {
  CountryCode,
  Products,
  type AccountBase,
  type Transaction as PlaidTransaction,
} from 'plaid';
import { plaid, PLAID_CONFIGURED } from '../config/plaid';
import { categorizeTransactions } from '../services/aiService';
import { categoryHint, isRsmPayroll, snapPaydayDate } from '../services/csvParser';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { encryptSecret, decryptSecret } from '../config/crypto';

const router = Router();

// Every route needs Plaid credentials; fail clearly if they're missing rather
// than throwing an opaque error from deep inside the SDK.
router.use((_req, res, next) => {
  if (!PLAID_CONFIGURED) {
    res.status(503).json({ error: 'Bank linking is not configured on the server (missing Plaid keys).' });
    return;
  }
  next();
});

// Map a Plaid account onto the `type` strings the rest of the app uses.
function mapAccountType(a: AccountBase): string {
  if (a.subtype === 'checking') return 'checking';
  if (a.subtype === 'savings') return 'savings';
  if (a.type === 'credit') return 'credit';
  return a.type ?? 'depository';
}

// ── 1. Create a link token ─────────────────────────────────────────
// The frontend feeds this into Plaid Link to open the bank-login widget.
router.post('/link-token', async (req: AuthRequest, res: Response) => {
  try {
    const result = await plaid.linkTokenCreate({
      user: { client_user_id: String(req.userId) },
      client_name: 'BreadBank',
      products: [Products.Transactions],
      // Initialize Investments (brokerages) and Liabilities (credit cards →
      // payment due dates for the bill calendar) when the institution supports
      // them, without forcing either on plain banks that don't.
      optional_products: [Products.Investments, Products.Liabilities],
      // Ask for up to 2 years of history instead of Plaid's ~90-day default.
      // Fixed at link time per item, so it only helps links made from now on.
      transactions: { days_requested: 730 },
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: result.data.link_token });
  } catch (err) {
    console.error('Plaid link-token error:', err);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// ── 2. Exchange the public token after the user logs in ────────────
// Stores the long-lived access token, mirrors the bank's accounts into our
// `accounts` table, then runs an initial transaction sync.
router.post('/exchange', async (req: AuthRequest, res: Response) => {
  const publicToken = req.body.public_token as string | undefined;
  if (!publicToken) {
    res.status(400).json({ error: 'public_token is required' });
    return;
  }

  try {
    const pool = getPool();
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    // Institution name (best-effort — used for display only).
    let institution = 'Bank';
    try {
      const itemResp = await plaid.itemGet({ access_token: accessToken });
      const instId = itemResp.data.item.institution_id;
      if (instId) {
        const inst = await plaid.institutionsGetById({
          institution_id: instId,
          country_codes: [CountryCode.Us],
        });
        institution = inst.data.institution.name;
      }
    } catch { /* non-fatal */ }

    // Re-linking an institution you already have would otherwise create a
    // second item with a fresh set of account ids — i.e. duplicate accounts.
    // Replace the old link instead: remove its accounts + revoke its token.
    // (Skipped when the institution name couldn't be resolved, to avoid
    // matching unrelated items under the generic fallback name.)
    if (institution !== 'Bank') {
      const existing = await pool.request()
        .input('userId', sql.Int, req.userId)
        .input('institution', sql.NVarChar(200), institution)
        .query(`SELECT id, access_token FROM plaid_items WHERE user_id = @userId AND institution = @institution`);
      for (const row of existing.recordset as { id: number; access_token: string }[]) {
        await removeLinkedItem(req.userId!, row);
      }
    }

    await pool.request()
      .input('userId', sql.Int, req.userId)
      .input('itemId', sql.NVarChar(100), itemId)
      .input('accessToken', sql.NVarChar(500), encryptSecret(accessToken))
      .input('institution', sql.NVarChar(200), institution)
      .query(`
        INSERT INTO plaid_items (user_id, item_id, access_token, institution)
        VALUES (@userId, @itemId, @accessToken, @institution)
      `);

    await upsertAccounts(req.userId!, accessToken, institution);
    const synced = await syncItem(req.userId!, accessToken, itemId);

    res.json({ success: true, institution, imported: synced });
  } catch (err) {
    console.error('Plaid exchange error:', err);
    res.status(500).json({ error: 'Failed to link account' });
  }
});

// ── 3. Sync transactions for all of the user's linked banks ────────
router.post('/sync', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const items = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`SELECT item_id, access_token, institution FROM plaid_items WHERE user_id = @userId`);

    let imported = 0;
    // Sync each linked bank independently: one bank erroring (e.g. NO_ACCOUNTS
    // after a card is closed, or a re-auth-required item) must not abort the
    // whole sync and leave every other account stale. Collect failures instead.
    const failed: { institution: string; reason: string }[] = [];
    for (const item of items.recordset as { item_id: string; access_token: string; institution: string }[]) {
      try {
        const token = decryptSecret(item.access_token);
        await upsertAccounts(req.userId!, token, item.institution);
        imported += await syncItem(req.userId!, token, item.item_id);
      } catch (e) {
        const code = (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code
          ?? (e instanceof Error ? e.message : 'unknown error');
        console.error(`Plaid sync failed for ${item.institution} (item ${item.item_id}): ${code}`);
        failed.push({ institution: item.institution, reason: String(code) });
      }
    }
    res.json({ success: true, banks: items.recordset.length, imported, failed });
  } catch (err) {
    console.error('Plaid sync error:', err);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

// ── 4. Which banks are linked (for the UI) ─────────────────────────
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`SELECT institution, created_at FROM plaid_items WHERE user_id = @userId ORDER BY created_at DESC`);
    res.json({ linked: result.recordset });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch link status' });
  }
});

// ── 5. Investment holdings across all linked brokerages ───────────
router.get('/investments', async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const items = await pool.request()
      .input('userId', sql.Int, req.userId)
      .query(`SELECT access_token, institution FROM plaid_items WHERE user_id = @userId`);

    const accounts: InvestmentAccount[] = [];
    const holdings: Holding[] = [];

    for (const item of items.recordset as { access_token: string; institution: string }[]) {
      try {
        const resp = await plaid.investmentsHoldingsGet({ access_token: decryptSecret(item.access_token) });
        const secById = new Map(resp.data.securities.map((s) => [s.security_id, s]));
        const acctById = new Map(resp.data.accounts.map((a) => [a.account_id, a]));

        for (const a of resp.data.accounts) {
          if (a.type !== 'investment') continue;
          accounts.push({
            name: a.name || a.official_name || 'Investment',
            institution: item.institution,
            value: a.balances.current ?? 0,
          });
        }

        for (const h of resp.data.holdings) {
          const sec = secById.get(h.security_id);
          const acct = acctById.get(h.account_id);
          const value = h.institution_value ?? 0;
          const costBasis = h.cost_basis ?? null;
          holdings.push({
            account: acct?.name ?? 'Investment',
            name: sec?.name ?? sec?.ticker_symbol ?? 'Unknown',
            ticker: sec?.ticker_symbol ?? null,
            type: sec?.type ?? null,
            quantity: h.quantity,
            price: h.institution_price ?? sec?.close_price ?? 0,
            value,
            costBasis,
            gain: costBasis != null ? value - costBasis : null,
          });
        }
      } catch {
        // Item has no investment accounts / doesn't support the product — skip.
        continue;
      }
    }

    holdings.sort((a, b) => b.value - a.value);
    const totalValue = accounts.reduce((s, a) => s + a.value, 0);
    const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis ?? 0), 0);
    const totalGain = holdings.reduce((s, h) => s + (h.gain ?? 0), 0);

    res.json({
      summary: {
        totalValue,
        totalCostBasis,
        totalGain,
        gainPct: totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0,
        holdingsCount: holdings.length,
      },
      accounts,
      holdings,
    });
  } catch (err) {
    console.error('Plaid investments error:', err);
    res.status(500).json({ error: 'Failed to load investments' });
  }
});

interface InvestmentAccount { name: string; institution: string; value: number; }
interface Holding {
  account: string;
  name: string;
  ticker: string | null;
  type: string | null;
  quantity: number;
  price: number;
  value: number;
  costBasis: number | null;
  gain: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────

// Fully unlink a previously-stored item: delete its local accounts (plus their
// transactions/uploads), revoke the access token at Plaid, and drop the row.
async function removeLinkedItem(userId: number, row: { id: number; access_token: string }): Promise<void> {
  const pool = getPool();
  const token = decryptSecret(row.access_token);

  let acctIds: string[] = [];
  try {
    const resp = await plaid.accountsGet({ access_token: token });
    acctIds = resp.data.accounts.map((a) => a.account_id);
  } catch { /* token may be invalid — still clean up locally below */ }

  if (acctIds.length) {
    const req = pool.request().input('userId', sql.Int, userId);
    acctIds.forEach((id, i) => req.input(`a${i}`, sql.NVarChar(100), id));
    const placeholders = acctIds.map((_, i) => `@a${i}`).join(',');
    const local = (await req.query(
      `SELECT id FROM accounts WHERE user_id = @userId AND plaid_account_id IN (${placeholders})`,
    )).recordset as { id: number }[];

    // ALL of it runs in one transaction so a mid-way failure rolls back cleanly
    // instead of leaving transactions half-deleted (which is exactly how a
    // reconnect once wiped a checking account). And we only ever remove
    // PLAID-sourced rows — CSV/manually-imported history on the account is kept.
    const tx = pool.transaction();
    await tx.begin();
    try {
      for (const a of local) {
        await tx.request().input('id', sql.Int, a.id)
          .query(`DELETE FROM transactions WHERE account_id = @id AND plaid_transaction_id IS NOT NULL`);
        const remaining = (await tx.request().input('id', sql.Int, a.id)
          .query(`SELECT COUNT(*) AS n FROM transactions WHERE account_id = @id`))
          .recordset[0].n as number;
        if (remaining > 0) {
          // Account still holds CSV/manual history — keep it, just detach Plaid.
          await tx.request().input('id', sql.Int, a.id)
            .query(`UPDATE accounts SET plaid_account_id = NULL, current_balance = NULL WHERE id = @id`);
        } else {
          // Purely Plaid-managed and now empty — safe to remove entirely.
          await tx.request().input('id', sql.Int, a.id).query(`DELETE FROM uploads WHERE account_id = @id`);
          await tx.request().input('id', sql.Int, a.id).query(`DELETE FROM accounts WHERE id = @id`);
        }
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  try { await plaid.itemRemove({ access_token: token }); } catch { /* non-fatal */ }
  await pool.request().input('id', sql.Int, row.id).query(`DELETE FROM plaid_items WHERE id = @id`);
}


// Create/refresh our accounts rows from Plaid, recording the real current
// balance so the dashboard's Checking/Savings cards are accurate.
async function upsertAccounts(userId: number, accessToken: string, institution: string): Promise<void> {
  const pool = getPool();
  const resp = await plaid.accountsBalanceGet({ access_token: accessToken });

  for (const a of resp.data.accounts) {
    const type = mapAccountType(a);
    // Store the real balance Plaid reports so the dashboard doesn't have to
    // derive it from a partial transaction history:
    //   • depository → AVAILABLE balance (excludes pending holds, matches the
    //     bank app); fall back to current if available isn't reported.
    //   • credit     → CURRENT balance, which is the amount currently owed.
    let balance: number | null = null;
    if (a.type === 'depository') {
      balance = a.balances.available ?? a.balances.current ?? null;
    } else if (a.type === 'credit' || a.type === 'investment') {
      // Credit → amount owed; investment → total portfolio value.
      balance = a.balances.current ?? null;
    }
    const name = a.name || a.official_name || `${institution} ${a.subtype ?? ''}`.trim();

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('plaidAccountId', sql.NVarChar(100), a.account_id)
      .input('name', sql.NVarChar(200), name)
      .input('type', sql.NVarChar(20), type)
      .input('institution', sql.NVarChar(200), institution)
      .input('balance', sql.Decimal(14, 2), balance)
      .query(`
        IF EXISTS (SELECT 1 FROM accounts WHERE plaid_account_id = @plaidAccountId AND user_id = @userId)
          UPDATE accounts SET current_balance = @balance, name = @name, type = @type
          WHERE plaid_account_id = @plaidAccountId AND user_id = @userId
        ELSE
        BEGIN
          -- Adopt an existing unlinked account (a seeded default, a CSV-built
          -- one, or one detached by a previous re-link) instead of inserting a
          -- duplicate next to it: exact name match first, else the single
          -- unlinked account with the same institution + type. Its transaction
          -- history stays put.
          DECLARE @adopt INT = (SELECT TOP 1 id FROM accounts
                                WHERE user_id = @userId AND plaid_account_id IS NULL AND name = @name);
          IF @adopt IS NULL
             AND (SELECT COUNT(*) FROM accounts
                  WHERE user_id = @userId AND plaid_account_id IS NULL
                    AND institution = @institution AND type = @type) = 1
            SET @adopt = (SELECT TOP 1 id FROM accounts
                          WHERE user_id = @userId AND plaid_account_id IS NULL
                            AND institution = @institution AND type = @type);
          -- Last resort: a single EMPTY unlinked account of the same type (a
          -- generic starter like 'Checking · My Bank') is safe to claim no
          -- matter its branding — it has no history to mix up.
          IF @adopt IS NULL
             AND (SELECT COUNT(*) FROM accounts a
                  WHERE a.user_id = @userId AND a.plaid_account_id IS NULL AND a.type = @type
                    AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = a.id)) = 1
            SET @adopt = (SELECT TOP 1 a.id FROM accounts a
                          WHERE a.user_id = @userId AND a.plaid_account_id IS NULL AND a.type = @type
                            AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = a.id));
          IF @adopt IS NOT NULL
            UPDATE accounts SET plaid_account_id = @plaidAccountId, current_balance = @balance,
                                name = @name, type = @type, institution = @institution
            WHERE id = @adopt
          ELSE
            INSERT INTO accounts (user_id, name, type, institution, plaid_account_id, current_balance)
            VALUES (@userId, @name, @type, @institution, @plaidAccountId, @balance)
        END
      `);
  }
}

// Pull new/changed transactions for one bank and write them into our tables.
// Uses Plaid's cursor-based /transactions/sync so each run only fetches deltas.
async function syncItem(userId: number, accessToken: string, itemId: string): Promise<number> {
  const pool = getPool();

  // Resume from the last cursor we stored for this item.
  const cursorRow = await pool.request()
    .input('itemId', sql.NVarChar(100), itemId)
    .input('userId', sql.Int, userId)
    .query(`SELECT sync_cursor FROM plaid_items WHERE item_id = @itemId AND user_id = @userId`);
  let cursor: string | undefined = (cursorRow.recordset[0]?.sync_cursor as string) || undefined;

  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: string[] = [];

  let hasMore = true;
  while (hasMore) {
    const resp = await plaid.transactionsSync({ access_token: accessToken, cursor });
    added.push(...resp.data.added);
    modified.push(...resp.data.modified);
    removed.push(...resp.data.removed.map((r) => r.transaction_id));
    cursor = resp.data.next_cursor;
    hasMore = resp.data.has_more;
  }

  // Map Plaid account ids → our account ids for this user.
  const acctRows = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`SELECT id, plaid_account_id, type FROM accounts WHERE user_id = @userId AND plaid_account_id IS NOT NULL`);
  const acctMap = new Map<string, { id: number; type: string }>();
  for (const r of acctRows.recordset as { id: number; plaid_account_id: string; type: string }[]) {
    acctMap.set(r.plaid_account_id, { id: r.id, type: r.type });
  }

  // Remove deleted transactions.
  for (const txId of removed) {
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('plaidTxId', sql.NVarChar(100), txId)
      .query(`DELETE FROM transactions WHERE user_id = @userId AND plaid_transaction_id = @plaidTxId`);
  }

  // Categorize the freshly added transactions (merchant rules first, AI for the rest).
  const cat = await categorize(userId, added);

  // Adds need an upload row to satisfy the transactions.upload_id FK; reuse one
  // synthetic "Plaid sync" upload row for the whole batch.
  let uploadId: number | null = null;
  if (added.length) {
    const firstAcct = acctMap.get(added[0]!.account_id);
    const up = await pool.request()
      .input('userId', sql.Int, userId)
      .input('accountId', sql.Int, firstAcct?.id ?? null)
      .input('filename', sql.NVarChar(500), `Plaid sync · ${new Date().toLocaleDateString('en-US')}`)
      .input('count', sql.Int, added.length)
      .query(`
        INSERT INTO uploads (user_id, account_id, filename, transaction_count, duplicate_count)
        OUTPUT INSERTED.id VALUES (@userId, @accountId, @filename, @count, 0)
      `);
    uploadId = (up.recordset[0] as { id: number }).id;
  }

  for (const t of added) {
    const acct = acctMap.get(t.account_id);
    if (!acct) continue; // account we don't track (shouldn't happen after upsert)
    const { type, amount } = normalizeAmount(t.amount);
    const c = cat.get(t.transaction_id);

    // RSM paychecks post a few days early — snap to the scheduled 1st/15th so the
    // income lands in the right month. Mark date_overridden so a later Plaid
    // "modified" event won't reset it back to the early posting date.
    let date = t.date;
    let dateOverridden = 0;
    if (isRsmPayroll(t.name)) {
      const [yy, mm, dd] = t.date.split('-').map(Number);
      const snapped = snapPaydayDate(new Date(yy ?? 1970, (mm ?? 1) - 1, dd ?? 1));
      date = `${snapped.getFullYear()}-${String(snapped.getMonth() + 1).padStart(2, '0')}-${String(snapped.getDate()).padStart(2, '0')}`;
      dateOverridden = 1;
    }

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('accountId', sql.Int, acct.id)
      .input('uploadId', sql.Int, uploadId)
      .input('plaidTxId', sql.NVarChar(100), t.transaction_id)
      .input('date', sql.Date, date)
      .input('description', sql.NVarChar(500), t.name)
      .input('merchant', sql.NVarChar(200), c?.merchant ?? t.merchant_name ?? t.name)
      .input('amount', sql.Decimal(12, 2), amount)
      .input('type', sql.NVarChar(10), type)
      .input('categoryId', sql.Int, c?.categoryId ?? null)
      .input('dateOverridden', sql.Bit, dateOverridden)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM transactions WHERE user_id = @userId AND plaid_transaction_id = @plaidTxId)
           -- Also skip rows the user already has from a CSV upload of the same
           -- period (same account, calendar date, amount, and direction), so a
           -- deep Plaid backfill doesn't duplicate CSV-imported history. CSV and
           -- Plaid descriptions never match, so text comparison can't help here.
           AND NOT EXISTS (SELECT 1 FROM transactions
                           WHERE user_id = @userId AND account_id = @accountId
                             AND plaid_transaction_id IS NULL
                             AND date = @date AND amount = @amount AND type = @type)
          INSERT INTO transactions
            (user_id, account_id, upload_id, plaid_transaction_id, date, description, merchant, amount, type, category_id, date_overridden)
          VALUES
            (@userId, @accountId, @uploadId, @plaidTxId, @date, @description, @merchant, @amount, @type, @categoryId, @dateOverridden)
      `);
  }

  // Apply edits Plaid reports for already-imported transactions.
  for (const t of modified) {
    const { type, amount } = normalizeAmount(t.amount);
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('plaidTxId', sql.NVarChar(100), t.transaction_id)
      .input('date', sql.Date, t.date)
      .input('description', sql.NVarChar(500), t.name)
      .input('amount', sql.Decimal(12, 2), amount)
      .input('type', sql.NVarChar(10), type)
      .query(`
        UPDATE transactions SET
          -- Preserve a date the user manually edited (e.g. an early paycheck).
          date        = CASE WHEN date_overridden = 1 THEN date ELSE @date END,
          description = @description, amount = @amount, type = @type
        WHERE user_id = @userId AND plaid_transaction_id = @plaidTxId
      `);
  }

  // Persist the cursor so the next sync resumes where this one stopped.
  await pool.request()
    .input('cursor', sql.NVarChar(sql.MAX), cursor ?? null)
    .input('itemId', sql.NVarChar(100), itemId)
    .input('userId', sql.Int, userId)
    .query(`UPDATE plaid_items SET sync_cursor = @cursor WHERE item_id = @itemId AND user_id = @userId`);

  return added.length;
}

// Plaid: positive amount = money leaving the account (a debit/spend).
function normalizeAmount(plaidAmount: number): { type: 'debit' | 'credit'; amount: number } {
  return { type: plaidAmount > 0 ? 'debit' : 'credit', amount: Math.abs(plaidAmount) };
}

// Resolve a category for each added transaction, mirroring the CSV upload flow:
// known merchant_rules win; everything else goes to the AI categorizer.
async function categorize(
  userId: number,
  txs: PlaidTransaction[],
): Promise<Map<string, { categoryId: number | null; merchant: string }>> {
  const pool = getPool();
  const out = new Map<string, { categoryId: number | null; merchant: string }>();
  if (txs.length === 0) return out;

  // The owner's registered name lets the hinting file Zelle moves between
  // their own banks (e.g. "ZELLE FROM <their name>") as transfers.
  const ownerRow = await pool.request()
    .input('id', sql.Int, userId)
    .query('SELECT name FROM users WHERE id = @id');
  const ownerName = (ownerRow.recordset[0] as { name: string | null } | undefined)?.name ?? null;

  const categoryIdCache = new Map<string, number | null>();
  const lookupCategoryId = async (name: string): Promise<number | null> => {
    if (categoryIdCache.has(name)) return categoryIdCache.get(name)!;
    const row = await pool.request()
      .input('name', sql.NVarChar(100), name)
      .query(`SELECT id FROM categories WHERE name = @name AND user_id IS NULL`);
    const id = (row.recordset[0] as { id: number } | undefined)?.id ?? null;
    categoryIdCache.set(name, id);
    return id;
  };

  const needsAI: PlaidTransaction[] = [];
  for (const t of txs) {
    // Self-transfers and refunds are recognized from the description (same rules
    // as the CSV importer) so the AI never mislabels them as income/spending.
    const hint = categoryHint(t.name, normalizeAmount(t.amount).type, ownerName);
    if (hint.category) {
      out.set(t.transaction_id, { categoryId: await lookupCategoryId(hint.category), merchant: t.merchant_name ?? t.name });
      continue;
    }

    const rule = await pool.request()
      .input('userId', sql.Int, userId)
      .input('desc', sql.NVarChar(500), t.name)
      .query(`
        SELECT TOP 1 category_id FROM merchant_rules
        WHERE user_id = @userId AND @desc LIKE '%' + merchant_pattern + '%'
        ORDER BY LEN(merchant_pattern) DESC
      `);
    const knownCatId = (rule.recordset[0] as { category_id: number } | undefined)?.category_id ?? null;
    if (knownCatId) {
      out.set(t.transaction_id, { categoryId: knownCatId, merchant: t.merchant_name ?? t.name });
    } else {
      needsAI.push(t);
    }
  }

  const BATCH = 50;
  for (let i = 0; i < needsAI.length; i += BATCH) {
    const batch = needsAI.slice(i, i + BATCH);
    const results = await categorizeTransactions(
      userId,
      batch.map((t) => ({ description: t.name, amount: t.amount })),
    );
    for (let j = 0; j < batch.length; j++) {
      const hit = results.find((r) => r.index === j);
      const categoryName = hit?.category ?? 'Unknown';
      const merchant = hit?.merchant ?? batch[j]!.merchant_name ?? batch[j]!.name;
      const categoryId = await lookupCategoryId(categoryName);
      out.set(batch[j]!.transaction_id, { categoryId, merchant });
    }
  }

  return out;
}

export default router;
