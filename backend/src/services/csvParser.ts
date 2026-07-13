import { parse } from 'csv-parse/sync';

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  // Optional category hint set by the parser (e.g. 'Transfer' for credit-card
  // payments and internal account transfers). When set, upload skips the
  // merchant-rule lookup and AI categorization for this row.
  category?: string;
}

// ── Transfer detection ──────────────────────────────────────────────
// A "transfer" is money moving between your own accounts — it is neither
// income nor spending and must be excluded from both totals. The two cases
// we care about:
//   1. Credit-card payments (paying off Apple Card / Discover / etc.)
//   2. Internal bank transfers (checking <-> savings, Apple Cash top-ups)

const CARD_PAYMENT_PATTERNS: RegExp[] = [
  /APPLECARD\s+GSBANK\s+PAYMENT/i,   // Wells Fargo wording for Apple Card payment
  /APPLE\s*CARD.*PAYMENT/i,
  /DISCOVER\s+E-?\s*PAYMENT/i,       // "DISCOVER E-PAYMENT"
  /DISCOVER.*PAYMENT/i,
  /CHASE\s+CREDIT\s+C(RD|ARD)/i,
  /CAPITAL\s+ONE.*(PAYMENT|CRCARDPMT)/i,
  /(AMEX|AMERICAN\s+EXPRESS).*(PAYMENT|EPAYMENT)/i,
  /CITI\s+CARD.*PAYMENT/i,
  /CREDIT\s+CARD\s+PAYMENT/i,
  /CARDMEMBER\s+SERV.*PAYMENT/i,
];

const INTERNAL_TRANSFER_PATTERNS: RegExp[] = [
  // Transfers to/from your OWN savings or checking only. We deliberately do
  // NOT match a bare "ONLINE TRANSFER REF ... TO <merchant>" because that is
  // a bill-pay to an external party (real spending), not a self-transfer.
  /ONLINE\s+TRANSFER\s+(TO|FROM).*(SAVINGS|CHECKING)/i,
  /WFB\s+OPENING\s+DEPOSIT.*TRANSFER/i,
  /APPLE\s+CASH/i,                            // any Apple Cash wallet load/unload
                                             // (e.g. "TRANSFER APPLE CASH S CUPERTINO",
                                             //  "APPLE CASH BANK XFER", "APPLE CASH SENT")
];

// A transfer that moves money to/from your SAVINGS account specifically. Only
// the checking-side leg names the savings account ("...TO/FROM ... SAVINGS");
// the mirror leg on the savings account names CHECKING, so this matches exactly
// one leg and won't double-count. Bucketed as 'Savings' so it's visible and the
// dashboard can show how much you've set aside.
const SAVINGS_TRANSFER_PATTERNS: RegExp[] = [
  /ONLINE\s+TRANSFER\s+(TO|FROM).*SAVINGS/i,
];

/** Returns true if a transfer moves money to/from your savings account. */
export function isSavingsTransfer(description: string): boolean {
  return SAVINGS_TRANSFER_PATTERNS.some(re => re.test(description));
}

/** Returns true if a Wells-Fargo-style description is a self-transfer. */
export function isTransferDescription(description: string): boolean {
  return (
    CARD_PAYMENT_PATTERNS.some(re => re.test(description)) ||
    INTERNAL_TRANSFER_PATTERNS.some(re => re.test(description))
  );
}

/** Returns true if a description looks like a credit-card payment specifically. */
export function isCardPayment(description: string): boolean {
  return CARD_PAYMENT_PATTERNS.some(re => re.test(description));
}

// The credit that LANDS ON a card when you pay it (the mirror of the bank-side
// payment). Ignored so it never looks like income. e.g. Discover's
// "INTERNET PAYMENT - THANK YOU", or "AUTOPAY PAYMENT - THANK YOU".
const PAYMENT_RECEIVED_PATTERNS: RegExp[] = [
  /INTERNET\s+PAYMENT/i,
  /THANK\s*YOU/i,
];

/** Returns true if a credit is a payment landing on a card (not income). */
export function isPaymentReceived(description: string): boolean {
  return PAYMENT_RECEIVED_PATTERNS.some(re => re.test(description));
}

