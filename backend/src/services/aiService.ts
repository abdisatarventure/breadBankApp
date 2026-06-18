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

// Accumulate this month's token usage per user so Settings can estimate spend.
async function recordUsage(userId: number, inputTokens: number, outputTokens: number): Promise<void> {
  try {
    await getPool().request()
      .input('u', sql.Int, userId)
      .input('m', sql.NVarChar(7), currentMonthKey())
      .input('i', sql.BigInt, inputTokens)
      .input('o', sql.BigInt, outputTokens)
      .query(`
        MERGE ai_usage AS t
        USING (SELECT @u AS user_id, @m AS month_key) AS s
          ON t.user_id = s.user_id AND t.month_key = s.month_key
        WHEN MATCHED THEN UPDATE SET
          input_tokens = t.input_tokens + @i, output_tokens = t.output_tokens + @o, updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (user_id, month_key, input_tokens, output_tokens, updated_at)
          VALUES (@u, @m, @i, @o, SYSUTCDATETIME());
      `);
  } catch (e) {
    // Usage tracking must never break an AI feature.
    console.error('Failed to record AI usage:', e);
  }
}

// Single choke point for every Claude call: records usage (for the calling user)
// on success and flags credit exhaustion on failure.
async function callClaude(params: Anthropic.MessageCreateParamsNonStreaming, userId: number): Promise<Anthropic.Message> {
  try {
    const resp = await anthropic.messages.create(params);
    creditExhaustedAt = null;
    await recordUsage(userId, resp.usage.input_tokens, resp.usage.output_tokens);
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

export async function getAiStatus(userId: number): Promise<AiStatus> {
  const monthKey = currentMonthKey();
  const pool = getPool();

  const usage = await pool.request().input('u', sql.Int, userId).input('m', sql.NVarChar(7), monthKey)
    .query(`SELECT input_tokens, output_tokens FROM ai_usage WHERE user_id = @u AND month_key = @m`);
  const inputTokens  = Number((usage.recordset[0] as { input_tokens?: number } | undefined)?.input_tokens  ?? 0);
  const outputTokens = Number((usage.recordset[0] as { output_tokens?: number } | undefined)?.output_tokens ?? 0);
  const estCostUsd = inputTokens * PRICE_PER_INPUT_TOKEN + outputTokens * PRICE_PER_OUTPUT_TOKEN;

  const budgetRow = await pool.request().input('u', sql.Int, userId)
    .query(`SELECT setting_value FROM app_settings WHERE user_id = @u AND setting_key = 'ai_monthly_budget'`);
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

export async function categorizeTransactions(userId: number, txs: TxInput[], accountType?: string): Promise<CatResult[]> {
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
  }, userId);

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

export async function generateMonthlySummary(userId: number, data: SummaryData): Promise<string> {
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
  }, userId);

  return response.content[0]?.type === 'text' ? response.content[0].text : '';
}

// ── Next month suggestions ─────────────────────────────────────────

export interface SuggestionsData extends SummaryData {
  categoryBreakdown: { category: string; amount: number }[];
  unusedSubscriptions: string[];
}

export async function generateSuggestions(userId: number, data: SuggestionsData): Promise<string[]> {
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
  }, userId);

  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';

  try {
    return JSON.parse(text) as string[];
  } catch {
    return ['Review your top spending categories and set a monthly limit for each.'];
  }
}

// ── Budget plan generation ─────────────────────────────────────────

export interface BudgetPlanCategory {
  categoryId: number;
  name: string;
  lastMonthSpent: number;
}
export interface BudgetPlanItem {
  categoryId: number;
  suggestedLimit: number;
  note: string;
}

// Essentials get trimmed gently; discretionary categories absorb most of the cut.
const ESSENTIAL_CATEGORIES = new Set([
  'Housing', 'Groceries', 'Health & Medical', 'Transportation', 'Education',
]);

function roundTo5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

