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

PRINT 'Schema created successfully.';
GO