// ── Refund detection ────────────────────────────────────────────────
// A refund is inbound money that gives back a prior charge (a merchant return,
// a reversal, a tax refund). It must NOT count as income, and it offsets
// spending — so it gets its own 'Refund' category (excluded from income,
// netted out of spending). Only meaningful on credits (money coming in).
const REFUND_PATTERNS: RegExp[] = [
  /\bTAX\s+REF(UND)?\b/i,   // IRS / state tax refund (e.g. "IRS TREAS 310 TAX REF")
  /IRS\s+TREAS\s+310/i,     // IRS refund ACH descriptor
  /TAX\s*RFD|TAXRFD/i,      // state refund ACH descriptors (e.g. MN's "MNSTTAXRFD")
  /\bREFUND\b/i,            // explicit merchant / vendor refund
];

/** Returns true if a credit description looks like a refund. */
export function isRefundDescription(description: string): boolean {
  return REFUND_PATTERNS.some(re => re.test(description));
}

// ── RSM payday snapping ─────────────────────────────────────────────
// RSM pays on the 1st and 15th, but a direct deposit can post a few days early
// (e.g. Jan 30 for the Feb 1 check, or Feb 13 for the Feb 15 check), which lands
// the income in the wrong month/half and distorts monthly income. Snap an RSM
// paycheck to the nearest scheduled payday so it counts in the period it's for.
export function isRsmPayroll(description: string): boolean {
  return /RSM.*PAYROLL/i.test(description);
}

/** Snap a date to the nearest scheduled payday: the 1st or 15th of the
 *  surrounding months (uses local-midnight dates to match the CSV parser). */
export function snapPaydayDate(d: Date): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const candidates = [
    new Date(y, m - 1, 15), // previous month, 15th
    new Date(y, m, 1),      // this month, 1st
    new Date(y, m, 15),     // this month, 15th
    new Date(y, m + 1, 1),  // next month, 1st
  ];
  let best = candidates[0]!;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = Math.abs(c.getTime() - d.getTime());
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }
  return best;
}

// ── Income detection ────────────────────────────────────────────────
// Incoming money that is genuine income: payroll, and Zelle from a business /
// organization (an LLC/INC/etc.) rather than a person. Keeping these off the
// spending side stops the AI from filing them under Rent/Shopping/etc. as
// credits that wrongly reduce spend.
const INCOME_PATTERNS: RegExp[] = [
  /PAYROLL/i,
  /ZELLE\s+FROM\b.*\b(LLC|INC|CORP|LTD|COMPANY)\b/i,  // business/org Zelle = income
];

/** Returns true if a credit description looks like genuine income. */
export function isIncomeDescription(description: string): boolean {
  return INCOME_PATTERNS.some(re => re.test(description));
}

// ── Reimbursement detection ─────────────────────────────────────────
// Person-to-person Zelle you received — money a friend/roommate paid you back.
// Treated as a reimbursement that OFFSETS (reduces) your spending, not as income.
// Business Zelle is caught by the income rule above first, so this only matches
// money paid back to you by a person.
const REIMBURSEMENT_PATTERNS: RegExp[] = [
  /ZELLE\s+FROM/i,
];

/** Returns true if a credit description looks like a person-to-person payback. */
export function isReimbursementDescription(description: string): boolean {
  return REIMBURSEMENT_PATTERNS.some(re => re.test(description));
}

