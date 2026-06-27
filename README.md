# BreadBank

![License: MIT](https://img.shields.io/badge/License-MIT-8B6FEC.svg) ![Node](https://img.shields.io/badge/Node-20%2B-22C55E.svg) ![Stack](https://img.shields.io/badge/Vue%203%20%2B%20Express%20%2B%20SQL%20Server-6C4ED4.svg)

A self-hosted personal-finance dashboard. Import your bank/credit-card statements (CSV) or link accounts live through **Plaid**, and BreadBank categorizes every transaction with AI, then shows you spending, income, net worth, budgets, subscriptions, and investments — all in a dark, modern UI.

> Single-user-friendly but multi-user capable. Your data stays in **your** SQL Server database; nothing is sent anywhere except the Anthropic API (for categorization/summaries) and Plaid (if you choose to link a bank).

---

## Screenshots

_Drop your own images into `docs/screenshots/` (e.g. `dashboard.png`) and they'll render below._

| Dashboard | Transactions | Budgets |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Transactions](docs/screenshots/transactions.png) | ![Budgets](docs/screenshots/budgets.png) |

---

## Features

- **Dashboard** — balances, monthly income/spending, net worth, savings rate, per-account breakdowns, and 6-month trend + category charts. "Hide amounts" privacy toggle (defaults on at login, masks charts too) and **unusual-spending alerts** that flag a category spiking well above its 12-week norm.
- **Transactions** — searchable, filterable, editable (category, note, **date**). Manual date edits are locked against Plaid overwrites.
- **AI categorization** — Claude auto-files transactions; it learns your corrections as merchant rules so future imports get smarter.
- **Budgets** — monthly limits per category with progress bars. **Build a full budget with AI** from last month's spending (it protects essentials and trims discretionary categories to a target), tighten it gradually with a one-click "trim 5%", and still edit every line by hand. Plus "where to cut back" suggestions.
- **AI Assistant** — ask natural-language questions about your finances ("how much did I spend on food last month?", "what are my top merchants?") and get answers grounded in your own data.
- **Smart income vs. spending** — credits are only counted as income when filed under **Income**; a credit in a spending category is treated as a **refund/reimbursement** that offsets that category (great for splitting rent or bills with a roommate). **Transfer** is excluded from both.
- **Plaid bank linking** — live sync of balances + transactions (Wells Fargo, Discover, Fidelity, etc.). Access tokens are encrypted at rest.
- **Savings Goals** — fund buckets (a new car, a trip, an emergency fund) from each month's leftover. A built-in **"pay yourself first" reserve** sets aside 20% of net savings before any goal can be funded, and Claude can **suggest how to split** the rest across your goals by deadline and priority.
- **Bills & due dates** — a calendar of what's hitting your account and when, built from detected subscriptions (projected by cadence) plus credit-card payment due dates from Plaid Liabilities.
- **Investments** — holdings, value, and gains pulled from linked brokerages.
- **Reports, Subscriptions, Categories**, and an AI-spend tracker that estimates your remaining Claude credit and warns you (in Settings and a login popup) before it runs out.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3 + Quasar (Vite), ApexCharts |
| Backend | Node.js + Express + TypeScript |
| Database | Microsoft SQL Server (Express is fine) |
| AI | Anthropic Claude API |
| Bank data | Plaid (optional) |

---

## Prerequisites

