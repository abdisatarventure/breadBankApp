<template>
  <q-page class="bb-tx-page q-pa-lg">
    <!-- Phone gesture: pull down to reload the list. -->
    <q-pull-to-refresh @refresh="onPullRefresh" color="purple-4" bg-color="dark">

    <div class="bb-page-header">
      <div class="bb-page-title">Transactions</div>
      <div class="bb-page-sub">{{ total }} total transactions</div>
    </div>

    <!-- Toolbar -->
    <div class="bb-tx-toolbar q-mb-md">
      <div class="bb-search-box">
        <q-icon name="search" size="16px" style="color: var(--bb-text-dim)" />
        <input
          v-model="search"
          placeholder="Search merchant or description..."
          class="bb-search-input"
          @input="onSearchInput"
        />
        <q-icon v-if="search" name="close" size="14px" style="color: var(--bb-text-dim);cursor:pointer" @click="clearSearch" />
      </div>
      <q-select
        v-model="filterCategory"
        :options="['All Categories', ...categoryNames]"
        dense outlined dark
        class="bb-filter-select"
        @update:model-value="() => { offset = 0; void loadTransactions(); }"
      />
      <q-select
        v-model="filterMonth"
        :options="monthOptions"
        emit-value map-options
        dense outlined dark
        class="bb-filter-select"
        @update:model-value="() => { offset = 0; void loadTransactions(); }"
      />
      <q-select
        v-model="filterAccount"
        :options="accountOptions"
        emit-value map-options
        dense outlined dark
        class="bb-filter-select"
        @update:model-value="() => { offset = 0; void loadTransactions(); }"
      />
      <q-btn no-caps flat label="Clear filters" size="sm" style="color: var(--bb-text-dim)" @click="clearFilters" />
      <q-btn
        no-caps flat icon="download" label="Export CSV" size="sm"
        :loading="exporting" :disable="total === 0"
        style="color: var(--bb-accent-light)"
        @click="exportCsv"
      >
        <q-tooltip>Download the filtered transactions as a CSV file</q-tooltip>
      </q-btn>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="32px" />
      <span>Loading transactions...</span>
    </div>

    <!-- Error -->
    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-md" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <!-- Empty -->
    <div v-else-if="transactions.length === 0" class="bb-stub">
      <q-icon name="receipt_long" size="52px" style="color: var(--bb-accent)" class="bb-stub-icon" />
      <div class="bb-stub-title">No transactions found</div>
      <div class="bb-stub-sub">
        {{ search || filterCategory !== 'All Categories' ? 'Try adjusting your filters' : 'Upload a CSV to get started' }}
      </div>
      <q-btn v-if="!search" no-caps unelevated label="Upload CSV" to="/app/upload"
        style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px;margin-top:8px" />
    </div>

    <!-- Table -->
    <div v-else class="bb-tx-table">
      <div class="bb-tx-header-row">
        <span class="bb-tx-col-date">Date</span>
        <span class="bb-tx-col-desc">Merchant / Description</span>
        <span class="bb-tx-col-cat">Category</span>
        <span class="bb-tx-col-acct">Account</span>
        <span class="bb-tx-col-amt">Amount</span>
      </div>

      <template v-for="(tx, i) in transactions" :key="tx.id">
        <div
          v-if="i === 0 || monthKeyOf(tx.date) !== monthKeyOf(transactions[i - 1]?.date ?? '')"
          class="bb-tx-month-header"
        >
          {{ monthLabel(monthKeyOf(tx.date)) }}
        </div>
        <div
          class="bb-tx-row"
          v-touch-swipe.mouse.left="() => quickCategorize(tx)"
          @click="openEdit(tx)"
        >
          <span class="bb-tx-col-date bb-tx-date">{{ fmtDate(tx.date) }}</span>
          <span class="bb-tx-col-desc">
            <div class="bb-tx-merchant">{{ tx.merchant || tx.description }}</div>
            <div v-if="tx.merchant" class="bb-tx-desc-small">{{ tx.description }}</div>
          </span>
          <span class="bb-tx-col-cat">
            <!-- A real category shows normally; an unknown one (blank OR the
                 'Unknown' category) shows its direction so you can tell income
                 from money leaving at a glance, on any account. -->
            <span v-if="tx.category && tx.category !== 'Unknown'" class="bb-cat-chip" :style="{ background: hex(tx.category_color ?? '#6C4ED4') + '22', color: tx.category_color ?? '#6C4ED4' }">
              {{ tx.category }}
            </span>
            <span v-else class="bb-cat-chip" :class="tx.type === 'credit' ? 'bb-cat-unknown-in' : 'bb-cat-unknown-out'">
              Unknown · {{ tx.type === 'credit' ? 'in ↓' : 'out ↑' }}
            </span>
          </span>
          <span class="bb-tx-col-acct bb-tx-acct">{{ tx.account_name }}</span>
          <span class="bb-tx-col-amt" :class="tx.type === 'credit' ? 'bb-amt-credit' : 'bb-amt-debit'">
            <template v-if="tx.reimbursed_amount > 0">
              <span class="bb-tx-gross">${{ fmtAmount(tx.amount) }}</span>
              <span class="bb-tx-net">-${{ fmtAmount(Math.max(0, tx.amount - tx.reimbursed_amount)) }}</span>
            </template>
            <template v-else>{{ tx.type === 'credit' ? '+' : '-' }}${{ fmtAmount(tx.amount) }}</template>
          </span>
        </div>
      </template>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && !loadError && total > PAGE_SIZE" class="bb-pagination q-mt-md">
      <q-btn
        flat dense no-caps icon="chevron_left" label="Prev"
        :disable="!hasPrev"
        class="bb-page-btn"
        @click="goToPrev"
      />
      <span class="bb-page-info">Page {{ currentPage }} of {{ totalPages }}</span>
      <q-btn
        flat dense no-caps icon-right="chevron_right" label="Next"
        :disable="!hasNext"
        class="bb-page-btn"
        @click="goToNext"
      />
    </div>

    <!-- Edit dialog -->
    <q-dialog v-model="editOpen">
      <q-card class="bb-edit-dialog">
        <div class="bb-edit-title">Edit Transaction</div>
        <div v-if="editTx" class="bb-edit-info">
          <div class="bb-edit-merchant">{{ editTx.merchant || editTx.description }}</div>
          <div class="bb-edit-amount" :class="editTx.type === 'credit' ? 'bb-amt-credit' : 'bb-amt-debit'">
            {{ editTx.type === 'credit' ? '+' : '-' }}${{ fmtAmount(editTx.amount) }}
          </div>
        </div>

        <div class="bb-edit-label q-mt-md">Date</div>
        <q-input v-model="editDate" type="date" dense outlined dark class="q-mb-md" />

        <div class="bb-edit-label">Category</div>
        <q-select
          v-model="editCategory"
          :options="categoryOptions"
          option-label="name"
          option-value="id"
          dense outlined dark emit-value map-options
          class="q-mb-md"
        />

        <div class="bb-edit-label">Note (optional)</div>
        <q-input v-model="editNote" dense outlined dark placeholder="e.g. Sarah's birthday dinner" class="q-mb-md" />

        <!-- Reimbursements — for expenses only: link money a friend paid you back
             so this expense shows its true net cost. -->
        <template v-if="editTx && editTx.type === 'debit'">
          <div class="bb-edit-label">Reimbursements</div>
          <div v-if="reimbLoading" class="bb-reimb-empty">Loading…</div>
          <template v-else>
            <div v-if="reimbOptions.length === 0" class="bb-reimb-empty">No reimbursements available to link.</div>
            <div v-else class="bb-reimb-list">
              <label v-for="r in reimbOptions" :key="r.id" class="bb-reimb-item">
                <q-checkbox v-model="reimbSelected" :val="r.id" dense color="teal" />
                <span class="bb-reimb-desc">{{ r.description }}</span>
                <span class="bb-reimb-amt">+${{ fmtAmount(r.amount) }}</span>
              </label>
            </div>
            <div v-if="reimbSelectedTotal > 0" class="bb-reimb-net">
              Net after reimbursement: <strong>${{ fmtAmount(reimbNet) }}</strong>
              <span class="bb-reimb-sub">(${{ fmtAmount(editTx.amount) }} − ${{ fmtAmount(reimbSelectedTotal) }})</span>
            </div>
          </template>
        </template>

        <div class="bb-edit-actions q-mt-lg">
          <q-btn flat no-caps label="Cancel" style="color: var(--bb-text-dim)" v-close-popup />
          <q-btn no-caps unelevated label="Save" :loading="saving"
            style="background:linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));color:var(--bb-on-accent);border-radius:8px;padding:6px 20px"
            @click="saveEdit" />
        </div>
      </q-card>
    </q-dialog>

    </q-pull-to-refresh>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { api, type Transaction, type Category, type TransactionMonth, type Account, type ReimbursementOption } from 'src/services/api';

