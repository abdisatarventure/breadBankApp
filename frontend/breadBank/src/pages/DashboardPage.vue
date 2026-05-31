<template>
  <q-page class="bb-dash q-pa-lg">

    <!-- Header -->
    <div class="bb-page-header">
      <div class="bb-page-title">Welcome Back!</div>
      <div class="bb-page-sub">Here's your financial summary for {{ currentMonth }}</div>
    </div>

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
                style="color:#8B6FEC; font-size:11px"
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
                <q-icon name="arrow_right" size="14px" style="color:#6C4ED4;flex-shrink:0" />
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
            <div class="bb-stat-val">{{ fmt(totalDebt) }}</div>
            <div class="bb-stat-row bb-debt-breakdown">
              <span v-for="d in debtBreakdown" :key="d.name" class="bb-debt-item">
                {{ d.name }} <strong>{{ fmt(d.owed) }}</strong>
              </span>
              <span v-if="debtBreakdown.length === 0" class="bb-stat-cmp">no credit cards</span>
            </div>
          </div>
        </div>

        <!-- Monthly Spending -->
        <div class="col-6 col-md-3">
          <div class="bb-stat bb-stat--gradient">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:rgba(255,255,255,0.6)"></span>
              MONTHLY SPENDING
            </div>
            <div class="bb-stat-val">{{ fmt(dash?.totalSpending ?? 0) }}</div>
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
              <span class="bb-dot" style="background:#6C4ED4"></span>
              MONTHLY INCOME
            </div>
            <div class="bb-stat-val">{{ fmt(dash?.totalIncome ?? 0) }}</div>
            <div class="bb-stat-row">
              <span class="bb-badge-neutral">this month</span>
            </div>
          </div>
        </div>

        <!-- Net Savings -->
        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#22C55E"></span>
              NET SAVINGS
            </div>
            <div class="bb-stat-val">{{ fmt(dash?.netSavings ?? 0) }}</div>
            <div class="bb-stat-row">
              <span class="bb-savings-rate">{{ (dash?.savingsRate ?? 0).toFixed(0) }}% rate</span>
            </div>
            <div class="bb-savings-bar-wrap">
              <div class="bb-savings-bar" :style="{ width: Math.min(dash?.savingsRate ?? 0, 100) + '%' }" />
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
            <div class="bb-stat-val">{{ fmt(dash?.parkingSpend ?? 0) }}</div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">
                {{ (dash?.parkingTxCount ?? 0) === 1 ? '1 charge' : (dash?.parkingTxCount ?? 0) + ' charges' }} this month
              </span>
            </div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">{{ fmt(dash?.parkingSpendYtd ?? 0) }} so far this year</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!hasData" class="bb-no-data">
        <q-icon name="upload_file" size="48px" style="color:#6C4ED4;opacity:0.4" />
        <div class="bb-no-data-title">No transactions yet</div>
        <div class="bb-no-data-sub">Upload a CSV from Wells Fargo, Apple Card, or Discover to get started</div>
        <q-btn no-caps unelevated label="Upload your first statement" to="/app/upload"
          style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px;margin-top:8px" />
      </div>

      <!-- Charts -->
      <div v-else class="row q-col-gutter-md">

        <!-- Spending by Category -->
        <div class="col-12 col-md-6">
          <div class="bb-chart-card">
            <div class="bb-chart-hdr">
              <div>
                <div class="bb-chart-title">Spending by Category</div>
                <div class="bb-chart-sub">This month's breakdown</div>
              </div>
              <q-btn flat round dense icon="more_vert" size="sm" style="color:#6E6E9A" />
            </div>
            <VueApexCharts type="bar" height="280" :options="categoryOpts" :series="categorySeries" />
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
              <q-btn flat round dense icon="more_vert" size="sm" style="color:#6E6E9A" />
            </div>
            <VueApexCharts type="area" height="280" :options="trendOpts" :series="trendSeries" />
          </div>
        </div>

      </div>

    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { api, type DashboardData, type Account } from 'src/services/api';

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

const hasData      = computed(() => (dash.value?.categoryBreakdown.length ?? 0) > 0);

// For a credit account, balance = payments - purchases, so the amount still
// owed is the negation of that. Clamp at 0 so a paid-off/overpaid card reads
// as $0 owed rather than a negative "debt".
const owedFor = (a: Account) => Math.max(0, -(a.balance ?? 0));
const debtBreakdown = computed(() =>
  accounts.value
    .filter(a => a.type === 'credit')
    .map(a => ({ name: a.name, owed: owedFor(a) })),
);
const totalDebt = computed(() => debtBreakdown.value.reduce((s, d) => s + d.owed, 0));

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

onMounted(async () => {
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
});

// ── Charts ─────────────────────────────────────────────────

const categorySeries = computed(() => [{
  name: 'Spent',
  data: (dash.value?.categoryBreakdown ?? []).map(c => ({ x: c.category, y: Math.round(c.total) })),
}]);

const trendSeries = computed(() => [
  { name: 'Spending', data: (dash.value?.monthlyTrend ?? []).map(t => Math.round(t.spending)) },
  { name: 'Income',   data: (dash.value?.monthlyTrend ?? []).map(t => Math.round(t.income)) },
]);

