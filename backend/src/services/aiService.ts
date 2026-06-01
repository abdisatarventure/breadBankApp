import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { getPool, sql } from '../config/db';

dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Approximate Claude Opus pricing ($ per token) — used only to estimate spend
// for the credit warning, not for billing.
const PRICE_PER_INPUT_TOKEN  = 15 / 1_000_000;
const PRICE_PER_OUTPUT_TOKEN = 75 / 1_000_000;

// Set when a Claude call fails because the account is out of credits; cleared
// on the next successful call. Exposed via getAiStatus() for the Settings page.
let creditExhaustedAt: Date | null = null;

function isCreditError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  return status === 402 || /credit balance is too low|insufficient (?:credit|funds|balance)|billing/i.test(msg);
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// Accumulate this month's token usage so Settings can estimate spend.
async function recordUsage(inputTokens: number, outputTokens: number): Promise<void> {
  try {
    await getPool().request()
      .input('m', sql.NVarChar(7), currentMonthKey())
      .input('i', sql.BigInt, inputTokens)
      .input('o', sql.BigInt, outputTokens)
      .query(`
        MERGE ai_usage AS t
        USING (SELECT @m AS month_key) AS s ON t.month_key = s.month_key
        WHEN MATCHED THEN UPDATE SET
          input_tokens = t.input_tokens + @i, output_tokens = t.output_tokens + @o, updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (month_key, input_tokens, output_tokens, updated_at)
          VALUES (@m, @i, @o, SYSUTCDATETIME());
      `);
  } catch (e) {
    // Usage tracking must never break an AI feature.
    console.error('Failed to record AI usage:', e);
  }
}

// Single choke point for every Claude call: records usage on success and flags
// credit exhaustion on failure.
async function callClaude(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  try {
    const resp = await anthropic.messages.create(params);
    creditExhaustedAt = null;
    await recordUsage(resp.usage.input_tokens, resp.usage.output_tokens);
    return resp;
  } catch (err) {
    if (isCreditError(err)) creditExhaustedAt = new Date();
    throw err;
  }
}

export interface AiStatus {
  monthKey: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  monthlyBudgetUsd: number | null;
  percentUsed: number | null;
  creditExhausted: boolean;
  creditExhaustedAt: string | null;
  level: 'ok' | 'warning' | 'over' | 'exhausted';
}

export async function getAiStatus(): Promise<AiStatus> {
  const monthKey = currentMonthKey();
  const pool = getPool();

  const usage = await pool.request().input('m', sql.NVarChar(7), monthKey)
    .query(`SELECT input_tokens, output_tokens FROM ai_usage WHERE month_key = @m`);
  const inputTokens  = Number((usage.recordset[0] as { input_tokens?: number } | undefined)?.input_tokens  ?? 0);
  const outputTokens = Number((usage.recordset[0] as { output_tokens?: number } | undefined)?.output_tokens ?? 0);
  const estCostUsd = inputTokens * PRICE_PER_INPUT_TOKEN + outputTokens * PRICE_PER_OUTPUT_TOKEN;

  const budgetRow = await pool.request()
    .query(`SELECT setting_value FROM app_settings WHERE setting_key = 'ai_monthly_budget'`);
  const rawBudget = (budgetRow.recordset[0] as { setting_value?: string } | undefined)?.setting_value;
  const monthlyBudgetUsd = rawBudget != null && rawBudget !== '' ? Number(rawBudget) : null;

  const percentUsed = monthlyBudgetUsd && monthlyBudgetUsd > 0
    ? (estCostUsd / monthlyBudgetUsd) * 100 : null;

  let level: AiStatus['level'] = 'ok';
  if (creditExhaustedAt) level = 'exhausted';
  else if (percentUsed != null && percentUsed >= 100) level = 'over';
  else if (percentUsed != null && percentUsed >= 80) level = 'warning';

  return {
    monthKey, inputTokens, outputTokens, estCostUsd,
    monthlyBudgetUsd, percentUsed,
    creditExhausted: creditExhaustedAt !== null,
    creditExhaustedAt: creditExhaustedAt ? creditExhaustedAt.toISOString() : null,
    level,
  };
}

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

  const response = await callClaude({
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

  const response = await callClaude({
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

  const response = await callClaude({
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
  const response = await callClaude({
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
