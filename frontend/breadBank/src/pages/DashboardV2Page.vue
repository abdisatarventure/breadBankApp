<template>
  <q-page class="bb-dash2 q-pa-lg">
    <q-pull-to-refresh @refresh="onPullRefresh" color="purple-4" bg-color="dark">

    <!-- Header -->
    <div class="bb-page-header row items-center justify-between">
      <div>
        <div class="bb-page-title">{{ greeting }}{{ firstName ? `, ${firstName}` : '' }}</div>
        <div class="bb-page-sub">{{ currentMonth }} · <router-link to="/app/dashboard" class="bb2-switch">classic view</router-link></div>
      </div>
      <div class="row items-center q-gutter-sm">
        <q-btn
          flat round dense
          :icon="hideAmounts ? 'visibility_off' : 'visibility'"
          style="color: var(--bb-accent-light)"
          aria-label="Toggle amount visibility"
          @click="toggleHideAmounts"
        />
        <q-btn
          no-caps unelevated icon="sync"
          :label="$q.screen.width < 600 ? undefined : 'Sync'"
          :loading="syncing"
          @click="syncBank"
          style="background:rgba(var(--bb-accent-rgb),0.15);color: var(--bb-accent-light);border-radius:8px"
        />
        <q-btn
          no-caps unelevated icon="account_balance"
          :label="$q.screen.width < 600 ? 'Link' : 'Connect bank'"
          :loading="connecting"
          @click="connectBank"
          style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px"
        />
      </div>
    </div>

    <q-banner v-if="bankError" class="bb-error-banner q-mb-md" dense rounded>{{ bankError }}</q-banner>

    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="40px" />
      <span>Loading your finances...</span>
    </div>

    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else>

      <!-- Unusual-spending alerts (kept — they state a conclusion, not a number) -->
      <div v-if="visibleAnomalies.length > 0" class="bb-anomalies q-mb-lg">
        <div v-for="a in visibleAnomalies" :key="a.category" class="bb-anomaly">
          <div class="bb-anomaly-icon" :style="{ background: (a.color || '#F59E0B') + '22' }">
            <q-icon :name="a.icon || 'trending_up'" size="16px" :style="`color:${a.color || '#F59E0B'}`" />
          </div>
          <div class="bb-anomaly-text">
            <strong>{{ a.category }}</strong> spending is <strong>{{ a.ratio }}×</strong> your usual this week
            <span class="bb-anomaly-sub">{{ money(a.thisWeek) }} vs {{ money(a.avgWeek) }} typical</span>
          </div>
          <router-link
            :to="`/app/transactions?category=${encodeURIComponent(a.category)}`"
            class="bb-anomaly-link" @click="dismissAnomaly(a.category)"
          >Review →</router-link>
          <q-btn flat round dense size="sm" icon="close" class="bb-anomaly-close" @click="dismissAnomaly(a.category)" />
        </div>
      </div>

      <!-- ── Hero: the verdict ─────────────────────────────── -->
      <div class="bb2-hero q-mb-lg" :class="`bb2-hero--${verdict.tone}`">
        <div class="bb2-hero-status">
          <span class="bb2-hero-dot" />
          {{ verdict.title }}
        </div>
        <template v-if="hasIncome">
          <div class="bb2-hero-big" :class="{ 'is-negative': leftThisMonth < 0 }">
            {{ money(leftThisMonth) }}
            <span class="bb2-hero-big-sub">left this month</span>
          </div>
          <div class="bb2-hero-line">
            You've earned <strong>{{ money(dash?.totalIncome ?? 0) }}</strong> and spent
            <strong>{{ money(dash?.totalSpending ?? 0) }}</strong><template v-if="billsRestOfMonth > 0">,
            with <strong>{{ money(billsRestOfMonth) }}</strong> of bills still to come</template>.
            <template v-if="leftThisMonth > 0">
              That's about <strong>{{ money(safePerDay) }}/day</strong> for the next {{ daysRemaining }} days.
            </template>
            <template v-else>
              You've spent more than you earned — a light week would help.
            </template>
          </div>
          <!-- How much of this month's income is already spoken for -->
          <div class="bb2-hero-track">
            <div class="bb2-hero-fill" :style="{ width: usedPct + '%' }" />
            <div v-if="billsPct > 0" class="bb2-hero-fill bb2-hero-fill--bills" :style="{ left: usedPct + '%', width: billsPct + '%' }" />
          </div>
          <div class="bb2-hero-legend">
            <span><i class="bb2-key bb2-key--spent" /> spent</span>
            <span v-if="billsRestOfMonth > 0"><i class="bb2-key bb2-key--bills" /> upcoming bills</span>
            <span><i class="bb2-key bb2-key--free" /> yours to keep</span>
          </div>
        </template>
        <template v-else>
          <div class="bb2-hero-big">{{ money(dash?.totalSpending ?? 0) }}
            <span class="bb2-hero-big-sub">spent this month</span>
          </div>
          <div class="bb2-hero-line">
            No income recorded yet this month — once a paycheck lands, this becomes
            "what's left to spend".
          </div>
        </template>
      </div>

      <!-- ── Do this next ──────────────────────────────────── -->
      <div class="bb2-next q-mb-lg">
        <div class="bb2-next-title"><q-icon name="checklist" size="16px" /> Do this next</div>
        <div v-for="(a, i) in nextActions" :key="i" class="bb2-next-row">
          <q-icon :name="a.icon" size="18px" :style="`color:${a.color}`" class="bb2-next-ic" />
          <span class="bb2-next-text">{{ a.text }}</span>
          <router-link :to="a.to" class="bb2-next-cta">{{ a.cta }} →</router-link>
        </div>
        <div v-if="nextActions.length === 0" class="bb2-next-empty">
          <q-icon name="check_circle" size="16px" style="color:#4ADE80" />
          Nothing needs your attention — you're all set.
        </div>
      </div>

      <!-- ── Three tiles ───────────────────────────────────── -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-sm-4">
          <div class="bb-stat">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background: var(--bb-accent)"></span>SPENDING</div>
            <div class="bb-stat-val">{{ money(dash?.totalSpending ?? 0) }}</div>
            <div class="bb-stat-row">
              <q-icon :name="spendingDown ? 'trending_down' : 'trending_up'" size="15px"
                :style="`color:${spendingDown ? '#22C55E' : '#EF4444'}`" />
              <span class="bb-stat-cmp">{{ spendingChangePct }} vs last month ({{ money(dash?.previousMonthSpending ?? 0) }})</span>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-4">
          <router-link to="/app/bills" class="bb2-tile-link">
            <div class="bb-stat">
              <div class="bb-stat-lbl"><span class="bb-dot" style="background:#F59E0B"></span>BILLS · NEXT 7 DAYS</div>
              <div class="bb-stat-val">{{ money(bills7Total) }}</div>
              <div class="bb-stat-row">
                <span class="bb-stat-cmp">
                  {{ bills7.length === 0 ? 'nothing due this week 🎉'
                    : bills7.map(b => b.name).slice(0, 2).join(', ') + (bills7.length > 2 ? ` +${bills7.length - 2} more` : '') }}
                </span>
              </div>
            </div>
          </router-link>
        </div>

        <div class="col-12 col-sm-4">
          <div class="bb-stat bb2-debt" @click="debtOpen = !debtOpen">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:#EF4444"></span>CARD DEBT
              <q-space /><q-icon name="expand_more" size="16px" class="bb2-debt-chev" :class="{ open: debtOpen }" />
            </div>
            <div class="bb-stat-val">{{ money(totalDebt) }}</div>
            <div v-if="overallUtilization != null" class="bb-du-bar-wrap">
              <div class="bb-du-bar" :class="overallUtilClass" :style="{ width: Math.min(overallUtilization, 100) + '%' }"></div>
              <div class="bb-du-mark"></div>
            </div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">
                {{ creditCards.length === 0 ? 'no credit-card debt'
                  : overallUtilization != null ? `${overallUtilization.toFixed(0)}% of your limits · tap for cards`
                  : `${creditCards.length} card${creditCards.length === 1 ? '' : 's'} · tap for details` }}
              </span>
            </div>
            <!-- Per-card detail, folded away by default -->
            <div v-if="debtOpen" class="bb-debt-util" @click.stop>
              <div v-for="c in creditCards" :key="c.id" class="bb-du-row" @click="editLimit(c)">
                <div class="bb-du-line1">
                  <span class="bb-du-name">{{ c.name }}</span>
                  <span v-if="c.hasLimit" class="bb-du-pct" :class="c.statusClass">{{ c.utilization.toFixed(0) }}%</span>
                  <span v-else class="bb-du-set">set limit</span>
                </div>
                <div v-if="c.hasLimit" class="bb-du-bar-wrap">
                  <div class="bb-du-bar" :class="c.statusClass" :style="{ width: Math.min(c.utilization, 100) + '%' }"></div>
                  <div class="bb-du-mark"></div>
                </div>
                <div class="bb-du-amt">{{ money(c.owed) }}<template v-if="c.hasLimit"> / {{ money(c.limit ?? 0) }}</template></div>
                <div v-if="c.warning" class="bb-du-warn" :class="c.statusClass">{{ c.warning }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── AI one-liner ──────────────────────────────────── -->
      <div class="bb2-ai q-mb-lg">
        <div class="bb2-ai-icon"><q-icon name="auto_awesome" size="15px" color="white" /></div>
        <div class="bb2-ai-body">
          <template v-if="aiSummary">
            <span class="bb2-ai-text" v-html="formatBold(aiSummary)" />
            <a v-if="aiSuggestions.length" class="bb2-ai-more" @click="aiOpen = !aiOpen">
              {{ aiOpen ? 'hide tips' : `${aiSuggestions.length} tips` }}
            </a>
            <ul v-if="aiOpen" class="bb2-ai-tips">
              <li v-for="(s, i) in aiSuggestions" :key="i">{{ s }}</li>
            </ul>
          </template>
          <span v-else-if="aiLoading" class="bb2-ai-text bb2-ai-dim">Reading this month's numbers…</span>
          <span v-else-if="aiError" class="bb2-ai-text" style="color:#EF4444">{{ aiError }}</span>
          <span v-else class="bb2-ai-text bb2-ai-dim">Your monthly AI read appears here.</span>
        </div>
        <q-btn flat round dense size="sm" icon="refresh" style="color: var(--bb-accent-light)" :loading="aiLoading" @click="loadAiSummary" />
      </div>

      <!-- ── Accounts strip ────────────────────────────────── -->
      <div class="bb2-accounts q-mb-lg">
        <div class="bb2-acct"><span class="bb2-acct-lbl">Checking</span><span class="bb2-acct-val">{{ money(checkingBalance) }}</span></div>
        <div class="bb2-acct"><span class="bb2-acct-lbl">Savings</span><span class="bb2-acct-val">{{ money(savingsBalance) }}</span></div>
        <div class="bb2-acct"><span class="bb2-acct-lbl">Card debt</span><span class="bb2-acct-val" style="color:#F87171">−{{ money(totalDebt) }}</span></div>
        <div class="bb2-acct bb2-acct--net"><span class="bb2-acct-lbl">Net worth</span><span class="bb2-acct-val">{{ money(netWorth) }}</span></div>
      </div>

      <!-- ── Charts (unchanged from classic) ───────────────── -->
      <div v-if="hasAnyData" class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-6">
          <div class="bb-chart-card">
            <div class="bb-chart-title">Spending by Category</div>
            <div class="bb-chart-sub">{{ currentMonth }}</div>
            <VueApexCharts v-if="hasCategoryData" :key="`cat2-${hideAmounts}`" type="bar" height="280" :options="categoryOpts" :series="categorySeries" />
            <div v-else class="bb2-chart-empty">No categorized spending yet this month.</div>
          </div>
        </div>
        <div class="col-12 col-md-6">
          <div class="bb-chart-card">
            <div class="bb-chart-title">Monthly Spending Trend</div>
            <div class="bb-chart-sub">last 6 months</div>
            <VueApexCharts :key="`trend2-${hideAmounts}`" type="area" height="280" :options="trendOpts" :series="trendSeries" />
          </div>
        </div>
      </div>

      <!-- ── Everything else, one tap away ─────────────────── -->
      <q-expansion-item class="bb2-details" dense expand-icon-class="bb2-details-icon">
        <template #header>
          <q-item-section>
            <span class="bb2-details-title"><q-icon name="unfold_more" size="16px" /> More details</span>
          </q-item-section>
        </template>

        <div class="row q-col-gutter-md q-pt-md">
          <!-- Top merchants -->
          <div class="col-12 col-md-4">
            <div class="bb-chart-card">
              <div class="bb-chart-title">Top merchants this month</div>
              <div v-if="(dash?.topMerchants?.length ?? 0) === 0" class="bb2-chart-empty">Nothing yet.</div>
              <div v-for="m in dash?.topMerchants ?? []" :key="m.merchant" class="bb2-merchant">
                <span class="bb2-merchant-name">{{ m.merchant }}</span>
                <span class="bb2-merchant-n">×{{ m.txCount }}</span>
                <span class="bb2-merchant-amt">{{ money(m.total) }}</span>
              </div>
            </div>
          </div>

          <!-- Money back -->
          <div class="col-12 col-md-4">
            <div class="bb-chart-card">
              <div class="bb-chart-title">Money back &amp; transfers</div>
              <div class="bb2-kv"><span>Refunds this month</span><strong>{{ money(dash?.refundsThisMonth ?? 0) }}</strong></div>
              <div class="bb2-kv"><span>Reimbursements this month</span><strong>{{ money(dash?.reimbursementsThisMonth ?? 0) }}</strong></div>
              <div class="bb2-kv"><span>Card payments this month</span><strong>{{ money(dash?.cardPaymentsThisMonth ?? 0) }}</strong></div>
              <div class="bb2-kv bb2-kv--dim"><span>Refunds YTD</span><strong>{{ money(dash?.refundsYtd ?? 0) }}</strong></div>
              <div class="bb2-kv bb2-kv--dim"><span>Reimbursements YTD</span><strong>{{ money(dash?.reimbursementsYtd ?? 0) }}</strong></div>
            </div>
          </div>

          <!-- Parking — only if the user actually has parking spend -->
          <div v-if="(dash?.parkingTxCount ?? 0) > 0" class="col-12 col-md-4">
            <div class="bb-chart-card">
              <div class="bb-chart-title">Parking (Metropolis)</div>
              <div class="bb2-kv"><span>This month</span><strong>{{ money(dash?.parkingSpend ?? 0) }} · {{ dash?.parkingTxCount ?? 0 }} visits</strong></div>
              <div class="bb2-kv bb2-kv--dim"><span>Year to date</span><strong>{{ money(dash?.parkingSpendYtd ?? 0) }}</strong></div>
            </div>
          </div>
        </div>
      </q-expansion-item>

    </template>
    </q-pull-to-refresh>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { themeColor } from 'src/services/theme';
import { api, type DashboardData, type Account, type Bill } from 'src/services/api';
import { auth } from 'src/services/auth';

const $q = useQuasar();
const now = new Date();
const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

const firstName = computed(() => {
  const name = auth.getUser()?.name?.trim();
  if (!name) return '';
  const first = name.split(/\s+/)[0] ?? '';
  return first.charAt(0).toUpperCase() + first.slice(1);
});
const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
});

