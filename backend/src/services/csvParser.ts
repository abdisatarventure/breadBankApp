import { parse } from 'csv-parse/sync';

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
}

function parseDate(raw: string): Date {
  const s = raw.replace(/"/g, '').trim();
  const parts = s.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(s);
}

// Wells Fargo: "Date","Amount","*","*","Description"
export function parseWellsFargo(csv: string): ParsedTransaction[] {
  const rows = parse(csv, { skip_empty_lines: true, trim: true, relax_quotes: true }) as string[][];
  const out: ParsedTransaction[] = [];

  for (const row of rows) {
    const dateStr = (row[0] ?? '').replace(/"/g, '');
    const amtStr  = (row[1] ?? '').replace(/[",]/g, '');
    const desc    = (row[4] ?? row[3] ?? row[2] ?? '').replace(/"/g, '').trim();

    const amount = parseFloat(amtStr);
    if (isNaN(amount) || !dateStr || dateStr.toLowerCase() === 'date') continue;

    out.push({
      date: parseDate(dateStr),
      description: desc,
      amount: Math.abs(amount),
      type: amount < 0 ? 'debit' : 'credit',
    });
  }
  return out;
}

// Apple Card: Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)
export function parseAppleCard(csv: string): ParsedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  return rows
    .filter(r => r['Transaction Date'] && r['Amount (USD)'])
    .map(r => {
      const amount = parseFloat((r['Amount (USD)'] ?? '0').replace(',', ''));
      const isPayment = (r['Type'] ?? '').toLowerCase() === 'payment';
      return {
        date: parseDate(r['Transaction Date'] ?? ''),
        description: r['Description'] ?? r['Merchant'] ?? '',
        amount: Math.abs(amount),
        type: (isPayment ? 'credit' : 'debit') as 'debit' | 'credit',
      };
    });
}

// Discover: Trans. Date, Post Date, Description, Amount, Category
export function parseDiscover(csv: string): ParsedTransaction[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  return rows
    .filter(r => (r['Trans. Date'] ?? r['Transaction Date']) && r['Amount'])
    .map(r => {
      const amount = parseFloat((r['Amount'] ?? '0').replace(',', ''));
      return {
        date: parseDate(r['Trans. Date'] ?? r['Transaction Date'] ?? ''),
        description: r['Description'] ?? '',
        amount: Math.abs(amount),
        type: (amount > 0 ? 'debit' : 'credit') as 'debit' | 'credit',
      };
    });
}

export function parseCSV(csv: string, accountType: string): ParsedTransaction[] {
  switch (accountType) {
    case 'apple-card':   return parseAppleCard(csv);
    case 'discover':     return parseDiscover(csv);
    case 'wells-fargo':
    default:             return parseWellsFargo(csv);
  }
}
