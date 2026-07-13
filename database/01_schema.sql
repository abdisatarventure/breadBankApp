-- ============================================================
-- BreadBank Database Schema
-- Run this first in SSMS
-- ============================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'breadbank')
    CREATE DATABASE breadbank;
GO

USE breadbank;
GO

-- ── Users ─────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    email             NVARCHAR(200) NOT NULL UNIQUE,
    password          NVARCHAR(200) NOT NULL,
    name              NVARCHAR(100),
    -- Self-service password reset (no email server needed): the user picks a
    -- question at sign-up and the answer is bcrypt-hashed, never stored plain.
    security_question NVARCHAR(300) NULL,
    security_answer   NVARCHAR(200) NULL,
    created_at        DATETIME DEFAULT GETDATE()
);

-- ── Accounts ──────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='accounts' AND xtype='U')
CREATE TABLE accounts (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    -- NULL = shared/seeded reference account available to every user.
    -- A non-NULL value scopes the account to a single owner.
    user_id     INT REFERENCES users(id),
    name        NVARCHAR(100) NOT NULL,
    type        NVARCHAR(50)  NOT NULL,  -- checking | savings | credit | investment
    institution NVARCHAR(100) NOT NULL,
    created_at  DATETIME DEFAULT GETDATE()
);

-- ── Categories ────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='categories' AND xtype='U')
CREATE TABLE categories (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    -- NULL = shared system category (is_system = 1) visible to every user.
    -- Non-NULL = a category created by and scoped to that user.
    user_id    INT REFERENCES users(id),
    name       NVARCHAR(100) NOT NULL,
    icon       NVARCHAR(50),
    color      NVARCHAR(20),
    is_system  BIT DEFAULT 1,           -- 0 = user-created
    created_at DATETIME DEFAULT GETDATE()
);

-- ── Uploads ───────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='uploads' AND xtype='U')
CREATE TABLE uploads (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    user_id           INT NOT NULL REFERENCES users(id),
    account_id        INT NOT NULL REFERENCES accounts(id),
    filename          NVARCHAR(500) NOT NULL,
    transaction_count INT DEFAULT 0,
    duplicate_count   INT DEFAULT 0,
    created_at        DATETIME DEFAULT GETDATE()
);

-- ── Transactions ──────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='transactions' AND xtype='U')
CREATE TABLE transactions (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    user_id      INT  NOT NULL REFERENCES users(id),
    account_id   INT  NOT NULL REFERENCES accounts(id),
    upload_id    INT  REFERENCES uploads(id),
    date         DATE NOT NULL,
    description  NVARCHAR(500) NOT NULL,
    merchant     NVARCHAR(200),
    amount       DECIMAL(12,2) NOT NULL,
    type         NVARCHAR(10)  NOT NULL,  -- debit | credit
    category_id  INT REFERENCES categories(id),
    notes        NVARCHAR(1000),
    is_recurring BIT DEFAULT 0,
    created_at   DATETIME DEFAULT GETDATE()
);

-- ── Merchant Rules (AI learned mappings) ──────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='merchant_rules' AND xtype='U')
CREATE TABLE merchant_rules (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES users(id),
    merchant_pattern NVARCHAR(200) NOT NULL,
    category_id      INT NOT NULL REFERENCES categories(id),
    created_at       DATETIME DEFAULT GETDATE(),
    CONSTRAINT uq_merchant_rules_user_pattern UNIQUE (user_id, merchant_pattern)
);

-- ── Indexes ───────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_tx_date')
    CREATE INDEX idx_tx_date ON transactions(date DESC);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_tx_account')
    CREATE INDEX idx_tx_account ON transactions(account_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_tx_user')
    CREATE INDEX idx_tx_user ON transactions(user_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_tx_category')
    CREATE INDEX idx_tx_category ON transactions(category_id);
GO

-- ============================================================
-- Feature tables & columns (Plaid bank linking, budgets, AI
-- usage tracking, manual date locks). Idempotent — safe to
-- re-run. New installs get everything from this one file.
-- ============================================================

-- ── Plaid items (one per linked bank login) ───────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='plaid_items' AND xtype='U')
CREATE TABLE plaid_items (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    user_id      INT            NOT NULL REFERENCES users(id),
    item_id      NVARCHAR(100)  NOT NULL,
    access_token NVARCHAR(500)  NOT NULL,   -- AES-256-GCM encrypted at rest
    institution  NVARCHAR(200)  NULL,
    sync_cursor  NVARCHAR(MAX)  NULL,        -- Plaid /transactions/sync cursor
    created_at   DATETIME2      DEFAULT SYSUTCDATETIME()
);

-- ── Budgets (monthly spending limit per category) ─────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='budgets' AND xtype='U')
CREATE TABLE budgets (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT            NOT NULL REFERENCES users(id),
    category_id   INT            NOT NULL REFERENCES categories(id),
    monthly_limit DECIMAL(12,2)  NOT NULL,
    created_at    DATETIME2      DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_budget_user_cat UNIQUE (user_id, category_id)
);

