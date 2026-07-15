<template>
  <q-page class="bb-dash q-pa-lg">
    <!-- Phone gesture: pull down to sync banks + reload. -->
    <q-pull-to-refresh @refresh="onPullRefresh" color="purple-4" bg-color="dark">

    <!-- Header -->
    <div class="bb-page-header row items-center justify-between">
      <div>
        <div class="bb-page-title">Welcome Back{{ firstName ? ` ${firstName}` : '' }}!</div>
        <div class="bb-page-sub">Here's your financial summary for {{ currentMonth }}</div>
      </div>
      <div class="row items-center q-gutter-sm">
        <q-btn
          no-caps flat dense icon="explore" label="Take a tour"
          style="color: var(--bb-accent-light)"
          @click="startTour"
        >
          <q-tooltip>A quick guided walkthrough</q-tooltip>
        </q-btn>
        <q-btn
          flat round dense
          :icon="hideAmounts ? 'visibility_off' : 'visibility'"
          style="color: var(--bb-accent-light)"
          aria-label="Toggle amount visibility"
          @click="toggleHideAmounts"
        >
          <q-tooltip>{{ hideAmounts ? 'Show amounts' : 'Hide amounts' }}</q-tooltip>
        </q-btn>
        <q-btn
          no-caps unelevated icon="sync" label="Sync"
          :loading="syncing"
          @click="syncBank"
          style="background:rgba(var(--bb-accent-rgb),0.15);color: var(--bb-accent-light);border-radius:8px"
        />
        <q-btn
          no-caps unelevated icon="account_balance" label="Connect bank"
          :loading="connecting"
          @click="connectBank"
          style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px"
        />
      </div>
    </div>

    <q-banner v-if="bankError" class="bb-error-banner q-mb-md" dense rounded>
      {{ bankError }}
    </q-banner>

    <!-- Loading -->
    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="40px" />
      <span>Loading your finances...</span>
    </div>

    <!-- Load error -->
    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else-if="!loadError">

      <!-- Unusual-spending alerts -->
      <div v-if="visibleAnomalies.length > 0" class="bb-anomalies q-mb-lg">
        <div v-for="a in visibleAnomalies" :key="a.category" class="bb-anomaly">
          <div class="bb-anomaly-icon" :style="{ background: (a.color || '#F59E0B') + '22' }">
            <q-icon :name="a.icon || 'trending_up'" size="16px" :style="`color:${a.color || '#F59E0B'}`" />
          </div>
          <div class="bb-anomaly-text">
            <strong>{{ a.category }}</strong> spending is
            <strong>{{ a.ratio }}×</strong> your usual this week
            <span class="bb-anomaly-sub">{{ money(a.thisWeek) }} vs {{ money(a.avgWeek) }} typical</span>
          </div>
          <router-link
            :to="`/app/transactions?category=${encodeURIComponent(a.category)}`"
            class="bb-anomaly-link"
            @click="dismissAnomaly(a.category)"
          >Review →</router-link>
          <q-btn flat round dense size="sm" icon="close" class="bb-anomaly-close"
            @click="dismissAnomaly(a.category)">
            <q-tooltip>Dismiss</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- AI Summary + Suggestions -->
      <div class="row q-col-gutter-md q-mb-lg">

        <!-- AI Monthly Summary -->
        <div class="col-12 col-md-6">
          <div class="bb-ai-card">
            <div class="bb-ai-header">
              <div class="bb-ai-icon">
                <q-icon name="auto_awesome" size="16px" color="white" />
              </div>
              <span class="bb-ai-label">AI Monthly Summary</span>
              <q-badge class="bb-ai-badge q-ml-sm">{{ currentMonth }}</q-badge>
              <q-space />
              <q-btn
                flat dense no-caps size="sm"
                :loading="aiLoading"
                :label="aiSummary ? 'Refresh' : 'Generate'"
                icon="refresh"
                style="color: var(--bb-accent-light); font-size:11px"
                @click="loadAiSummary"
              />
            </div>
            <p v-if="aiSummary" class="bb-ai-text" v-html="formatBold(aiSummary)" />
            <p v-else-if="aiError" class="bb-ai-text bb-ai-placeholder" style="color:#EF4444">
              {{ aiError }}
            </p>
            <p v-else class="bb-ai-text bb-ai-placeholder">
              Click Generate to get your AI-powered monthly summary
            </p>
          </div>
        </div>

        <!-- Suggestions -->
        <div class="col-12 col-md-6">
          <div class="bb-ai-card bb-suggestions-card">
            <div class="bb-ai-header">
              <div class="bb-ai-icon bb-ai-icon--pink">
                <q-icon name="lightbulb" size="16px" color="white" />
              </div>
              <span class="bb-ai-label">Suggestions for Next Month</span>
            </div>
            <ul v-if="aiSuggestions.length" class="bb-suggestions">
              <li v-for="(s, i) in aiSuggestions" :key="i">
                <q-icon name="arrow_right" size="14px" style="color: var(--bb-accent);flex-shrink:0" />
                {{ s }}
              </li>
            </ul>
            <p v-else class="bb-ai-text bb-ai-placeholder">
              Suggestions will appear after generating your summary
            </p>
          </div>
        </div>
      </div>

      <!-- Stat Cards -->
      <div class="row q-col-gutter-md q-mb-lg">

        <!-- Total Debt -->
        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#EF4444"></span>
              TOTAL DEBT
            </div>
            <div class="bb-stat-val">{{ money(totalDebt) }}</div>
            <!-- Per-card debt + utilization vs limit (click a card to set/edit its limit) -->
            <div class="bb-debt-util">
              <div v-for="c in creditCards" :key="c.id" class="bb-du-row" @click="editLimit(c)">
                <q-tooltip>Click to set / edit this card's credit limit</q-tooltip>
                <div class="bb-du-line1">
                  <span class="bb-du-name">{{ c.name }}</span>
                  <span v-if="c.hasLimit" class="bb-du-pct" :class="c.statusClass">{{ c.utilization.toFixed(0) }}%</span>
                  <span v-else class="bb-du-set">set limit</span>
                </div>
                <div v-if="c.hasLimit" class="bb-du-bar-wrap">
                  <div class="bb-du-bar" :class="c.statusClass" :style="{ width: Math.min(c.utilization, 100) + '%' }"></div>
                  <div class="bb-du-mark"></div>
                </div>
                <div class="bb-du-amt">
                  {{ money(c.owed) }}<template v-if="c.hasLimit"> / {{ money(c.limit ?? 0) }}</template>
                </div>
                <div v-if="c.warning" class="bb-du-warn" :class="c.statusClass">{{ c.warning }}</div>
              </div>
              <span v-if="creditCards.length === 0" class="bb-stat-cmp">no credit-card debt</span>
            </div>
          </div>
        </div>

        <!-- Monthly Spending -->
        <div class="col-6 col-md-3">
          <div class="bb-stat bb-stat--gradient" data-tour="spending">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:rgba(255,255,255,0.6)"></span>
              MONTHLY SPENDING
            </div>
            <div class="bb-stat-val">{{ money(dash?.totalSpending ?? 0) }}</div>
            <div class="bb-stat-row">
              <span :class="spendingDown ? 'bb-badge-down-good' : 'bb-badge-up-bad'">
                {{ spendingChangePct }}
              </span>
              <span class="bb-stat-cmp">vs last month</span>
            </div>
          </div>
        </div>

        <!-- Monthly Income -->
        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background: var(--bb-accent)"></span>
              MONTHLY INCOME
            </div>
            <div class="bb-stat-val">{{ money(dash?.totalIncome ?? 0) }}</div>
            <div class="bb-stat-row">
              <span class="bb-badge-neutral">this month</span>
            </div>
          </div>
        </div>

        <!-- Net Savings -->
        <div class="col-6 col-md-3">
          <div class="bb-stat" data-tour="savings">
            <div class="bb-stat-lbl">
              <span class="bb-dot" :style="`background:${netSavingsNegative ? '#EF4444' : '#22C55E'}`"></span>
              NET SAVINGS
            </div>
            <div class="bb-stat-val" :style="netSavingsNegative ? 'color:#EF4444' : ''">{{ money(dash?.netSavings ?? 0) }}</div>
            <div class="bb-stat-row">
              <span class="bb-savings-rate" :class="{ 'is-negative': netSavingsNegative }">
                {{ (dash?.savingsRate ?? 0).toFixed(0) }}% rate{{ netSavingsNegative ? ' · over budget' : '' }}
              </span>
            </div>
            <div class="bb-savings-bar-wrap">
              <div
                class="bb-savings-bar"
                :class="{ 'is-negative': netSavingsNegative }"
                :style="{ width: Math.min(Math.abs(dash?.savingsRate ?? 0), 100) + '%' }"
              />
            </div>
            <router-link to="/app/goals" class="bb-unallocated">
              {{ money(dash?.savedThisMonth ?? 0) }} saved this month →
            </router-link>
          </div>
        </div>

        <!-- Checking Balance -->
        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#3B82F6"></span>
              CHECKING BALANCE
            </div>
            <div class="bb-stat-val">{{ money(checkingBalance) }}</div>
            <div class="bb-acct-breakdown">
              <div v-for="a in checkingBreakdown" :key="a.name" class="bb-acct-row">
                <span class="bb-acct-name">{{ a.name }}</span>
                <span class="bb-acct-bal">{{ money(a.balance) }}</span>
              </div>
              <span v-if="checkingBreakdown.length === 0" class="bb-stat-cmp">no checking accounts</span>
            </div>
          </div>
        </div>

        <!-- Savings Balance -->
        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#14B8A6"></span>
              SAVINGS BALANCE
            </div>
            <div class="bb-stat-val">{{ money(savingsBalance) }}</div>
            <div class="bb-acct-breakdown">
              <div v-for="a in savingsBreakdown" :key="a.name" class="bb-acct-row">
                <span class="bb-acct-name">{{ a.name }}</span>
                <span class="bb-acct-bal">{{ money(a.balance) }}</span>
              </div>
              <span v-if="savingsBreakdown.length === 0" class="bb-stat-cmp">no savings accounts</span>
            </div>
          </div>
        </div>

        <!-- Net Worth -->
        <div class="col-6 col-md-3">
          <div class="bb-stat" data-tour="net-worth">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#A855F7"></span>
              NET WORTH
            </div>
            <div class="bb-stat-val" :style="netWorth < 0 ? 'color:#EF4444' : ''">{{ money(netWorth) }}</div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">cash on hand minus card debt</span>
            </div>
          </div>
        </div>

        <!-- Metropolis Parking -->
        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#F59E0B"></span>
              METROPOLIS PARKING
            </div>
            <div class="bb-stat-val">{{ money(dash?.parkingSpend ?? 0) }}</div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">
                {{ (dash?.parkingTxCount ?? 0) === 1 ? '1 charge' : (dash?.parkingTxCount ?? 0) + ' charges' }} this month
              </span>
            </div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">{{ money(dash?.parkingSpendYtd ?? 0) }} so far this year</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state — only when there's no data at all -->
      <div v-if="!hasAnyData" class="bb-no-data">
        <q-icon name="upload_file" size="48px" style="color: var(--bb-accent);opacity:0.4" />
        <div class="bb-no-data-title">No transactions yet</div>
        <div class="bb-no-data-sub">Upload a CSV from Wells Fargo, Apple Card, or Discover — or connect a bank — to get started</div>
        <q-btn no-caps unelevated label="Upload your first statement" to="/app/upload"
          style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px;margin-top:8px" />
      </div>

      <!-- Charts -->
      <div v-else class="row q-col-gutter-md" data-tour="charts">

        <!-- Spending by Category -->
        <div class="col-12 col-md-6">
          <div class="bb-chart-card">
            <div class="bb-chart-hdr">
              <div>
                <div class="bb-chart-title">Spending by Category</div>
                <div class="bb-chart-sub">This month's breakdown</div>
              </div>
            </div>
            <VueApexCharts v-if="hasCategoryData" :key="`cat-${hideAmounts}`" type="bar" height="280" :options="categoryOpts" :series="categorySeries" />
            <div v-else class="bb-chart-empty">
              <q-icon name="pie_chart" size="34px" style="color: var(--bb-accent);opacity:0.4" />
              <span>No spending recorded yet this month.</span>
            </div>
          </div>
        </div>

        <!-- Monthly Trend -->
        <div class="col-12 col-md-6">
          <div class="bb-chart-card">
            <div class="bb-chart-hdr">
              <div>
                <div class="bb-chart-title">Monthly Spending Trend</div>
                <div class="bb-chart-sub">Last 6 months</div>
              </div>
            </div>
            <VueApexCharts :key="`trend-${hideAmounts}`" type="area" height="280" :options="trendOpts" :series="trendSeries" />
          </div>
        </div>

      </div>

    </template>
    </q-pull-to-refresh>

    <TourGuide v-model="tourActive" :steps="tourSteps" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { themeColor } from 'src/services/theme';
