<template>
  <q-page class="bb-upload-page q-pa-lg">

    <div class="bb-page-header">
      <div class="bb-page-title">Upload Statements</div>
      <div class="bb-page-sub">Import CSV files from your bank or credit card accounts</div>
    </div>

    <!-- Account selector -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="account in accounts" :key="account.id" class="col-6 col-md-3">
        <div
          class="bb-account-card"
          :class="{ 'bb-account-card--active': selectedAccountId === account.id }"
          @click="selectAccount(account)"
        >
          <q-btn
            flat dense round size="xs" icon="close" class="bb-account-hide"
            @click.stop="setArchived(account, true)"
          >
            <q-tooltip>Hide this account (keeps its data)</q-tooltip>
          </q-btn>
          <q-icon :name="accountIcon(account.institution, account.type)" size="22px" :style="{ color: accountColor(account.institution) }" />
          <div class="bb-account-name">{{ account.name }}</div>
          <div class="bb-account-type">{{ account.institution }}</div>
        </div>
      </div>
    </div>

    <!-- Hidden (archived) accounts -->
    <div v-if="archivedAccounts.length" class="bb-hidden-accts q-mb-lg">
      <div class="bb-hidden-title">Hidden accounts</div>
      <div class="bb-hidden-sub">Their transactions still count in Reports; they're just hidden from uploads, credit utilization, and balances.</div>
      <div class="bb-hidden-list">
        <div v-for="account in archivedAccounts" :key="account.id" class="bb-hidden-item">
          <q-icon :name="accountIcon(account.institution, account.type)" size="18px" :style="{ color: accountColor(account.institution) }" />
          <span class="bb-hidden-name">{{ account.name }}</span>
          <span class="bb-hidden-inst">{{ account.institution }}</span>
          <q-btn flat dense no-caps size="sm" label="Restore" icon="undo" style="color:#8B6FEC"
            @click="setArchived(account, false)" />
        </div>
      </div>
    </div>

    <!-- Historical toggle -->
    <div class="bb-historical-row q-mb-md">
      <q-toggle v-model="historical" color="purple-5" dense />
      <div class="bb-historical-text">
        <div class="bb-historical-label">Historical backfill (Reports only)</div>
        <div class="bb-historical-sub">
          Use for a past year (e.g. 2025). Counts in Reports but won't change your current dashboard balances or debt.
        </div>
      </div>
    </div>

    <!-- Drop Zone -->
    <div
      class="bb-drop-zone"
      :class="{ 'bb-drop-zone--active': isDragging, 'bb-drop-zone--uploading': uploading }"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
      @click="!uploading && triggerFileInput()"
    >
      <input ref="fileInput" type="file" accept=".csv" style="display:none" @change="handleFileChange" />

      <template v-if="uploading">
        <q-spinner color="primary" size="36px" />
        <div class="bb-drop-title">Processing your CSV with AI...</div>
        <div class="bb-drop-sub">Categorizing transactions — this may take a moment</div>
      </template>
      <template v-else>
        <div class="bb-drop-icon">
          <q-icon name="cloud_upload" size="40px" style="color:#6C4ED4;opacity:0.7" />
        </div>
        <div class="bb-drop-title">
          {{ isDragging ? 'Drop your CSV here' : 'Drag & drop your CSV file here' }}
        </div>
        <div class="bb-drop-sub">or click to browse · supports .csv files</div>
        <q-chip v-if="selectedAccount" class="q-mt-sm" style="background:rgba(108,78,212,0.15);color:#8B6FEC">
          {{ selectedAccount.name }} — {{ selectedAccount.institution }}
        </q-chip>
      </template>
    </div>

    <!-- Upload Result -->
    <div v-if="lastResult" class="bb-result" :class="lastResult.success ? 'bb-result--success' : 'bb-result--error'">
      <q-icon :name="lastResult.success ? 'check_circle' : 'error'" size="20px" />
      <div v-if="lastResult.success">
        <strong>{{ lastResult.imported }}</strong> transactions imported
        <span v-if="lastResult.duplicatesSkipped > 0"> · {{ lastResult.duplicatesSkipped }} duplicates skipped</span>
      </div>
      <div v-else>Upload failed — check that the file matches the selected account</div>
    </div>

    <!-- Export Tips -->
    <div class="row q-col-gutter-md q-mt-lg">
      <div v-for="tip in exportTips" :key="tip.bank" class="col-12 col-md-4">
        <div class="bb-tip-card">
          <div class="bb-tip-header">
            <q-icon :name="tip.icon" size="16px" :style="{ color: tip.color }" />
            <span class="bb-tip-bank">{{ tip.bank }}</span>
          </div>
          <ol class="bb-tip-steps">
            <li v-for="step in tip.steps" :key="step">{{ step }}</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- Upload History -->
    <div class="bb-recent q-mt-lg">
      <div class="bb-recent-title">Recent Uploads</div>

      <div v-if="loadingHistory" class="bb-empty-uploads">
        <q-spinner size="20px" color="primary" />
        <span>Loading history...</span>
      </div>
      <div v-else-if="history.length === 0" class="bb-empty-uploads">
        <q-icon name="history" size="32px" style="color:#3D3D5C" />
        <span>No uploads yet — import your first statement above</span>
      </div>
      <div v-else class="bb-history-list">
        <div v-for="item in history" :key="item.id" class="bb-history-item">
          <q-icon name="upload_file" size="18px" style="color:#6C4ED4" />
          <div class="bb-history-info">
            <div class="bb-history-name">{{ item.filename }}</div>
            <div class="bb-history-meta">
              {{ item.account_name }} · {{ item.transaction_count }} transactions
              <span v-if="item.duplicate_count > 0"> · {{ item.duplicate_count }} skipped</span>
            </div>
          </div>
          <div class="bb-history-date">{{ fmtDate(item.created_at) }}</div>
          <q-btn
            flat dense round icon="delete_outline" size="sm"
            class="bb-history-delete"
            @click="askUndo(item)"
          >
            <q-tooltip>Undo this import (removes its transactions)</q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>

    <!-- Undo-import confirmation -->
    <q-dialog v-model="undoOpen">
      <q-card class="bb-undo-dialog">
        <div class="bb-undo-title">Undo this import?</div>
        <div v-if="undoTarget" class="bb-undo-text">
          This removes the <strong>{{ undoTarget.transaction_count }}</strong> transactions imported from
          <strong>{{ undoTarget.filename }}</strong> into {{ undoTarget.account_name }},
          including any you've since re-categorized. You can always re-upload the file.
        </div>
        <div class="bb-undo-actions">
          <q-btn flat no-caps label="Cancel" style="color:#6E6E9A" v-close-popup />
          <q-btn
            no-caps unelevated label="Remove transactions" :loading="undoing"
            style="background:#EF4444;color:#fff;border-radius:8px;padding:6px 16px"
            @click="confirmUndo"
          />
        </div>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { api, type Account, type UploadResult, type UploadHistory } from 'src/services/api';