const loading   = ref(true);
const loadError = ref('');
const dash      = ref<DashboardData | null>(null);
const accounts  = ref<Account[]>([]);
const bills     = ref<Bill[]>([]);
const debtOpen  = ref(false);
const aiOpen    = ref(false);
const budgetsCount = ref<number | null>(null); // null = couldn't load, don't nag
const unknownCount = ref(0);

// ── Privacy toggle (shared preference with the classic dashboard) ──
const hideAmounts = ref(localStorage.getItem('bb_hide_amounts') === '1');
function toggleHideAmounts() {
  hideAmounts.value = !hideAmounts.value;
  localStorage.setItem('bb_hide_amounts', hideAmounts.value ? '1' : '0');
}
function fmt(val: number) {
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money(val: number) {
  return hideAmounts.value ? '••••••' : fmt(val);
}

// ── The verdict ─────────────────────────────────────────────
// "Left this month" = income − spending − bills still to come this month.
// Works with no budgets configured; falls back gracefully when a user has no
// income recorded (e.g. only a credit card is linked).
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysInMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);

const upcomingBills = computed(() => bills.value.filter(b => b.status === 'upcoming' && b.dueDate >= isoLocal(now)));
const billsRestOfMonth = computed(() => {
  const eom = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return upcomingBills.value.filter(b => b.dueDate <= eom).reduce((s, b) => s + b.amount, 0);
});
const bills7 = computed(() => {
  const in7 = isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  return upcomingBills.value.filter(b => b.dueDate <= in7);
});
const bills7Total = computed(() => bills7.value.reduce((s, b) => s + b.amount, 0));

