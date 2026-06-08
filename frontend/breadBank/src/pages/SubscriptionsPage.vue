<template>
  <q-page class="bb-subs q-pa-lg">
    <div class="bb-page-header">
      <div>
        <div class="bb-page-title">Subscriptions</div>
        <div class="bb-page-sub">Recurring charges detected automatically from your transaction history</div>
      </div>
      <q-btn
        flat dense no-caps icon="refresh" label="Rescan"
        :loading="loading"
        class="bb-rescan-btn"
        @click="loadSubscriptions"
      />
    </div>

    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="40px" />
      <span>Scanning your transactions for recurring charges...</span>
    </div>

    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else>
      <!-- Summary -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-6 col-md-4">
          <div class="bb-sum-card">
            <div class="bb-sum-lbl">Active subscriptions</div>
            <div class="bb-sum-val">{{ summary.count }}</div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="bb-sum-card bb-sum-card--accent">
            <div class="bb-sum-lbl">Estimated monthly</div>
            <div class="bb-sum-val">{{ fmt(summary.totalMonthly) }}</div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="bb-sum-card">
            <div class="bb-sum-lbl">Estimated yearly</div>
            <div class="bb-sum-val">{{ fmt(summary.totalYearly) }}</div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-if="subscriptions.length === 0" class="bb-empty">
        <q-icon name="autorenew" size="48px" style="color:#6C4ED4" />
        <div class="bb-empty-title">No recurring charges detected</div>
        <div class="bb-empty-sub">
          We look for merchants that bill you on a consistent schedule and amount. Upload more
          statements (a few months of history works best) and rescan.
        </div>
      </div>

      <!-- List -->
      <div v-else class="bb-subs-list">
        <div class="bb-subs-grid bb-subs-head">
          <div class="bb-sc-merchant">Merchant</div>
          <div class="bb-sc-freq">Frequency</div>
          <div class="bb-sc-typical bb-num">Typical</div>
          <div class="bb-sc-monthly bb-num">Per month</div>
          <div class="bb-sc-next bb-num">Next charge</div>
        </div>

        <div v-for="sub in subscriptions" :key="sub.merchant" class="bb-subs-grid bb-sub-row">
          <div class="bb-sc-merchant bb-sub-merchant">
            <div class="bb-sub-icon" :style="{ background: (sub.categoryColor ?? '#6C4ED4') + '33', color: sub.categoryColor ?? '#8B6FEC' }">
              <q-icon name="autorenew" size="16px" />
            </div>
            <div class="bb-sub-merchant-text">
              <div class="bb-sub-name">{{ sub.merchant }}</div>
              <div class="bb-sub-meta">
                {{ sub.category ?? 'Uncategorized' }} · {{ sub.occurrences }} charges
                <span v-if="sub.confidence === 'medium'" class="bb-sub-likely">likely</span>
              </div>
            </div>
          </div>
          <div class="bb-sc-freq">
            <span class="bb-cadence-chip">{{ cadenceLabel(sub.cadence) }}</span>
          </div>
          <div class="bb-sc-typical bb-num bb-sub-amt">{{ fmt(sub.averageAmount) }}</div>
          <div class="bb-sc-monthly bb-num bb-sub-monthly">{{ fmt(sub.monthlyCost) }}</div>
          <div class="bb-sc-next bb-num bb-sub-next">{{ fmtDate(sub.nextEstimatedDate) }}</div>
        </div>
      </div>

      <div class="bb-disclaimer">
        Estimates are inferred from your past charges and may include occasional non-subscriptions.
        "Per month" normalizes weekly/yearly charges to a monthly figure.
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api, type SubscriptionsData } from 'src/services/api';

const loading = ref(true);
const loadError = ref('');
const data = ref<SubscriptionsData | null>(null);

const subscriptions = computed(() => data.value?.subscriptions ?? []);
const summary = computed(() => data.value?.summary ?? { count: 0, totalMonthly: 0, totalYearly: 0 });

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};
const cadenceLabel = (c: string) => CADENCE_LABELS[c] ?? c;

function fmt(value: number) {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadSubscriptions() {
  loading.value = true;
  loadError.value = '';
  try {
    data.value = await api.getSubscriptions();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load subscriptions';
  } finally {
    loading.value = false;
  }
}

onMounted(loadSubscriptions);
</script>

<style lang="scss">
.bb-subs { background-color: #0A0A1B; min-height: 100vh; }
.bb-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.bb-page-title { font-size: 28px; font-weight: 700; }
.bb-page-sub { color: #8F8FB5; margin-top: 8px; }
.bb-rescan-btn { color: #8B6FEC; }

.bb-loading { display: flex; align-items: center; gap: 12px; min-height: 220px; color: #C6C6E5; }

.bb-sum-card { background: #11112A; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 20px; height: 100%; }
.bb-sum-card--accent { background: linear-gradient(145deg, #2D1A6E, #1A1040); border-color: rgba(108,78,212,0.25); }
.bb-sum-lbl { font-size: 11px; font-weight: 600; letter-spacing: 0.7px; text-transform: uppercase; color: #8F8FB5; margin-bottom: 10px; }
.bb-sum-val { font-size: 26px; font-weight: 700; color: #F8FAFF; }

.bb-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 240px; text-align: center; background: #11112A; border: 1px dashed rgba(108,78,212,0.3); border-radius: 18px; padding: 40px; }
.bb-empty-title { font-size: 18px; font-weight: 700; }
.bb-empty-sub { color: #8F8FB5; max-width: 460px; font-size: 13px; }

.bb-subs-list { background: #11112A; border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; overflow-x: auto; }
// Fixed-width columns with a flexible Merchant column. A min-width keeps the
// columns from crushing into each other — the table scrolls sideways instead.
.bb-subs-grid { display: flex; align-items: center; gap: 16px; padding: 14px 20px; min-width: 640px; }
.bb-sc-merchant { flex: 1; min-width: 0; }
.bb-sc-freq     { width: 120px; flex-shrink: 0; }
.bb-sc-typical  { width: 84px;  flex-shrink: 0; }
.bb-sc-monthly  { width: 90px;  flex-shrink: 0; }
.bb-sc-next     { width: 104px; flex-shrink: 0; }
.bb-subs-head { background: #0F0F26; color: #8F8FB5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid rgba(255,255,255,0.06); }
.bb-sub-row { border-bottom: 1px solid rgba(255,255,255,0.04); }
.bb-sub-row:last-child { border-bottom: none; }
.bb-num { text-align: right; white-space: nowrap; }

.bb-sub-merchant { display: flex; align-items: center; gap: 12px; min-width: 0; }
.bb-sub-icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }
.bb-sub-merchant-text { min-width: 0; }
.bb-sub-name { color: #F8FAFF; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-sub-meta { color: #8F8FB5; font-size: 12px; margin-top: 3px; display: flex; align-items: center; gap: 6px; }
.bb-sub-likely { background: rgba(245,158,11,0.16); color: #F59E0B; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; }

.bb-cadence-chip { background: rgba(108,78,212,0.16); color: #8B6FEC; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; }
.bb-sub-amt { color: #C6C6E5; font-weight: 600; }
.bb-sub-monthly { color: #ffffff; font-weight: 700; }
.bb-sub-next { color: #8F8FB5; font-size: 13px; }

.bb-disclaimer { color: #6E6E9A; font-size: 12px; margin-top: 16px; line-height: 1.5; }
</style>
