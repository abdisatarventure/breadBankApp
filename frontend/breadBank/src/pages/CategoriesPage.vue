<template>
  <q-page class="bb-categories q-pa-lg">
    <div class="bb-page-header">
      <div>
        <div class="bb-page-title">Categories</div>
        <div class="bb-page-sub">Manage your categories and review unknown transactions that need labeling</div>
      </div>
    </div>

    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="40px" />
      <span>Loading categories and unknown transactions...</span>
    </div>

    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else>
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-xl-4">
          <div class="bb-panel bb-panel--compact">
            <div class="bb-panel__header">
              <div>
                <div class="bb-panel__title">Create a new category</div>
                <div class="bb-panel__sub">Add custom labels for your spending.</div>
              </div>
            </div>

            <div class="bb-form-row">
              <q-input v-model="newCategory.name" label="Category name" dense clearable />
            </div>
            <div class="bb-form-row row q-col-gutter-sm">
              <div class="col-6">
                <q-input v-model="newCategory.icon" label="Icon" dense clearable />
              </div>
              <div class="col-6">
                <q-input v-model="newCategory.color" label="Color" dense clearable />
              </div>
            </div>
            <div class="bb-form-row">
              <q-btn unelevated color="primary" label="Create category" :loading="creating" @click="createCategory" />
            </div>
          </div>

          <div class="bb-panel bb-panel--compact bb-panel--list">
            <div class="bb-panel__header">
              <div>
                <div class="bb-panel__title">Your categories</div>
                <div class="bb-panel__sub">Custom and system categories.</div>
              </div>
            </div>
            <div class="bb-category-list">
              <div v-for="category in categories" :key="category.id" class="bb-category-item">
                <div class="bb-category-icon" :style="{ background: category.color ?? '#6C4ED4' }">
                  <q-icon :name="category.icon || 'label'" size="16px" color="white" />
                </div>
                <div class="bb-category-details">
                  <div class="bb-category-name">{{ category.name }}</div>
                  <div class="bb-category-meta">{{ category.transaction_count }} transactions</div>
                </div>
                <div class="bb-category-chip" v-if="category.is_system">System</div>
                <q-btn
                  v-else
                  flat
                  round
                  dense
                  size="sm"
                  icon="delete_outline"
                  class="bb-category-delete"
                  :loading="deletingId === category.id"
                  @click="confirmDeleteCategory(category)"
                >
                  <q-tooltip>Delete category</q-tooltip>
                </q-btn>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-xl-8">
          <div class="bb-panel bb-panel--wide">
            <div class="bb-panel__header">
              <div>
                <div class="bb-panel__title">Unknown transactions</div>
                <div class="bb-panel__sub">Label these transactions so the app can learn your spending patterns.</div>
              </div>
            </div>

            <div v-if="unknownTransactions.length === 0" class="bb-empty-state">
              <q-icon name="inbox" size="48px" style="color:#6C4ED4" />
              <div class="bb-empty-title">No unknown transactions</div>
              <div class="bb-empty-sub">Great job — all transactions have been categorized or reviewed.</div>
            </div>

            <div v-else>
              <div v-if="selectedIds.length" class="bb-bulk-bar">
                <div class="bb-bulk-count">{{ selectedIds.length }} selected</div>
                <q-select
                  dense
                  options-dense
                  emit-value
                  map-options
                  :options="categoryOptions"
                  option-label="label"
                  option-value="value"
                  v-model="bulkCategory"
                  label="Assign to category"
                  outlined
                  class="bb-bulk-select"
                />
                <q-btn
                  unelevated
                  color="primary"
                  :disable="!bulkCategory"
                  :loading="bulkAssigning"
                  :label="`Assign ${selectedIds.length}`"
                  @click="bulkAssign"
                />
                <q-btn flat color="grey-5" label="Clear" @click="clearSelection" />
              </div>

              <div class="bb-tx-header-row row no-wrap">
                <div class="bb-tx-check">
                  <q-checkbox
                    dense
                    :model-value="allSelected"
                    :indeterminate-value="'some'"
                    @update:model-value="toggleAll"
                  />
                </div>
                <div class="col-2">Date</div>
                <div class="col-4">Merchant / Description</div>
                <div class="col-2 bb-tx-amt">Amount</div>
                <div class="col-3 bb-tx-cat-col">Category</div>
                <div class="bb-tx-action-col">Action</div>
              </div>

              <div v-for="tx in unknownTransactions" :key="tx.id" class="bb-tx-row row no-wrap">
                <div class="bb-tx-check">
                  <q-checkbox dense v-model="selectedMap[tx.id]" />
                </div>
                <div class="col-2 bb-tx-date">{{ formatDate(tx.date) }}</div>
                <div class="col-4 bb-tx-merchant">{{ tx.merchant || tx.description }}</div>
                <div class="col-2 bb-tx-amt">{{ fmt(tx.amount) }}</div>
                <div class="col-3 bb-tx-cat-col">
                  <q-select
                    dense
                    hide-dropdown-icon
                    options-dense
                    emit-value
                    map-options
                    :options="categoryOptions"
                    option-label="label"
                    option-value="value"
                    v-model="txCategoryMap[tx.id]"
                    label="Assign"
                    outlined
                    class="bb-assign-select"
                  />
                </div>
                <div class="bb-tx-action-col">
                  <q-btn
                    round
                    dense
                    unelevated
                    color="primary"
                    icon="check"
                    size="sm"
                    :disable="!txCategoryMap[tx.id]"
                    @click="assignCategory(tx.id)"
                  >
                    <q-tooltip>Assign category</q-tooltip>
                  </q-btn>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { api, type Category, type Transaction } from 'src/services/api';