1. **Node.js 20+** and npm.
2. **Microsoft SQL Server** — [SQL Server Express](https://www.microsoft.com/sql-server/sql-server-downloads) is free and sufficient. Install with **Mixed Mode (SQL) authentication** enabled, plus [SSMS](https://learn.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms) or `sqlcmd` to run the setup scripts.
3. **Anthropic API key** — required for AI categorization/summaries. Get one at [console.anthropic.com](https://console.anthropic.com).
4. **Plaid account** *(optional)* — only if you want live bank linking. Free sandbox at [dashboard.plaid.com](https://dashboard.plaid.com).

---

## Quick start

### 1. Clone & install

```bash
git clone <your-repo-url> breadBankApp
cd breadBankApp
npm run install:all      # installs root + backend + frontend deps
```

### 2. Create the database

In SQL Server, create a login the app will use, then run the schema scripts.

```sql
-- In SSMS / sqlcmd, once:
CREATE LOGIN breadbank_user WITH PASSWORD = 'ChangeMe!StrongPassword1';
```

Then run the two schema files in `database/` **in order** (skip `00_reset.sql` on a fresh install):

```
database/01_schema.sql   -- creates the breadbank DB + all tables
database/02_seed.sql     -- seeds default categories + example accounts
```

Finally, grant the login access to the new database:

```sql
USE breadbank;
CREATE USER breadbank_user FOR LOGIN breadbank_user;
ALTER ROLE db_owner ADD MEMBER breadbank_user;
```

> `00_reset.sql` is **destructive** — only use it to wipe data tables and start over (it keeps the `users` table). Run order then is `00 → 01 → 02`.

### 3. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in the required values (see the [reference](#environment-variables) below). Generate the two secrets with:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('PLAID_ENC_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Configure the frontend *(optional)*

The frontend defaults to `http://localhost:3001/api`. Only create `frontend/breadBank/.env` if your API runs elsewhere (e.g. to reach it from a phone on your LAN):

```bash
cp frontend/breadBank/.env.example frontend/breadBank/.env
# then set VITE_API_URL=http://<your-pc-ip>:3001/api
```

### 5. Run it

```bash
npm run dev      # starts API (:3001) and frontend (:9000) together
```

Open **http://localhost:9000**, click **Create an account**, and sign in. You can now upload a CSV (Transactions → Upload) or connect a bank (Dashboard → Connect bank).

> Want it running **24/7 on a Linux box** (Docker + systemd, one port, survives reboots)? See [Deploy on a Linux server (24/7)](#deploy-on-a-linux-server-247).

---

## Environment variables

All live in `backend/.env` (copy from `backend/.env.example`).

| Variable | Required? | Purpose |
|---|---|---|
| `DB_PASSWORD` | **Yes** | Password for the SQL login. App won't start without it. |
| `JWT_SECRET` | **Yes** | Signs auth tokens. Use a long random string. |
| `PLAID_ENC_KEY` | **Yes** | 64-hex-char (32-byte) key encrypting Plaid tokens at rest. App won't start without it. |
| `ANTHROPIC_API_KEY` | For AI | Categorization, summaries, and chat. |
| `DB_SERVER` / `DB_INSTANCE` | No | Default `localhost` / `SQLEXPRESS`. Set `DB_INSTANCE=` (empty) for a default instance. |
| `DB_NAME` / `DB_USER` | No | Default `breadbank` / `breadbank_user`. |
| `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV` | For Plaid | Bank linking. Without them the app still runs; Plaid routes return 503. Use `PLAID_ENV=sandbox` while developing. |
| `CORS_ORIGIN` | No | Comma-separated allowed origins. Default `http://localhost:9000`. Add your LAN URL to use from a phone. |
| `PORT` | No | API port. Default `3001`. |

> Note: even if you don't use Plaid, `PLAID_ENC_KEY` is required for the server to boot — just generate one and forget it.

---

## Available scripts

Run from the **repo root**:

| Command | Description |
|---|---|
| `npm run dev` | Run backend + frontend together |
| `npm run backend` | API only |
| `npm run frontend` | Web app only |
| `npm run install:all` | Install all dependencies (root + backend + frontend) |
| `npm run kill-ports` | Free ports 3001/3000/9000 if a server is stuck (Linux/macOS; uses `lsof`) |

Production build of the frontend: `cd frontend/breadBank && npm run build` (outputs static files to `dist/spa`).

---

## Deploy on a Linux server (24/7)

The Quick start above is the local/dev flow. To run BreadBank as an **always-on service** on a Linux box (e.g. a home server) — SQL Server in Docker, the API + web app served from a **single port**, managed by systemd so it survives crashes, logouts, and reboots — follow this.

> **One-origin in production.** The backend also serves the built frontend, so there's just **one port** (default `3001`), no CORS, and it works from any device on your network without baking in an IP. You reach everything at `http://<server-ip>:3001`.

**Prerequisites:** Docker and Node.js 20+.

### 1. SQL Server in Docker

Linux SQL Server has **no named instances** — it runs as a *default* instance on port 1433, so `DB_INSTANCE` must be left **empty** in `.env` (see step 3).

```bash
docker run -d --name breadbank-sql \
  -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=Your_Strong_SA_Pass1" \
  -e "MSSQL_PID=Express" \
  -p 1433:1433 \
  -v breadbank-mssql-data:/var/opt/mssql \
  --restart unless-stopped \
  mcr.microsoft.com/mssql/server:2022-latest
```

> Pick the image version that matches any `.bak` you plan to restore — **you can't restore a backup into an older engine** (a SQL Server 2022 backup needs the `2022` image). `--restart unless-stopped` + the persistent volume mean your data and the container survive reboots.

Create the login, database, and tables using the `sqlcmd` bundled in the image (at `/opt/mssql-tools18/bin/sqlcmd`):

```bash
SA='Your_Strong_SA_Pass1'; SQLCMD=/opt/mssql-tools18/bin/sqlcmd
docker cp database/. breadbank-sql:/tmp/db/
docker exec breadbank-sql $SQLCMD -S localhost -U sa -P "$SA" -C \
  -Q "CREATE LOGIN breadbank_user WITH PASSWORD='Your_App_Pass1', CHECK_POLICY=OFF;"
docker exec breadbank-sql $SQLCMD -S localhost -U sa -P "$SA" -C -i /tmp/db/01_schema.sql
docker exec breadbank-sql $SQLCMD -S localhost -U sa -P "$SA" -C -i /tmp/db/02_seed.sql
docker exec breadbank-sql $SQLCMD -S localhost -U sa -P "$SA" -C -d breadbank \
  -Q "CREATE USER breadbank_user FOR LOGIN breadbank_user; ALTER ROLE db_owner ADD MEMBER breadbank_user;"
```

### 2. Build for production (single origin)

Point the frontend at a **relative** API path and build both halves:

```bash
echo 'VITE_API_URL=/api' > frontend/breadBank/.env
npm run install:all
npm --prefix backend run build              # -> backend/dist
npm --prefix frontend/breadBank run build   # -> frontend/breadBank/dist/spa
```

### 3. Configure `backend/.env` (Linux)

Same as the [Environment variables](#environment-variables) reference, but `DB_INSTANCE` **must be empty**:

```
DB_SERVER=localhost
DB_INSTANCE=                 # empty — no named instance on Linux
DB_NAME=breadbank
DB_USER=breadbank_user
DB_PASSWORD=Your_App_Pass1
# ...plus JWT_SECRET, PLAID_ENC_KEY, ANTHROPIC_API_KEY, etc.
```

`node backend/dist/index.js` now serves the API **and** the web app on `PORT`. Open `http://<server-ip>:3001`.

### 4. Run 24/7 with systemd

A **user service** (no root needed). Create `~/.config/systemd/user/breadbank.service`:

```ini
[Unit]
Description=BreadBank (API + web on one origin)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=/home/<you>/breadBankApp/backend
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

> Use the **absolute path to your `node`** in `ExecStart` (`which node` — with nvm it's under `~/.nvm/versions/node/<ver>/bin/node`). `WorkingDirectory` is the **backend** folder so the app finds `backend/.env`.

Enable it, and turn on **linger** so it starts on boot *without anyone logging in*:

```bash
systemctl --user daemon-reload
systemctl --user enable --now breadbank
loginctl enable-linger "$USER"
```

That's it — after a reboot, Docker (enabled on boot) brings the SQL container back via `--restart unless-stopped`, and your lingering user manager starts `breadbank`. Manage it with:

```bash
systemctl --user status breadbank      # is it up?
systemctl --user restart breadbank     # restart
journalctl --user -u breadbank -f      # live logs
```

> If `systemctl --user` ever errors with *"Failed to connect to bus"* (some non-login shells / under `sudo`), run `export XDG_RUNTIME_DIR=/run/user/$(id -u)` first.

### 5. Deploy updates after a `git pull`

The service runs the **compiled build**, not your source — so a pull alone changes nothing until you rebuild and restart:

```bash
npm --prefix backend run build && npm --prefix frontend/breadBank run build && systemctl --user restart breadbank
```

If a pull changes the schema, re-run `database/01_schema.sql` — it's **idempotent** (`IF NOT EXISTS` guards everywhere, never touches existing data):

```bash
docker cp database/01_schema.sql breadbank-sql:/tmp/01_schema.sql
docker exec breadbank-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA" -C -i /tmp/01_schema.sql
```

### 6. Restore a `.bak` (migrating from another machine)

```bash
docker cp mydata.bak breadbank-sql:/var/opt/mssql/backup/mydata.bak
# 1) find the logical file names inside the backup:
docker exec breadbank-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA" -C \
  -Q "RESTORE FILELISTONLY FROM DISK='/var/opt/mssql/backup/mydata.bak'"
# 2) restore (stop the app first so nothing holds the DB open):
systemctl --user stop breadbank
docker exec breadbank-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA" -C -Q \
 "RESTORE DATABASE breadbank FROM DISK='/var/opt/mssql/backup/mydata.bak' WITH \
  MOVE 'breadbank'     TO '/var/opt/mssql/data/breadbank.mdf', \
  MOVE 'breadbank_log' TO '/var/opt/mssql/data/breadbank_log.ldf', REPLACE;"
# 3) re-map the restored DB user to this server's login (fixes the 'orphaned user'), then restart:
docker exec breadbank-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA" -C -d breadbank \
  -Q "ALTER USER breadbank_user WITH LOGIN = breadbank_user; ALTER ROLE db_owner ADD MEMBER breadbank_user;"
systemctl --user start breadbank
```

> **Plaid after a restore:** access tokens in the backup were encrypted with the **original machine's** `PLAID_ENC_KEY`. Put that *exact* key (plus your Plaid client ID / secret / `PLAID_ENV`) into the new `backend/.env`, or sync fails with *"unable to authenticate data"* — otherwise just re-link your banks from the dashboard.

---

## Project structure

```
breadBankApp/
├── backend/            Express + TypeScript API
│   ├── src/routes/     auth, transactions, dashboard, budgets, plaid, ai, ...
│   ├── src/services/   csvParser, aiService, duplicateDetector
│   ├── src/config/     db, auth (JWT), crypto (token encryption), plaid
│   └── src/scripts/    one-off maintenance/migration utilities (see below)
├── frontend/breadBank/ Vue 3 + Quasar app
│   └── src/pages/      Dashboard, Transactions, Budgets, Investments, Settings, ...
├── database/           SQL setup scripts (run in order)
└── package.json        root scripts (dev / install:all / kill-ports)
```

### `backend/src/scripts/`

The `database/*.sql` files already create the **complete** schema, so a fresh install needs nothing here. These TypeScript scripts are maintenance utilities (run with `npx ts-node src/scripts/<name>.ts`):

- `migrate*.ts` — incremental schema migrations (already folded into `01_schema.sql`; only needed to upgrade an **older** database in place).
- `dedupeTransactions.ts`, `dedupePlaidItems.ts`, `cleanupDuplicateAccounts.ts` — clean up duplicate data (e.g. after re-linking a bank or mixing CSV + Plaid). Each runs a dry run first; pass `apply` to commit.
- `addMerchantRule.ts` — add a description→category rule so future imports auto-file a recurring payee, and backfill existing matches. Idempotent. Use the *stable* part of the description (no dates/ref numbers):
  ```bash
  cd backend
  npx ts-node src/scripts/addMerchantRule.ts "ZELLE FROM JANE DOE" "Rent"
  ```
- `migrateMultiUser.ts` — upgrade an **older** single-user database to full per-user data separation: gives each user their own copy of the seeded accounts, and makes Claude usage + the AI budget per-user. Idempotent; fresh installs don't need it.
- `inspect*.ts` — read-only diagnostics.

---

## Good to know

- **Bring your own keys.** Everyone runs BreadBank with their **own** credentials. `ANTHROPIC_API_KEY` is required for the AI features; generate your own `JWT_SECRET` and `PLAID_ENC_KEY` (one-liners in [step 3](#3-configure-the-backend)). Plaid is optional — without it, everything except live bank linking still works.
- **Secrets stay local.** `backend/.env` and `frontend/breadBank/.env` are gitignored and never committed — your API keys, DB password, and tokens live only on your machine. Only the `.env.example` templates are in the repo.
- **Every user gets their own starter accounts.** When you register, BreadBank creates a private set of example accounts for you (Wells Fargo, Apple Card, Discover, Fidelity, Robinhood) so you can start uploading CSVs right away. Ignore them, upload into them, or replace them — they hold no data until you add transactions, and they're never shared with other users.
- **Your data is fully separated per user.** Transactions, accounts, budgets, merchant rules, linked banks, AI spend, and the AI budget are all scoped to the signed-in user — nothing bleeds across accounts. Upgrading a database created before this change? Run `npx ts-node src/scripts/migrateMultiUser.ts` once (see [`backend/src/scripts/`](#backendsrcscripts)).
- **First run = create an account.** There's no default login; click **Create an account** on first launch. You'll also pick a **security question** — it's what lets you reset your own password later (set or change it anytime under Settings → Security question).
- **Forgot your password?** On the login screen, click **Forgot your password?**, enter your email, answer your security question, and set a new one. No email server required.
- **Splitting bills / refunds.** Money coming back to you isn't income — file it under the **same category as the expense**. A roommate Zelling you their share of rent into your **Rent** category (or a store refund into **Shopping**) automatically reduces that category's spending rather than inflating your income. Only credits in the **Income** category count as income. For a recurring payer, add a forward rule once (see [`addMerchantRule.ts`](#backendsrcscripts)) so every future payment is filed automatically.

---

## Troubleshooting

- **`DB_PASSWORD env var is required`** → you didn't fill `backend/.env`.
- **Login/connection fails** → confirm SQL Server allows **SQL authentication**, the `breadbank_user` login exists, and it's a user in the `breadbank` database (step 2).
- **`Port 3001/9000 already in use`** → `npm run kill-ports`, then `npm run dev`.
- **AI features error** → check `ANTHROPIC_API_KEY` and that your Anthropic account has credit (the Settings page shows usage + a low-credit warning).
- **Forgot password / "No security question is set"** → reset needs a security question on the account. If you registered before this feature, sign in and set one under **Settings → Security question**, or reset directly in SQL: `UPDATE users SET password = '<bcrypt-hash>' WHERE email = '...'`.
- **Reaching it from your phone** → run on the same Wi-Fi, set `VITE_API_URL` to your PC's LAN IP, add that origin to `CORS_ORIGIN`, and allow ports 3001/9000 through the firewall.

## Security notes

- Passwords are bcrypt-hashed; the API uses Helmet, rate limiting, and parameterized queries.
- Plaid access tokens are AES-256-GCM encrypted at rest.
- Keep `backend/.env` out of version control (it's gitignored). Use strong, unique values for `JWT_SECRET` and `PLAID_ENC_KEY`.

---

## License

Released under the [MIT License](LICENSE) — free to use, modify, and distribute. Update the copyright name in `LICENSE` to your own.