// ── Self-transfer by name ───────────────────────────────────────────
// Zelle between YOUR OWN banks (e.g. Wells Fargo ↔ Capital One) names you as
// the counterparty: "ZELLE FROM ABRAR MOHAMED" on the receiving side, or —
// in Capital One's format — a row whose whole description is just your name.
// That's your own money moving, a Transfer, never income or a reimbursement.
// Matches on the owner's FIRST registered name so relatives sharing a surname
// ("ZELLE FROM AMNA MOHAMED") don't get swallowed as transfers.
export function isSelfTransfer(description: string, ownerName?: string | null): boolean {
  const first = ((ownerName ?? '').trim().split(/\s+/)[0] ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  if (first.length < 3) return false;
  if (!new RegExp(`\\b${first}\\b`, 'iu').test(description)) return false;
  if (/ZELLE\s+(FROM|TO)/i.test(description)) return true;
  // A bare person-name row (Capital One writes the Zelle leg as just the name).
  const t = description.trim();
  return /^[\p{L} .'-]+$/u.test(t) && t.split(/\s+/).length <= 4;
}

/**
 * The category hint for a parsed row. Precedence: transfers first (a card
 * payment reversal is still a transfer), then — for credits only — income
 * (payroll / business Zelle), reimbursements (person Zelle), and refunds.
 * Returns {} when there's nothing to hint, so callers can spread it.
 * Pass the account owner's registered name so Zelle between their own banks
 * is filed as a Transfer instead of income/reimbursement.
 */
export function categoryHint(description: string, type: 'debit' | 'credit', ownerName?: string | null): { category?: string } {
  // Paying off a card FROM a bank account (money out) → its own visible bucket,
  // excluded from spending (the card's purchases are the real spending).
  if (type === 'debit' && isCardPayment(description)) return { category: 'Credit Card Payment' };
  // Money moved to/from your savings → its own visible bucket (checked before the
  // generic transfer rule, which would otherwise also match it).
  if (isSavingsTransfer(description)) return { category: 'Savings' };
  // Money you Zelle'd between your own banks → transfer, checked before the
  // income/reimbursement rules that would otherwise claim it.
  if (isSelfTransfer(description, ownerName)) return { category: 'Transfer' };
  // The mirror credit that lands ON the card → ignored so it isn't seen as income.
  if (type === 'credit' && isPaymentReceived(description)) return { category: 'Transfer' };
  if (isTransferDescription(description)) return { category: 'Transfer' };
  if (type === 'credit' && isIncomeDescription(description)) return { category: 'Income' };
  if (type === 'credit' && isReimbursementDescription(description)) return { category: 'Reimbursement' };
  if (type === 'credit' && isRefundDescription(description)) return { category: 'Refund' };
  return {};
}

function parseDate(raw: string): Date | null {
  const s = raw.replace(/"/g, '').trim();
  if (!s) return null;
  // ISO (YYYY-MM-DD, Capital One cards): build from parts at LOCAL midnight —
  // new Date('2026-07-01') parses as UTC and shifts the calendar day back one
  // in US timezones when stored.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const parts = s.split('/');
  let d: Date;
  if (parts.length === 3) {
    const [m, day, y] = parts;
    let year = Number(y);
    if (year < 100) year += 2000; // MM/DD/YY (Capital One 360) → 2026, not 1926
    d = new Date(year, Number(m) - 1, Number(day));
  } else {
    d = new Date(s);
  }
  return isNaN(d.getTime()) ? null : d;
}

// Case/spacing-insensitive column lookup, tried in order of preference —
// bank exports are inconsistent about header capitalization and whitespace.
function field(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === name.toLowerCase()) return (row[key] ?? '').trim();
    }
  }
  return '';
}

