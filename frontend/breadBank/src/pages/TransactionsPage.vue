<template>
  <q-page class="bb-tx-page q-pa-lg">

    <div class="bb-page-header">
      <div class="bb-page-title">Transactions</div>
      <div class="bb-page-sub">{{ total }} total transactions</div>
    </div>

    <!-- Toolbar -->
    <div class="bb-tx-toolbar q-mb-md">
      <div class="bb-search-box">
        <q-icon name="search" size="16px" style="color:#6E6E9A" />
        <input
          v-model="search"
          placeholder="Search merchant or description..."
          class="bb-search-input"
          @input="onSearchInput"
        />
        <q-icon v-if="search" name="close" size="14px" style="color:#6E6E9A;cursor:pointer" @click="clearSearch" />
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
      <q-btn no-caps flat label="Clear filters" size="sm" style="color:#6E6E9A" @click="clearFilters" />
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
      <q-icon name="receipt_long" size="52px" style="color:#6C4ED4" class="bb-stub-icon" />
      <div class="bb-stub-title">No transactions found</div>
      <div class="bb-stub-sub">
        {{ search || filterCategory !== 'All Categories' ? 'Try adjusting your filters' : 'Upload a CSV to get started' }}
      </div>
      <q-btn v-if="!search" no-caps unelevated label="Upload CSV" to="/app/upload"
        style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px;margin-top:8px" />
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
          @click="openEdit(tx)"
        >
          <span class="bb-tx-col-date bb-tx-date">{{ fmtDate(tx.date) }}</span>
          <span class="bb-tx-col-desc">
            <div class="bb-tx-merchant">{{ tx.merchant || tx.description }}</div>
            <div v-if="tx.merchant" class="bb-tx-desc-small">{{ tx.description }}</div>
          </span>
          <span class="bb-tx-col-cat">
            <span v-if="tx.category" class="bb-cat-chip" :style="{ background: hex(tx.category_color ?? '#6C4ED4') + '22', color: tx.category_color ?? '#6C4ED4' }">
              {{ tx.category }}
            </span>
            <span v-else class="bb-cat-chip bb-cat-unknown">Unknown</span>
          </span>
          <span class="bb-tx-col-acct bb-tx-acct">{{ tx.account_name }}</span>
          <span class="bb-tx-col-amt" :class="tx.type === 'credit' ? 'bb-amt-credit' : 'bb-amt-debit'">
            {{ tx.type === 'credit' ? '+' : '-' }}${{ fmtAmount(tx.amount) }}
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
      <div class="bb-edit-dialog">
        <div class="bb-edit-title">Edit Transaction</div>
        <div v-if="editTx" class="bb-edit-info">
          <div class="bb-edit-merchant">{{ editTx.merchant || editTx.description }}</div>
          <div class="bb-edit-amount" :class="editTx.type === 'credit' ? 'bb-amt-credit' : 'bb-amt-debit'">
            {{ editTx.type === 'credit' ? '+' : '-' }}${{ fmtAmount(editTx.amount) }}
          </div>
        </div>

        <div class="bb-edit-label q-mt-md">Category</div>
        <q-select
          v-model="editCategory"
          :options="categoryOptions"
          option-label="name"
          option-value="id"
          dense outlined dark emit-value map-options
          class="q-mb-md"
        />

        <div class="bb-edit-label">Note (optional)</div>
        <q-input v-model="editNote" dense outlined dark placeholder="e.g. Sarah's birthday dinner" class="q-mb-lg" />

        <div class="bb-edit-actions">
          <q-btn flat no-caps label="Cancel" style="color:#6E6E9A" v-close-popup />
          <q-btn no-caps unelevated label="Save" :loading="saving"
            style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px;padding:6px 20px"
            @click="saveEdit" />
        </div>
      </div>
    </q-dialog>

  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api, type Transaction, type Category, type TransactionMonth } from 'src/services/api';

const PAGE_SIZE = 50;

const transactions   = ref<Transaction[]>([]);
const categories     = ref<Category[]>([]);
const months         = ref<TransactionMonth[]>([]);
const loading        = ref(true);
const loadError      = ref('');
const total          = ref(0);
const offset         = ref(0);
const search         = ref('');
const filterCategory = ref('All Categories');
const filterMonth    = ref(''); // '' = all months, otherwise 'YYYY-MM'

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
const saving       = ref(false);