const $q = useQuasar();

const loading = ref(true);
const loadError = ref('');
const creating = ref(false);
const deletingId = ref<number | null>(null);
const bulkAssigning = ref(false);
const categories = ref<Category[]>([]);
const unknownTransactions = ref<Transaction[]>([]);
const txCategoryMap = reactive<Record<number, number | null>>({});
const selectedMap = reactive<Record<number, boolean>>({});
const bulkCategory = ref<number | null>(null);

const selectedIds = computed(() =>
  unknownTransactions.value.filter((tx) => selectedMap[tx.id]).map((tx) => tx.id),
);

const allSelected = computed<boolean | 'some'>(() => {
  if (unknownTransactions.value.length === 0) return false;
  const count = selectedIds.value.length;
  if (count === 0) return false;
  if (count === unknownTransactions.value.length) return true;
  return 'some';
});

const toggleAll = () => {
  const selectAll = allSelected.value !== true;
  unknownTransactions.value.forEach((tx) => {
    selectedMap[tx.id] = selectAll;
  });
};

const clearSelection = () => {
  unknownTransactions.value.forEach((tx) => {
    selectedMap[tx.id] = false;
  });
  bulkCategory.value = null;
};

const newCategory = ref({ name: '', icon: 'label', color: '#6C4ED4' });

const categoryOptions = computed(() => categories.value.map((category) => ({
  label: category.name,
  value: category.id,
})));

const createCategory = async () => {
  if (!newCategory.value.name.trim()) {
    loadError.value = 'Category name is required';
    return;
  }

  creating.value = true;
  loadError.value = '';

  try {
    const category = await api.createCategory(
      newCategory.value.name.trim(),
      newCategory.value.icon.trim() || 'label',
      newCategory.value.color.trim() || '#6C4ED4',
    );
    categories.value.unshift(category);
    newCategory.value.name = '';
    newCategory.value.icon = 'label';
    newCategory.value.color = '#6C4ED4';
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to create category';
  } finally {
    creating.value = false;
  }
};

const loadData = async () => {
  loading.value = true;
  loadError.value = '';

  try {
    const [cats, unknownTxs] = await Promise.all([
      api.getCategories(),
      api.getUnknownTransactions(),
    ]);
    categories.value = cats;
    unknownTransactions.value = unknownTxs;
    Object.keys(txCategoryMap).forEach((key) => delete txCategoryMap[Number(key)]);
    Object.keys(selectedMap).forEach((key) => delete selectedMap[Number(key)]);
    bulkCategory.value = null;
    Object.assign(txCategoryMap, unknownTxs.reduce((map, tx) => {
      map[tx.id] = null;
      return map;
    }, {} as Record<number, number | null>));
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load categories';
  } finally {
    loading.value = false;
  }
};

// Remove just-assigned transactions from the list and bump the category's
// count in place. Avoids calling loadData(), whose loading spinner swaps the
// whole page and resets the scroll position to the top.
const removeAssigned = (ids: number[], categoryId: number) => {
  const idSet = new Set(ids);
  unknownTransactions.value = unknownTransactions.value.filter((tx) => !idSet.has(tx.id));
  ids.forEach((id) => {
    delete txCategoryMap[id];
    delete selectedMap[id];
  });
  const category = categories.value.find((c) => c.id === categoryId);
  if (category) category.transaction_count += ids.length;
};