import { api, type DashboardData, type Account } from 'src/services/api';
import { auth } from 'src/services/auth';
import TourGuide, { type TourStep } from 'src/components/TourGuide.vue';

// First name for the "Welcome Back, X!" greeting.
const firstName = computed(() => {
  const name = auth.getUser()?.name?.trim();
  if (!name) return '';
  const first = name.split(/\s+/)[0] ?? '';
  return first.charAt(0).toUpperCase() + first.slice(1);
});

const $q = useQuasar();

// ── Guided tour (auto-runs for the demo account, replayable via the button) ──
const tourActive = ref(false);
const tourSteps: TourStep[] = [
  { target: null, title: 'Welcome to BreadBank 👋',
    body: "This is a live demo with fake data. Here's a 60-second tour of how it all works — you can skip anytime." },
  { target: '[data-tour="net-worth"]', title: 'Net Worth',
    body: 'Your bottom line at a glance: cash on hand (checking + savings) minus credit-card debt.' },
  { target: '[data-tour="spending"]', title: 'Monthly Spending',
    body: 'What you actually spent this month. Card payments, transfers and reimbursements are excluded automatically, so this is your true spending — not money just moving around.' },
  { target: '[data-tour="savings"]', title: 'Net Savings',
    body: 'Income minus spending, with your savings rate — and how much you moved into savings this month.' },
  { target: '[data-tour="charts"]', title: 'Where your money goes',
    body: 'See spending broken down by category and how it trends month over month.' },
  { target: '[data-tour="nav"]', title: 'Explore everything',
    body: 'Jump into Transactions (categorize charges & link reimbursements to see true cost), Reports, Budgets, Savings Goals, Bills, and upload statements — all from here.' },
  { target: null, title: "You're all set 🎉",
    body: "That's the tour! Click around freely — it's all demo data, so nothing here is real. Enjoy exploring BreadBank." },
];
function startTour() { tourActive.value = true; }
const now = new Date();
const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

