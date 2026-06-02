<template>
  <q-page class="bb-budgets q-pa-lg">
    <div class="bb-page-header">
      <div class="bb-page-title">Budgets</div>
      <div class="bb-page-sub">Set monthly spending limits per category and track your progress</div>
    </div>

    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="40px" /> <span>Loading budgets…</span>
    </div>

    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else-if="data">
      <!-- Summary -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-6 col-md-4">
          <div class="bb-stat bb-stat--gradient">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:rgba(255,255,255,0.6)"></span>TOTAL BUDGETED</div>
            <div class="bb-stat-val">{{ fmt(data.summary.totalLimit) }}</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">{{ data.budgets.length }} categor{{ data.budgets.length === 1 ? 'y' : 'ies' }}</span></div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="bb-stat">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:#6C4ED4"></span>SPENT THIS MONTH</div>
            <div class="bb-stat-val">{{ fmt(data.summary.totalSpent) }}</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">of budgeted categories</span></div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="bb-stat">
            <div class="bb-stat-lbl"><span class="bb-dot" :style="`background:${remaining >= 0 ? '#22C55E' : '#EF4444'}`"></span>REMAINING</div>
            <div class="bb-stat-val" :style="remaining < 0 ? 'color:#EF4444' : ''">{{ fmt(remaining) }}</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">{{ remaining >= 0 ? 'left to spend' : 'over budget' }}</span></div>
          </div>
        </div>
      </div>

      <!-- Where to cut back (suggestions from last month) -->
      <div v-if="data.suggestions.length" class="bb-bg-panel q-mb-lg">
        <div class="bb-bg-panel-hdr">
          <q-icon name="trending_down" size="18px" style="color:#F59E0B" />
          <span>Where to cut back</span>
          <span class="bb-bg-panel-sub">Your biggest categories last month — set a target ~10% lower to do better this month.</span>
        </div>
        <div class="bb-sugg-grid">
          <div v-for="s in data.suggestions" :key="s.categoryId" class="bb-sugg-card">
            <div class="bb-sugg-top">
              <div class="bb-category-icon" :style="{ background: s.color || '#6C4ED4' }">
                <q-icon :name="s.icon || 'label'" size="15px" color="white" />
              </div>
              <span class="bb-sugg-name">{{ s.name }}</span>
            </div>
            <div class="bb-sugg-last">{{ fmt(s.lastMonthSpent) }} last month</div>
            <q-btn
              no-caps unelevated dense size="sm"
              :label="`Set ${fmt(s.suggestedLimit)} budget`"
              :loading="savingId === s.categoryId"
              style="background:rgba(245,158,11,0.15);color:#F59E0B;border-radius:8px"
              @click="applySuggestion(s)"
            />
          </div>
        </div>
      </div>

      <!-- Your budgets -->
      <div class="bb-bg-panel q-mb-lg">
        <div class="bb-bg-panel-hdr">
          <q-icon name="savings" size="18px" style="color:#8B6FEC" />
          <span>Your budgets</span>
        </div>

        <div v-if="data.budgets.length === 0" class="bb-bg-empty">
          No budgets yet. Add one below, or use a suggestion above.
        </div>

        <div v-else class="bb-bg-list">
          <div v-for="b in data.budgets" :key="b.categoryId" class="bb-bg-row">
            <div class="bb-category-icon" :style="{ background: b.color || '#6C4ED4' }">
              <q-icon :name="b.icon || 'label'" size="16px" color="white" />
            </div>
            <div class="bb-bg-main">
              <div class="bb-bg-row-top">
                <span class="bb-bg-name">{{ b.name }}</span>
                <span class="bb-bg-amounts">
                  {{ fmt(b.spent) }} / <span class="bb-bg-limit">{{ fmt(b.limit) }}
                    <q-popup-edit :model-value="b.limit" v-slot="scope" buttons
                      label-set="Save" label-cancel="Cancel"
                      @save="(val:number) => saveBudget(b.categoryId, Number(val))">
                      <q-input type="number" v-model.number="scope.value" dense autofocus prefix="$" dark outlined />
                    </q-popup-edit>
                  </span>
                </span>
              </div>
              <div class="bb-bg-bar-wrap">
                <div class="bb-bg-bar" :style="{ width: Math.min(pctOf(b.spent, b.limit), 100) + '%', background: barColor(b.spent, b.limit) }" />
              </div>
              <div class="bb-bg-row-bot">
                <span :style="`color:${barColor(b.spent, b.limit)}`">{{ pctOf(b.spent, b.limit).toFixed(0) }}% used</span>
                <span class="bb-bg-last">last month: {{ fmt(b.lastMonthSpent) }}</span>
              </div>
            </div>
            <q-btn flat round dense size="sm" icon="delete_outline" class="bb-bg-del" @click="removeBudget(b.categoryId)">
              <q-tooltip>Remove budget</q-tooltip>
            </q-btn>
          </div>
        </div>

        <!-- Add a budget -->
        <div class="bb-bg-add">
          <q-select
            v-model="addCategory"
            :options="availableCategoryOptions"
            option-label="label" option-value="value"
            emit-value map-options dense outlined dark options-dense
            label="Category"
            class="bb-bg-add-cat"
          />
          <q-input v-model.number="addLimit" type="number" dense outlined dark prefix="$" label="Monthly limit" class="bb-bg-add-amt" />
          <q-btn no-caps unelevated label="Add budget" :loading="adding" :disable="!addCategory || !addLimit"
            style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px"
            @click="addBudget" />
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { api, type BudgetsData, type BudgetSuggestion, type Category } from 'src/services/api';

