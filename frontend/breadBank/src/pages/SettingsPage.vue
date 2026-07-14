<template>
  <q-page class="bb-settings q-pa-lg">
    <div class="bb-page-header">
      <div class="bb-page-title">Settings</div>
      <div class="bb-page-sub">Manage your AI credits, linked accounts, and profile</div>
    </div>

    <!-- ── Appearance ───────────────────────────────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="palette" size="18px" style="color: var(--bb-accent-light)" />
        <span>Appearance</span>
      </div>
      <div class="bb-theme-sub">Pick a look — it's saved to your account, so it follows you to any device.</div>
      <div class="bb-theme-grid">
        <button
          v-for="t in THEMES" :key="t.id"
          class="bb-theme-card"
          :class="{ 'is-active': currentTheme === t.id }"
          :disabled="savingTheme"
          @click="pickTheme(t.id)"
        >
          <span class="bb-theme-swatches">
            <i v-for="(c, i) in t.colors" :key="i" :style="{ background: c }" />
          </span>
          <span class="bb-theme-name">{{ t.label }}</span>
          <q-icon v-if="currentTheme === t.id" name="check_circle" size="16px" class="bb-theme-check" />
        </button>
      </div>
    </div>

    <!-- ── AI & API Credits ─────────────────────────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="auto_awesome" size="18px" style="color: var(--bb-accent-light)" />
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
        <div class="bb-set-metric">
          <div class="bb-set-metric-lbl">Credits remaining (est.)</div>
          <div class="bb-set-metric-val" :style="`color:${ai.creditLow ? '#EF4444' : '#22C55E'}`">
            {{ fmtUsd(ai.creditRemainingUsd) }}
          </div>
          <div class="bb-set-metric-sub">of {{ fmtUsd(ai.creditTotalUsd) }} · {{ fmtUsd(ai.creditSpentAllTimeUsd) }} used all-time</div>
        </div>
      </div>

      <!-- Credit balance control -->
      <div v-if="ai" class="bb-set-budget">
        <div class="bb-set-metric-lbl q-mb-xs">Total Claude credits purchased (warn at {{ fmtUsd(ai.creditWarnAtUsd) }})</div>
        <div class="row items-center q-gutter-sm">
          <q-input
            v-model.number="creditTotalInput"
            type="number" dense outlined dark
            placeholder="e.g. 5"
            prefix="$"
            style="max-width:160px"
            @keyup.enter="saveCreditTotal"
          />
          <q-btn no-caps unelevated label="Save" :loading="savingCredit"
            style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px"
            @click="saveCreditTotal" />
          <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener" class="bb-set-link">Add credits →</a>
        </div>
        <div class="bb-set-bar-wrap">
          <div class="bb-set-bar" :style="{
            width: Math.min(100, (ai.creditRemainingUsd / Math.max(ai.creditTotalUsd, 0.01)) * 100) + '%',
            background: ai.creditLow ? '#EF4444' : 'linear-gradient(90deg,var(--bb-accent),#22C55E)',
          }" />
        </div>
        <div class="bb-set-note">
          Anthropic has no balance API, so this is estimated from token usage. After you top up, bump this total to match what you bought.
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
            style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px"
            @click="saveBudget" />
          <q-btn v-if="ai.monthlyBudgetUsd != null" no-caps flat label="Clear" size="sm"
            style="color: var(--bb-text-dim)" @click="clearBudget" />
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
        <q-icon name="account_balance" size="18px" style="color: var(--bb-accent-light)" />
        <span>Linked Accounts</span>
        <q-space />
        <q-btn no-caps unelevated icon="sync" label="Sync" size="sm" :loading="syncing"
          style="background:rgba(var(--bb-accent-rgb),0.15);color: var(--bb-accent-light);border-radius:8px" @click="syncBanks" />
        <q-btn no-caps unelevated icon="add" label="Connect" size="sm" :loading="connecting"
          style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px" @click="connect" />
      </div>

      <q-banner v-if="linkError" class="bb-set-banner bb-banner-red" dense rounded>{{ linkError }}</q-banner>

      <div v-if="banks.length" class="bb-bank-list">
        <div v-for="(b, i) in banks" :key="i" class="bb-bank-row">
          <q-icon name="account_balance" size="16px" style="color: var(--bb-text-dim)" />
          <span class="bb-bank-name">{{ b.institution }}</span>
          <q-space />
          <span class="bb-bank-date">linked {{ fmtDate(b.created_at) }}</span>
        </div>
      </div>
      <div v-else class="bb-set-note">No banks linked yet. Click Connect to link one through Plaid.</div>
    </div>

    <!-- ── Security question (password reset) ───────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="lock" size="18px" style="color: var(--bb-accent-light)" />
        <span>Security question</span>
      </div>

      <div class="bb-set-note q-mb-md" style="margin-top:0">
        <template v-if="hasSecurityQ">Current question: <span style="color: var(--bb-text-soft)">“{{ currentQuestion }}”</span>. </template>
        <template v-else>You haven't set one yet. </template>
        It lets you reset your password from the login screen if you forget it.
      </div>

      <q-banner v-if="secMsg" class="bb-set-banner" :class="secOk ? 'bb-banner-amber' : 'bb-banner-red'" dense rounded>
        {{ secMsg }}
      </q-banner>

      <div class="bb-set-metric-lbl q-mb-xs">Question</div>
      <q-select
        v-model="secQuestion"
        :options="securityQuestions"
        outlined dense dark options-dark
        placeholder="Choose a question"
        style="max-width:420px"
        class="q-mb-md"
      />
      <div class="bb-set-metric-lbl q-mb-xs">Answer</div>
      <q-input v-model="secAnswer" type="text" dense outlined dark
        placeholder="New answer" style="max-width:420px" class="q-mb-md" />
      <div class="bb-set-metric-lbl q-mb-xs">Current password (to confirm)</div>
      <q-input v-model="secCurrentPwd" type="password" dense outlined dark
        placeholder="Your current password" style="max-width:420px" class="q-mb-md" />
      <q-btn no-caps unelevated :label="hasSecurityQ ? 'Update' : 'Set question'" :loading="secSaving"
        style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px"
        @click="saveSecurity" />
    </div>

    <!-- ── Account ──────────────────────────────────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="person" size="18px" style="color: var(--bb-accent-light)" />
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

    <!-- ── Legal & compliance documents ─────────────────── -->
    <div class="bb-set-card">
      <div class="bb-set-card-hdr">
        <q-icon name="description" size="18px" style="color: var(--bb-accent-light)" />
        <span>Legal &amp; compliance documents</span>
      </div>
      <div class="bb-set-note" style="margin-top:0">
        Download our policies — e.g. to share with a partner's compliance or security team.
      </div>
      <div class="bb-doc-list q-mt-md">
        <a v-for="d in legalDocs" :key="d.file" class="bb-doc-row" :href="d.file" target="_blank" rel="noopener">
          <q-icon name="picture_as_pdf" size="18px" style="color:#EF4444" />
          <span class="bb-doc-name">{{ d.label }}</span>
          <q-space />
          <span class="bb-doc-badge">PDF</span>
          <q-icon name="open_in_new" size="15px" style="color: var(--bb-text-dim)" />
        </a>
      </div>
    </div>

    <!-- ── Danger zone: delete account & data ───────────── -->
    <div v-if="!isDemo" class="bb-set-card bb-danger-card">
      <div class="bb-set-card-hdr">
        <q-icon name="warning" size="18px" style="color:#EF4444" />
        <span>Delete account</span>
      </div>
      <div class="bb-set-note" style="margin-top:0">
        Permanently delete your account and <strong>all</strong> of your data — transactions,
        accounts, goals, budgets and profile. This also disconnects your linked banks from Plaid.
        This cannot be undone.
      </div>
      <q-btn no-caps unelevated icon="delete_forever" label="Delete my account & data" class="q-mt-md"
        style="background:rgba(239,68,68,0.15);color:#ffb4b4;border-radius:8px" @click="deleteOpen = true" />
    </div>

    <!-- Confirm deletion dialog -->
    <q-dialog v-model="deleteOpen">
      <q-card class="bb-set-card" style="width:420px;max-width:92vw;margin:0">
        <div class="bb-set-card-hdr">
          <q-icon name="warning" size="18px" style="color:#EF4444" />
          <span>Delete account — confirm</span>
        </div>
        <div class="bb-set-note" style="margin-top:0">
          Enter your password to permanently erase your account and all data. This can't be undone.
        </div>
        <q-banner v-if="deleteError" class="bb-set-banner bb-banner-red q-mt-md" dense rounded>{{ deleteError }}</q-banner>
        <q-input v-model="deletePwd" type="password" dense outlined dark autofocus
          placeholder="Your password" class="q-mt-md" @keyup.enter="deleteAccount" />
        <div class="row justify-end q-gutter-sm q-mt-md">
          <q-btn flat no-caps label="Cancel" style="color: var(--bb-text-dim)" v-close-popup />
          <q-btn no-caps unelevated label="Delete forever" :loading="deleting" :disable="!deletePwd"
            style="background:#EF4444;color:#fff;border-radius:8px" @click="deleteAccount" />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, type AiStatus, type PlaidLinkStatus } from 'src/services/api';