const $q = useQuasar();

const allAccounts     = ref<Account[]>([]); // all non-investment accounts
const selectedAccountId = ref<number | null>(null);
const isDragging      = ref(false);
const uploading       = ref(false);
const fileInput       = ref<HTMLInputElement | null>(null);
const lastResult      = ref<UploadResult | null>(null);
const history         = ref<UploadHistory[]>([]);
const loadingHistory  = ref(true);
const historical      = ref(false);

// Active (upload target) accounts vs archived (hidden) ones.
const accounts = computed(() =>
  allAccounts.value.filter(a => !a.is_archived).slice().sort((x, y) => uploadOrder(x) - uploadOrder(y)),
);
const archivedAccounts = computed(() => allAccounts.value.filter(a => a.is_archived));

const selectedAccount = computed(() => accounts.value.find(a => a.id === selectedAccountId.value) ?? null);

// Upload-card ordering: checking accounts first (Everyday Checking), the closed
// Apple Card last, everything else in between. Stable sort keeps the API's
// existing order within each group.
function uploadOrder(a: Account): number {
  if (/check/i.test(a.type ?? '') || /check/i.test(a.name ?? '')) return 0;
  if (a.institution === 'Apple') return 2;
  return 1;
}

// Which backend CSV parser to use for a given institution. Unknown banks fall
// back to the Wells Fargo parser (generic Date/Amount/Description layouts).
function accountTypeKey(institution: string): string {
  if (institution === 'Apple') return 'apple-card';
  if (institution === 'Discover') return 'discover';
  if (/capital\s*one/i.test(institution)) return 'capital-one';
  if (/chase/i.test(institution)) return 'chase';
  if (/american\s*express|amex/i.test(institution)) return 'amex';
  return 'wells-fargo';
}

function accountIcon(institution: string, type?: string): string {
  if (type === 'credit') return 'credit_card';
  if (type === 'investment' || institution === 'Robinhood' || institution === 'Fidelity') return 'trending_up';
  if (institution === 'Apple' || institution === 'Discover') return 'credit_card';
  return 'account_balance';
}