const route = useRoute();
const $q = useQuasar();

const PAGE_SIZE = 50;

const transactions   = ref<Transaction[]>([]);
const categories     = ref<Category[]>([]);
const months         = ref<TransactionMonth[]>([]);
const accounts       = ref<Account[]>([]);
const loading        = ref(true);
const loadError      = ref('');
const total          = ref(0);
const offset         = ref(0);
const search         = ref('');
const filterCategory = ref('All Categories');
const filterMonth    = ref(''); // '' = all months, otherwise 'YYYY-MM'
const filterAccount  = ref(''); // '' = all accounts, otherwise the account id as a string
const exporting      = ref(false);

let searchTimer: ReturnType<typeof setTimeout> | null = null;

const currentPage  = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1);
const totalPages   = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const hasPrev      = computed(() => offset.value > 0);
const hasNext      = computed(() => offset.value + PAGE_SIZE < total.value);

const categoryNames = computed(() => categories.value.map(c => c.name));
const categoryOptions = computed(() => categories.value.map(c => ({ id: c.id, name: c.name, color: c.color })));

const monthOptions = computed(() => [
  { label: 'All Months', value: '' },
  ...months.value.map(m => ({ label: `${monthLabel(m.monthKey)} (${m.count})`, value: m.monthKey })),
]);