const loading    = ref(true);
const loadError  = ref('');
const aiLoading  = ref(false);
const aiError    = ref('');
const dash       = ref<DashboardData | null>(null);
const accounts   = ref<Account[]>([]);
const aiSummary  = ref('');
const aiSuggestions = ref<string[]>([]);

// Spending-by-category is scoped to the *current* month, which is empty early
// in a new month. Don't let that hide the whole charts area — only show the
// "no transactions" prompt when there's genuinely no data anywhere.
const hasCategoryData = computed(() => (dash.value?.categoryBreakdown.length ?? 0) > 0);
// Spent more than earned this month → show Net Savings in the red.
const netSavingsNegative = computed(() => (dash.value?.netSavings ?? 0) < 0);

// Anomaly alerts you've reviewed/dismissed stay gone for the current week
// (keyed by category + week bucket), then can re-alert if they spike again.
function readDismissed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('bb_dismissed_anomalies') || '{}') as Record<string, boolean>;
  } catch {
    return {}; // corrupt value — start clean rather than crashing the dashboard
  }
}
const dismissedAnomalies = ref<Record<string, boolean>>(readDismissed());
function anomalyKey(category: string) {
  return `${category}|${Math.floor(Date.now() / (7 * 86_400_000))}`;
}
const visibleAnomalies = computed(() =>
  (dash.value?.anomalies ?? []).filter((a) => !dismissedAnomalies.value[anomalyKey(a.category)]),
);
function dismissAnomaly(category: string) {
  dismissedAnomalies.value = { ...dismissedAnomalies.value, [anomalyKey(category)]: true };
  localStorage.setItem('bb_dismissed_anomalies', JSON.stringify(dismissedAnomalies.value));
}
const hasAnyData = computed(() =>
  hasCategoryData.value || (dash.value?.monthlyTrend?.length ?? 0) > 0,
);

