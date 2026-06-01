<template>
  <q-page class="bb-settings q-pa-lg">
    <div class="bb-page-header">
      <div class="bb-page-title">Settings</div>
      <div class="bb-page-sub">Manage your AI credits, linked accounts, and profile</div>
    </div>

    <!-- ── AI & API Credits ─────────────────────────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="auto_awesome" size="18px" style="color:#8B6FEC" />
        <span>AI &amp; API Credits</span>
      </div>

      <!-- Warning banner -->
      <q-banner v-if="ai && ai.level === 'exhausted'" class="bb-set-banner bb-banner-red" dense rounded>
        <template #avatar><q-icon name="error" color="negative" /></template>
        Your Anthropic API credit balance is too low — AI features (categorization, summaries, chat) are paused.
        <a href="https://console.anthropic.com/settings/billing" target="_blank" class="bb-set-link">Add credits →</a>
      </q-banner>
      <q-banner v-else-if="ai && ai.level === 'over'" class="bb-set-banner bb-banner-red" dense rounded>
        <template #avatar><q-icon name="warning" color="negative" /></template>
        You've passed your monthly AI budget ({{ fmtUsd(ai.estCostUsd) }} of {{ fmtUsd(ai.monthlyBudgetUsd ?? 0) }}).
      </q-banner>
      <q-banner v-else-if="ai && ai.level === 'warning'" class="bb-set-banner bb-banner-amber" dense rounded>
        <template #avatar><q-icon name="warning_amber" style="color:#F59E0B" /></template>
        Heads up — you've used {{ ai.percentUsed?.toFixed(0) }}% of your monthly AI budget.
      </q-banner>

      <div v-if="aiLoading" class="bb-set-loading"><q-spinner size="20px" color="primary" /> Loading usage…</div>

      <div v-else-if="ai" class="bb-set-grid">
        <div class="bb-set-metric">
          <div class="bb-set-metric-lbl">Estimated spend this month</div>
          <div class="bb-set-metric-val">{{ fmtUsd(ai.estCostUsd) }}</div>
          <div class="bb-set-metric-sub">{{ ai.monthKey }}</div>
        </div>
        <div class="bb-set-metric">
          <div class="bb-set-metric-lbl">Tokens used</div>
          <div class="bb-set-metric-val">{{ (ai.inputTokens + ai.outputTokens).toLocaleString() }}</div>
          <div class="bb-set-metric-sub">{{ ai.inputTokens.toLocaleString() }} in / {{ ai.outputTokens.toLocaleString() }} out</div>
        </div>
        <div class="bb-set-metric">
          <div class="bb-set-metric-lbl">Status</div>
          <div class="bb-set-metric-val" :style="`color:${statusColor}`">{{ statusLabel }}</div>
          <div class="bb-set-metric-sub">{{ ai.creditExhausted ? 'last call failed' : 'API reachable' }}</div>
        </div>
      </div>

      <!-- Budget control -->
      <div v-if="ai" class="bb-set-budget">
        <div class="bb-set-metric-lbl q-mb-xs">Monthly budget (warn at 80%)</div>
        <div class="row items-center q-gutter-sm">
          <q-input
            v-model.number="budgetInput"
            type="number" dense outlined dark
            placeholder="e.g. 20"
            prefix="$"
            style="max-width:160px"
            @keyup.enter="saveBudget"
          />
          <q-btn no-caps unelevated label="Save" :loading="savingBudget"
            style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px"
            @click="saveBudget" />
          <q-btn v-if="ai.monthlyBudgetUsd != null" no-caps flat label="Clear" size="sm"
            style="color:#6E6E9A" @click="clearBudget" />
        </div>
        <div v-if="ai.percentUsed != null" class="bb-set-bar-wrap">
          <div class="bb-set-bar" :style="{ width: Math.min(ai.percentUsed, 100) + '%', background: barColor }" />
        </div>
        <div v-if="ai.percentUsed != null" class="bb-set-metric-sub q-mt-xs">
          {{ fmtUsd(ai.estCostUsd) }} of {{ fmtUsd(ai.monthlyBudgetUsd ?? 0) }} · {{ ai.percentUsed.toFixed(0) }}%
        </div>
        <div class="bb-set-note">
          Spend is estimated from token usage at Claude Opus rates and may differ from your actual Anthropic invoice.
        </div>
      </div>
    </div>

    <!-- ── Linked Accounts ──────────────────────────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="account_balance" size="18px" style="color:#8B6FEC" />
        <span>Linked Accounts</span>
        <q-space />
        <q-btn no-caps unelevated icon="sync" label="Sync" size="sm" :loading="syncing"
          style="background:rgba(108,78,212,0.15);color:#8B6FEC;border-radius:8px" @click="syncBanks" />
        <q-btn no-caps unelevated icon="add" label="Connect" size="sm" :loading="connecting"
          style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px" @click="connect" />
      </div>

      <q-banner v-if="linkError" class="bb-set-banner bb-banner-red" dense rounded>{{ linkError }}</q-banner>

      <div v-if="banks.length" class="bb-bank-list">
        <div v-for="(b, i) in banks" :key="i" class="bb-bank-row">
          <q-icon name="account_balance" size="16px" style="color:#6E6E9A" />
          <span class="bb-bank-name">{{ b.institution }}</span>
          <q-space />
          <span class="bb-bank-date">linked {{ fmtDate(b.created_at) }}</span>
        </div>
      </div>
      <div v-else class="bb-set-note">No banks linked yet. Click Connect to link one through Plaid.</div>
    </div>

    <!-- ── Account ──────────────────────────────────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="person" size="18px" style="color:#8B6FEC" />
        <span>Account</span>
      </div>
      <div class="bb-set-grid">
        <div class="bb-set-metric">
          <div class="bb-set-metric-lbl">Signed in as</div>
          <div class="bb-set-metric-val" style="font-size:15px">{{ userEmail }}</div>
        </div>
      </div>
      <q-btn no-caps unelevated icon="logout" label="Sign out" class="q-mt-md"
        style="background:rgba(239,68,68,0.12);color:#ffb4b4;border-radius:8px" @click="signOut" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, type AiStatus, type PlaidLinkStatus } from 'src/services/api';