// Wells Fargo supports two export layouts:
//   Format A (legacy): Date, Amount, *, *, Description
//   Format B (current): DATE, DESCRIPTION, AMOUNT, CHECK #, STATUS
export function parseWellsFargo(csv: string, ownerName?: string | null): ParsedTransaction[] {
  const rows = parse(csv, { skip_empty_lines: true, trim: true, relax_quotes: true }) as string[][];
  const out: ParsedTransaction[] = [];

  // Detect format by inspecting the first row
  const firstRow = rows[0]?.map(c => c.replace(/"/g, '').trim().toUpperCase()) ?? [];
  // Format B has "DESCRIPTION" in column 1; Format A has a numeric-looking amount there
  const isFormatB = firstRow[1] === 'DESCRIPTION' || firstRow[2] === 'AMOUNT';

  for (const row of rows) {
    const dateStr = (row[0] ?? '').replace(/"/g, '').trim();

    // Skip header rows
    if (dateStr.toUpperCase() === 'DATE' || dateStr.toUpperCase() === 'TRANS DATE') continue;
    if (!dateStr) continue;

    let amtStr: string;
    let desc: string;

    if (isFormatB) {
      // Format B: DATE(0), DESCRIPTION(1), AMOUNT(2), CHECK#(3), STATUS(4)
      desc   = (row[1] ?? '').replace(/"/g, '').trim();
      amtStr = (row[2] ?? '').replace(/[",]/g, '').trim();
    } else {
      // Format A: DATE(0), AMOUNT(1), *(2), *(3), DESCRIPTION(4)
      amtStr = (row[1] ?? '').replace(/[",]/g, '').trim();
      desc   = (row[4] ?? row[3] ?? row[2] ?? '').replace(/"/g, '').trim();
    }

    const amount = parseFloat(amtStr);
    if (isNaN(amount)) continue;

    const parsedDate = parseDate(dateStr);
    if (!parsedDate) continue;

    out.push({
      date: isRsmPayroll(desc) ? snapPaydayDate(parsedDate) : parsedDate,
      description: desc,
      amount: Math.abs(amount),
      type: amount < 0 ? 'debit' : 'credit',
      ...categoryHint(desc, amount < 0 ? 'debit' : 'credit', ownerName),
    });
  }
  return out;
}

// Apple Card: Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)
export function parseAppleCard(csv: string): ParsedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  return rows
    .filter(r => r['Transaction Date'] && r['Amount (USD)'])
    .reduce<ParsedTransaction[]>((acc, r) => {
      const parsedDate = parseDate(r['Transaction Date'] ?? '');
      if (!parsedDate) return acc;
      const amount = parseFloat((r['Amount (USD)'] ?? '0').replace(/,/g, ''));
      if (isNaN(amount)) return acc;
      const isPayment = (r['Type'] ?? '').toLowerCase() === 'payment';
      acc.push({
        date: parsedDate,
        description: r['Description'] ?? r['Merchant'] ?? '',
        amount: Math.abs(amount),
        type: (isPayment ? 'credit' : 'debit') as 'debit' | 'credit',
        // A payment to the card is you paying it off from another account —
        // a transfer, not income.
        ...(isPayment ? { category: 'Transfer' } : {}),
      });
      return acc;
    }, []);
}

// Discover: Trans. Date, Post Date, Description, Amount, Category
export function parseDiscover(csv: string): ParsedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  return rows
    .filter(r => (r['Trans. Date'] ?? r['Transaction Date']) && r['Amount'])
    .reduce<ParsedTransaction[]>((acc, r) => {
      const parsedDate = parseDate(r['Trans. Date'] ?? r['Transaction Date'] ?? '');
      if (!parsedDate) return acc;
      const amount = parseFloat((r['Amount'] ?? '0').replace(/,/g, ''));
      if (isNaN(amount)) return acc;
      // Discover: positive amount = purchase (debit), negative = payment/credit.
      const desc      = r['Description'] ?? '';
      const isPayment = amount < 0 && /PAYMENT|DIRECTPAY|THANK\s*YOU/i.test(desc);
      acc.push({
        date: parsedDate,
        description: desc,
        amount: Math.abs(amount),
        type: (amount > 0 ? 'debit' : 'credit') as 'debit' | 'credit',
        // Paying off the Discover card is a transfer, not income.
        ...(isPayment ? { category: 'Transfer' } : {}),
      });
      return acc;
    }, []);
}

// Capital One — two export layouts, detected by their headers:
//   Credit card: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
//                (ISO dates; purchases in the Debit column, payments/returns in Credit)
//   360 bank:    Account Number, Transaction Date, Transaction Amount, Transaction Type,
//                Transaction Description, Balance   (signed amount, MM/DD/YY dates)
export function parseCapitalOne(csv: string, ownerName?: string | null): ParsedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  const out: ParsedTransaction[] = [];

  for (const r of rows) {
    const parsedDate = parseDate(field(r, 'Transaction Date', 'Posted Date'));
    if (!parsedDate) continue;
    const desc = field(r, 'Description', 'Transaction Description');
    if (!desc) continue;

    const debit  = field(r, 'Debit');
    const credit = field(r, 'Credit');
    const signed = field(r, 'Transaction Amount');
    let amount: number;
    let type: 'debit' | 'credit';
    let isCardLayout = false;

    if (debit || credit) {
      isCardLayout = true;
      amount = parseFloat((debit || credit).replace(/[$,]/g, ''));
      type = debit ? 'debit' : 'credit';
    } else if (signed) {
      const n = parseFloat(signed.replace(/[$,]/g, ''));
      if (isNaN(n)) continue;
      amount = Math.abs(n);
      const t = field(r, 'Transaction Type');
      type = t ? (/credit/i.test(t) ? 'credit' : 'debit') : (n < 0 ? 'debit' : 'credit');
    } else {
      continue;
    }
    if (isNaN(amount) || amount === 0) continue;

    // A payment landing ON the card is you paying it off — a transfer.
    const isCardPmt = isCardLayout && type === 'credit'
      && /(PYMT|PAYMENT|AUTOPAY)/i.test(`${desc} ${field(r, 'Category')}`);
    out.push({
      date: parsedDate, description: desc, amount, type,
      ...(isCardPmt ? { category: 'Transfer' } : categoryHint(desc, type, ownerName)),
    });
  }
  return out;
}

// Chase — two export layouts, detected by their headers:
//   Credit card: Transaction Date, Post Date, Description, Category, Type, Amount, Memo
//                (negative = purchase, positive = payment/return)
//   Bank:        Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
//                (negative = money out)
export function parseChase(csv: string, ownerName?: string | null): ParsedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  const out: ParsedTransaction[] = [];

  for (const r of rows) {
    const parsedDate = parseDate(field(r, 'Transaction Date', 'Posting Date', 'Post Date'));
    if (!parsedDate) continue;
    const desc = field(r, 'Description');
    const n = parseFloat(field(r, 'Amount').replace(/[$,]/g, ''));
    if (!desc || isNaN(n) || n === 0) continue;

    // Both layouts sign the amount the same way: negative is money out.
    const type: 'debit' | 'credit' = n < 0 ? 'debit' : 'credit';
    const isCardLayout = !!field(r, 'Post Date');
    const isCardPmt = isCardLayout && type === 'credit'
      && /payment/i.test(`${field(r, 'Type')} ${desc}`);
    out.push({
      date: parsedDate, description: desc, amount: Math.abs(n), type,
      ...(isCardPmt ? { category: 'Transfer' } : categoryHint(desc, type, ownerName)),
    });
  }
  return out;
}

// American Express — Date, Description, Amount, plus optional columns in the
// extended export (Card Member, Account #, Category, …). POSITIVE amount = a
// charge, negative = a payment/credit landing on the card.
export function parseAmex(csv: string, ownerName?: string | null): ParsedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  const out: ParsedTransaction[] = [];

  for (const r of rows) {
    const parsedDate = parseDate(field(r, 'Date'));
    if (!parsedDate) continue;
    const desc = field(r, 'Description');
    const n = parseFloat(field(r, 'Amount').replace(/[$,]/g, ''));
    if (!desc || isNaN(n) || n === 0) continue;

    const type: 'debit' | 'credit' = n >= 0 ? 'debit' : 'credit';
    const isCardPmt = type === 'credit' && /(PAYMENT|AUTOPAY|THANK\s*YOU)/i.test(desc);
    out.push({
      date: parsedDate, description: desc, amount: Math.abs(n), type,
      ...(isCardPmt ? { category: 'Transfer' } : categoryHint(desc, type, ownerName)),
    });
  }
  return out;
}

export function parseCSV(csv: string, accountType: string, ownerName?: string | null): ParsedTransaction[] {
  // Strip a leading UTF-8 BOM. Excel/Discover/Apple exports often prepend one,
  // which otherwise corrupts the first column's header (e.g. "Trans. Date"
  // becomes "Trans. Date") and makes every header-keyed lookup miss.
  if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);

  switch (accountType) {
    case 'apple-card':   return parseAppleCard(csv);
    case 'discover':     return parseDiscover(csv);
    case 'capital-one':  return parseCapitalOne(csv, ownerName);
    case 'chase':        return parseChase(csv, ownerName);
    case 'amex':         return parseAmex(csv, ownerName);
    case 'wells-fargo':
    default:             return parseWellsFargo(csv, ownerName);
  }
}