// Amount owed on a credit card. For Plaid-linked cards we have the real
// statement balance (current_balance, positive = owed). For CSV-only cards we
// derive it: balance = payments - purchases, so owed is the negation. Clamp at
// 0 so a paid-off/overpaid card reads as $0 rather than a negative "debt".
const owedFor = (a: Account) =>
  a.current_balance != null
    ? Math.max(0, a.current_balance)
    : Math.max(0, -(a.balance ?? 0));
// The credit cards you actually owe on (owed > 0), each with utilization vs its
// limit and a warning near the 30% guideline (amber 25%+, red 30%+). Shown inside
// the Total Debt tile. Paid-off ($0) and archived cards are hidden.
const creditCards = computed(() =>
  accounts.value
    .filter(a => a.type === 'credit' && !a.is_archived)
    .map(a => {
      const owed = owedFor(a);
      const limit = a.credit_limit;
      let hasLimit = false;
      let utilization = 0;
      let statusClass = 'is-good';
      let warning = '';
      if (limit != null && limit > 0) {
        hasLimit = true;
        utilization = (owed / limit) * 100;
        const thirty = limit * 0.30;
        if (utilization >= 30) {
          statusClass = 'is-over';
          warning = `Over 30% — pay down ${money(owed - thirty)} to get back under.`;
        } else if (utilization >= 25) {
          statusClass = 'is-near';
          warning = `Approaching 30% — ${money(thirty - owed)} of room left.`;
        }
      }
      return { id: a.id, name: a.name, owed, limit, hasLimit, utilization, statusClass, warning };
    })
    .filter(c => c.owed > 0),
);
const totalDebt = computed(() => creditCards.value.reduce((s, c) => s + c.owed, 0));