import { auth, SECURITY_QUESTIONS } from 'src/services/auth';
import { THEMES, applyTheme, cacheTheme } from 'src/services/theme';
import { usePlaidLink } from 'src/composables/usePlaidLink';

const router = useRouter();

// ── Security question ────────────────────────────────────────
const securityQuestions = SECURITY_QUESTIONS;
const hasSecurityQ = ref(false);
const currentQuestion = ref<string | null>(null);
const secQuestion = ref<string | null>(null);
const secAnswer = ref('');
const secCurrentPwd = ref('');
const secSaving = ref(false);
const secMsg = ref('');
const secOk = ref(false);

async function loadSecurity() {
  try {
    const r = await auth.getMySecurity();
    hasSecurityQ.value = r.hasSecurityQuestion;
    currentQuestion.value = r.question;
    if (r.question) secQuestion.value = r.question;
  } catch (e) {
    console.error(e);
  }
}

async function saveSecurity() {
  secMsg.value = '';
  if (!secQuestion.value || !secAnswer.value.trim() || !secCurrentPwd.value) {
    secMsg.value = 'Choose a question, enter an answer, and your current password.';
    secOk.value = false;
    return;
  }
  secSaving.value = true;
  try {
    const r = await auth.setMySecurity(secCurrentPwd.value, secQuestion.value, secAnswer.value);
    hasSecurityQ.value = r.hasSecurityQuestion;
    currentQuestion.value = r.question;
    secAnswer.value = '';
    secCurrentPwd.value = '';
    secMsg.value = 'Security question saved.';
    secOk.value = true;
  } catch (e) {
    secMsg.value = e instanceof Error ? e.message : 'Failed to save security question.';
    secOk.value = false;
  } finally {
    secSaving.value = false;
  }
}