const accountOptions = computed(() => [
  { label: 'All Accounts', value: '' },
  ...accounts.value.map(a => ({ label: `${a.name} · ${a.institution}`, value: String(a.id) })),
]);

// The API returns dates as calendar dates serialized at UTC midnight
// (e.g. "2026-06-01T00:00:00.000Z"). Parsing those with `new Date()` and
// rendering in a US timezone shifts them back a day, so a June 1 transaction
// shows as "May 31" while still grouping under June. Work off the YYYY-MM-DD
// portion directly so the day shown matches the stored (and grouped) day.
function monthKeyOf(iso: string) {
  return iso.slice(0, 7); // 'YYYY-MM' straight from the stored calendar date
}

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Edit dialog
const editOpen     = ref(false);
const editTx       = ref<Transaction | null>(null);
const editCategory = ref<number | null>(null);
const editNote     = ref('');
const editDate     = ref('');
const saving       = ref(false);

// Reimbursement linking (expenses only): reimbOptions = linked + available,
// with the linked ones pre-selected.
const reimbLoading  = ref(false);
const reimbOptions  = ref<ReimbursementOption[]>([]);
const reimbSelected = ref<number[]>([]);
const reimbSelectedTotal = computed(() =>
  reimbOptions.value.filter(r => reimbSelected.value.includes(r.id)).reduce((s, r) => s + r.amount, 0),
);
const reimbNet = computed(() => Math.max(0, (editTx.value?.amount ?? 0) - reimbSelectedTotal.value));