function accountColor(institution: string): string {
  if (institution === 'Apple') return '#9090B8';
  if (institution === 'Discover') return '#F59E0B';
  if (institution === 'Robinhood') return '#22C55E';
  if (institution === 'Fidelity') return '#3B82F6';
  if (/capital\s*one/i.test(institution)) return '#D03027';
  if (/chase/i.test(institution)) return '#117ACA';
  if (/american\s*express|amex/i.test(institution)) return '#2E77BB';
  return '#EF4444';
}

function selectAccount(account: Account) {
  selectedAccountId.value = account.id;
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) void processFile(file);
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void processFile(file);
}

function isCsvFile(file: File): boolean {
  const csvMimes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
  return file.name.toLowerCase().endsWith('.csv') || csvMimes.includes(file.type);
}

async function processFile(file: File) {
  if (!selectedAccountId.value || !selectedAccount.value) {
    lastResult.value = { success: false, imported: 0, duplicatesSkipped: 0, total: 0 };
    return;
  }

  // Client-side guard so non-CSV files fail instantly instead of round-tripping
  // to the server (which performs the authoritative check).
  if (!isCsvFile(file)) {
    lastResult.value = { success: false, imported: 0, duplicatesSkipped: 0, total: 0 };
    return;
  }

  uploading.value  = true;
  lastResult.value = null;

  try {
    const accountType = accountTypeKey(selectedAccount.value.institution);
    const result = await api.uploadCSV(file, selectedAccountId.value, accountType, historical.value);
    lastResult.value = result;
    await loadHistory();
  } catch (err) {
    console.error(err);
    lastResult.value = { success: false, imported: 0, duplicatesSkipped: 0, total: 0 };
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function loadHistory() {
  try {
    history.value = await api.getUploadHistory();
  } catch (e) {
    console.error(e);
  }
}

// Undo an import: confirm, then delete that upload's transactions server-side.
const undoOpen   = ref(false);
const undoTarget = ref<UploadHistory | null>(null);
const undoing    = ref(false);

function askUndo(item: UploadHistory) {
  undoTarget.value = item;
  undoOpen.value   = true;
}

async function confirmUndo() {
  if (!undoTarget.value) return;
  undoing.value = true;
  try {
    const { removedTransactions } = await api.deleteUpload(undoTarget.value.id);
    undoOpen.value = false;
    $q.notify({
      type: 'positive',
      message: `Import undone — ${removedTransactions} transaction${removedTransactions === 1 ? '' : 's'} removed.`,
    });
    await loadHistory();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to undo import' });
  } finally {
    undoing.value = false;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadAccounts() {
  allAccounts.value = (await api.getAccounts()).filter(a => a.type !== 'investment');
  // Keep a valid selection: fall back to the first active account.
  if (!selectedAccount.value) selectedAccountId.value = accounts.value[0]?.id ?? null;
}

// Hide an account from uploads/utilization/balances (keeps its transactions), or restore it.
async function setArchived(account: Account, archived: boolean) {
  try {
    await api.archiveAccount(account.id, archived);
    if (archived && selectedAccountId.value === account.id) selectedAccountId.value = null;
    await loadAccounts();
  } catch (e) { console.error(e); }
}

onMounted(async () => {
  await Promise.all([loadAccounts(), loadHistory()]);
  loadingHistory.value = false;
});

const exportTips = [
  {
    bank: 'Wells Fargo', icon: 'account_balance', color: '#EF4444',
    steps: ['Log in at wellsfargo.com', 'Go to Account Activity', 'Click Download Activity', 'Select CSV & date range'],
  },
  {
    bank: 'Apple Card', icon: 'credit_card', color: '#9090B8',
    steps: ['Open Wallet app on iPhone', 'Tap Apple Card', 'Tap the ··· menu', 'Select Download Transactions'],
  },
  {
    bank: 'Discover', icon: 'credit_card', color: '#F59E0B',
    steps: ['Log in at discover.com', 'Go to Manage > Activity', 'Click Download Transactions', 'Choose CSV format'],
  },
  {
    bank: 'Capital One', icon: 'account_balance', color: '#D03027',
    steps: ['Log in at capitalone.com', 'Select the account', 'Click Download Transactions', 'Choose CSV format'],
  },
  {
    bank: 'Chase', icon: 'account_balance', color: '#117ACA',
    steps: ['Log in at chase.com', 'Choose the account', 'Click the download icon above activity', 'Select CSV & date range'],
  },
  {
    bank: 'American Express', icon: 'credit_card', color: '#2E77BB',
    steps: ['Log in at americanexpress.com', 'Go to Statements & Activity', 'Click Download Your Transactions', 'Choose CSV format'],
  },
];
</script>

<style lang="scss">
.bb-upload-page { background-color: #0A0A1B; min-height: 100vh; }

.bb-account-card {
  position: relative;
  background: #0F1030; border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; padding: 16px; cursor: pointer;
  transition: all 0.15s ease; display: flex; flex-direction: column; gap: 6px;
  &:hover { border-color: rgba(108,78,212,0.3); background: #141440;
    .bb-account-hide { opacity: 1; } }
  &--active { border-color: #6C4ED4 !important; background: rgba(108,78,212,0.1) !important; }
}
.bb-account-hide {
  position: absolute; top: 6px; right: 6px; color: #6E6E9A !important;
  opacity: 0; transition: opacity 0.15s ease;
  &:hover { color: #EF4444 !important; }
}
.bb-account-name { font-size: 13px; font-weight: 600; color: #ffffff; }
.bb-account-type { font-size: 11px; color: #6E6E9A; }

.bb-hidden-accts {
  background: #0C0C22; border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px;
}
.bb-hidden-title { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: #8F8FB5; text-transform: uppercase; }
.bb-hidden-sub { font-size: 11.5px; color: #6E6E9A; margin: 4px 0 10px; }
.bb-hidden-list { display: flex; flex-direction: column; gap: 4px; }
.bb-hidden-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.bb-hidden-name { font-size: 13px; color: #C6C6E5; font-weight: 600; }
.bb-hidden-inst { font-size: 11px; color: #6E6E9A; flex: 1; }

.bb-historical-row {
  display: flex; align-items: flex-start; gap: 12px;
  background: #0F1030; border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; padding: 12px 16px;
}
.bb-historical-label { font-size: 13px; font-weight: 600; color: #ffffff; }
.bb-historical-sub { font-size: 11px; color: #6E6E9A; margin-top: 2px; max-width: 560px; }

.bb-drop-zone {
  background: #0F1030; border: 2px dashed rgba(108,78,212,0.25);
  border-radius: 16px; padding: 48px 24px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  transition: all 0.2s ease;
  &:hover, &--active { border-color: rgba(108,78,212,0.5); background: rgba(108,78,212,0.04); }
  &--uploading { cursor: default; border-color: rgba(108,78,212,0.4); }
}
.bb-drop-title { font-size: 15px; font-weight: 600; color: #ffffff; }
.bb-drop-sub   { font-size: 12px; color: #6E6E9A; }

.bb-result {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; border-radius: 10px; margin-top: 16px;
  font-size: 13px; font-weight: 500;
  &--success { background: rgba(34,197,94,0.1); color: #22C55E; border: 1px solid rgba(34,197,94,0.2); }
  &--error   { background: rgba(239,68,68,0.1);  color: #EF4444; border: 1px solid rgba(239,68,68,0.2); }
}

.bb-tip-card { background: #0F1030; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px; }
.bb-tip-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.bb-tip-bank   { font-size: 13px; font-weight: 600; color: #ffffff; }
.bb-tip-steps  { padding-left: 16px; margin: 0; li { font-size: 12px; color: #6E6E9A; line-height: 1.8; } }

.bb-recent-title  { font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }
.bb-empty-uploads {
  display: flex; align-items: center; gap: 10px; padding: 20px;
  background: #0F1030; border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; color: #3D3D5C; font-size: 13px;
}
.bb-history-list { display: flex; flex-direction: column; gap: 8px; }
.bb-history-item {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  background: #0F1030; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
}
.bb-history-info { flex: 1; }
.bb-history-name { font-size: 13px; font-weight: 500; color: #ffffff; }
.bb-history-meta { font-size: 11px; color: #6E6E9A; margin-top: 2px; }
.bb-history-date { font-size: 11px; color: #4D4D70; white-space: nowrap; }
.bb-history-delete {
  color: #4D4D70;
  &:hover { color: #EF4444; }
}

.bb-undo-dialog {
  background: #0F1030; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px; padding: 28px; width: 92vw; max-width: 420px;
}
.bb-undo-title   { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
.bb-undo-text    { font-size: 13px; color: #9090B8; line-height: 1.6; margin-bottom: 20px; strong { color: #ffffff; } }
.bb-undo-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