const trendOpts = computed<ApexOptions>(() => ({
  chart: { type: 'area', background: 'transparent', toolbar: { show: false }, foreColor: '#6E6E9A' },
  colors: ['#6C4ED4', '#22C55E'],
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
    labels: { style: { colors: '#6E6E9A', fontSize: '11px' }, formatter: (v: number) => `$${v.toLocaleString()}` },
  },
  legend: { labels: { colors: '#6E6E9A' } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => `$${v.toLocaleString()}` } },
}));

const categoryOpts: ApexOptions = {
  chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, foreColor: '#6E6E9A' },
  plotOptions: { bar: { horizontal: true, borderRadius: 4, borderRadiusApplication: 'end', barHeight: '60%' } },
  colors: ['#6C4ED4'],
  dataLabels: {
    enabled: true,
    formatter: (val: number) => `$${val}`,
    style: { fontSize: '11px', colors: ['#ffffff'] },
    offsetX: -4,
  },
  grid: { borderColor: 'rgba(255,255,255,0.04)', strokeDashArray: 4 },
  xaxis: {
    labels: { style: { colors: '#6E6E9A', fontSize: '11px' }, formatter: (v: string) => `$${v}` },
    axisBorder: { show: false }, axisTicks: { show: false },
  },
  yaxis: { labels: { style: { colors: '#b0b0cc', fontSize: '12px' } } },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => `$${v.toLocaleString()}` } },
};
</script>

<style lang="scss">
.bb-dash { background-color: #0A0A1B; min-height: 100vh; }

.bb-loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 300px; gap: 16px;
  color: #6E6E9A; font-size: 14px;
}

.bb-no-data {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 24px; gap: 10px;
  background: #0F1030; border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px; text-align: center;
}
.bb-no-data-title { font-size: 16px; font-weight: 600; color: #ffffff; }
.bb-no-data-sub   { font-size: 13px; color: #6E6E9A; max-width: 360px; }

.bb-ai-card {
  background: #0F1030; border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px; padding: 18px 20px; height: 100%;
}
.bb-suggestions-card { border-color: rgba(108,78,212,0.2); }

.bb-ai-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
}
.bb-ai-icon {
  width: 26px; height: 26px; border-radius: 6px;
  background: linear-gradient(135deg,#6C4ED4,#8B6FEC);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  &--pink { background: linear-gradient(135deg,#E040FB,#6C4ED4); }
}
.bb-ai-label  { font-size: 13px; font-weight: 600; color: #ffffff; }
.bb-ai-badge  { background: rgba(108,78,212,0.2) !important; color: #8B6FEC !important; font-size: 10px !important; }
.bb-ai-text   { font-size: 13px; color: #9090B8; line-height: 1.6; margin: 0; strong { color: #ffffff; } }
.bb-ai-placeholder { font-style: italic; opacity: 0.5; }

.bb-suggestions {
  list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;
  li { display: flex; align-items: flex-start; gap: 6px; font-size: 13px; color: #9090B8; line-height: 1.5; }
}

.bb-stat {
  background: #0F1030; border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px; padding: 18px; height: 100%;
  &--gradient { background: linear-gradient(145deg,#2D1A6E,#1A1040); border-color: rgba(108,78,212,0.25); }
}
.bb-stat-lbl {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 600; letter-spacing: 0.7px;
  text-transform: uppercase; color: #6E6E9A; margin-bottom: 8px;
}
.bb-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.bb-stat-val { font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; margin-bottom: 6px; }
.bb-stat-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.bb-stat-cmp { font-size: 11px; color: #6E6E9A; }

.bb-debt-breakdown { flex-wrap: wrap; gap: 4px 10px; }
.bb-debt-item {
  font-size: 11px;
  color: #6E6E9A;
  strong { color: #EF4444; font-weight: 600; }
}

.bb-badge-up      { font-size: 10px; font-weight: 600; background: rgba(34,197,94,0.15);  color: #22C55E; padding: 2px 7px; border-radius: 20px; }
.bb-badge-down-good { font-size: 10px; font-weight: 600; background: rgba(34,197,94,0.15);  color: #22C55E; padding: 2px 7px; border-radius: 20px; }
.bb-badge-up-bad  { font-size: 10px; font-weight: 600; background: rgba(239,68,68,0.15);   color: #EF4444; padding: 2px 7px; border-radius: 20px; }
.bb-badge-neutral { font-size: 10px; font-weight: 600; background: rgba(110,110,154,0.15); color: #6E6E9A; padding: 2px 7px; border-radius: 20px; }

.bb-savings-rate { font-size: 11px; font-weight: 600; color: #22C55E; }
.bb-savings-bar-wrap { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-top: 4px; }
.bb-savings-bar { height: 100%; background: linear-gradient(90deg,#6C4ED4,#22C55E); border-radius: 2px; transition: width 0.6s ease; }

.bb-chart-card { background: #0F1030; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 20px; }
.bb-chart-hdr  { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
.bb-chart-title { font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 2px; }
.bb-chart-sub   { font-size: 12px; color: #6E6E9A; }
</style>