const hasIncome     = computed(() => (dash.value?.totalIncome ?? 0) > 0);
const leftThisMonth = computed(() =>
  (dash.value?.totalIncome ?? 0) - (dash.value?.totalSpending ?? 0) - billsRestOfMonth.value);
const safePerDay = computed(() => Math.max(0, leftThisMonth.value) / daysRemaining);

const verdict = computed<{ tone: 'good' | 'tight' | 'over' | 'info'; title: string }>(() => {
  if (!hasIncome.value) return { tone: 'info', title: 'This month so far' };
  if (leftThisMonth.value < 0) return { tone: 'over', title: "You're overspent this month" };
  if (leftThisMonth.value < (dash.value?.totalIncome ?? 0) * 0.1) return { tone: 'tight', title: "Getting tight — watch it" };
  return { tone: 'good', title: "You're on track this month" };
});

// Income bar: how much is already spent / spoken for by upcoming bills.
const usedPct  = computed(() => {
  const inc = dash.value?.totalIncome ?? 0;
  return inc > 0 ? Math.min(100, ((dash.value?.totalSpending ?? 0) / inc) * 100) : 0;
});
const billsPct = computed(() => {
  const inc = dash.value?.totalIncome ?? 0;
  return inc > 0 ? Math.min(100 - usedPct.value, (billsRestOfMonth.value / inc) * 100) : 0;
});