function editLimit(c: { id: number; name: string; limit: number | null }) {
  $q.dialog({
    title: `Credit limit — ${c.name}`,
    message: "Enter this card's total credit limit (leave blank to clear).",
    prompt: { model: c.limit != null ? String(c.limit) : '', type: 'number', outlined: true, isValid: (v: string) => v === '' || Number(v) >= 0 },
    cancel: true,
    dark: true,
  }).onOk((val: string) => {
    const limit = val === '' || val == null ? null : Number(val);
    void api.setCreditLimit(c.id, limit).then(() => load()).catch((e) => console.error(e));
  });
}

// Checking / savings balances. Match on the account `type` first, falling back
// to the account name, since deposit accounts aren't always typed consistently.
const matchAccounts = (re: RegExp) =>
  accounts.value.filter(a => !a.is_archived && (re.test(a.type ?? '') || re.test(a.name ?? '')));

// The accounts that actually make up a balance card. If any account in the
// group is linked to Plaid (real bank balance), trust only those and ignore
// stale CSV-imported duplicates; otherwise fall back to the derived balances.
const contributingAccounts = (list: Account[]) => {
  const linked = list.filter(a => a.current_balance != null);
  const chosen = linked.length ? linked : list;
  return chosen.map(a => ({ name: a.name, balance: a.current_balance ?? a.balance ?? 0 }));
};
const sumBalance = (list: Account[]) =>
  contributingAccounts(list).reduce((s, a) => s + a.balance, 0);

const checkingAccounts  = computed(() => matchAccounts(/check/i));
// Health Savings Accounts (HSA) contain "savings" in their name but are a
// separate medical account — keep them out of the Savings Balance card.
const isHsa = (a: Account) => /hsa|health\s*saving/i.test(`${a.type ?? ''} ${a.name ?? ''}`);
const savingsAccounts   = computed(() => matchAccounts(/saving/i).filter(a => !isHsa(a)));
const checkingBreakdown = computed(() => contributingAccounts(checkingAccounts.value));
const savingsBreakdown  = computed(() => contributingAccounts(savingsAccounts.value));
const checkingBalance   = computed(() => sumBalance(checkingAccounts.value));
const savingsBalance    = computed(() => sumBalance(savingsAccounts.value));

// Net worth = liquid cash on hand (checking + savings) minus credit-card debt.
const netWorth = computed(() => checkingBalance.value + savingsBalance.value - totalDebt.value);

const spendingDown = computed(() => {
  if (!dash.value || dash.value.previousMonthSpending === 0) return true;
  return dash.value.totalSpending <= dash.value.previousMonthSpending;
});

const spendingChangePct = computed(() => {
  const d = dash.value;
  if (!d || d.previousMonthSpending === 0) return '—';
  const pct = ((d.totalSpending - d.previousMonthSpending) / d.previousMonthSpending * 100);
  return (pct > 0 ? '+' : '') + pct.toFixed(0) + '%';
});

