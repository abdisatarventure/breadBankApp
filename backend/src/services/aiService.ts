import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Housing', 'Transportation',
  'Entertainment', 'Subscriptions', 'Shopping', 'Health & Medical',
  'Travel', 'Investments', 'Income', 'Personal Care', 'Education',
  'Transfer', 'Unknown',
];

// ── Categorize transactions ────────────────────────────────────────

interface TxInput { description: string; amount: number; }
interface CatResult { index: number; category: string; merchant: string; }

export async function categorizeTransactions(txs: TxInput[], accountType?: string): Promise<CatResult[]> {
  if (txs.length === 0) return [];

  const accountNote = accountType === 'credit'
    ? '\nNOTE: These are CREDIT-CARD transactions. A positive amount / payment toward the card is you paying off the card from another account → Transfer (NOT Income).'
    : '';

  const prompt = `You are a personal finance categorizer. Assign each transaction to one category from this list:
${CATEGORIES.join(', ')}
${accountNote}
Rules:
- "Transfer" means money moving between your OWN accounts — it is NOT income or spending. Use it for:
    • Credit-card payments: "APPLECARD GSBANK PAYMENT", "DISCOVER E-PAYMENT", "CREDIT CARD PAYMENT", "AMEX EPAYMENT", any "... CARD PAYMENT"
    • Internal bank transfers: "ONLINE TRANSFER TO/FROM ... SAVINGS/CHECKING", "APPLE CASH BANK XFER", "APPLE CASH SENT"
- Real income (Income) = paychecks/deposits from someone else: "PAYROLL", "DIRECT DEP", "ACH CREDIT", tax refunds ("IRS TREAS", "TAXRFD"). Do NOT mark card payments or self-transfers as Income.
- Netflix, Spotify, Hulu, Apple One, gym memberships → Subscriptions
- Whole Foods, Trader Joe's, grocery stores → Groceries (not Food & Dining)
- Restaurants, fast food, coffee shops → Food & Dining
- Uber/Lyft rides → Transportation
- Amazon purchases → Shopping (not always groceries)
- If truly unclear → Unknown

Return ONLY a JSON array (no markdown, no explanation):
[{"index":0,"category":"...","merchant":"clean short merchant name"},...]

Transactions:
${txs.map((t, i) => `${i}. "${t.description}" $${Math.abs(t.amount).toFixed(2)}`).join('\n')}`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';

  try {
    return JSON.parse(text) as CatResult[];
  } catch {
    return txs.map((t, i) => ({ index: i, category: 'Unknown', merchant: t.description }));
  }
}

// ── Monthly summary ────────────────────────────────────────────────

export interface SummaryData {
  month: string;
  totalSpending: number;
  totalIncome: number;
  previousMonthSpending: number;
  topCategory: string;
  topCategoryAmount: number;
  topMerchant: string;
  topMerchantAmount: number;
  subscriptionCount: number;
  subscriptionTotal: number;
  savingsRate: number;
}

export async function generateMonthlySummary(data: SummaryData): Promise<string> {
  const change = data.previousMonthSpending > 0
    ? ((data.totalSpending - data.previousMonthSpending) / data.previousMonthSpending * 100).toFixed(0)
    : null;

  const prompt = `Write a 2-3 sentence personal finance summary for ${data.month}. Be conversational, specific with numbers. Use **bold** for key dollar amounts. No headers or labels — just the paragraph.

Data:
- Spending: $${data.totalSpending.toFixed(2)}${change ? ` (${change}% vs last month)` : ''}
- Income: $${data.totalIncome.toFixed(2)}
- Top category: ${data.topCategory} at $${data.topCategoryAmount.toFixed(2)}
- Top merchant: ${data.topMerchant} at $${data.topMerchantAmount.toFixed(2)}
- Subscriptions: ${data.subscriptionCount} active, $${data.subscriptionTotal.toFixed(2)}/mo
- Savings rate: ${data.savingsRate.toFixed(0)}%`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0]?.type === 'text' ? response.content[0].text : '';
}

// ── Next month suggestions ─────────────────────────────────────────

export interface SuggestionsData extends SummaryData {
  categoryBreakdown: { category: string; amount: number }[];
  unusedSubscriptions: string[];
}

export async function generateSuggestions(data: SuggestionsData): Promise<string[]> {
  const prompt = `Based on this ${data.month} spending, give exactly 3 specific actionable suggestions for next month. Each is one sentence. Start with a concrete number or percentage. No generic advice.

Top categories: ${data.categoryBreakdown.slice(0, 5).map(c => `${c.category} $${c.amount.toFixed(0)}`).join(', ')}
Savings rate: ${data.savingsRate.toFixed(0)}%
Unused subscriptions: ${data.unusedSubscriptions.join(', ') || 'none'}

Return ONLY a JSON array of 3 strings:
["suggestion 1","suggestion 2","suggestion 3"]`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';

  try {
    return JSON.parse(text) as string[];
  } catch {
    return ['Review your top spending categories and set a monthly limit for each.'];
  }
}

// ── Natural language Q&A ───────────────────────────────────────────

export async function answerFinanceQuestion(question: string, context: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `You are a personal finance assistant. Answer concisely based on the data provided.

Financial context:
${context}

Question: ${question}`,
    }],
  });

  return response.content[0]?.type === 'text' ? response.content[0].text : 'Unable to answer at this time.';
}