// Deterministic fallback used when the AI is unavailable (e.g. out of credit):
// flat-trim discretionary categories by the target, essentials by a third of it.
function fallbackBudgetPlan(cats: BudgetPlanCategory[], reductionPercent: number): BudgetPlanItem[] {
  const r = Math.min(Math.max(reductionPercent, 0), 90) / 100;
  return cats.map((c) => {
    const essential = ESSENTIAL_CATEGORIES.has(c.name);
    const cut = essential ? r / 3 : r;
    return {
      categoryId: c.categoryId,
      suggestedLimit: roundTo5(c.lastMonthSpent * (1 - cut)),
      note: essential ? 'Essential — trimmed lightly' : `Trimmed ~${Math.round(cut * 100)}%`,
    };
  });
}

export async function generateBudgetPlan(
  userId: number,
  cats: BudgetPlanCategory[],
  reductionPercent: number,
): Promise<BudgetPlanItem[]> {
  if (cats.length === 0) return [];

  const prompt = `You are a personal finance budgeting assistant. Based on last month's spending per category, propose a realistic monthly budget for each category that reduces total spending by about ${reductionPercent}% overall.

Guidelines:
- Protect essentials (Housing, Groceries, Health & Medical, Transportation, Education) — trim these little or not at all.
- Trim discretionary categories (Food & Dining, Entertainment, Shopping, Subscriptions, Travel) more aggressively to reach the overall target.
- Never set a budget above last month's spend for that category.
- Round every budget to the nearest $5.
- Keep each budget at least $5.

Categories (last month spend):
${cats.map((c) => `- id ${c.categoryId} | ${c.name} | $${c.lastMonthSpent.toFixed(2)}`).join('\n')}

Return ONLY a JSON array (no markdown, no explanation), one object per category id above:
[{"categoryId":1,"suggestedLimit":120,"note":"short reason (<=6 words)"}]`;

  try {
    const response = await callClaude({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }, userId);

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';
    const parsed = JSON.parse(text) as BudgetPlanItem[];

    // Trust the category set, not the model: only keep ids we asked about, clamp
    // each limit to [5, lastMonthSpent], and backfill anything the model dropped.
    const byId = new Map(parsed.map((p) => [Number(p.categoryId), p]));
    return cats.map((c) => {
      const ai = byId.get(c.categoryId);
      const raw = ai ? Number(ai.suggestedLimit) : c.lastMonthSpent * (1 - reductionPercent / 100);
      const capped = Math.min(Number.isFinite(raw) ? raw : c.lastMonthSpent, c.lastMonthSpent);
      return {
        categoryId: c.categoryId,
        suggestedLimit: roundTo5(capped),
        note: ai?.note ?? 'Suggested limit',
      };
    });
  } catch {
    // Out of credit or malformed response — fall back to a deterministic plan so
    // the feature still works without the AI.
    return fallbackBudgetPlan(cats, reductionPercent);
  }
}

// ── Savings split suggestion ───────────────────────────────────────
// Given this month's leftover ("available") and each goal's remaining need,
// deadline and priority, propose how much to drop into each bucket. Mirrors
// generateBudgetPlan: AI first, deterministic fallback when AI is unavailable.

export interface SavingsSplitGoal {
  goalId: number;
  name: string;
  remaining: number;            // target - already saved (>= 0)
  targetDate: string | null;    // 'YYYY-MM-DD' or null
  priority: number;             // higher = fund first
}
export interface SavingsSplitItem {
  goalId: number;
  suggestedAmount: number;
  note: string;
}

function roundTo10(n: number): number {
  return Math.max(0, Math.round(n / 10) * 10);
}