function hex(color: string) { return color; }

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The filters currently in effect, as query params understood by both the
// list and the CSV-export endpoints (paging is added separately).
function currentFilterParams(): Record<string, string> {
  const params: Record<string, string> = {};
  if (search.value) params.search = search.value;
  if (filterCategory.value !== 'All Categories') params.category = filterCategory.value;
  if (filterAccount.value) params.account = filterAccount.value;
  if (filterMonth.value) {
    const [y, m] = filterMonth.value.split('-').map(Number);
    const lastDay = new Date(y ?? 0, m ?? 1, 0).getDate(); // day 0 of next month = last day of this one
    params.startDate = `${filterMonth.value}-01`;
    params.endDate = `${filterMonth.value}-${String(lastDay).padStart(2, '0')}`;
  }
  return params;
}

async function loadTransactions() {
  loading.value = true;
  loadError.value = '';
  try {
    const params = { ...currentFilterParams(), limit: String(PAGE_SIZE), offset: String(offset.value) };
    const res = await api.getTransactions(params);
    transactions.value = res.transactions;
    total.value        = res.total;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load transactions';
    console.error(e);
  } finally {
    loading.value = false;
  }
}

// Download everything matching the current filters (not just this page) as CSV.
async function exportCsv() {
  exporting.value = true;
  try {
    const blob = await api.exportTransactionsCsv(currentFilterParams());
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `breadbank-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to export transactions' });
  } finally {
    exporting.value = false;
  }
}

function goToPrev() {
  if (!hasPrev.value) return;
  offset.value = Math.max(0, offset.value - PAGE_SIZE);
  void loadTransactions();
}

function goToNext() {
  if (!hasNext.value) return;
  offset.value += PAGE_SIZE;
  void loadTransactions();
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    offset.value = 0;
    void loadTransactions();
  }, 400);
}

function clearSearch() {
  search.value = '';
  offset.value = 0;
  void loadTransactions();
}

function clearFilters() {
  search.value         = '';
  filterCategory.value = 'All Categories';
  filterMonth.value    = '';
  filterAccount.value  = '';
  offset.value         = 0;
  void loadTransactions();
}

// Pull-to-refresh: reload the current page of results.
async function onPullRefresh(done: () => void) {
  try {
    await loadTransactions();
  } finally {
    done();
  }
}

// Swipe a row left → quick category picker, no dialog round-trip.
function quickCategorize(tx: Transaction) {
  if (!categories.value.length) return;
  $q.bottomSheet({
    message: `${tx.merchant || tx.description} — move to category`,
    grid: true,
    dark: true,
    class: 'bb-sheet',
    actions: categories.value.map(c => ({
      label: c.name,
      icon: c.icon || 'label',
      id: String(c.id),
    })),
  }).onOk((action: { id: string }) => {
    void (async () => {
      try {
        await api.updateTransaction(tx.id, { categoryId: Number(action.id) });
        $q.notify({ type: 'positive', message: `Moved to ${categories.value.find(c => c.id === Number(action.id))?.name ?? 'category'}` });
        await loadTransactions();
      } catch (e) {
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to update category' });
      }
    })();
  });
}

function openEdit(tx: Transaction) {
  editTx.value       = tx;
  editCategory.value = categories.value.find(c => c.name === tx.category)?.id ?? null;
  editNote.value     = tx.notes ?? '';
  editDate.value     = tx.date.slice(0, 10); // 'YYYY-MM-DD' for the date input
  editOpen.value     = true;

  // For an expense, load the reimbursements it can be paired with (already-linked
  // ones pre-checked). Skipped for credits — those aren't expenses.
  reimbOptions.value = [];
  reimbSelected.value = [];
  if (tx.type === 'debit') {
    reimbLoading.value = true;
    void api.getReimbursements(tx.id)
      .then(({ linked, available }) => {
        reimbOptions.value = [...linked, ...available];
        reimbSelected.value = linked.map(l => l.id);
      })
      .catch((e) => console.error(e))
      .finally(() => { reimbLoading.value = false; });
  }
}

async function saveEdit() {
  if (!editTx.value) return;
  saving.value = true;
  try {
    const updates: { categoryId?: number; notes?: string; date?: string } = {};
    if (editCategory.value !== null) updates.categoryId = editCategory.value;
    if (editNote.value) updates.notes = editNote.value;
    if (editDate.value && editDate.value !== editTx.value.date.slice(0, 10)) updates.date = editDate.value;
    await api.updateTransaction(editTx.value.id, updates);
    // Persist reimbursement links (expenses only). Sends the full selected set so
    // the backend reconciles adds and removals.
    if (editTx.value.type === 'debit') {
      await api.setReimbursements(editTx.value.id, [...reimbSelected.value]);
    }
    editOpen.value = false;
    await loadTransactions();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  // Honour a ?category=Name deep link (e.g. from the dashboard anomaly alerts).
  if (typeof route.query.category === 'string' && route.query.category) {
    filterCategory.value = route.query.category;
  }
  // ?account=<id> deep link (e.g. from Dashboard V2's "Do this next" card).
  if (typeof route.query.account === 'string' && /^\d+$/.test(route.query.account)) {
    filterAccount.value = route.query.account;
  }
  try {
    const [, cats, mos, accts] = await Promise.all([
      loadTransactions(), api.getCategories(), api.getTransactionMonths(), api.getAccounts(),
    ]);
    categories.value = cats;
    months.value = mos;
    accounts.value = accts;
  } catch (e) {
    // loadTransactions handles its own error state; this catches a failed
    // category fetch so it isn't silently swallowed.
    loadError.value = e instanceof Error ? e.message : 'Failed to load page data';
    console.error(e);
  }
});
</script>

<style lang="scss">
.bb-tx-page { background-color: var(--bb-bg); min-height: 100vh; }

.bb-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; gap: 16px; color: var(--bb-text-dim); font-size: 14px; }

.bb-tx-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}

.bb-search-box {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 8px; padding: 8px 12px;
}

.bb-search-input {
  background: none; border: none; outline: none; flex: 1;
  color: var(--bb-text); font-size: 13px;
  &::placeholder { color: var(--bb-text-dim); }
}

.bb-filter-select {
  min-width: 180px;
  .q-field__control { background: var(--bb-surface) !important; border-color: var(--bb-border) !important; }
}

.bb-tx-table { border-radius: 12px; overflow-x: auto; border: 1px solid var(--bb-border); }
// Keep the columns from crushing into each other — scroll the table sideways
// instead once they no longer fit.
.bb-tx-header-row, .bb-tx-row, .bb-tx-month-header { min-width: 660px; }

.bb-tx-header-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 16px;
  background: var(--bb-surface); font-size: 10px; font-weight: 600;
  letter-spacing: 0.6px; text-transform: uppercase; color: var(--bb-text-muted);
  border-bottom: 1px solid var(--bb-border);
}

.bb-tx-month-header {
  padding: 8px 16px; background: var(--bb-surface-2);
  font-size: 11px; font-weight: 700; letter-spacing: 0.6px;
  text-transform: uppercase; color: var(--bb-accent-light);
  border-bottom: 1px solid var(--bb-border);
}

.bb-tx-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--bb-bg); border-bottom: 1px solid var(--bb-border);
  cursor: pointer; transition: background 0.1s;
  &:hover { background: var(--bb-surface); }
  &:last-child { border-bottom: none; }
}

.bb-tx-col-date { width: 92px;  flex-shrink: 0; }
.bb-tx-col-desc { flex: 1; min-width: 0; }
.bb-tx-col-cat  { width: 140px; flex-shrink: 0; min-width: 0; overflow: hidden; }
.bb-tx-col-acct { width: 130px; flex-shrink: 0; min-width: 0; }
.bb-tx-col-amt  { width: 104px; flex-shrink: 0; text-align: right; font-weight: 600; font-size: 13px; white-space: nowrap; }

.bb-tx-date    { font-size: 12px; color: var(--bb-text-dim); white-space: nowrap; }
.bb-tx-merchant { font-size: 13px; font-weight: 500; color: var(--bb-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-tx-desc-small { font-size: 11px; color: var(--bb-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-tx-acct    { font-size: 11px; color: var(--bb-text-dim); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.bb-cat-chip {
  font-size: 11px; font-weight: 500; padding: 3px 9px;
  border-radius: 20px; display: inline-block;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bb-cat-unknown { background: rgba(110,110,154,0.15) !important; color: var(--bb-text-dim) !important; }
/* Unknown category, direction-tagged: green when money came in, red when it left. */
.bb-cat-unknown-in  { background: rgba(34,197,94,0.15) !important;  color: #22C55E !important; }
.bb-cat-unknown-out { background: rgba(239,68,68,0.15) !important;  color: #EF4444 !important; }

/* Money coming IN is green, money going OUT is red — at a glance, regardless of
   category (including Unknown). */
.bb-amt-credit { color: #22C55E !important; }
.bb-amt-debit  { color: #EF4444 !important; }

/* Row: struck-through gross + green net when an expense is (partly) reimbursed */
.bb-tx-gross { color: var(--bb-text-dim); text-decoration: line-through; font-size: 12px; margin-right: 6px; }
.bb-tx-net   { color: #22C55E; font-weight: 600; }

/* Reimbursement linker inside the edit dialog */
.bb-reimb-empty { color: var(--bb-text-dim); font-size: 12px; margin-bottom: 12px; }
.bb-reimb-list  { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px;
                  max-height: 160px; overflow-y: auto; }
.bb-reimb-item  { display: flex; align-items: center; gap: 8px; cursor: pointer;
                  padding: 2px 0; font-size: 12px; color: var(--bb-text-soft); }
.bb-reimb-desc  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-reimb-amt   { color: #22C55E; font-weight: 600; }
.bb-reimb-net   { font-size: 13px; color: var(--bb-text-soft); margin-bottom: 8px; }
.bb-reimb-net strong { color: #14B8A6; }
.bb-reimb-sub   { color: var(--bb-text-dim); font-size: 11px; margin-left: 6px; }

.bb-pagination {
  display: flex; align-items: center; justify-content: center; gap: 16px;
}
.bb-page-btn  { color: var(--bb-accent-light) !important; font-size: 13px; }
.bb-page-info { font-size: 13px; color: var(--bb-text-dim); min-width: 100px; text-align: center; }

.bb-edit-dialog {
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 16px; padding: 28px; width: 92vw; max-width: 380px;
}
.bb-edit-title   { font-size: 16px; font-weight: 700; color: var(--bb-text); margin-bottom: 16px; }
.bb-edit-info    { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.bb-edit-merchant { font-size: 14px; font-weight: 500; color: var(--bb-text); }
.bb-edit-amount  { font-size: 16px; font-weight: 700; }
.bb-edit-label   { font-size: 12px; font-weight: 600; color: var(--bb-text-soft); margin-bottom: 6px; }
.bb-edit-actions { display: flex; justify-content: flex-end; gap: 10px; }

// Phones: no sideways scrolling — each transaction becomes a two-line card:
// merchant + amount on the first line, date · category · account underneath.
@media (max-width: 599px) {
  .bb-tx-header-row { display: none; }
  .bb-tx-row, .bb-tx-month-header { min-width: 0; }
  .bb-tx-row { flex-wrap: wrap; gap: 2px 10px; padding: 10px 12px; }
  .bb-tx-col-desc { order: 1; flex: 1 1 0; min-width: 55%; }
  .bb-tx-col-amt  { order: 2; width: auto; margin-left: auto; }
  .bb-tx-col-date { order: 3; width: auto; }
  .bb-tx-col-cat  { order: 4; width: auto; max-width: 45%; }
  .bb-tx-col-acct { order: 5; width: auto; flex: 1 1 auto; text-align: right; }
}
</style>
