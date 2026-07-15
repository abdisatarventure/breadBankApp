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
            <div class="bb-form-row row q-col-gutter-md">
              <!-- Icon picker -->
              <div class="col-6">
                <div class="bb-field-label">Icon</div>
                <div class="bb-picker-btn">
                  <q-icon :name="newCategory.icon || 'label'" size="18px" />
                  <span class="bb-picker-val">{{ newCategory.icon }}</span>
                  <q-icon name="expand_more" size="16px" class="bb-picker-caret" />
                  <q-menu anchor="bottom left" self="top left" class="bb-picker-menu">
                    <div class="bb-icon-grid">
                      <button
                        v-for="ic in ICON_OPTIONS"
                        :key="ic"
                        type="button"
                        v-close-popup
                        class="bb-icon-cell"
                        :class="{ active: newCategory.icon === ic }"
                        @click="newCategory.icon = ic"
                      >
                        <q-icon :name="ic" size="18px" />
                      </button>
                    </div>
                  </q-menu>
                </div>
              </div>

              <!-- Color picker -->
              <div class="col-6">
                <div class="bb-field-label">Color</div>
                <div class="bb-picker-btn">
                  <span class="bb-swatch" :style="{ background: newCategory.color }" />
                  <span class="bb-picker-val">{{ newCategory.color }}</span>
                  <q-icon name="expand_more" size="16px" class="bb-picker-caret" />
                  <q-menu anchor="bottom left" self="top left" class="bb-picker-menu">
                    <div class="bb-color-grid">
                      <button
                        v-for="col in COLOR_OPTIONS"
                        :key="col"
                        type="button"
                        v-close-popup
                        class="bb-color-cell"
                        :class="{ active: newCategory.color === col }"
                        :style="{ background: col }"
                        @click="newCategory.color = col"
                      />
                    </div>
                    <label class="bb-color-custom">
                      <span>Custom</span>
                      <input type="color" v-model="newCategory.color" class="bb-color-input" />
                    </label>
                  </q-menu>
                </div>
              </div>
            </div>

            <!-- Live preview -->
            <div class="bb-form-row bb-preview-row">
              <div class="bb-category-icon" :style="{ background: newCategory.color || '#6C4ED4' }">
                <q-icon :name="newCategory.icon || 'label'" size="16px" color="white" />
              </div>
              <span class="bb-preview-name">{{ newCategory.name || 'New category' }}</span>
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
              <div
                v-for="category in categories"
                :key="category.id"
                class="bb-category-item bb-category-item--clickable"
                @click="openCategory(category)"
              >
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
                  @click.stop="confirmDeleteCategory(category)"
                >
                  <q-tooltip>Delete category</q-tooltip>
                </q-btn>
                <q-icon name="chevron_right" size="18px" class="bb-category-arrow" />
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
              <q-icon name="inbox" size="48px" style="color: var(--bb-accent)" />
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
                <div class="col-2 bb-tx-amt" :class="tx.type === 'credit' ? 'bb-amt-in' : 'bb-amt-out'">
                  {{ tx.type === 'credit' ? '+' : '−' }}{{ fmt(tx.amount) }}
                  <span class="bb-amt-tag">{{ tx.type === 'credit' ? 'in' : 'out' }}</span>
                </div>
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

    <!-- Drill into a category to review / re-assign its transactions -->
    <q-dialog v-model="categoryDialogOpen">
      <div class="bb-cat-dialog">
        <div class="bb-cat-dialog-hdr">
          <div class="bb-category-icon" :style="{ background: activeCategory?.color || '#6C4ED4' }" style="cursor:pointer">
            <q-icon :name="activeCategory?.icon || 'label'" size="16px" color="white" />
            <q-menu anchor="bottom left" self="top left" class="bb-picker-menu">
              <div class="bb-color-grid">
                <button
                  v-for="col in COLOR_OPTIONS" :key="col" type="button" v-close-popup
                  class="bb-color-cell" :style="{ background: col }"
                  @click="recolorCategory(col)"
                />
              </div>
            </q-menu>
            <q-tooltip>Change this category's color</q-tooltip>
          </div>
          <div class="bb-cat-dialog-titles">
            <div class="bb-cat-dialog-title">{{ activeCategory?.name }}</div>
            <div class="bb-cat-dialog-sub">Move any that landed in the wrong place — the app will remember.</div>
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup style="color: var(--bb-text-soft)" />
        </div>

        <q-checkbox
          v-model="applyToAll"
          dense
          size="sm"
          class="bb-cat-applyall"
          label="Also move every existing transaction from the same merchant"
        />

        <div v-if="categoryTxLoading" class="bb-cat-loading">
          <q-spinner color="primary" size="28px" /> <span>Loading transactions…</span>
        </div>
        <div v-else-if="categoryTxs.length === 0" class="bb-cat-empty">
          <q-icon name="inbox" size="36px" style="color: var(--bb-accent);opacity:0.5" />
          <span>No transactions in this category.</span>
        </div>
        <div v-else class="bb-cat-tx-list">
          <div v-for="tx in categoryTxs" :key="tx.id" class="bb-cat-tx-row">
            <div class="bb-cat-tx-main">
              <div class="bb-cat-tx-merchant">{{ tx.merchant || tx.description }}</div>
              <div class="bb-cat-tx-meta">{{ formatDate(tx.date) }} · {{ tx.account_name }}</div>
            </div>
            <div class="bb-cat-tx-amt" :class="tx.type === 'credit' ? 'bb-amt-in' : 'bb-amt-out'">{{ tx.type === 'credit' ? '+' : '−' }}{{ fmt(tx.amount) }}</div>
            <q-select
              dense options-dense outlined emit-value map-options
              :options="categoryOptions"
              option-label="label"
              option-value="value"
              :model-value="activeCategory?.id ?? null"
              :loading="reassigningId === tx.id"
              class="bb-cat-tx-select"
              @update:model-value="(val: number) => reassignTx(tx, val)"
            />
          </div>
        </div>

        <div class="bb-cat-dialog-note">
          <q-icon name="lightbulb" size="14px" />
          Changing a category here teaches the app, so future transactions from that merchant are sorted here automatically.
        </div>
      </div>
    </q-dialog>
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