// ── "Do this next" ──────────────────────────────────────────
// The dashboard's job is to tell the user what to DO, not just show numbers.
// Derive up to 3 concrete actions, most urgent first, each with a link.
interface NextAction { icon: string; color: string; text: string; cta: string; to: string }

const nextActions = computed<NextAction[]>(() => {
  const out: NextAction[] = [];

  // 1. Overspent → point at the biggest category lever.
  if (hasIncome.value && leftThisMonth.value < 0) {
    const top = (dash.value?.categoryBreakdown ?? [])[0];
    if (top) {
      out.push({
        icon: 'content_cut', color: '#F87171',
        text: `You're ${money(-leftThisMonth.value)} over this month. ${top.category} is your biggest spend (${money(top.total)}) — trimming there helps most.`,
        cta: 'Review', to: `/app/transactions?category=${encodeURIComponent(top.category)}`,
      });
    }
  }

  // 2. This week's bills exceed what's sitting in checking.
  if (bills7Total.value > 0 && checkingBalance.value < bills7Total.value) {
    out.push({
      icon: 'warning_amber', color: '#FBBF24',
      text: `${money(bills7Total.value)} in bills hits this week but checking holds ${money(checkingBalance.value)} — move money over before they land.`,
      cta: 'See bills', to: '/app/bills',
    });
  }

  // 3. A card past the 30% utilization guideline.
  const worst = creditCards.value
    .filter(c => c.statusClass === 'is-over')
    .sort((a, b) => b.utilization - a.utilization)[0];
  if (worst) {
    out.push({
      icon: 'credit_card', color: '#F87171',
      text: `${worst.name} is at ${worst.utilization.toFixed(0)}% of its limit — paying ${money(worst.owed - (worst.limit ?? 0) * 0.3)} brings it under the 30% guideline (good for your credit score).`,
      cta: 'View card', to: `/app/transactions?account=${worst.id}`,
    });
  }

  // 4. Uncategorized transactions make every number on this page fuzzy.
  if (unknownCount.value >= 5) {
    out.push({
      icon: 'label', color: '#A78BFA',
      text: `${unknownCount.value} transactions have no category yet — filing them keeps these numbers honest.`,
      cta: 'Categorize', to: '/app/categories',
    });
  }

  // 5. No budgets at all → one-tap AI setup.
  if (budgetsCount.value === 0) {
    out.push({
      icon: 'savings', color: '#8B6FEC',
      text: 'No budgets set — the AI can build a full set from last month’s spending in one tap.',
      cta: 'Build budgets', to: '/app/budgets',
    });
  }

  // 6. Ahead this month → nudge the surplus somewhere useful.
  if (out.length === 0 && verdict.value.tone === 'good' && leftThisMonth.value > 100) {
    out.push({
      icon: 'flag', color: '#4ADE80',
      text: `You're ahead — moving ${money(Math.round(leftThisMonth.value / 2))} into savings now beats letting it evaporate by month-end.`,
      cta: 'Savings goals', to: '/app/goals',
    });
  }

  return out.slice(0, 3);
});