const $q = useQuasar();

const loading = ref(true);
const loadError = ref('');
const data = ref<BudgetsData | null>(null);
const categories = ref<Category[]>([]);
const savingId = ref<number | null>(null);
const adding = ref(false);
const addCategory = ref<number | null>(null);
const addLimit = ref<number | null>(null);

const remaining = computed(() => (data.value?.summary.totalLimit ?? 0) - (data.value?.summary.totalSpent ?? 0));

// Categories that don't already have a budget.
const availableCategoryOptions = computed(() => {
  const budgeted = new Set((data.value?.budgets ?? []).map((b) => b.categoryId));
  return categories.value
    .filter((c) => !budgeted.has(c.id))
    .map((c) => ({ label: c.name, value: c.id }));
});

function fmt(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pctOf(spent: number, limit: number) {
  return limit > 0 ? (spent / limit) * 100 : 0;
}
function barColor(spent: number, limit: number) {
  const p = pctOf(spent, limit);
  return p >= 100 ? '#EF4444' : p >= 80 ? '#F59E0B' : '#22C55E';
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [b, cats] = await Promise.all([api.getBudgets(), api.getCategories()]);
    data.value = b;
    categories.value = cats;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load budgets';
  } finally {
    loading.value = false;
  }
}

async function saveBudget(categoryId: number, limit: number) {
  if (!Number.isFinite(limit) || limit < 0) return;
  savingId.value = categoryId;
  try {
    await api.setBudget(categoryId, limit);
    await load();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to save budget' });
  } finally {
    savingId.value = null;
  }
}

async function applySuggestion(s: BudgetSuggestion) {
  await saveBudget(s.categoryId, s.suggestedLimit);
}

async function addBudget() {
  if (!addCategory.value || !addLimit.value) return;
  adding.value = true;
  try {
    await api.setBudget(addCategory.value, addLimit.value);
    addCategory.value = null;
    addLimit.value = null;
    await load();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to add budget' });
  } finally {
    adding.value = false;
  }
}

async function removeBudget(categoryId: number) {
  try {
    await api.deleteBudget(categoryId);
    await load();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to remove budget' });
  }
}

onMounted(load);
</script>

<style lang="scss">
.bb-budgets { background-color: #0A0A1B; min-height: 100vh; }

.bb-bg-panel {
  background: #0F1030; border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px; padding: 20px;
}
.bb-bg-panel-hdr {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;
  font-size: 14px; font-weight: 600; color: #ffffff;
}
.bb-bg-panel-sub { font-size: 12px; font-weight: 400; color: #6E6E9A; flex-basis: 100%; }
.bb-bg-empty { color: #6E6E9A; font-size: 13px; padding: 8px 0 16px; }

.bb-category-icon { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }

// Suggestions
.bb-sugg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.bb-sugg-card {
  background: #0A0A1B; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.bb-sugg-top { display: flex; align-items: center; gap: 10px; }
.bb-sugg-name { font-size: 13px; font-weight: 600; color: #F8FAFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-sugg-last { font-size: 12px; color: #6E6E9A; }

// Budget rows
.bb-bg-list { display: flex; flex-direction: column; gap: 14px; }
.bb-bg-row { display: flex; align-items: center; gap: 14px; }
.bb-bg-main { flex: 1; min-width: 0; }
.bb-bg-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; }
.bb-bg-name { font-size: 14px; font-weight: 600; color: #F8FAFF; }
.bb-bg-amounts { font-size: 13px; color: #9090B8; white-space: nowrap; }
.bb-bg-limit { color: #F8FAFF; font-weight: 600; cursor: pointer; border-bottom: 1px dashed rgba(255,255,255,0.25); }
.bb-bg-bar-wrap { height: 7px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.bb-bg-bar { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.bb-bg-row-bot { display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px; font-weight: 600; }
.bb-bg-last { color: #6E6E9A; font-weight: 400; }
.bb-bg-del { color: #6E6E9A; flex-shrink: 0; &:hover { color: #EF4444; } }

.bb-bg-add {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-top: 20px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.06);
}
.bb-bg-add-cat { min-width: 200px; flex: 1; }
.bb-bg-add-amt { width: 150px; }
</style>
