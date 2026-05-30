<template>
  <q-page class="bb-dash q-pa-lg">

    <!-- Page Header -->
    <div class="bb-page-header">
      <div class="bb-page-title">Welcome Back!</div>
      <div class="bb-page-sub">Here's your financial summary for {{ currentMonth }}</div>
    </div>

    <!-- AI Summary + Suggestions Row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-md-6">
        <div class="bb-ai-card">
          <div class="bb-ai-header">
            <div class="bb-ai-icon">
              <q-icon name="auto_awesome" size="16px" color="white" />
            </div>
            <span class="bb-ai-label">AI Monthly Summary</span>
            <q-badge class="bb-ai-badge q-ml-sm">May 2026</q-badge>
          </div>
          <p class="bb-ai-text">
            You spent <strong>$2,840</strong> this month, down 8% from last month — great progress.
            Your biggest category was <strong>Shopping at $680</strong>, mostly Amazon.
            You have <strong>8 active subscriptions</strong> totaling $127/month.
            Your savings rate is <strong>32%</strong> of income.
          </p>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="bb-ai-card bb-suggestions-card">
          <div class="bb-ai-header">
            <div class="bb-ai-icon bb-ai-icon--pink">
              <q-icon name="lightbulb" size="16px" color="white" />
            </div>
            <span class="bb-ai-label">Suggestions for Next Month</span>
          </div>
          <ul class="bb-suggestions">
            <li>
              <q-icon name="arrow_right" size="14px" style="color: #6C4ED4" />
              Shopping was $680 — try setting a $500 limit to save an extra $180
            </li>
            <li>
              <q-icon name="arrow_right" size="14px" style="color: #6C4ED4" />
              3 subscriptions (Hulu, Adobe, Xbox) haven't been used this month
            </li>
            <li>
              <q-icon name="arrow_right" size="14px" style="color: #22C55E" />
              Bumping savings rate to 40% would add ~$336/month to your savings
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Stat Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <!-- Total Balance -->
      <div class="col-6 col-md-3">
        <div class="bb-stat">
          <div class="bb-stat-lbl">
            <span class="bb-dot" style="background:#22C55E"></span>
            TOTAL BALANCE
          </div>
          <div class="bb-stat-val">$12,450.00</div>
          <div class="bb-stat-row">
            <span class="bb-badge-up">+2.3%</span>
            <span class="bb-stat-cmp">vs last month</span>
          </div>
          <div class="bb-accounts-mini">
            <span>WF $9,000</span><span>·</span><span>Invest $3,450</span>
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
          <div class="bb-stat-val">$2,840.00</div>
          <div class="bb-stat-row">
            <span class="bb-badge-down-good">-8%</span>
            <span class="bb-stat-cmp">vs last month</span>
          </div>
          <div class="bb-accounts-mini">
            <span>Apple $840</span><span>·</span><span>Discover $320</span>
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
          <div class="bb-stat-val">$4,200.00</div>
          <div class="bb-stat-row">
            <span class="bb-badge-neutral">0%</span>
            <span class="bb-stat-cmp">vs last month</span>
          </div>
          <div class="bb-accounts-mini">
            <span>Direct deposit</span>
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
          <div class="bb-stat-val">$1,360.00</div>
          <div class="bb-stat-row">
            <span class="bb-savings-rate">32% rate</span>
          </div>
          <div class="bb-savings-bar-wrap">
            <div class="bb-savings-bar" style="width: 32%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="row q-col-gutter-md">
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
          <VueApexCharts
            type="bar"
            height="260"
            :options="categoryOpts"
            :series="categorySeries"
          />
        </div>
      </div>

      <!-- Monthly Spending Trend -->
      <div class="col-12 col-md-6">
        <div class="bb-chart-card">
          <div class="bb-chart-hdr">
            <div>
              <div class="bb-chart-title">Monthly Spending Trend</div>
              <div class="bb-chart-sub">Last 6 months</div>
            </div>
            <q-btn flat round dense icon="more_vert" size="sm" style="color:#6E6E9A" />
          </div>
          <VueApexCharts
            type="area"
            height="260"
            :options="trendOpts"
            :series="trendSeries"
          />
        </div>
      </div>
    </div>

  </q-page>
</template>

<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts';
import type { ApexOptions } from 'apexcharts';

const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

// ── Spending by Category (horizontal bar) ──────────────────────────
const categoryOpts: ApexOptions = {
  chart: {
    type: 'bar',
    background: 'transparent',
    toolbar: { show: false },
    foreColor: '#6E6E9A',
  },
  plotOptions: {
    bar: {
      horizontal: true,
      borderRadius: 4,
      borderRadiusApplication: 'end',
      barHeight: '60%',
    },
  },
  colors: ['#6C4ED4'],
  dataLabels: {
    enabled: true,
    formatter: (val: number) => `$${val}`,
    style: { fontSize: '11px', colors: ['#ffffff'] },
    offsetX: -4,
  },
  grid: { borderColor: 'rgba(255,255,255,0.04)', strokeDashArray: 4 },
  xaxis: {
    labels: {
      style: { colors: '#6E6E9A', fontSize: '11px' },
      formatter: (val: string) => `$${val}`,
    },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { colors: '#b0b0cc', fontSize: '12px' } },
  },
  tooltip: {
    theme: 'dark',
    y: { formatter: (val: number) => `$${val.toLocaleString()}` },
  },
};

