-- ============================================================
-- BreadBank Reset (DESTRUCTIVE)
-- Run this BEFORE re-running 01_schema.sql when an older database
-- (created without user_id columns) already exists.
--
-- Drops the data tables in FK-dependency order so 01_schema.sql can
-- recreate them with the new user_id ownership columns. The `users`
-- table is intentionally KEPT so existing logins keep working.
--
-- Run order:  00_reset.sql  ->  01_schema.sql  ->  02_seed.sql
-- ============================================================

USE breadbank;
GO

-- Children first (they reference the tables below via foreign keys).
IF OBJECT_ID('merchant_rules', 'U') IS NOT NULL DROP TABLE merchant_rules;
IF OBJECT_ID('transactions',   'U') IS NOT NULL DROP TABLE transactions;
IF OBJECT_ID('uploads',        'U') IS NOT NULL DROP TABLE uploads;
IF OBJECT_ID('accounts',       'U') IS NOT NULL DROP TABLE accounts;
IF OBJECT_ID('categories',     'U') IS NOT NULL DROP TABLE categories;

PRINT 'Reset complete — data tables dropped (users preserved). Now run 01_schema.sql then 02_seed.sql.';
GO
