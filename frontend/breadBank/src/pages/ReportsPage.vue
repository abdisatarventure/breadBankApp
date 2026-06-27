<template>
  <q-page class="bb-reports q-pa-lg">
    <div class="bb-page-header">
      <div>
        <div class="bb-page-title">Reports</div>
        <div class="bb-page-sub">Deep dives — top merchants, year-over-year comparison, category trends</div>
      </div>
    </div>

    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="40px" />
      <span>Loading your reports...</span>
    </div>

    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else>
      <div v-if="!hasData" class="bb-no-data q-mb-lg">
        <q-icon name="upload_file" size="48px" style="color:#6C4ED4;opacity:0.4" />
        <div class="bb-no-data-title">No reporting data yet</div>
        <div class="bb-no-data-sub">Upload transaction CSVs to unlock merchant, category, and year-over-year reporting.</div>
        <q-btn no-caps unelevated label="Upload your first statement" to="/app/upload"
          style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px;margin-top:12px" />
      </div>

      <template v-else>
        <div class="row q-col-gutter-md q-mb-lg">
          <div class="col-12 col-lg-4">
            <div class="bb-report-card">
              <div class="bb-report-card__header">
                <div>
                  <div class="bb-report-card__title">Top Merchants</div>
                  <div class="bb-report-card__sub">Last 12 months</div>
                </div>
              </div>
              <div class="bb-report-list">
                <div v-for="(merchant, index) in topMerchants" :key="merchant.merchant" class="bb-report-row">
                  <div>
                    <div class="bb-report-row__label">{{ index + 1 }}. {{ merchant.merchant }}</div>
                    <div class="bb-report-row__meta">{{ merchant.txCount }} charges</div>
                  </div>
                  <div class="bb-report-row__value">{{ fmt(merchant.total) }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 col-lg-4">
            <div class="bb-report-card bb-report-card--accent">
              <div class="bb-report-card__header">
                <div>
                  <div class="bb-report-card__title">Year-over-Year</div>
                  <div class="bb-report-card__sub">Compare this year to last year</div>
                </div>
              </div>
              <div class="bb-report-summary">
                <div class="bb-report-summary__line">
                  <span>Year-to-date spend</span>
                  <strong>{{ fmt(yearOverview.currentYearTotal) }}</strong>
                </div>
                <div class="bb-report-summary__line bb-report-summary__line--sub">
                  <span>Last year</span>
                  <span>{{ fmt(yearOverview.priorYearTotal) }}</span>
                </div>
                <div class="bb-report-pill" :class="yearChange.class">
                  {{ yearChange.label }}
                </div>
              </div>
              <q-separator spaced />
              <div class="bb-report-summary">
                <div class="bb-report-summary__line">
                  <span>Same month</span>
                  <strong>{{ fmt(yearOverview.currentMonthTotal) }}</strong>
                </div>
                <div class="bb-report-summary__line bb-report-summary__line--sub">
                  <span>Same month last year</span>
                  <span>{{ fmt(yearOverview.priorMonthTotal) }}</span>
                </div>
                <div class="bb-report-pill" :class="monthChange.class">
                  {{ monthChange.label }}
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 col-lg-4">
            <div class="bb-report-card">
              <div class="bb-report-card__header">
                <div>
                  <div class="bb-report-card__title">Category Trends</div>
                  <div class="bb-report-card__sub">Top categories this year vs last year</div>
                </div>
              </div>
              <div class="bb-report-trends">
                <div v-for="trend in categoryTrends.slice(0, 5)" :key="trend.category" class="bb-trend-row">
                  <div class="bb-trend-label">{{ trend.category }}</div>
                  <div class="bb-trend-values">
                    <span>{{ fmt(trend.thisYearTotal) }}</span>
                    <span class="bb-trend-values__compare">{{ fmt(trend.lastYearTotal) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <div class="bb-report-card">
              <div class="bb-report-card__header">
                <div>
                  <div class="bb-report-card__title">Category Trend Chart</div>
                  <div class="bb-report-card__sub">Top categories across both years</div>
                </div>
              </div>
              <VueApexCharts type="bar" height="320" :options="categoryChartOptions" :series="categoryChartSeries" />
            </div>
          </div>

          <div class="col-12 col-md-6">
            <div class="bb-report-card">
              <div class="bb-report-card__header">
                <div>
                  <div class="bb-report-card__title">Insights</div>
                  <div class="bb-report-card__sub">What the current trends mean</div>
                </div>
              </div>
              <div class="bb-insight-list">
                <div class="bb-insight-item">
                  <div class="bb-insight-tag">Top merchant</div>
                  <div>{{ topMerchants[0]?.merchant ?? 'No merchant data' }}</div>
                </div>
                <div class="bb-insight-item">
                  <div class="bb-insight-tag">Biggest category gain</div>
                  <div>{{ biggestGainCategory }}</div>
                </div>
                <div class="bb-insight-item">
                  <div class="bb-insight-tag">Fastest declining category</div>
                  <div>{{ biggestDropCategory }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Monthly breakdown: every month of a chosen year, side by side -->
        <div class="row q-mt-lg">
          <div class="col-12">
            <div class="bb-report-card">
              <div class="bb-report-card__header">
                <div>
                  <div class="bb-report-card__title">Monthly Breakdown</div>
                  <div class="bb-report-card__sub">Spending, income &amp; net for every month of {{ selectedYear ?? '—' }}</div>
                </div>
                <q-select
                  v-if="availableYears.length"
                  :model-value="selectedYear"
                  :options="availableYears"
                  dense outlined dark options-dark
                  class="bb-year-select"
                  @update:model-value="onYearChange"
                />
              </div>

              <div v-if="monthlyLoading" class="bb-loading"><q-spinner color="primary" size="24px" /> <span>Loading…</span></div>

              <template v-else-if="hasMonthlyData">
                <VueApexCharts type="bar" height="300" :options="monthlyChartOptions" :series="monthlyChartSeries" />

                <div class="bb-month-table">
                  <div class="bb-month-row bb-month-row--head">
                    <span>Month</span>
                    <span class="bb-month-num">Spending</span>
                    <span class="bb-month-num">Income</span>
                    <span class="bb-month-num">Net</span>
                    <span class="bb-month-num">Saved %</span>
                    <span class="bb-month-num">Spend vs prev</span>
                    <span class="bb-month-num">Net worth</span>
                  </div>
                  <div v-for="row in monthlyRows" :key="row.monthKey" class="bb-month-row">
                    <span>{{ row.label }}</span>
                    <!-- Months that haven't started yet have no data — show "—" everywhere. -->
                    <template v-if="row.isFuture">
                      <span v-for="n in 6" :key="n" class="bb-month-num bb-month-muted">—</span>
                    </template>
                    <template v-else>
                      <span class="bb-month-num">{{ fmt(row.spending) }}</span>
                      <span class="bb-month-num bb-amt-income">{{ fmt(row.income) }}</span>
                      <span class="bb-month-num" :class="row.net >= 0 ? 'bb-amt-income' : 'bb-amt-neg'">{{ fmt(row.net) }}</span>
                      <!-- Savings rate: green when you kept money (income > spending), red when you overspent. -->
                      <span class="bb-month-num" :class="row.savedPct == null ? 'bb-month-muted' : row.savedPct >= 0 ? 'bb-amt-income' : 'bb-amt-neg'">
                        {{ row.savedPct == null ? '—' : `${row.savedPct >= 0 ? '+' : ''}${row.savedPct.toFixed(0)}%` }}
                      </span>
                      <!-- Spending change vs last month: more spending is the bad direction (red), less is good (green). -->
                      <span class="bb-month-num" :class="row.delta == null ? 'bb-month-muted' : row.delta > 0 ? 'bb-amt-neg' : 'bb-amt-income'">
                        {{ row.delta == null ? '—' : `${row.delta > 0 ? '+' : ''}${row.delta.toFixed(0)}%` }}
                      </span>
                      <span class="bb-month-num" :class="row.netWorth >= 0 ? 'bb-amt-income' : 'bb-amt-neg'">{{ fmt(row.netWorth) }}</span>
                    </template>
                  </div>
                </div>
              </template>

              <div v-else class="bb-month-empty">No transactions in {{ selectedYear ?? 'this year' }}.</div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { ApexOptions } from 'apexcharts';
import VueApexCharts from 'vue3-apexcharts';
import { api, type ReportsData, type MonthlyBreakdown } from 'src/services/api';

const loading = ref(true);
const loadError = ref('');
const reports = ref<ReportsData | null>(null);

// ── Monthly breakdown (per-month compare for a selectable year) ──────
const monthly = ref<MonthlyBreakdown | null>(null);
const selectedYear = ref<number | null>(null);
const monthlyLoading = ref(false);

const hasData = computed(() => !!reports.value && reports.value.topMerchants.length > 0);
const topMerchants = computed(() => reports.value?.topMerchants ?? []);
const categoryTrends = computed(() => reports.value?.categoryTrends ?? []);
const yearOverview = computed(() => reports.value?.yearOverview ?? {
  currentYearTotal: 0,
  priorYearTotal: 0,
  currentMonthTotal: 0,
  priorMonthTotal: 0,
});

const categoryChartSeries = computed(() => [
  {
    name: 'This Year',
    data: categoryTrends.value.slice(0, 6).map((item) => item.thisYearTotal),
  },
  {
    name: 'Last Year',
    data: categoryTrends.value.slice(0, 6).map((item) => item.lastYearTotal),
  },
]);

const categoryChartOptions = computed<ApexOptions>(() => ({
  chart: {
    toolbar: { show: false },
    foreColor: '#C6C6E5',
  },
  plotOptions: {
    bar: { horizontal: false, columnWidth: '58%', borderRadius: 6 },
  },
  dataLabels: { enabled: false },
  legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: '#B0B0C3' } },
  stroke: { show: true, width: 2, colors: ['transparent'] },
  xaxis: {
    categories: categoryTrends.value.slice(0, 6).map((item) => item.category),
    labels: { style: { colors: '#B0B0C3' } },
  },
  yaxis: {
    labels: { formatter: (val) => `$${Number(val).toLocaleString()}`, style: { colors: '#B0B0C3' } },
  },
  tooltip: {
    y: { formatter: (val) => `$${Number(val).toLocaleString()}` },
  },
  grid: { borderColor: '#1F1F3A' },
  fill: { opacity: 1 },
  colors: ['#6C4ED4', '#22C55E'],
}));

// Build a spend-comparison pill. For a spending metric, spending *more* is the
// unfavourable direction (red); spending less is favourable (green).
// When the prior period is zero or negligibly small, a percentage explodes into
// a meaningless figure (e.g. +99506.9%), so we fall back to the dollar delta or
// a plain "no comparison" message instead.
function buildChange(current: number, prior: number, suffix: string) {
  const diff = current - prior;
  const cls = diff > 0 ? 'bb-pill-negative' : 'bb-pill-positive';
  const signedDollar = `${diff >= 0 ? '+' : '-'}${fmt(Math.abs(diff))}`;

  if (prior <= 0) {
    if (current <= 0) return { label: `No ${suffix} comparison`, class: 'bb-pill-neutral' };
    return { label: `${signedDollar} ${suffix} (new)`, class: cls };
  }

  const pct = (diff / prior) * 100;
  // A prior base this small makes the percentage noise — show the dollar change.
  if (Math.abs(pct) >= 1000) {
    return { label: `${signedDollar} ${suffix}`, class: cls };
  }
  return { label: `${diff >= 0 ? '+' : ''}${pct.toFixed(1)}% ${suffix}`, class: cls };
}

const yearChange = computed(() =>
  buildChange(yearOverview.value.currentYearTotal, yearOverview.value.priorYearTotal, 'vs last year'),
);

const monthChange = computed(() =>
  buildChange(yearOverview.value.currentMonthTotal, yearOverview.value.priorMonthTotal, 'vs same month last year'),
);

const biggestGainCategory = computed(() => {
  const trends = categoryTrends.value.slice().sort((a, b) => (b.thisYearTotal - b.lastYearTotal) - (a.thisYearTotal - a.lastYearTotal));
  const best = trends[0];
  return best && best.thisYearTotal > best.lastYearTotal ? `${best.category} (${((best.thisYearTotal - best.lastYearTotal) / Math.max(best.lastYearTotal, 1) * 100).toFixed(0)}%)` : 'No significant gain yet';
});

const biggestDropCategory = computed(() => {
  const trends = categoryTrends.value.slice().sort((a, b) => (a.thisYearTotal - a.lastYearTotal) - (b.thisYearTotal - b.lastYearTotal));
  const worst = trends[0];
  return worst && worst.thisYearTotal < worst.lastYearTotal ? `${worst.category} (${((worst.thisYearTotal - worst.lastYearTotal) / Math.max(worst.lastYearTotal, 1) * 100).toFixed(0)}%)` : 'No decline detected';
});

function fmt(value: number) {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Monthly breakdown ────────────────────────────────────────────────
const monthlyMonths = computed(() => monthly.value?.months ?? []);
const availableYears = computed(() => monthly.value?.availableYears ?? []);

// 'YYYY-MM' of the current month; any month after it hasn't started yet.
const currentMonthKey = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
})();

// Each month plus: its change in spending vs the previous month, its savings rate
// (net as a % of income — positive means you kept money), and whether the month
// is still in the future (no data yet, so the table shows "—" instead of $0).
const monthlyRows = computed(() =>
  monthlyMonths.value.map((m, i) => {
    const prev = i > 0 ? monthlyMonths.value[i - 1]!.spending : null;
    const delta = prev !== null && prev > 0 ? ((m.spending - prev) / prev) * 100 : null;
    const savedPct = m.income > 0 ? (m.net / m.income) * 100 : null;
    const isFuture = m.monthKey > currentMonthKey;
    return { ...m, delta, savedPct, isFuture };
  }),
);

const monthlyChartSeries = computed(() => [
  { name: 'Spending', data: monthlyMonths.value.map((m) => Number(m.spending.toFixed(2))) },
  { name: 'Income',   data: monthlyMonths.value.map((m) => Number(m.income.toFixed(2))) },
]);

const monthlyChartOptions = computed<ApexOptions>(() => ({
  chart: { toolbar: { show: false }, foreColor: '#C6C6E5', stacked: false },
  plotOptions: { bar: { horizontal: false, columnWidth: '62%', borderRadius: 4 } },
  dataLabels: { enabled: false },
  legend: { show: true, position: 'top', horizontalAlign: 'right', labels: { colors: '#B0B0C3' } },
  stroke: { show: true, width: 2, colors: ['transparent'] },
  xaxis: {
    categories: monthlyMonths.value.map((m) => m.label),
    labels: { style: { colors: '#B0B0C3' } },
  },
  yaxis: { labels: { formatter: (v) => `$${Number(v).toLocaleString()}`, style: { colors: '#B0B0C3' } } },
  tooltip: { y: { formatter: (v) => `$${Number(v).toLocaleString()}` } },
  grid: { borderColor: '#1F1F3A' },
  fill: { opacity: 1 },
  colors: ['#6C4ED4', '#22C55E'],
}));

const hasMonthlyData = computed(() => monthlyMonths.value.some((m) => m.spending !== 0 || m.income !== 0));

async function loadMonthly(year?: number) {
  monthlyLoading.value = true;
  try {
    monthly.value = await api.getMonthlyBreakdown(year);
    selectedYear.value = monthly.value.year;
  } catch (err) {
    console.error(err);
  } finally {
    monthlyLoading.value = false;
  }
}

function onYearChange(year: number) {
  void loadMonthly(year);
}

async function loadReports() {
  loading.value = true;
  loadError.value = '';

  try {
    reports.value = await api.getReports();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Unable to load reports';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadReports();
  void loadMonthly();
});
</script>

<style lang="scss">
.bb-reports { background-color: #0A0A1B; min-height: 100vh; }
.bb-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.bb-page-title { font-size: 28px; font-weight: 700; }
.bb-page-sub { color: #8F8FB5; margin-top: 8px; }
.bb-report-card { background: #11112A; border: 1px solid #22223B; border-radius: 18px; padding: 22px; min-height: 280px; }
.bb-report-card--accent { background: linear-gradient(180deg, rgba(26, 18, 70, 0.95), #0B0B1A); }
.bb-report-card__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
.bb-report-card__title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; }
.bb-report-card__sub { color: #8F8FB5; font-size: 12px; margin-top: 6px; }
.bb-report-list { display: grid; gap: 14px; }
.bb-report-row { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.bb-report-row:last-child { border-bottom: none; }
.bb-report-row__label { color: #E2E2FF; font-weight: 600; }
.bb-report-row__meta { color: #A5A5C4; font-size: 12px; margin-top: 4px; }
.bb-report-row__value { color: #6C4ED4; font-weight: 700; }
.bb-report-summary { display: grid; gap: 14px; }
.bb-report-summary__line { display: flex; justify-content: space-between; align-items: center; }
.bb-report-summary__line--sub { color: #8F8FB5; font-size: 13px; }
.bb-report-pill { display: inline-flex; padding: 8px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; width: fit-content; }
.bb-pill-positive { background: rgba(34, 197, 94, 0.16); color: #22C55E; }
.bb-pill-negative { background: rgba(239, 68, 68, 0.16); color: #EF4444; }
.bb-pill-neutral { background: rgba(143, 143, 181, 0.16); color: #8F8FB5; }
.bb-report-trends { display: grid; gap: 16px; }
.bb-trend-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.bb-trend-label { color: #E2E2FF; font-weight: 600; }
.bb-trend-values { display: flex; gap: 12px; align-items: center; }
.bb-trend-values__compare { color: #8F8FB5; font-size: 13px; }
.bb-insight-list { display: grid; gap: 14px; }
.bb-insight-item { display: grid; gap: 4px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.bb-insight-tag { color: #8F8FB5; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; }
.bb-loading { display: flex; align-items: center; gap: 12px; color: #C6C6E5; min-height: 250px; }
.bb-no-data { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 14px; background: #11112A; border: 1px dashed rgba(108, 78, 212, 0.3); border-radius: 18px; padding: 40px; text-align: center; }
.bb-no-data-title { font-size: 20px; font-weight: 700; }
.bb-no-data-sub { color: #8F8FB5; max-width: 420px; }

.bb-year-select { min-width: 110px; }
.bb-month-table { margin-top: 20px; display: flex; flex-direction: column; overflow-x: auto; }
.bb-month-row {
  display: grid; grid-template-columns: 0.9fr 1fr 1fr 1fr 0.8fr 1fr 1.2fr; gap: 12px;
  align-items: center; padding: 10px 4px; min-width: 660px;
  border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; color: #E2E2FF;
}
.bb-month-row:last-child { border-bottom: none; }
.bb-month-row--head {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  color: #8F8FB5; font-weight: 600;
}
.bb-month-num { text-align: right; font-variant-numeric: tabular-nums; }
.bb-month-muted { color: #6E6E9A; }
.bb-amt-income { color: #22C55E; }
.bb-amt-neg { color: #EF4444; }
.bb-month-empty { color: #8F8FB5; padding: 24px 0; text-align: center; }
</style>