// Curated Material icons + a colour palette for the create-category pickers.
const ICON_OPTIONS = [
  'label', 'restaurant', 'local_grocery_store', 'home', 'directions_car',
  'movie', 'subscriptions', 'shopping_bag', 'medical_services', 'flight',
  'savings', 'fitness_center', 'school', 'pets', 'sports_esports',
  'local_cafe', 'local_gas_station', 'phone_iphone', 'bolt', 'wifi',
  'card_giftcard', 'receipt_long', 'account_balance', 'credit_card', 'pedal_bike',
];
const COLOR_OPTIONS = [
  '#6C4ED4', '#E040FB', '#3B82F6', '#22C55E', '#14B8A6',
  '#F59E0B', '#EF4444', '#EC4899', '#A855F7', '#0EA5E9',
  '#84CC16', '#F97316', '#06B6D4', '#8B5CF6', '#10B981',
];

const categoryOptions = computed(() => categories.value.map((category) => ({
  label: category.name,
  value: category.id,
})));

// ── Drill into a category to review / re-assign transactions ──────
const categoryDialogOpen = ref(false);
const activeCategory = ref<Category | null>(null);

// Change the open category's color (persists for the account; system
// categories are shared, so the new color shows for every user).
async function recolorCategory(color: string) {
  if (!activeCategory.value) return;
  try {
    await api.updateCategory(activeCategory.value.id, { color });
    activeCategory.value = { ...activeCategory.value, color };
    await loadData();
  } catch (e) {
    console.error(e);
  }
}
const categoryTxs = ref<Transaction[]>([]);
const categoryTxLoading = ref(false);
const reassigningId = ref<number | null>(null);
const applyToAll = ref(false);

const openCategory = async (category: Category) => {
  activeCategory.value = category;
  categoryTxs.value = [];
  categoryDialogOpen.value = true;
  categoryTxLoading.value = true;
  try {
    const res = await api.getTransactions({ category: category.name, limit: '250' });
    categoryTxs.value = res.transactions;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : 'Failed to load transactions' });
  } finally {
    categoryTxLoading.value = false;
  }
};