function hex(color: string) { return color; }

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function loadTransactions() {
  loading.value = true;
  loadError.value = '';
  try {
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(offset.value) };
    if (search.value) params.search = search.value;
    if (filterCategory.value !== 'All Categories') params.category = filterCategory.value;
    if (filterMonth.value) {
      const [y, m] = filterMonth.value.split('-').map(Number);
      const lastDay = new Date(y ?? 0, m ?? 1, 0).getDate(); // day 0 of next month = last day of this one
      params.startDate = `${filterMonth.value}-01`;
      params.endDate = `${filterMonth.value}-${String(lastDay).padStart(2, '0')}`;
    }

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
  offset.value         = 0;
  void loadTransactions();
}

function openEdit(tx: Transaction) {
  editTx.value       = tx;
  editCategory.value = categories.value.find(c => c.name === tx.category)?.id ?? null;
  editNote.value     = tx.notes ?? '';
  editOpen.value     = true;
}

async function saveEdit() {
  if (!editTx.value) return;
  saving.value = true;
  try {
    const updates: { categoryId?: number; notes?: string } = {};
    if (editCategory.value !== null) updates.categoryId = editCategory.value;
    if (editNote.value) updates.notes = editNote.value;
    await api.updateTransaction(editTx.value.id, updates);
    editOpen.value = false;
    await loadTransactions();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const [, cats, mos] = await Promise.all([loadTransactions(), api.getCategories(), api.getTransactionMonths()]);
    categories.value = cats;
    months.value = mos;
  } catch (e) {
    // loadTransactions handles its own error state; this catches a failed
    // category fetch so it isn't silently swallowed.
    loadError.value = e instanceof Error ? e.message : 'Failed to load page data';
    console.error(e);
  }
});
</script>

<style lang="scss">
.bb-tx-page { background-color: #0A0A1B; min-height: 100vh; }

.bb-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; gap: 16px; color: #6E6E9A; font-size: 14px; }

.bb-tx-toolbar {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}

.bb-search-box {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;
  background: #0F1030; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; padding: 8px 12px;
}

.bb-search-input {
  background: none; border: none; outline: none; flex: 1;
  color: #ffffff; font-size: 13px;
  &::placeholder { color: #6E6E9A; }
}

.bb-filter-select {
  min-width: 180px;
  .q-field__control { background: #0F1030 !important; border-color: rgba(255,255,255,0.08) !important; }
}

.bb-tx-table { border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06); }

.bb-tx-header-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 16px;
  background: #0F1030; font-size: 10px; font-weight: 600;
  letter-spacing: 0.6px; text-transform: uppercase; color: #4D4D70;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.bb-tx-month-header {
  padding: 8px 16px; background: #0C0C22;
  font-size: 11px; font-weight: 700; letter-spacing: 0.6px;
  text-transform: uppercase; color: #8B6FEC;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.bb-tx-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: #0A0A1B; border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer; transition: background 0.1s;
  &:hover { background: #0F1030; }
  &:last-child { border-bottom: none; }
}

.bb-tx-col-date { width: 92px;  flex-shrink: 0; }
.bb-tx-col-desc { flex: 1; min-width: 0; }
.bb-tx-col-cat  { width: 140px; flex-shrink: 0; }
.bb-tx-col-acct { width: 130px; flex-shrink: 0; min-width: 0; }
.bb-tx-col-amt  { width: 104px; flex-shrink: 0; text-align: right; font-weight: 600; font-size: 13px; white-space: nowrap; }

.bb-tx-date    { font-size: 12px; color: #6E6E9A; white-space: nowrap; }
.bb-tx-merchant { font-size: 13px; font-weight: 500; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-tx-desc-small { font-size: 11px; color: #4D4D70; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-tx-acct    { font-size: 11px; color: #6E6E9A; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.bb-cat-chip {
  font-size: 11px; font-weight: 500; padding: 3px 9px;
  border-radius: 20px; display: inline-block;
}
.bb-cat-unknown { background: rgba(110,110,154,0.15) !important; color: #6E6E9A !important; }

.bb-amt-credit { color: #22C55E !important; }
.bb-amt-debit  { color: #ffffff; }

.bb-pagination {
  display: flex; align-items: center; justify-content: center; gap: 16px;
}
.bb-page-btn  { color: #8B6FEC !important; font-size: 13px; }
.bb-page-info { font-size: 13px; color: #6E6E9A; min-width: 100px; text-align: center; }

.bb-edit-dialog {
  background: #0F1030; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px; padding: 28px; min-width: 380px;
}
.bb-edit-title   { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 16px; }
.bb-edit-info    { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.bb-edit-merchant { font-size: 14px; font-weight: 500; color: #ffffff; }
.bb-edit-amount  { font-size: 16px; font-weight: 700; }
.bb-edit-label   { font-size: 12px; font-weight: 600; color: #9090B8; margin-bottom: 6px; }
.bb-edit-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