const ai           = ref<AiStatus | null>(null);
const aiLoading    = ref(true);
const budgetInput  = ref<number | null>(null);
const savingBudget = ref(false);
const creditTotalInput = ref<number | null>(null);
const savingCredit = ref(false);

const banks   = ref<PlaidLinkStatus['linked']>([]);
const syncing = ref(false);

const userEmail = computed(() => auth.getUser()?.email ?? '—');
const isDemo = computed(() => auth.getUser()?.email === 'test@gmail.com');

// Policy documents (PDFs served as static files from /legal). Opened in a new
// tab so they preview inline; the viewer's own download button saves them.
const legalDocs = [
  { label: 'Information Security Policy', file: '/legal/BreadBank-Information-Security-Policy.pdf' },
  { label: 'Privacy Policy', file: '/legal/BreadBank-Privacy-Policy.pdf' },
  { label: 'Data Retention & Deletion Policy', file: '/legal/BreadBank-Data-Retention-Policy.pdf' },
];

// ── Delete account ───────────────────────────────────────────
const deleteOpen = ref(false);
const deletePwd = ref('');
const deleting = ref(false);
const deleteError = ref('');

async function deleteAccount() {
  if (!deletePwd.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await auth.deleteAccount(deletePwd.value);
    auth.logout();
    void router.push('/login');
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Failed to delete account.';
  } finally {
    deleting.value = false;
  }
}

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
    creditTotalInput.value = ai.value.creditTotalUsd;
  } catch (e) {
    console.error(e);
  } finally {
    aiLoading.value = false;
  }
}

