-- ============================================================
-- BreadBank Seed Data
-- Run this after 01_schema.sql
-- ============================================================

USE breadbank;
GO

-- ── Default Accounts ──────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM accounts)
BEGIN
    INSERT INTO accounts (name, type, institution) VALUES
    ('Checking',      'checking',   'Wells Fargo'),
    ('Savings',       'savings',    'Wells Fargo'),
    ('Apple Card',    'credit',     'Apple'),
    ('Discover Card', 'credit',     'Discover'),
    ('Robinhood',     'investment', 'Robinhood'),
    ('Fidelity',      'investment', 'Fidelity');
    PRINT 'Accounts seeded.';
END

-- ── Default Categories ────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM categories)
BEGIN
    INSERT INTO categories (name, icon, color, is_system) VALUES
    ('Food & Dining',    'restaurant',          '#E040FB', 1),
    ('Groceries',        'local_grocery_store', '#6C4ED4', 1),
    ('Housing',          'home',                '#3B82F6', 1),
    ('Transportation',   'directions_car',      '#F59E0B', 1),
    ('Entertainment',    'movie',               '#EC4899', 1),
    ('Subscriptions',    'autorenew',           '#8B5CF6', 1),
    ('Shopping',         'shopping_bag',        '#06B6D4', 1),
    ('Health & Medical', 'local_hospital',      '#22C55E', 1),
    ('Travel',           'flight',              '#F97316', 1),
    ('Investments',      'trending_up',         '#10B981', 1),
    ('Income',           'payments',            '#4ADE80', 1),
    ('Personal Care',    'face',                '#A78BFA', 1),
    ('Education',        'school',              '#60A5FA', 1),
    ('Transfer',         'swap_horiz',          '#64748B', 1),
    ('Unknown',          'help_outline',        '#6E6E9A', 1);
    PRINT 'Categories seeded.';
END

-- Ensure the Transfer category exists even on databases seeded before it
-- was added (used to flag credit-card payments and internal transfers,
-- which are excluded from income/spending totals).
IF NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Transfer')
BEGIN
    INSERT INTO categories (name, icon, color, is_system)
    VALUES ('Transfer', 'swap_horiz', '#64748B', 1);
    PRINT 'Transfer category added.';
END

-- Ensure Parking category exists for parking-related transactions
IF NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Parking')
BEGIN
    INSERT INTO categories (name, icon, color, is_system)
    VALUES ('Parking', 'local_parking', '#F87171', 1);
    PRINT 'Parking category added.';
END

PRINT 'Seed data complete.';
GO