function fmt(val: number) {
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Privacy toggle: one eye in the header masks every dollar amount on the
// dashboard at once. Persisted so it stays hidden across reloads.
const hideAmounts = ref(localStorage.getItem('bb_hide_amounts') === '1');
function toggleHideAmounts() {
  hideAmounts.value = !hideAmounts.value;
  localStorage.setItem('bb_hide_amounts', hideAmounts.value ? '1' : '0');
}
// Use everywhere a balance/amount is shown, instead of fmt().
function money(val: number) {
  return hideAmounts.value ? '••••••' : fmt(val);
}

function formatBold(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

async function loadAiSummary() {
  aiLoading.value = true;
  aiError.value   = '';
  try {
    const result = await api.getAiSummary(now.getMonth() + 1, now.getFullYear());
    aiSummary.value     = result.summary;
    aiSuggestions.value = result.suggestions;
  } catch (e) {
    aiError.value = e instanceof Error ? e.message : 'Failed to generate summary';
    console.error(e);
  } finally {
    aiLoading.value = false;
  }
}

async function load() {
  try {
    const [dashData, acctData] = await Promise.all([
      api.getDashboard(),
      api.getAccounts(),
    ]);
    dash.value     = dashData;
    accounts.value = acctData;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load dashboard';
    console.error(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await load();
  // First visit after a demo login: auto-launch the guided tour (once). The flag
  // is set by the login page's "Try the demo" flow.
  if (localStorage.getItem('bb_show_tour')) {
    localStorage.removeItem('bb_show_tour');
    setTimeout(startTour, 400); // let the tiles finish rendering first
  }
  // Auto-sync once per browser session (whether just logged in or returning to
  // the app) so we pull fresh data AND detect any bank that has disconnected —
  // syncBank() raises a reconnect popup for those.
  sessionStorage.removeItem('bb_sync_on_login'); // legacy flag, superseded below
  if (!sessionStorage.getItem('bb_synced_session')) {
    sessionStorage.setItem('bb_synced_session', '1');
    await syncBank();
  }
});

// ── Bank linking (Plaid) ───────────────────────────────────

const connecting = ref(false);
const syncing    = ref(false);
const bankError  = ref('');

// Plaid Link is a drop-in widget loaded from Plaid's CDN at runtime.
declare global {
  interface Window {
    Plaid?: { create: (cfg: Record<string, unknown>) => { open: () => void } };
  }
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Plaid Link'));
    document.head.appendChild(s);
  });
}

async function connectBank() {
  bankError.value = '';
  connecting.value = true;
  try {
    await loadPlaidScript();
    const { link_token } = await api.createPlaidLinkToken();
    const handler = window.Plaid!.create({
      token: link_token,
      onSuccess: async (publicToken: string) => {
        try {
          await api.exchangePlaidToken(publicToken);
          await load();
        } catch (e) {
          bankError.value = e instanceof Error ? e.message : 'Failed to import account';
        } finally {
          connecting.value = false;
        }
      },
      onExit: () => { connecting.value = false; },
    });
    handler.open();
  } catch (e) {
    bankError.value = e instanceof Error ? e.message : 'Failed to start bank linking';
    connecting.value = false;
  }
}

// Pull-to-refresh: run the same bank sync + reload as the Sync button, then
// release the spinner whether it worked or not.
async function onPullRefresh(done: () => void) {
  try {
    await syncBank();
  } finally {
    done();
  }
}

async function syncBank() {
  bankError.value = '';
  syncing.value = true;
  try {
    const result = await api.syncPlaid();
    await load();
    if (result.failed?.length) notifyDisconnected(result.failed);
  } catch (e) {
    bankError.value = e instanceof Error ? e.message : 'Failed to sync';
  } finally {
    syncing.value = false;
  }
}

// A bank whose Plaid connection has dropped (e.g. NO_ACCOUNTS / login required)
// won't pull new transactions until it's reconnected — tell the user with a
// sticky popup that offers to reconnect right away.
function notifyDisconnected(failed: { institution: string; reason: string }[]) {
  const names = [...new Set(failed.map(f => f.institution))].join(', ');
  const plural = failed.length > 1;
  $q.notify({
    type: 'negative',
    icon: 'link_off',
    timeout: 0, // sticky — stays until dismissed
    multiLine: true,
    message: `${names} ${plural ? 'have' : 'has'} disconnected. New transactions won't sync until you reconnect ${plural ? 'them' : 'it'}.`,
    actions: [
      { label: 'Reconnect', color: 'white', handler: () => { void connectBank(); } },
      { label: 'Dismiss', color: 'white' },
    ],
  });
}

// ── Charts ─────────────────────────────────────────────────

const categorySeries = computed(() => [{
  name: 'Spent',
  // Keep cents so near-identical categories (e.g. $807.09 vs $806.76) stay
  // distinguishable instead of both rounding to the same whole-dollar label.
  data: (dash.value?.categoryBreakdown ?? []).map(c => ({ x: c.category, y: Math.round(c.total * 100) / 100 })),
}]);

const trendSeries = computed(() => [
  { name: 'Spending', data: (dash.value?.monthlyTrend ?? []).map(t => Math.round(t.spending)) },
  { name: 'Income',   data: (dash.value?.monthlyTrend ?? []).map(t => Math.round(t.income)) },
]);

// Round the y-axis up to the next $1,000 and tick once per $1,000, so the
// gridlines step in 1,000 increments instead of ApexCharts' default ~2,000.
const trendYMax = computed(() => {
  const vals = (dash.value?.monthlyTrend ?? []).flatMap(t => [t.spending, t.income]);
  const peak = Math.max(0, ...vals);
  return Math.max(1000, Math.ceil(peak / 1000) * 1000);
});

const trendOpts = computed<ApexOptions>(() => ({
  chart: { type: 'area', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false }, foreColor: '#6E6E9A' },
  colors: [themeColor('--bb-accent', '#6C4ED4'), '#22C55E'],
  fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02 } },
  stroke: { curve: 'smooth', width: 2 },
  dataLabels: { enabled: false },
  grid: { borderColor: 'rgba(255,255,255,0.04)', strokeDashArray: 4 },
  xaxis: {
    categories: (dash.value?.monthlyTrend ?? []).map(t => t.month),
    axisBorder: { show: false }, axisTicks: { show: false },
    labels: { style: { colors: '#6E6E9A', fontSize: '11px' } },
  },
  yaxis: {
    min: 0,
    max: trendYMax.value,
    tickAmount: trendYMax.value / 1000,
    labels: { style: { colors: '#6E6E9A', fontSize: '11px' }, formatter: (v: number) => hideAmounts.value ? '••' : `$${v.toLocaleString()}` },
  },
  legend: { labels: { colors: '#6E6E9A' } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => hideAmounts.value ? '••••' : `$${v.toLocaleString()}` } },
}));

