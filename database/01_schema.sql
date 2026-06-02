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
    id            INT IDENTITY(1,1) PRIMARY KEY,
    email         NVARCHAR(200) NOT NULL UNIQUE,
    password      NVARCHAR(200) NOT NULL,
    name          NVARCHAR(100),
    created_at    DATETIME DEFAULT GETDATE()
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

-- ── AI usage (Claude token spend, per calendar month) ─────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ai_usage' AND xtype='U')
CREATE TABLE ai_usage (
    month_key     CHAR(7)   NOT NULL PRIMARY KEY,   -- 'YYYY-MM'
    input_tokens  BIGINT    NOT NULL DEFAULT 0,
    output_tokens BIGINT    NOT NULL DEFAULT 0,
    updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ── Generic key/value app settings (e.g. AI monthly budget) ─
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_settings' AND xtype='U')
CREATE TABLE app_settings (
    setting_key   NVARCHAR(100) NOT NULL PRIMARY KEY,
    setting_value NVARCHAR(50)  NULL
);

-- ── Columns added by Plaid sync + manual date editing ─────
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='plaid_account_id' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD plaid_account_id NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='current_balance' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD current_balance DECIMAL(14,2) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='plaid_transaction_id' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD plaid_transaction_id NVARCHAR(100) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='date_overridden' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD date_overridden BIT NOT NULL DEFAULT 0;
GO

PRINT 'Schema created successfully.';
GO
