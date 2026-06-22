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
  /APPLE\s+CASH\s+BANK\s+XFER/i,              // money pulled back from Apple Cash
  /APPLE\s+CASH\s+SENT/i,                     // money pushed to Apple Cash
];

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

function parseDate(raw: string): Date | null {
  const s = raw.replace(/"/g, '').trim();
  if (!s) return null;
  const parts = s.split('/');
  let d: Date;
  if (parts.length === 3) {
    const [m, day, y] = parts;
    d = new Date(Number(y), Number(m) - 1, Number(day));
  } else {
    d = new Date(s);
  }
  return isNaN(d.getTime()) ? null : d;
}

// Wells Fargo supports two export layouts:
//   Format A (legacy): Date, Amount, *, *, Description
//   Format B (current): DATE, DESCRIPTION, AMOUNT, CHECK #, STATUS
export function parseWellsFargo(csv: string): ParsedTransaction[] {
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
      date: parsedDate,
      description: desc,
      amount: Math.abs(amount),
      type: amount < 0 ? 'debit' : 'credit',
      ...(isTransferDescription(desc) ? { category: 'Transfer' } : {}),
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

export function parseCSV(csv: string, accountType: string): ParsedTransaction[] {
  // Strip a leading UTF-8 BOM. Excel/Discover/Apple exports often prepend one,
  // which otherwise corrupts the first column's header (e.g. "Trans. Date"
  // becomes "Trans. Date") and makes every header-keyed lookup miss.
  if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);

  switch (accountType) {
    case 'apple-card':   return parseAppleCard(csv);
    case 'discover':     return parseDiscover(csv);
    case 'wells-fargo':
    default:             return parseWellsFargo(csv);
  }
}