import { auth } from 'src/services/auth';
import { usePlaidLink } from 'src/composables/usePlaidLink';

const router = useRouter();

const ai           = ref<AiStatus | null>(null);
const aiLoading    = ref(true);
const budgetInput  = ref<number | null>(null);
const savingBudget = ref(false);

const banks   = ref<PlaidLinkStatus['linked']>([]);
const syncing = ref(false);

const userEmail = computed(() => auth.getUser()?.email ?? '—');

const statusLabel = computed(() => {
  if (!ai.value) return '—';
  return ai.value.creditExhausted ? 'Credits low' : 'Active';
});
const statusColor = computed(() => (ai.value?.creditExhausted ? '#EF4444' : '#22C55E'));
const barColor = computed(() => {
  const p = ai.value?.percentUsed ?? 0;
  return p >= 100 ? '#EF4444' : p >= 80 ? '#F59E0B' : '#6C4ED4';
});

function fmtUsd(n: number) {
  if (n > 0 && n < 0.01) return '<$0.01';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadAi() {
  aiLoading.value = true;
  try {
    ai.value = await api.getAiStatus();
    budgetInput.value = ai.value.monthlyBudgetUsd;
  } catch (e) {
    console.error(e);
  } finally {
    aiLoading.value = false;
  }
}

async function saveBudget() {
  savingBudget.value = true;
  try {
    ai.value = await api.setAiBudget(budgetInput.value ?? null);
    budgetInput.value = ai.value.monthlyBudgetUsd;
  } catch (e) {
    console.error(e);
  } finally {
    savingBudget.value = false;
  }
}
async function clearBudget() {
  budgetInput.value = null;
  await saveBudget();
}

async function loadBanks() {
  try {
    banks.value = (await api.getPlaidStatus()).linked;
  } catch (e) {
    console.error(e);
  }
}

const { connecting, error: linkError, connect } = usePlaidLink(async () => {
  await Promise.all([loadBanks(), loadAi()]);
});

async function syncBanks() {
  syncing.value = true;
  try {
    await api.syncPlaid();
    await loadBanks();
  } catch (e) {
    console.error(e);
  } finally {
    syncing.value = false;
  }
}

function signOut() {
  auth.logout();
  void router.push('/login');
}

onMounted(() => {
  void loadAi();
  void loadBanks();
});
</script>

<style lang="scss">
.bb-settings { background-color: #0A0A1B; min-height: 100vh; }

.bb-set-card {
  background: #0F1030; border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px; padding: 20px; margin-bottom: 18px; max-width: 760px;
}
.bb-set-card-hdr {
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
  font-size: 14px; font-weight: 600; color: #ffffff;
}

.bb-set-banner { margin-bottom: 16px; font-size: 13px; }
.bb-banner-red   { background: rgba(239,68,68,0.1)  !important; color: #ffb4b4 !important; border: 1px solid rgba(239,68,68,0.3); }
.bb-banner-amber { background: rgba(245,158,11,0.1) !important; color: #ffd79a !important; border: 1px solid rgba(245,158,11,0.3); }
.bb-set-link { color: #8B6FEC; font-weight: 600; margin-left: 6px; text-decoration: none; &:hover { color: #E040FB; } }

.bb-set-loading { display: flex; align-items: center; gap: 8px; color: #6E6E9A; font-size: 13px; }

.bb-set-grid { display: flex; flex-wrap: wrap; gap: 28px; }
.bb-set-metric-lbl { font-size: 10px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: #6E6E9A; }
.bb-set-metric-val { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 4px; }
.bb-set-metric-sub { font-size: 11px; color: #6E6E9A; margin-top: 2px; }

.bb-set-budget { margin-top: 20px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.06); }
.bb-set-bar-wrap { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 12px; max-width: 420px; }
.bb-set-bar { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.bb-set-note { font-size: 11px; color: #4D4D70; margin-top: 10px; line-height: 1.5; }

.bb-bank-list { display: flex; flex-direction: column; gap: 8px; }
.bb-bank-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0A0A1B; border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; }
.bb-bank-name { font-size: 13px; font-weight: 500; color: #ffffff; }
.bb-bank-date { font-size: 11px; color: #6E6E9A; }
</style>
