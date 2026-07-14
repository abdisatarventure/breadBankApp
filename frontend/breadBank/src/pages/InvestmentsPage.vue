<template>
  <q-page class="bb-invest q-pa-lg">

    <!-- Header -->
    <div class="bb-page-header row items-center justify-between">
      <div>
        <div class="bb-page-title">Investments</div>
        <div class="bb-page-sub">Your Fidelity and Robinhood portfolio</div>
      </div>
      <div class="row items-center q-gutter-sm">
        <q-btn
          no-caps unelevated icon="refresh" label="Refresh"
          :loading="loading"
          @click="load"
          style="background:rgba(var(--bb-accent-rgb),0.15);color: var(--bb-accent-light);border-radius:8px"
        />
        <q-btn
          no-caps unelevated icon="add" label="Connect brokerage"
          :loading="connecting"
          @click="connect"
          style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px"
        />
      </div>
    </div>

    <q-banner v-if="error || linkError" class="bb-error-banner q-mb-md" dense rounded>
      {{ error || linkError }}
    </q-banner>

    <!-- Loading -->
    <div v-if="loading && !data" class="bb-loading">
      <q-spinner color="primary" size="40px" />
      <span>Loading your portfolio...</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="data && data.holdings.length === 0" class="bb-no-data">
      <q-icon name="trending_up" size="48px" style="color: var(--bb-accent);opacity:0.5" />
      <div class="bb-no-data-title">No investments connected yet</div>
      <div class="bb-no-data-sub">
        Connect Fidelity or Robinhood through Plaid to see your holdings, value, and gains here.
      </div>
      <q-btn
        no-caps unelevated label="Connect brokerage"
        :loading="connecting"
        @click="connect"
        style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px;margin-top:8px"
      />
    </div>

    <template v-else-if="data">

      <!-- Summary cards -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-6 col-md-3">
          <div class="bb-stat bb-stat--gradient">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:rgba(255,255,255,0.6)"></span>
              PORTFOLIO VALUE
            </div>
            <div class="bb-stat-val">{{ fmt(data.summary.totalValue) }}</div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">{{ data.accounts.length }} account{{ data.accounts.length === 1 ? '' : 's' }}</span>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" :style="`background:${gainColor}`"></span>
              TOTAL GAIN / LOSS
            </div>
            <div class="bb-stat-val" :style="`color:${gainColor}`">{{ fmtSigned(data.summary.totalGain) }}</div>
            <div class="bb-stat-row">
              <span :style="`font-size:11px;font-weight:600;color:${gainColor}`">
                {{ data.summary.gainPct >= 0 ? '+' : '' }}{{ data.summary.gainPct.toFixed(2) }}%
              </span>
              <span class="bb-stat-cmp">all time</span>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#3B82F6"></span>
              COST BASIS
            </div>
            <div class="bb-stat-val">{{ fmt(data.summary.totalCostBasis) }}</div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">total invested</span>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="bb-stat">
            <div class="bb-stat-lbl">
              <span class="bb-dot" style="background:#F59E0B"></span>
              HOLDINGS
            </div>
            <div class="bb-stat-val">{{ data.summary.holdingsCount }}</div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">positions</span>
            </div>
          </div>
        </div>
      </div>

      <div class="row q-col-gutter-md">

        <!-- Allocation donut -->
        <div class="col-12 col-md-5">
          <div class="bb-chart-card">
            <div class="bb-chart-title">Allocation</div>
            <div class="bb-chart-sub q-mb-md">By position value</div>
            <VueApexCharts type="donut" height="300" :options="allocationOpts" :series="allocationSeries" />
          </div>
        </div>

        <!-- Holdings table -->
        <div class="col-12 col-md-7">
          <div class="bb-chart-card">
            <div class="bb-chart-title">Holdings</div>
            <div class="bb-chart-sub q-mb-md">{{ data.holdings.length }} positions across your accounts</div>
            <div class="bb-holdings-wrap">
              <table class="bb-holdings">
                <thead>
                  <tr>
                    <th>Security</th>
                    <th class="bb-num">Qty</th>
                    <th class="bb-num">Price</th>
                    <th class="bb-num">Value</th>
                    <th class="bb-num">Gain</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(h, i) in data.holdings" :key="i">
                    <td>
                      <div class="bb-sec-name">{{ h.ticker || h.name }}</div>
                      <div class="bb-sec-sub">{{ h.ticker ? h.name : h.account }}</div>
                    </td>
                    <td class="bb-num">{{ h.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 }) }}</td>
                    <td class="bb-num">{{ fmt(h.price) }}</td>
                    <td class="bb-num bb-strong">{{ fmt(h.value) }}</td>
                    <td class="bb-num" :style="h.gain == null ? 'color: var(--bb-text-dim)' : `color:${h.gain >= 0 ? '#22C55E' : '#EF4444'}`">
                      {{ h.gain == null ? '—' : fmtSigned(h.gain) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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
import { api, type InvestmentsData } from 'src/services/api';
import { usePlaidLink } from 'src/composables/usePlaidLink';

const loading = ref(true);
const error   = ref('');
const data    = ref<InvestmentsData | null>(null);

async function load() {
  error.value = '';
  loading.value = true;
  try {
    data.value = await api.getInvestments();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load investments';
    console.error(e);
  } finally {
    loading.value = false;
  }
}

const { connecting, error: linkError, connect } = usePlaidLink(load);

onMounted(load);

const gainColor = computed(() => ((data.value?.summary.totalGain ?? 0) >= 0 ? '#22C55E' : '#EF4444'));

function fmt(val: number) {
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(val: number) {
  return (val >= 0 ? '+' : '-') + '$' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Donut: top 8 holdings by value, remainder bucketed into "Other".
const allocation = computed(() => {
  const hs = data.value?.holdings ?? [];
  const top = hs.slice(0, 8);
  const restTotal = hs.slice(8).reduce((s, h) => s + h.value, 0);
  const labels = top.map(h => h.ticker || h.name);
  const series = top.map(h => Math.round(h.value * 100) / 100);
  if (restTotal > 0) { labels.push('Other'); series.push(Math.round(restTotal * 100) / 100); }
  return { labels, series };
});
const allocationSeries = computed(() => allocation.value.series);

const allocationOpts = computed<ApexOptions>(() => ({
  chart: { type: 'donut', background: 'transparent', foreColor: '#9090B8' },
  labels: allocation.value.labels,
  colors: ['#6C4ED4', '#E040FB', '#22C55E', '#3B82F6', '#F59E0B', '#14B8A6', '#A855F7', '#EC4899', '#6E6E9A'],
  stroke: { width: 0 },
  legend: { position: 'bottom', labels: { colors: '#9090B8' }, fontSize: '12px' },
  dataLabels: { enabled: false },
  tooltip: { theme: 'dark', y: { formatter: (v: number) => fmt(v) } },
  plotOptions: { pie: { donut: { size: '68%', labels: {
    show: true,
    total: { show: true, label: 'Total', color: '#9090B8',
      formatter: () => fmt(data.value?.summary.totalValue ?? 0) },
  } } } },
}));
</script>

<style lang="scss">
.bb-invest { background-color: var(--bb-bg); min-height: 100vh; }

.bb-holdings-wrap { overflow-x: auto; }
.bb-holdings {
  width: 100%; border-collapse: collapse; font-size: 13px;
  th {
    text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 600;
    letter-spacing: 0.6px; text-transform: uppercase; color: var(--bb-text-dim);
    border-bottom: 1px solid var(--bb-border);
  }
  td { padding: 10px; border-bottom: 1px solid var(--bb-border); color: var(--bb-text-soft); vertical-align: top; }
  tbody tr:hover td { background: rgba(var(--bb-accent-rgb),0.06); }
  .bb-num { text-align: right; white-space: nowrap; }
  .bb-strong { color: var(--bb-text); font-weight: 600; }
}
.bb-sec-name { color: var(--bb-text); font-weight: 600; }
.bb-sec-sub  { font-size: 11px; color: var(--bb-text-dim); margin-top: 2px; }
</style>