const categorySeries = [
  {
    name: 'Spent',
    data: [
      { x: 'Personal Care', y: 65 },
      { x: 'Health', y: 95 },
      { x: 'Travel', y: 120 },
      { x: 'Entertainment', y: 180 },
      { x: 'Subscriptions', y: 127 },
      { x: 'Transportation', y: 240 },
      { x: 'Groceries', y: 320 },
      { x: 'Food & Dining', y: 480 },
      { x: 'Shopping', y: 680 },
    ],
  },
];

// ── Monthly Trend (area chart) ─────────────────────────────────────
const trendOpts: ApexOptions = {
  chart: {
    type: 'area',
    background: 'transparent',
    toolbar: { show: false },
    foreColor: '#6E6E9A',
  },
  colors: ['#6C4ED4', '#22C55E'],
  fill: {
    type: 'gradient',
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.25,
      opacityTo: 0.02,
      stops: [0, 100],
    },
  },
  stroke: { curve: 'smooth', width: 2 },
  dataLabels: { enabled: false },
  grid: { borderColor: 'rgba(255,255,255,0.04)', strokeDashArray: 4 },
  xaxis: {
    categories: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: { style: { colors: '#6E6E9A', fontSize: '11px' } },
  },
  yaxis: {
    labels: {
      style: { colors: '#6E6E9A', fontSize: '11px' },
      formatter: (val: number) => `$${val.toLocaleString()}`,
    },
  },
  legend: { labels: { colors: '#6E6E9A' } },
  tooltip: {
    theme: 'dark',
    y: { formatter: (val: number) => `$${val.toLocaleString()}` },
  },
};

const trendSeries = [
  { name: 'Spending', data: [2400, 2800, 2200, 2600, 3100, 2840] },
  { name: 'Income', data: [4200, 4200, 4200, 4200, 4200, 4200] },
];
</script>

<style lang="scss">
.bb-dash {
  background-color: #0A0A1B;
  min-height: 100vh;
}

// ── AI Cards ───────────────────────────────────────────
.bb-ai-card {
  background: #0F1030;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 18px 20px;
  height: 100%;
}

.bb-suggestions-card {
  border-color: rgba(108, 78, 212, 0.2);
}

.bb-ai-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.bb-ai-icon {
  width: 26px;
  height: 26px;
  background: linear-gradient(135deg, #6C4ED4, #8B6FEC);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &--pink {
    background: linear-gradient(135deg, #E040FB, #6C4ED4);
  }
}

.bb-ai-label {
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
}

.bb-ai-badge {
  background: rgba(108, 78, 212, 0.2) !important;
  color: #8B6FEC !important;
  font-size: 10px !important;
}

.bb-ai-text {
  font-size: 13px;
  color: #9090B8;
  line-height: 1.6;
  margin: 0;

  strong { color: #ffffff; }
}

.bb-suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;

  li {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 13px;
    color: #9090B8;
    line-height: 1.5;
  }
}

// ── Stat Cards ─────────────────────────────────────────
.bb-stat {
  background: #0F1030;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 18px;
  height: 100%;

  &--gradient {
    background: linear-gradient(145deg, #2D1A6E, #1A1040);
    border-color: rgba(108, 78, 212, 0.25);
  }
}

.bb-stat-lbl {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: #6E6E9A;
  margin-bottom: 8px;
}

.bb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.bb-stat-val {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.5px;
  margin-bottom: 6px;
}

.bb-stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.bb-stat-cmp {
  font-size: 11px;
  color: #6E6E9A;
}

.bb-badge-up {
  font-size: 10px;
  font-weight: 600;
  background: rgba(34, 197, 94, 0.15);
  color: #22C55E;
  padding: 2px 7px;
  border-radius: 20px;
}

.bb-badge-down-good {
  font-size: 10px;
  font-weight: 600;
  background: rgba(34, 197, 94, 0.15);
  color: #22C55E;
  padding: 2px 7px;
  border-radius: 20px;
}

.bb-badge-neutral {
  font-size: 10px;
  font-weight: 600;
  background: rgba(110, 110, 154, 0.15);
  color: #6E6E9A;
  padding: 2px 7px;
  border-radius: 20px;
}

.bb-accounts-mini {
  display: flex;
  gap: 4px;
  font-size: 10px;
  color: #4D4D70;
  flex-wrap: wrap;
}

.bb-savings-rate {
  font-size: 11px;
  font-weight: 600;
  color: #22C55E;
}

.bb-savings-bar-wrap {
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
}

.bb-savings-bar {
  height: 100%;
  background: linear-gradient(90deg, #6C4ED4, #22C55E);
  border-radius: 2px;
  transition: width 0.6s ease;
}

// ── Chart Cards ────────────────────────────────────────
.bb-chart-card {
  background: #0F1030;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 20px;
}

.bb-chart-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}

.bb-chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 2px;
}

.bb-chart-sub {
  font-size: 12px;
  color: #6E6E9A;
}
</style>