const categoryOpts = computed<ApexOptions>(() => ({
  chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, zoom: { enabled: false }, foreColor: '#6E6E9A' },
  plotOptions: { bar: { horizontal: true, borderRadius: 4, borderRadiusApplication: 'end', barHeight: '60%' } },
  colors: [themeColor('--bb-accent', '#6C4ED4')],
  dataLabels: {
    enabled: true,
    formatter: (val: number) => hideAmounts.value ? '••••' : fmt(val),
    style: { fontSize: '11px', colors: ['#ffffff'] },
    offsetX: -4,
  },
  grid: { borderColor: 'rgba(255,255,255,0.04)', strokeDashArray: 4 },
  xaxis: {
    labels: { style: { colors: '#6E6E9A', fontSize: '11px' }, formatter: (v: string) => hideAmounts.value ? '••' : `$${Math.round(Number(v)).toLocaleString()}` },
    axisBorder: { show: false }, axisTicks: { show: false },
  },
  yaxis: { labels: { style: { colors: '#b0b0cc', fontSize: '12px' } } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => hideAmounts.value ? '••••' : fmt(v) } },
}));
</script>

<style lang="scss">
.bb-dash { background-color: var(--bb-bg); min-height: 100vh; }

/* ── Per-card debt + utilization inside the Total Debt tile ──── */
.bb-debt-util { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.bb-du-row { cursor: pointer; border-radius: 8px; padding: 4px; margin: -4px; transition: background 0.15s ease; }
.bb-du-row:hover { background: rgba(255,255,255,0.04); }
.bb-du-line1 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.bb-du-name { font-size: 12px; font-weight: 600; color: var(--bb-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-du-pct { font-size: 13px; font-weight: 700; flex-shrink: 0; }
.bb-du-pct.is-good { color: #22C55E; }
.bb-du-pct.is-near { color: #F59E0B; }
.bb-du-pct.is-over { color: #EF4444; }
.bb-du-set { font-size: 11px; font-weight: 600; color: var(--bb-accent-light); flex-shrink: 0; }
.bb-du-bar-wrap { position: relative; height: 6px; background: rgba(255,255,255,0.08); border-radius: 999px; margin: 5px 0 3px; }
.bb-du-bar { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
.bb-du-bar.is-good { background: #22C55E; }
.bb-du-bar.is-near { background: #F59E0B; }
.bb-du-bar.is-over { background: #EF4444; }
.bb-du-mark { position: absolute; top: -2px; bottom: -2px; left: 30%; width: 2px; background: rgba(255,255,255,0.4); }
.bb-du-amt { font-size: 11px; color: var(--bb-text-soft); font-variant-numeric: tabular-nums; }
.bb-du-warn { font-size: 10.5px; margin-top: 2px; line-height: 1.35; }
.bb-du-warn.is-near { color: #F59E0B; }
.bb-du-warn.is-over { color: #EF4444; }

/* Refund note on the (dark gradient) Monthly Spending tile — brighter than the
   default muted caption so it reads against the purple background. */
.bb-refund-note { margin-top: 6px; color: var(--bb-text) !important; font-weight: 600; }

/* Unusual-spending alerts */
.bb-anomalies { display: flex; flex-direction: column; gap: 10px; }
.bb-anomaly {
  display: flex; align-items: center; gap: 12px;
  background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.28);
  border-radius: 12px; padding: 12px 16px;
}
.bb-anomaly-icon { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; }
.bb-anomaly-text { flex: 1; min-width: 0; font-size: 13px; color: var(--bb-text-soft); }
.bb-anomaly-text strong { color: var(--bb-text); font-weight: 700; }
.bb-anomaly-sub { display: block; font-size: 11px; color: var(--bb-text-soft); margin-top: 2px; }
.bb-anomaly-link {
  font-size: 12px; font-weight: 600; color: #F59E0B; text-decoration: none; white-space: nowrap;
  &:hover { color: #FBBF24; }
}
.bb-anomaly-close { color: var(--bb-text-dim); flex-shrink: 0; &:hover { color: var(--bb-text); } }

.bb-chart-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 280px; gap: 12px; color: var(--bb-text-dim); font-size: 13px; text-align: center;
}

.bb-ai-card {
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 14px; padding: 18px 20px; height: 100%;
}
.bb-suggestions-card { border-color: rgba(var(--bb-accent-rgb),0.2); }

.bb-ai-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
}
.bb-ai-icon {
  width: 26px; height: 26px; border-radius: 6px;
  background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-light));
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  &--pink { background: linear-gradient(135deg,var(--bb-accent-2),var(--bb-accent)); }
}
.bb-ai-label  { font-size: 13px; font-weight: 600; color: var(--bb-text); }
.bb-ai-badge  { background: rgba(var(--bb-accent-rgb),0.2) !important; color: var(--bb-accent-light) !important; font-size: 10px !important; }
.bb-ai-text   { font-size: 13px; color: var(--bb-text-soft); line-height: 1.6; margin: 0; strong { color: var(--bb-text); } }
.bb-ai-placeholder { font-style: italic; opacity: 0.5; }

.bb-suggestions {
  list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;
  li { display: flex; align-items: flex-start; gap: 6px; font-size: 13px; color: var(--bb-text-soft); line-height: 1.5; }
}

.bb-acct-breakdown { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.bb-acct-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.bb-acct-name {
  font-size: 11px; color: var(--bb-text-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bb-acct-bal { font-size: 11px; font-weight: 600; color: var(--bb-text-soft); flex-shrink: 0; }

.bb-debt-breakdown { flex-wrap: wrap; gap: 4px 10px; }
.bb-debt-item {
  font-size: 11px;
  color: var(--bb-text-dim);
  strong { color: #EF4444; font-weight: 600; }
}

.bb-badge-up      { font-size: 10px; font-weight: 600; background: rgba(34,197,94,0.15);  color: #22C55E; padding: 2px 7px; border-radius: 20px; }
.bb-badge-down-good { font-size: 10px; font-weight: 600; background: rgba(34,197,94,0.15);  color: #22C55E; padding: 2px 7px; border-radius: 20px; }
.bb-badge-up-bad  { font-size: 10px; font-weight: 600; background: rgba(239,68,68,0.15);   color: #EF4444; padding: 2px 7px; border-radius: 20px; }
.bb-badge-neutral { font-size: 10px; font-weight: 600; background: rgba(110,110,154,0.15); color: var(--bb-text-dim); padding: 2px 7px; border-radius: 20px; }

.bb-savings-rate { font-size: 11px; font-weight: 600; color: #22C55E; }
.bb-savings-rate.is-negative { color: #EF4444; }
.bb-savings-bar-wrap { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-top: 4px; }
.bb-savings-bar { height: 100%; background: linear-gradient(90deg,var(--bb-accent),#22C55E); border-radius: 2px; transition: width 0.6s ease; }
.bb-savings-bar.is-negative { background: linear-gradient(90deg,#F97316,#EF4444); }
.bb-unallocated {
  display: inline-block; margin-top: 8px; font-size: 11px; font-weight: 600;
  color: var(--bb-accent-light); text-decoration: none;
  &:hover { color: var(--bb-accent-light); }
}
</style>