// ── Anomalies (same behavior as classic) ────────────────────
function readDismissed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('bb_dismissed_anomalies') || '{}') as Record<string, boolean>; }
  catch { return {}; }
}
const dismissedAnomalies = ref<Record<string, boolean>>(readDismissed());
function anomalyKey(category: string) {
  return `${category}|${Math.floor(Date.now() / (7 * 86_400_000))}`;
}
const visibleAnomalies = computed(() =>
  (dash.value?.anomalies ?? []).filter((a) => !dismissedAnomalies.value[anomalyKey(a.category)]));
function dismissAnomaly(category: string) {
  dismissedAnomalies.value = { ...dismissedAnomalies.value, [anomalyKey(category)]: true };
  localStorage.setItem('bb_dismissed_anomalies', JSON.stringify(dismissedAnomalies.value));
}

// ── Debt / accounts (same math as classic) ──────────────────
const owedFor = (a: Account) =>
  a.current_balance != null ? Math.max(0, a.current_balance) : Math.max(0, -(a.balance ?? 0));

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
    .filter(c => c.owed > 0));

const totalDebt = computed(() => creditCards.value.reduce((s, c) => s + c.owed, 0));
// One overall utilization number across every card that has a limit set.
const overallUtilization = computed(() => {
  const withLimit = creditCards.value.filter(c => c.hasLimit);
  const limits = withLimit.reduce((s, c) => s + (c.limit ?? 0), 0);
  if (!limits) return null;
  return (withLimit.reduce((s, c) => s + c.owed, 0) / limits) * 100;
});
const overallUtilClass = computed(() => {
  const u = overallUtilization.value ?? 0;
  return u >= 30 ? 'is-over' : u >= 25 ? 'is-near' : 'is-good';
});

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