-- ── AI usage (Claude token spend, per user, per calendar month) ─
-- Scoped per user so each person's Claude spend / credit warning is their own.
-- Upgrading an OLDER (month_key-only) database? Run src/scripts/migrateMultiUser.ts.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ai_usage' AND xtype='U')
CREATE TABLE ai_usage (
    user_id       INT       NOT NULL,
    month_key     CHAR(7)   NOT NULL,            -- 'YYYY-MM'
    input_tokens  BIGINT    NOT NULL DEFAULT 0,
    output_tokens BIGINT    NOT NULL DEFAULT 0,
    updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ai_usage PRIMARY KEY (user_id, month_key)
);

-- ── Generic key/value app settings, per user (e.g. AI monthly budget) ─
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_settings' AND xtype='U')
CREATE TABLE app_settings (
    user_id       INT           NOT NULL,
    setting_key   NVARCHAR(100) NOT NULL,
    setting_value NVARCHAR(50)  NULL,
    CONSTRAINT PK_app_settings PRIMARY KEY (user_id, setting_key)
);

-- ── Savings goals (buckets you fund from each month's leftover) ────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='savings_goals' AND xtype='U')
CREATE TABLE savings_goals (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT            NOT NULL REFERENCES users(id),
    name          NVARCHAR(150)  NOT NULL,
    target_amount DECIMAL(12,2)  NOT NULL,
    target_date   DATE           NULL,                 -- optional deadline
    icon          NVARCHAR(50)   NULL,
    color         NVARCHAR(20)   NULL,
    priority      INT            NOT NULL DEFAULT 0,    -- ordering / "fund first"
    created_at    DATETIME2      DEFAULT SYSUTCDATETIME()
);

-- The one built-in "pay yourself first" bucket per user. 20% of each month's
-- leftover is auto-reserved here before any purchase goal can be funded.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='is_reserve' AND Object_ID=Object_ID('savings_goals'))
    ALTER TABLE savings_goals ADD is_reserve BIT NOT NULL DEFAULT 0;

-- ── Savings contributions (the allocation ledger) ─────────────────
-- One row per allocation. The source of truth for both:
--   • "total saved so far" per goal  = SUM(amount) for that goal (persists forever)
--   • "allocated this month"         = SUM(amount) where month_key = current month
-- This lets the Goals tab subtract what's been allocated from this month's net
-- savings (the "unallocated" figure) WITHOUT changing the dashboard's Net Savings.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='savings_contributions' AND xtype='U')
CREATE TABLE savings_contributions (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    user_id    INT            NOT NULL REFERENCES users(id),
    goal_id    INT            NOT NULL REFERENCES savings_goals(id),
    amount     DECIMAL(12,2)  NOT NULL,
    month_key  CHAR(7)        NOT NULL,                -- 'YYYY-MM' the money was allocated
    created_at DATETIME2      DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_sc_goal')
    CREATE INDEX idx_sc_goal ON savings_contributions(goal_id);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_sc_user_month')
    CREATE INDEX idx_sc_user_month ON savings_contributions(user_id, month_key);

-- ── Columns added by Plaid sync + manual date editing ─────
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='plaid_account_id' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD plaid_account_id NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='current_balance' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD current_balance DECIMAL(14,2) NULL;
-- Optional user-entered credit limit per card, for utilization tracking (the
-- 30%-of-limit warning on the dashboard).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='credit_limit' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD credit_limit DECIMAL(14,2) NULL;
-- Archived (hidden) accounts: their transactions are kept for reports/history,
-- but the account is hidden from uploads, credit utilization, and current
-- balances/debt/net worth. A soft "delete" that never loses data.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='is_archived' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD is_archived BIT NOT NULL DEFAULT 0;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='plaid_transaction_id' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD plaid_transaction_id NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='date_overridden' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD date_overridden BIT NOT NULL DEFAULT 0;
-- Historical / backfill rows: included in Reports but excluded from the
-- dashboard's current account balances so a prior-year import doesn't move them.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='is_historical' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD is_historical BIT NOT NULL DEFAULT 0;
-- Links a reimbursement (a credit) to the specific expense it offsets, so a
-- shared cost shows its true net (e.g. rent minus a roommate's Zelle). The
-- linked reimbursement is also moved into the expense's category so category
-- and report totals net out too.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='reimburses_transaction_id' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD reimburses_transaction_id INT NULL;
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_tx_reimburses')
    CREATE INDEX idx_tx_reimburses ON transactions(reimburses_transaction_id);
-- Self-service password reset columns (safe to add to an existing users table).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='security_question' AND Object_ID=Object_ID('users'))
    ALTER TABLE users ADD security_question NVARCHAR(300) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='security_answer' AND Object_ID=Object_ID('users'))
    ALTER TABLE users ADD security_answer NVARCHAR(200) NULL;
GO

PRINT 'Schema created successfully.';
GO
