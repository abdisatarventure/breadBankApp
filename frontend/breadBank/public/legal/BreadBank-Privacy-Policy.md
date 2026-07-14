# BreadBank — Privacy Policy

_Version 1.0 · Last updated July 14, 2026 · Contact: abdisatar.venture@gmail.com_

BreadBank ("we", "the app") is a personal-finance dashboard that helps you see
your spending, budgets, savings goals and net worth in one place. This policy
explains what data we collect, why, who we share it with, and the control you
have over it.

## 1. What we collect

- **Account details** — your email address, a display name, a hashed password,
  and (optionally) a hashed security-question answer.
- **Financial data via Plaid** — when you connect a bank, card or brokerage
  through Plaid, we receive transactions, balances, account and holding details
  for the accounts you choose to link.
- **Files you upload** — CSV statements you import are parsed into transactions
  and stored in your account.
- **Usage records** — minimal operational data such as AI-feature usage counts.

## 2. How we use it

Your data is used solely to provide the app to you: categorizing transactions,
showing budgets, goals, bills, reports and net worth. We do **not** sell your
data or use it for advertising.

## 3. Who we share it with

- **Plaid Inc.** — provides the secure bank-connection service. Your bank
  credentials are entered directly into Plaid and are never seen or stored by us;
  we only hold the resulting access token (encrypted) and the account data Plaid
  returns. See Plaid's privacy policy at plaid.com/legal.
- **Anthropic (Claude)** — if you use the optional AI features (AI chat, smart
  categorization or savings suggestions), the relevant financial context for that
  request is sent to Anthropic's API to generate a response. Don't use those
  features if you'd prefer no data leave the app.

We share data with no one else except where required by law.

## 4. How we protect it

- Passwords and security answers are **hashed** (bcrypt) — never stored in plain
  text.
- Plaid access tokens are **encrypted at rest** (AES-256-GCM).
- Access to your data is scoped to your account only; every request is
  authenticated.
- Traffic is served over encrypted transport (HTTPS/TLS).

## 5. Data retention & deletion

We keep your data only while your account is active. You can permanently delete
your account and all associated data at any time from **Settings → Delete
account**. Doing so disconnects your linked Plaid items (so Plaid stops sharing
data) and erases your transactions, accounts, goals, budgets and profile from our
database. See our Data Retention Policy for details.

## 6. Your consent

When you create an account you consent to the collection, processing and storage
of your data as described here. Connecting a bank through Plaid is an additional,
explicit choice you make per institution.

## 7. Contact

Questions or a data request? Contact the operator at abdisatar.venture@gmail.com.