const reassignTx = async (tx: Transaction, newCategoryId: number) => {
  if (!newCategoryId || newCategoryId === activeCategory.value?.id) return;
  // Passing the merchant is what makes the backend learn a merchant→category
  // rule, so future imports of this merchant are categorized automatically.
  const merchant = tx.merchant ?? tx.description;
  reassigningId.value = tx.id;
  try {
    if (applyToAll.value && merchant) {
      // Retroactively move every transaction from this merchant, then refresh
      // category counts (other categories may have contributed too).
      const { updated } = await api.reclassifyMerchant(merchant, newCategoryId);
      categoryTxs.value = categoryTxs.value.filter((t) => (t.merchant ?? t.description) !== merchant);
      categories.value = await api.getCategories();
      activeCategory.value = categories.value.find((c) => c.id === activeCategory.value?.id) ?? activeCategory.value;
      const target = categories.value.find((c) => c.id === newCategoryId);
      $q.notify({ type: 'positive', message: `Moved ${updated} transaction${updated === 1 ? '' : 's'} from "${merchant}" to ${target?.name ?? 'category'}. The app will remember.` });
    } else {
      await api.updateTransaction(tx.id, { categoryId: newCategoryId, merchant });
      categoryTxs.value = categoryTxs.value.filter((t) => t.id !== tx.id);
      if (activeCategory.value) {
        const cur = categories.value.find((c) => c.id === activeCategory.value!.id);
        if (cur) cur.transaction_count = Math.max(0, cur.transaction_count - 1);
      }
      const target = categories.value.find((c) => c.id === newCategoryId);
      if (target) target.transaction_count += 1;
      $q.notify({ type: 'positive', message: `Moved to ${target?.name ?? 'category'} — the app will remember this.` });
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof Error ? err.message : 'Failed to move transaction' });
  } finally {
    reassigningId.value = null;
  }
};

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

  const tx = unknownTransactions.value.find((t) => t.id === transactionId);
  try {
    // Pass the merchant so the backend learns a rule and future imports of this
    // merchant are auto-categorized.
    await api.updateTransaction(transactionId, { categoryId, merchant: tx?.merchant ?? tx?.description ?? '' });
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

const formatDate = (value: string) => {
  // Use the calendar date (YYYY-MM-DD) directly so a timezone offset can't roll
  // it back a day.
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

onMounted(loadData);
</script>

<style lang="scss">
.bb-categories { background-color: var(--bb-bg); min-height: 100vh; }
.bb-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.bb-page-title { font-size: 28px; font-weight: 700; }
.bb-page-sub { color: var(--bb-text-soft); margin-top: 8px; }
.bb-panel { background: var(--bb-surface-2); border: 1px solid var(--bb-border); border-radius: 18px; padding: 22px; }
.bb-panel--compact { margin-bottom: 20px; }
.bb-panel--wide { min-height: 520px; }
.bb-panel--list { margin-top: 0; }
.bb-panel__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.bb-panel__title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; }
.bb-panel__sub { color: var(--bb-text-soft); font-size: 12px; margin-top: 6px; }
.bb-form-row { margin-bottom: 14px; }

// ── Icon / colour pickers ──────────────────────────────────
.bb-field-label { font-size: 11px; color: var(--bb-text-soft); margin-bottom: 6px; }
.bb-picker-btn {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  height: 42px; padding: 0 12px;
  background: #17162F; border: 1px solid var(--bb-border); border-radius: 10px;
  transition: border-color 0.2s ease, background 0.2s ease;
  &:hover { border-color: rgba(var(--bb-accent-rgb), 0.55); background: #1b1936; }
}
.bb-picker-val { flex: 1; min-width: 0; font-size: 13px; color: var(--bb-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-picker-caret { color: var(--bb-text-dim); flex-shrink: 0; }
.bb-swatch { width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; border: 1px solid var(--bb-border); }

.bb-picker-menu {
  background: #14132E !important; border: 1px solid var(--bb-border);
  border-radius: 12px; padding: 12px;
}
.bb-icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.bb-icon-cell {
  width: 40px; height: 40px; display: grid; place-items: center; cursor: pointer;
  background: rgba(255, 255, 255, 0.04); border: 1px solid transparent;
  border-radius: 9px; color: var(--bb-text-soft); transition: all 0.12s ease;
  &:hover { background: rgba(var(--bb-accent-rgb), 0.2); color: var(--bb-text); }
  &.active { background: rgba(var(--bb-accent-rgb), 0.32); border-color: var(--bb-accent-light); color: var(--bb-text); }
}
.bb-color-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.bb-color-cell {
  width: 32px; height: 32px; border-radius: 8px; cursor: pointer; padding: 0;
  border: 2px solid transparent; transition: transform 0.1s ease;
  &:hover { transform: scale(1.12); }
  &.active { border-color: var(--bb-text); box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25); }
}
.bb-color-custom {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--bb-border);
  font-size: 12px; color: var(--bb-text-soft); cursor: pointer;
}
.bb-color-input { width: 40px; height: 26px; border: none; background: none; cursor: pointer; padding: 0; }

.bb-preview-row { display: flex; align-items: center; gap: 10px; }
.bb-preview-name { color: var(--bb-text); font-weight: 600; font-size: 13px; }
.bb-category-list { display: grid; gap: 12px; }
.bb-category-item { display: flex; align-items: center; gap: 12px; background: #0E0E26; border-radius: 14px; padding: 14px; }
.bb-category-item--clickable { cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; border: 1px solid transparent; }
.bb-category-item--clickable:hover { background: #13132f; border-color: rgba(var(--bb-accent-rgb),0.35); }
.bb-category-arrow { color: var(--bb-text-muted); flex-shrink: 0; }
.bb-category-item--clickable:hover .bb-category-arrow { color: var(--bb-accent-light); }

// ── Category drill-in dialog ───────────────────────────────
.bb-cat-dialog {
  background: var(--bb-surface); border: 1px solid var(--bb-border);
  border-radius: 16px; padding: 22px; width: 92vw; max-width: 620px;
}
.bb-cat-dialog-hdr { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.bb-cat-dialog-titles { min-width: 0; }
.bb-cat-dialog-title { font-size: 16px; font-weight: 700; color: var(--bb-text); }
.bb-cat-dialog-sub { font-size: 12px; color: var(--bb-text-soft); margin-top: 2px; }
.bb-cat-loading { display: flex; align-items: center; gap: 10px; color: var(--bb-text-soft); min-height: 120px; justify-content: center; }
.bb-cat-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--bb-text-soft); min-height: 140px; justify-content: center; }
.bb-cat-applyall { color: var(--bb-text-soft); margin-bottom: 12px; font-size: 12px; }
.bb-cat-tx-list { max-height: 52vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.bb-cat-tx-row {
  display: flex; align-items: center; gap: 12px;
  background: var(--bb-bg); border: 1px solid var(--bb-border);
  border-radius: 10px; padding: 10px 12px;
}
.bb-cat-tx-main { flex: 1; min-width: 0; }
.bb-cat-tx-merchant { color: var(--bb-text); font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-cat-tx-meta { color: var(--bb-text-dim); font-size: 11px; margin-top: 2px; }
.bb-cat-tx-amt { color: var(--bb-text); font-weight: 700; font-size: 13px; white-space: nowrap; }
.bb-cat-tx-amt.bb-amt-credit { color: #22C55E; }
.bb-cat-tx-select { width: 150px; flex-shrink: 0; }
.bb-cat-dialog-note {
  display: flex; align-items: flex-start; gap: 6px; margin-top: 16px;
  font-size: 11px; color: var(--bb-accent-light); line-height: 1.5;
}
.bb-category-icon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; }
.bb-category-details { flex: 1; }
.bb-category-name { color: var(--bb-text); font-weight: 700; }
.bb-category-meta { color: var(--bb-text-soft); font-size: 12px; margin-top: 4px; }
.bb-category-chip { font-size: 11px; letter-spacing: 0.08em; color: var(--bb-text-soft); border: 1px solid var(--bb-border); border-radius: 999px; padding: 4px 10px; }
.bb-category-delete { color: var(--bb-text-soft); }
.bb-category-delete:hover { color: #FF6B6B; }
.bb-bulk-bar { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2000; display: flex; align-items: center; gap: 12px; background: #161636; border: 1px solid rgba(var(--bb-accent-rgb),0.4); border-radius: 14px; padding: 10px 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.45); }
.bb-bulk-count { color: var(--bb-text); font-weight: 700; font-size: 13px; white-space: nowrap; }
.bb-bulk-select { min-width: 220px; }
.bb-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280px; gap: 14px; color: var(--bb-text-soft); }
.bb-empty-title { font-size: 18px; font-weight: 700; }
.bb-tx-header-row, .bb-tx-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
.bb-tx-header-row { border-bottom: 1px solid var(--bb-border); color: var(--bb-text-soft); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.bb-tx-row { border-bottom: 1px solid var(--bb-border); }
.bb-tx-row:last-child { border-bottom: none; }
.bb-tx-date { color: var(--bb-text-soft); font-size: 12px; }
.bb-tx-merchant { color: var(--bb-text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-tx-amt { color: var(--bb-text); font-weight: 700; text-align: right; }
.bb-tx-header-row .bb-tx-amt { color: var(--bb-text-soft); font-weight: inherit; }
/* Unknown transactions: money in = green, money out = red, with an in/out tag. */
.bb-amt-in  { color: #22C55E !important; }
.bb-amt-out { color: #EF4444 !important; }
.bb-amt-tag { font-size: 10px; font-weight: 600; opacity: 0.7; margin-left: 3px; text-transform: uppercase; }
.bb-tx-check { flex: 0 0 34px; display: flex; align-items: center; }
.bb-tx-cat-col { flex: 1 1 auto; min-width: 0; }
.bb-tx-action-col { flex: 0 0 52px; display: flex; align-items: center; justify-content: center; }
.bb-assign-select { width: 100%; }
.bb-loading { display: flex; align-items: center; gap: 12px; min-height: 220px; color: var(--bb-text-soft); }
</style>