async function saveCreditTotal() {
  if (creditTotalInput.value == null || creditTotalInput.value < 0) return;
  savingCredit.value = true;
  try {
    ai.value = await api.setAiCreditTotal(creditTotalInput.value);
    creditTotalInput.value = ai.value.creditTotalUsd;
  } catch (e) {
    console.error(e);
  } finally {
    savingCredit.value = false;
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

// ── Appearance / theme ───────────────────────────────────────
const currentTheme = ref('original');
const savingTheme = ref(false);

async function pickTheme(id: string) {
  const previous = currentTheme.value;
  currentTheme.value = id;
  applyTheme(id); // switch instantly, then persist
  savingTheme.value = true;
  try {
    await api.setTheme(id);
    const user = auth.getUser();
    if (user) cacheTheme(user.id, id);
  } catch (e) {
    // Couldn't save — roll the UI back so what you see matches your account.
    currentTheme.value = previous;
    applyTheme(previous);
    console.error(e);
  } finally {
    savingTheme.value = false;
  }
}

onMounted(() => {
  void loadAi();
  void loadBanks();
  void loadSecurity();
  void api.getSettings().then((s) => { currentTheme.value = s.theme; }).catch(() => {});
});
</script>

<style lang="scss">
.bb-settings { background-color: var(--bb-bg); min-height: 100vh; }

/* ── Theme picker ── */
.bb-theme-sub { font-size: 12px; color: var(--bb-text-dim); margin-bottom: 14px; }
.bb-theme-grid { display: flex; gap: 12px; flex-wrap: wrap; }
.bb-theme-card {
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
  min-width: 150px; padding: 14px 16px;
  background: var(--bb-surface-2); border: 1px solid var(--bb-border);
  border-radius: 12px; cursor: pointer; font: inherit;
  transition: border-color 0.15s ease;
  &:hover { border-color: var(--bb-border-hover); }
  &.is-active { border-color: var(--bb-accent); }
  &:disabled { opacity: 0.6; cursor: wait; }
}
.bb-theme-swatches {
  display: flex; gap: 6px;
  i { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(128,128,128,0.35); }
}
.bb-theme-name { font-size: 13px; font-weight: 600; color: var(--bb-text); }
.bb-theme-check { position: absolute; top: 10px; right: 10px; color: var(--bb-accent); }

.bb-set-card {
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 14px; padding: 20px; margin-bottom: 18px; max-width: 760px;
}
.bb-set-card-hdr {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;
  font-size: 14px; font-weight: 600; color: var(--bb-text);
}

.bb-set-banner { margin-bottom: 16px; font-size: 13px; }
.bb-banner-red   { background: rgba(239,68,68,0.1)  !important; color: #ffb4b4 !important; border: 1px solid rgba(239,68,68,0.3); }
.bb-banner-amber { background: rgba(245,158,11,0.1) !important; color: #ffd79a !important; border: 1px solid rgba(245,158,11,0.3); }
.bb-set-link { color: var(--bb-accent-light); font-weight: 600; margin-left: 6px; text-decoration: none; &:hover { color: var(--bb-accent-2); } }

.bb-set-loading { display: flex; align-items: center; gap: 8px; color: var(--bb-text-dim); font-size: 13px; }

.bb-set-grid { display: flex; flex-wrap: wrap; gap: 28px; }
.bb-set-metric-lbl { font-size: 10px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: var(--bb-text-dim); }
.bb-set-metric-val { font-size: 22px; font-weight: 700; color: var(--bb-text); margin-top: 4px; }
.bb-set-metric-sub { font-size: 11px; color: var(--bb-text-dim); margin-top: 2px; }

.bb-set-budget { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--bb-border); }
.bb-set-bar-wrap { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 12px; max-width: 420px; }
.bb-set-bar { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.bb-set-note { font-size: 11px; color: var(--bb-text-muted); margin-top: 10px; line-height: 1.5; }

.bb-bank-list { display: flex; flex-direction: column; gap: 8px; }
.bb-bank-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bb-bg); border: 1px solid var(--bb-border); border-radius: 10px; }
.bb-bank-name { font-size: 13px; font-weight: 500; color: var(--bb-text); }
.bb-bank-date { font-size: 11px; color: var(--bb-text-dim); }

.bb-danger-card { border-color: rgba(239,68,68,0.35); }

.bb-doc-list { display: flex; flex-direction: column; gap: 8px; max-width: 460px; }
.bb-doc-row {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  background: var(--bb-bg); border: 1px solid var(--bb-border); border-radius: 10px;
  text-decoration: none; transition: border-color 0.15s ease;
  &:hover { border-color: var(--bb-accent); }
}
.bb-doc-name { font-size: 13px; font-weight: 500; color: var(--bb-text); }
.bb-doc-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: #EF4444;
  border: 1px solid rgba(239,68,68,0.4); border-radius: 4px; padding: 1px 5px;
}
</style>