const matchAccounts = (re: RegExp) =>
  accounts.value.filter(a => !a.is_archived && (re.test(a.type ?? '') || re.test(a.name ?? '')));
const contributingBalance = (list: Account[]) => {
  const linked = list.filter(a => a.current_balance != null);
  const chosen = linked.length ? linked : list;
  return chosen.reduce((s, a) => s + (a.current_balance ?? a.balance ?? 0), 0);
};
const isHsa = (a: Account) => /hsa|health\s*saving/i.test(`${a.type ?? ''} ${a.name ?? ''}`);
const checkingBalance = computed(() => contributingBalance(matchAccounts(/check/i)));
const savingsBalance  = computed(() => contributingBalance(matchAccounts(/saving/i).filter(a => !isHsa(a))));
const netWorth        = computed(() => checkingBalance.value + savingsBalance.value - totalDebt.value);

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

// ── AI one-liner (auto-loads once per session) ──────────────
const aiLoading = ref(false);
const aiError   = ref('');
const aiSummary = ref('');
const aiSuggestions = ref<string[]>([]);

function formatBold(text: string) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

async function loadAiSummary() {
  aiLoading.value = true;
  aiError.value = '';
  try {
    const result = await api.getAiSummary(now.getMonth() + 1, now.getFullYear());
    aiSummary.value = result.summary;
    aiSuggestions.value = result.suggestions;
    sessionStorage.setItem('bb2_ai_summary', JSON.stringify(result));
  } catch (e) {
    aiError.value = e instanceof Error ? e.message : 'Failed to generate summary';
  } finally {
    aiLoading.value = false;
  }
}

// ── Data loading / bank sync ────────────────────────────────
async function load() {
  try {
    const from = isoLocal(now);
    const to = isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 31));
    const [dashData, acctData, cal, budgets, unknowns] = await Promise.all([
      api.getDashboard(),
      api.getAccounts(),
      api.getCalendar(from, to).catch(() => ({ bills: [] as Bill[] })),
      // These two only feed the "Do this next" list — never block the page on them.
      api.getBudgets().catch(() => null),
      api.getUnknownTransactions().catch(() => []),
    ]);
    dash.value = dashData;
    accounts.value = acctData;
    bills.value = cal.bills;
    budgetsCount.value = budgets ? budgets.budgets.length : null;
    unknownCount.value = unknowns.length;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load dashboard';
  } finally {
    loading.value = false;
  }
}

const hasCategoryData = computed(() => (dash.value?.categoryBreakdown.length ?? 0) > 0);
const hasAnyData = computed(() => hasCategoryData.value || (dash.value?.monthlyTrend?.length ?? 0) > 0);

const connecting = ref(false);
const syncing = ref(false);
const bankError = ref('');

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
async function syncBank() {
  bankError.value = '';
  syncing.value = true;
  try {
    await api.syncPlaid();
    await load();
  } catch (e) {
    bankError.value = e instanceof Error ? e.message : 'Failed to sync';
  } finally {
    syncing.value = false;
  }
}
async function onPullRefresh(done: () => void) {
  try { await syncBank(); } finally { done(); }
}

onMounted(async () => {
  await load();
  // Reuse a summary generated earlier this session; only auto-generate once so
  // opening the dashboard repeatedly doesn't burn AI credits.
  const cached = sessionStorage.getItem('bb2_ai_summary');
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { summary: string; suggestions: string[] };
      aiSummary.value = parsed.summary;
      aiSuggestions.value = parsed.suggestions;
      return;
    } catch { /* fall through to a fresh generation */ }
  }
  void loadAiSummary();
});