const assignCategory = async (transactionId: number) => {
  const selected = txCategoryMap[transactionId];
  const categoryId = typeof selected === 'string' ? Number(selected) : selected;
  if (!categoryId || Number.isNaN(categoryId)) return;

  try {
    await api.assignTransactionCategory(transactionId, categoryId);
    removeAssigned([transactionId], categoryId);
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to assign category';
  }
};

const bulkAssign = async () => {
  const categoryId = bulkCategory.value;
  const ids = selectedIds.value;
  if (!categoryId || ids.length === 0) return;

  bulkAssigning.value = true;
  loadError.value = '';

  try {
    const { updated } = await api.bulkCategorize(ids, categoryId);
    $q.notify({ type: 'positive', message: `Assigned ${updated} transaction${updated === 1 ? '' : 's'}` });
    removeAssigned(ids, categoryId);
    bulkCategory.value = null;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to assign categories';
  } finally {
    bulkAssigning.value = false;
  }
};

const confirmDeleteCategory = (category: Category) => {
  const note = category.transaction_count > 0
    ? ` Its ${category.transaction_count} transaction${category.transaction_count === 1 ? '' : 's'} will be moved to Unknown.`
    : '';
  $q.dialog({
    title: 'Delete category',
    message: `Delete "${category.name}"?${note}`,
    cancel: true,
    persistent: true,
    ok: { label: 'Delete', color: 'negative', unelevated: true },
  }).onOk(() => { void deleteCategory(category.id); });
};

const deleteCategory = async (id: number) => {
  deletingId.value = id;
  loadError.value = '';

  try {
    await api.deleteCategory(id);
    $q.notify({ type: 'positive', message: 'Category deleted' });
    await loadData();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to delete category';
  } finally {
    deletingId.value = null;
  }
};

const fmt = (value: number) =>
  '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

onMounted(loadData);
</script>

<style lang="scss">
.bb-categories { background-color: #0A0A1B; min-height: 100vh; }
.bb-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.bb-page-title { font-size: 28px; font-weight: 700; }
.bb-page-sub { color: #8F8FB5; margin-top: 8px; }
.bb-panel { background: #11112A; border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 22px; }
.bb-panel--compact { margin-bottom: 20px; }
.bb-panel--wide { min-height: 520px; }
.bb-panel--list { margin-top: 0; }
.bb-panel__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.bb-panel__title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; }
.bb-panel__sub { color: #8F8FB5; font-size: 12px; margin-top: 6px; }
.bb-form-row { margin-bottom: 14px; }
.bb-category-list { display: grid; gap: 12px; }
.bb-category-item { display: flex; align-items: center; gap: 12px; background: #0E0E26; border-radius: 14px; padding: 14px; }
.bb-category-icon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; }
.bb-category-details { flex: 1; }
.bb-category-name { color: #F8FAFF; font-weight: 700; }
.bb-category-meta { color: #8F8FB5; font-size: 12px; margin-top: 4px; }
.bb-category-chip { font-size: 11px; letter-spacing: 0.08em; color: #8F8FB5; border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 4px 10px; }
.bb-category-delete { color: #8F8FB5; }
.bb-category-delete:hover { color: #FF6B6B; }
.bb-bulk-bar { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2000; display: flex; align-items: center; gap: 12px; background: #161636; border: 1px solid rgba(108,78,212,0.4); border-radius: 14px; padding: 10px 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.45); }
.bb-bulk-count { color: #F8FAFF; font-weight: 700; font-size: 13px; white-space: nowrap; }
.bb-bulk-select { min-width: 220px; }
.bb-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280px; gap: 14px; color: #8F8FB5; }
.bb-empty-title { font-size: 18px; font-weight: 700; }
.bb-tx-header-row, .bb-tx-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
.bb-tx-header-row { border-bottom: 1px solid rgba(255,255,255,0.08); color: #8F8FB5; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.bb-tx-row { border-bottom: 1px solid rgba(255,255,255,0.05); }
.bb-tx-row:last-child { border-bottom: none; }
.bb-tx-date { color: #8F8FB5; font-size: 12px; }
.bb-tx-merchant { color: #F8FAFF; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-tx-amt { color: #ffffff; font-weight: 700; text-align: right; }
.bb-tx-header-row .bb-tx-amt { color: #8F8FB5; font-weight: inherit; }
.bb-tx-check { flex: 0 0 34px; display: flex; align-items: center; }
.bb-tx-cat-col { flex: 1 1 auto; min-width: 0; }
.bb-tx-action-col { flex: 0 0 52px; display: flex; align-items: center; justify-content: center; }
.bb-assign-select { width: 100%; }
.bb-loading { display: flex; align-items: center; gap: 12px; min-height: 220px; color: #C6C6E5; }
</style>
