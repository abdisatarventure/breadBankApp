---
name: plaid-integration-plan
description: Planned Plaid bank-connection feature to replace/augment CSV uploads — decisions and approach
metadata:
  type: project
---

User wants to incorporate Plaid so they can connect bank accounts directly instead of importing CSVs each time. As of 2026-05-31 this is **planned only, no code written yet**.

Decisions made:
- **Environment:** Production is the target. But build/verify in **Sandbox** first (identical code, `PLAID_ENV` is a one-line switch) because Production needs Plaid approval + billing. User needs to start the Plaid Production application (long-pole item).
- **Categorization:** Reuse the existing pipeline (merchant_rules → AI → Unknown + Transfer detection in [upload.ts]), enriched with Plaid's clean `merchant_name` and `personal_finance_category` (cheap first guess, AI only for unknowns). Chosen over Plaid-native categories to preserve Transfer/income/spending accuracy for individual use.
- **Sync:** Automatic via **webhooks** (`SYNC_UPDATES_AVAILABLE`) + a manual "Sync now" button. Webhooks need a public HTTPS URL (deploy backend or tunnel via ngrok/Cloudflare) — can't hit localhost.

Approach:
1. Refactor CSV categorize+insert logic out of `backend/src/routes/upload.ts` into shared `services/ingest.ts` → `ingestTransactions(userId, accountId, txs)`. This is the safe starting point, no Plaid dep. CSV upload stays as a fallback (not replaced).
2. Add `plaid` SDK + env: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_WEBHOOK_URL`, `TOKEN_ENC_KEY` (encrypt access tokens at rest).
3. Schema: new `plaid_items` table (item_id, encrypted access_token, sync_cursor); add `plaid_account_id`+`plaid_item_id` to `accounts` (Plaid auto-creates accounts — note: app currently has NO account-creation code, accounts are seeded by hand); add `plaid_transaction_id` to `transactions` for idempotent dedup.
4. `routes/plaid.ts`: `link-token`, `exchange` (store item + create accounts + initial sync), `sync`, `webhook` (with Plaid-Verification JWT signature check).
5. Sign mapping: Plaid amount → existing debit/credit + positive-amount convention; dedup on plaid_transaction_id; honor `removed` IDs.
6. Frontend: load Plaid Link, "Connect a bank" button + connected-institutions list with last-synced time.

See also [[[breadbank-stack]]] if created. Build order: ingest refactor → schema → link/exchange (Sandbox) → sync+ingest → frontend → webhook last.

**Bank-connectivity constraints (researched 2026-05-31):** User's accounts are Apple Card, Wells Fargo, Discover.
- **Apple Card CANNOT be aggregated by Plaid or ANY aggregator** (Goldman Sachs/Apple don't expose it — no API/OAuth/Direct Connect). Only option: export CSV/OFX from the Wallet app. So a fully no-CSV setup is impossible; Apple Card stays a manual import regardless of approach.
- **Wells Fargo + Discover** can connect via: (a) OAuth aggregators — Plaid, or alternatives Akoya (bank-owned, official APIs, most private; WF participates), MX, Finicity, Yodlee, Teller (all need production approval like Plaid); or (b) OFX/QFX **Direct Connect** = DIY pull straight from the bank's OFX server with creds+Direct Connect PIN, no third party (closest to "connect directly without Plaid", but must encrypt stored creds, can break/trip fraud flags); or (c) manual OFX/QFX/CSV download.
- **Alternative track to Plaid:** add OFX/QFX import (+ optional OFX Direct Connect) to the existing ingest pipeline — no external approval needed, works for WF/Discover, and OFX is cleaner than CSV (stable txn IDs). Apple Card would use OFX export from Wallet.