// ── Charts (identical config to classic) ────────────────────
const categorySeries = computed(() => [{
  name: 'Spent',
  data: (dash.value?.categoryBreakdown ?? []).map(c => ({ x: c.category, y: Math.round(c.total * 100) / 100 })),
}]);
const trendSeries = computed(() => [
  { name: 'Spending', data: (dash.value?.monthlyTrend ?? []).map(t => Math.round(t.spending)) },
  { name: 'Income',   data: (dash.value?.monthlyTrend ?? []).map(t => Math.round(t.income)) },
]);
const trendYMax = computed(() => {
  const vals = (dash.value?.monthlyTrend ?? []).flatMap(t => [t.spending, t.income]);
  const peak = Math.max(0, ...vals);
  return Math.max(1000, Math.ceil(peak / 1000) * 1000);
});
const trendOpts = computed<ApexOptions>(() => ({
  chart: { type: 'area', background: 'transparent', toolbar: { show: false }, foreColor: '#6E6E9A' },
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
    min: 0, max: trendYMax.value, tickAmount: trendYMax.value / 1000,
    labels: { style: { colors: '#6E6E9A', fontSize: '11px' }, formatter: (v: number) => hideAmounts.value ? '••' : `$${v.toLocaleString()}` },
  },
  legend: { labels: { colors: '#6E6E9A' } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => hideAmounts.value ? '••••' : `$${v.toLocaleString()}` } },
}));
const categoryOpts = computed<ApexOptions>(() => ({
  chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, foreColor: '#6E6E9A' },
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
.bb-dash2 { background-color: var(--bb-bg); min-height: 100vh; }

.bb2-switch { color: var(--bb-accent-light); text-decoration: none; &:hover { text-decoration: underline; } }

/* ── Hero ── */
.bb2-hero {
  border-radius: 16px; padding: 24px;
  background: linear-gradient(145deg, var(--bb-grad-deep-a), var(--bb-surface));
  border: 1px solid rgba(var(--bb-accent-rgb), 0.25);
  &--good  { border-color: rgba(34, 197, 94, 0.35);  .bb2-hero-dot { background: #22C55E; } .bb2-hero-status { color: #4ADE80; } }
  &--tight { border-color: rgba(245, 158, 11, 0.35); .bb2-hero-dot { background: #F59E0B; } .bb2-hero-status { color: #FBBF24; } }
  &--over  { border-color: rgba(239, 68, 68, 0.4);   .bb2-hero-dot { background: #EF4444; } .bb2-hero-status { color: #F87171; } }
  &--info  { .bb2-hero-dot { background: var(--bb-accent-light); } .bb2-hero-status { color: var(--bb-accent-light); } }
}
.bb2-hero-status {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 10px;
}
.bb2-hero-dot { width: 9px; height: 9px; border-radius: 50%; }
.bb2-hero-big {
  font-size: 40px; font-weight: 800; color: var(--bb-text); letter-spacing: -1px; line-height: 1.1;
  &.is-negative { color: #F87171; }
}
.bb2-hero-big-sub { font-size: 14px; font-weight: 500; color: var(--bb-text-soft); letter-spacing: 0; margin-left: 6px; }
.bb2-hero-line { font-size: 14px; color: var(--bb-text-soft); line-height: 1.6; margin-top: 10px; max-width: 640px;
  strong { color: var(--bb-text); } }
.bb2-hero-track {
  position: relative; height: 10px; margin-top: 16px;
  background: rgba(34, 197, 94, 0.25); border-radius: 999px; overflow: hidden;
}
.bb2-hero-fill { position: absolute; top: 0; bottom: 0; left: 0; background: var(--bb-accent); }
.bb2-hero-fill--bills { background: #F59E0B; }
.bb2-hero-legend {
  display: flex; gap: 16px; margin-top: 8px; font-size: 11px; color: var(--bb-text-soft);
  span { display: inline-flex; align-items: center; gap: 5px; }
}
.bb2-key { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.bb2-key--spent { background: var(--bb-accent); }
.bb2-key--bills { background: #F59E0B; }
.bb2-key--free  { background: rgba(34, 197, 94, 0.5); }

/* ── Tiles ── */
.bb2-tile-link { text-decoration: none; display: block; .bb-stat:hover { border-color: rgba(var(--bb-accent-rgb),0.4); } }
.bb2-debt { cursor: pointer; &:hover { border-color: rgba(var(--bb-accent-rgb),0.4); } }
.bb2-debt-chev { transition: transform 0.2s ease; color: var(--bb-text-dim); &.open { transform: rotate(180deg); } }

/* ── AI strip ── */
.bb2-ai {
  display: flex; align-items: flex-start; gap: 12px;
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 14px; padding: 14px 16px;
}
.bb2-ai-icon {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));
  display: flex; align-items: center; justify-content: center;
}
.bb2-ai-body { flex: 1; min-width: 0; }
.bb2-ai-text { font-size: 13px; color: var(--bb-text-soft); line-height: 1.6; strong { color: var(--bb-text); } }
.bb2-ai-dim  { color: var(--bb-text-dim); }
.bb2-ai-more { color: var(--bb-accent-light); font-size: 12px; font-weight: 600; margin-left: 8px; cursor: pointer; white-space: nowrap; }
.bb2-ai-tips { margin: 8px 0 0; padding-left: 18px; li { font-size: 13px; color: var(--bb-text-soft); line-height: 1.7; } }

/* ── Accounts strip ── */
.bb2-accounts {
  display: flex; flex-wrap: wrap; gap: 10px;
}
.bb2-acct {
  flex: 1; min-width: 130px;
  display: flex; flex-direction: column; gap: 2px;
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 12px; padding: 12px 16px;
  &--net { border-color: rgba(var(--bb-accent-rgb),0.35); background: linear-gradient(145deg,var(--bb-grad-deep-a),var(--bb-surface)); }
}
.bb2-acct-lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--bb-text-dim); }
.bb2-acct-val { font-size: 17px; font-weight: 700; color: var(--bb-text); font-variant-numeric: tabular-nums; }

/* ── Details accordion ── */
.bb2-details {
  background: var(--bb-surface-2); border: 1px solid var(--bb-border); border-radius: 14px;
  .q-item { padding: 10px 16px; }
}
.bb2-details-title { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--bb-text-soft); }
.bb2-details-icon { color: var(--bb-text-dim); }
.bb2-chart-empty { font-size: 13px; color: var(--bb-text-dim); padding: 18px 0; }

.bb2-merchant {
  display: flex; align-items: baseline; gap: 8px; padding: 7px 0;
  border-bottom: 1px solid var(--bb-border);
  &:last-child { border-bottom: none; }
}
.bb2-merchant-name { flex: 1; min-width: 0; font-size: 13px; color: var(--bb-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb2-merchant-n { font-size: 11px; color: var(--bb-text-dim); }
.bb2-merchant-amt { font-size: 13px; font-weight: 600; color: var(--bb-text); font-variant-numeric: tabular-nums; }

.bb2-kv {
  display: flex; justify-content: space-between; gap: 10px; padding: 6px 0;
  font-size: 13px; color: var(--bb-text-soft);
  strong { color: var(--bb-text); font-variant-numeric: tabular-nums; }
  &--dim { color: var(--bb-text-dim); strong { color: var(--bb-text-soft); } }
}

/* ── Do this next ── */
.bb2-next {
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 14px; padding: 14px 16px;
}
.bb2-next-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase;
  color: var(--bb-text-soft); margin-bottom: 10px;
}
.bb2-next-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 9px 0; border-bottom: 1px solid var(--bb-border);
  &:last-of-type { border-bottom: none; }
}
.bb2-next-ic { flex-shrink: 0; margin-top: 1px; }
.bb2-next-text { flex: 1; min-width: 0; font-size: 13px; color: var(--bb-text-soft); line-height: 1.55; }
.bb2-next-cta {
  flex-shrink: 0; align-self: center;
  font-size: 12px; font-weight: 700; color: var(--bb-accent-light); text-decoration: none;
  background: rgba(var(--bb-accent-rgb),0.14); border-radius: 8px; padding: 6px 12px;
  white-space: nowrap;
  &:hover { background: rgba(var(--bb-accent-rgb),0.28); }
}
.bb2-next-empty {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--bb-text-soft); padding: 4px 0;
}

/* Phones: tighter hero, 2×2 account grid, action buttons drop below their text */
@media (max-width: 599px) {
  .bb2-hero { padding: 18px; }
  .bb2-hero-big { font-size: 32px; }
  .bb2-hero-legend { flex-wrap: wrap; gap: 6px 14px; }
  .bb2-accounts { display: grid; grid-template-columns: 1fr 1fr; }
  .bb2-acct { min-width: 0; }
  .bb2-next-row { flex-wrap: wrap; }
  .bb2-next-cta { margin-left: 28px; }
}
</style>
