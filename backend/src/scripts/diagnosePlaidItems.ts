/**
 * Probe each of a user's linked Plaid items and report which are healthy vs
 * broken (e.g. NO_ACCOUNTS / ITEM_LOGIN_REQUIRED), so we know which to re-link.
 *
 *   cd backend && npx ts-node src/scripts/diagnosePlaidItems.ts <userId>
 */
import { connectDB, getPool, sql } from '../config/db';
import { plaid } from '../config/plaid';
import { decryptSecret } from '../config/crypto';

async function main() {
  const userId = Number(process.argv[2]);
  if (!Number.isInteger(userId)) { console.error('Usage: diagnosePlaidItems <userId>'); process.exit(1); }

  await connectDB();
  const items = await getPool().request()
    .input('userId', sql.Int, userId)
    .query(`SELECT item_id, access_token, institution FROM plaid_items WHERE user_id = @userId`);

  for (const it of items.recordset as { item_id: string; access_token: string; institution: string }[]) {
    const token = decryptSecret(it.access_token);
    try {
      const resp = await plaid.accountsBalanceGet({ access_token: token });
      console.log(`✓ ${it.institution.padEnd(14)} OK — ${resp.data.accounts.length} account(s)`);
    } catch (e) {
      const data = (e as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
      console.log(`✗ ${it.institution.padEnd(14)} ${data?.error_code ?? (e instanceof Error ? e.message : 'error')}` +
        (data?.error_message ? ` — ${data.error_message}` : '') + `  [item ${it.item_id}]`);
    }
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