// Distribute `available` across goals by urgency: soonest deadline first, then
// higher priority, each capped at its remaining need. Used when AI is down.
function fallbackSavingsSplit(goals: SavingsSplitGoal[], available: number): SavingsSplitItem[] {
  const order = [...goals].sort((a, b) => {
    const ad = a.targetDate ? Date.parse(a.targetDate) : Infinity;
    const bd = b.targetDate ? Date.parse(b.targetDate) : Infinity;
    if (ad !== bd) return ad - bd;            // earlier deadline first
    return b.priority - a.priority;            // then higher priority
  });
  let pot = Math.max(0, available);
  const byId = new Map<number, SavingsSplitItem>();
  for (const g of order) {
    const give = Math.min(Math.max(0, g.remaining), pot);
    pot -= give;
    byId.set(g.goalId, {
      goalId: g.goalId,
      suggestedAmount: Math.round(give * 100) / 100,
      note: g.targetDate ? 'Fund toward deadline' : 'Toward goal',
    });
  }
  // Preserve the caller's order in the response.
  return goals.map((g) => byId.get(g.goalId) ?? { goalId: g.goalId, suggestedAmount: 0, note: '' });
}

export async function generateSavingsSplit(
  userId: number,
  goals: SavingsSplitGoal[],
  available: number,
): Promise<SavingsSplitItem[]> {
  const pot = Math.max(0, available);
  const fundable = goals.filter((g) => g.remaining > 0);
  if (fundable.length === 0 || pot <= 0) {
    return goals.map((g) => ({ goalId: g.goalId, suggestedAmount: 0, note: '' }));
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You are a personal savings assistant. The user has $${pot.toFixed(2)} of leftover money this month to put toward their savings goals. Today is ${today}. Propose how much to put into each goal.

Guidelines:
- The total you allocate MUST NOT exceed $${pot.toFixed(2)}. It can be less if that's sensible.
- Never allocate more than a goal's remaining need.
- Prioritize goals with the soonest deadline, then higher priority.
- It's fine to fully fund small/urgent goals and leave longer-term ones partially funded.
- Round every amount to the nearest $10.

Goals (remaining need | deadline | priority):
${fundable.map((g) => `- id ${g.goalId} | ${g.name} | $${g.remaining.toFixed(2)} | ${g.targetDate ?? 'no deadline'} | priority ${g.priority}`).join('\n')}

Return ONLY a JSON array (no markdown, no explanation), one object per goal id above:
[{"goalId":1,"suggestedAmount":120,"note":"short reason (<=6 words)"}]`;

  try {
    const response = await callClaude({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }, userId);

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '[]';
    const parsed = JSON.parse(text) as SavingsSplitItem[];
    const byId = new Map(parsed.map((p) => [Number(p.goalId), p]));

    // Trust our goal set, not the model: clamp each amount to [0, remaining], drop
    // unknown ids, then scale down proportionally if the total still exceeds the pot.
    let items = fundable.map((g) => {
      const ai = byId.get(g.goalId);
      const raw = ai ? Number(ai.suggestedAmount) : 0;
      const capped = Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), g.remaining);
      return { goalId: g.goalId, suggestedAmount: roundTo10(capped), note: ai?.note ?? 'Toward goal' };
    });

    const total = items.reduce((a, i) => a + i.suggestedAmount, 0);
    if (total > pot && total > 0) {
      const scale = pot / total;
      items = items.map((i) => ({ ...i, suggestedAmount: roundTo10(i.suggestedAmount * scale) }));
    }

    const byIdOut = new Map(items.map((i) => [i.goalId, i]));
    return goals.map((g) => byIdOut.get(g.goalId) ?? { goalId: g.goalId, suggestedAmount: 0, note: '' });
  } catch {
    // Out of credit or malformed response — deterministic split so it still works.
    return fallbackSavingsSplit(goals, pot);
  }
}

// ── Natural language Q&A ───────────────────────────────────────────

export async function answerFinanceQuestion(userId: number, question: string, context: string): Promise<string> {
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
  }, userId);

  return response.content[0]?.type === 'text' ? response.content[0].text : 'Unable to answer at this time.';
}
