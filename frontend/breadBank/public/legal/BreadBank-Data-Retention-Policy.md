# BreadBank — Data Retention & Deletion Policy

_Version 1.0 · Effective July 14, 2026 · Reviewed annually_

## Principle

We keep personal and financial data only as long as it is needed to provide the
service to the user, and we give users a self-service way to erase it.

## What we retain, and for how long

| Data | Retention |
|------|-----------|
| Account profile (email, name, hashed password) | For the life of the account |
| Financial data from Plaid (transactions, balances, accounts) | For the life of the account, refreshed on sync |
| Uploaded statement files (parsed) | For the life of the account |
| Consent record (timestamp + policy version) | For the life of the account |
| Operational logs | Rolled over by the host; not retained long-term |

## Deletion

- **User-initiated:** any user can permanently delete their account and all data
  from **Settings → Delete account**. This:
  1. Calls Plaid `/item/remove` for every linked item, so Plaid stops sharing the
     user's data.
  2. Deletes all of the user's rows (transactions, accounts, uploads, goals,
     budgets, categories, merchant rules, Plaid items, usage records) and the
     user record itself, inside a single database transaction.
- **Effect:** deletion is immediate and irreversible. Encrypted database backups,
  if any, age out on their normal rotation and are not restored except for
  disaster recovery.

## Third parties

Data shared with Plaid (bank connectivity) and, when AI features are used,
Anthropic, is governed by their respective retention policies. Removing a Plaid
item stops further data sharing from that institution.

## Review

This policy is reviewed at least annually and whenever data handling materially
changes. Last review: July 14, 2026.
