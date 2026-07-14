<template>
  <q-page class="bb-budgets q-pa-lg">
    <div class="bb-page-header bb-budgets-header">
      <div>
        <div class="bb-page-title">Budgets</div>
        <div class="bb-page-sub">Set monthly spending limits per category and track your progress</div>
      </div>
      <q-btn
        no-caps unelevated icon="auto_awesome" label="Build with AI"
        class="bb-ai-btn"
        @click="openPlanner"
      />
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

      <!-- Where to cut back (suggestions from last month). On phones this is
           pushed BELOW "Your budgets" via flex order — see the media query. -->
      <div v-if="data.suggestions.length" class="bb-bg-panel bb-sugg-panel q-mb-lg">
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
          <q-space />
          <q-btn
            v-if="data.budgets.length"
            flat dense no-caps icon="trending_down" label="Trim all 5%"
            class="bb-trim-btn"
            :loading="trimming"
            @click="trimAll"
          >
            <q-tooltip>Lower every budget by 5% to tighten gradually</q-tooltip>
          </q-btn>
        </div>

        <div v-if="data.budgets.length === 0" class="bb-bg-empty">
          No budgets yet. Add one below, or use a "Where to cut back" suggestion.
        </div>

        <div v-else class="bb-bg-list">
          <div v-for="b in data.budgets" :key="b.categoryId" class="bb-bg-item">
            <div class="bb-bg-row bb-bg-row--click" @click="toggleCategory(b)">
            <div class="bb-category-icon" :style="{ background: b.color || '#6C4ED4' }">
              <q-icon :name="b.icon || 'label'" size="16px" color="white" />
            </div>
            <div class="bb-bg-main">
              <div class="bb-bg-row-top">
                <span class="bb-bg-name">{{ b.name }}</span>
                <span class="bb-bg-amounts">
                  {{ fmt(b.spent) }} / <span class="bb-bg-limit" @click.stop>{{ fmt(b.limit) }}
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
            <q-icon
              name="expand_more" size="20px" class="bb-bg-chevron"
              :class="{ open: expanded.has(b.categoryId) }"
            />
            <q-btn flat round dense size="sm" icon="delete_outline" class="bb-bg-del" @click.stop="removeBudget(b.categoryId)">
              <q-tooltip>Remove budget</q-tooltip>
            </q-btn>
            </div>

            <!-- Expanded: this month's transactions in this category -->
            <div v-if="expanded.has(b.categoryId)" class="bb-bg-tx">
              <div v-if="txLoading.has(b.categoryId)" class="bb-bg-tx-state">
                <q-spinner color="primary" size="18px" /> <span>Loading transactions…</span>
              </div>
              <template v-else>
                <div v-if="(txByCat[b.categoryId]?.length ?? 0) === 0" class="bb-bg-tx-state">
                  No transactions in this category this month.
                </div>
                <div
                  v-for="t in txByCat[b.categoryId]" :key="t.id"
                  class="bb-bg-tx-row"
                >
                  <span class="bb-bg-tx-date">{{ shortDate(t.date) }}</span>
                  <span class="bb-bg-tx-desc">{{ t.merchant || t.description }}</span>
                  <span class="bb-bg-tx-amt" :class="{ 'is-credit': t.type === 'credit' }">
                    {{ t.type === 'credit' ? '+' : '' }}{{ fmt(t.amount) }}
                  </span>
                </div>
              </template>
            </div>
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

    <!-- AI budget planner -->
    <q-dialog v-model="plannerOpen">
      <q-card class="bb-planner-card">
        <div class="bb-planner-hdr">
          <div>
            <div class="bb-planner-title"><q-icon name="auto_awesome" size="18px" style="color:#8B6FEC" /> AI budget plan</div>
            <div class="bb-planner-sub">Built from last month's spending. Adjust the target or edit any amount before applying.</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div class="bb-planner-controls">
          <div class="bb-planner-slider">
            <div class="bb-planner-slider-lbl">Target reduction vs last month: <strong>{{ reductionPercent }}%</strong></div>
            <q-slider v-model="reductionPercent" :min="0" :max="40" :step="5" markers color="purple" />
          </div>
          <q-btn flat dense no-caps icon="refresh" label="Regenerate" :loading="generating" @click="regenerate" />
        </div>

        <div v-if="generating && !plan.length" class="bb-planner-loading">
          <q-spinner color="primary" size="32px" /> <span>Building your plan…</span>
        </div>

        <div v-else-if="!plan.length" class="bb-planner-empty">
          No spending categories found for last month. Upload some statements first.
        </div>

        <template v-else>
          <div class="bb-planner-list">
            <div v-for="p in plan" :key="p.categoryId" class="bb-planner-row">
              <div class="bb-category-icon" :style="{ background: p.color || '#6C4ED4' }">
                <q-icon :name="p.icon || 'label'" size="15px" color="white" />
              </div>
              <div class="bb-planner-info">
                <div class="bb-planner-name">{{ p.name }}</div>
                <div class="bb-planner-note">
                  {{ fmt(p.lastMonthSpent) }} last month<span v-if="p.note"> · {{ p.note }}</span>
                </div>
              </div>
              <q-input v-model.number="p.suggestedLimit" type="number" dense outlined dark prefix="$" class="bb-planner-amt" />
            </div>
          </div>

          <div class="bb-planner-foot">
            <div class="bb-planner-total">
              Plan total: <strong>{{ fmt(planTotal) }}</strong>
              <span class="bb-planner-vs">vs {{ fmt(planLastTotal) }} last month</span>
            </div>
            <div class="bb-planner-actions">
              <q-btn flat no-caps label="Cancel" v-close-popup />
              <q-btn
                no-caps unelevated :label="`Apply ${plan.length} budget${plan.length === 1 ? '' : 's'}`"
                :loading="applying"
                style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px"
                @click="applyPlan"
              />
            </div>
          </div>
        </template>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { api, type BudgetsData, type BudgetSuggestion, type BudgetPlanItem, type Category, type Budget, type Transaction } from 'src/services/api';

const $q = useQuasar();

const loading = ref(true);
const loadError = ref('');
const data = ref<BudgetsData | null>(null);
const categories = ref<Category[]>([]);

// Expandable category rows → this month's transactions (lazy-loaded, cached).
const expanded = ref<Set<number>>(new Set());
const txByCat = ref<Record<number, Transaction[]>>({});
const txLoading = ref<Set<number>>(new Set());
const savingId = ref<number | null>(null);
const adding = ref(false);
const addCategory = ref<number | null>(null);
const addLimit = ref<number | null>(null);

// AI planner state
const plannerOpen = ref(false);
const generating = ref(false);
const applying = ref(false);
const trimming = ref(false);
const reductionPercent = ref(10);
const plan = ref<BudgetPlanItem[]>([]);

const planTotal = computed(() => plan.value.reduce((a, p) => a + (Number(p.suggestedLimit) || 0), 0));
const planLastTotal = computed(() => plan.value.reduce((a, p) => a + p.lastMonthSpent, 0));

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
function shortDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function monthStartStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
}

// Expand/collapse a category and lazy-load this month's transactions for it.
async function toggleCategory(b: Budget) {
  const id = b.categoryId;
  const next = new Set(expanded.value);
  if (next.has(id)) {
    next.delete(id);
    expanded.value = next;
    return;
  }
  next.add(id);
  expanded.value = next;
  if (txByCat.value[id]) return; // cached

  const loading = new Set(txLoading.value);
  loading.add(id);
  txLoading.value = loading;
  try {
    const res = await api.getTransactions({ category: b.name, startDate: monthStartStr(), limit: '200' });
    txByCat.value = { ...txByCat.value, [id]: res.transactions };
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to load transactions' });
    const reset = new Set(expanded.value);
    reset.delete(id);
    expanded.value = reset;
  } finally {
    const done = new Set(txLoading.value);
    done.delete(id);
    txLoading.value = done;
  }
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

// ── AI planner ──────────────────────────────────────────────

function openPlanner() {
  plannerOpen.value = true;
  if (!plan.value.length) void regenerate();
}

async function regenerate() {
  generating.value = true;
  try {
    const res = await api.generateBudgetPlan(reductionPercent.value);
    plan.value = res.plan;
    if (!res.plan.length) {
      $q.notify({ type: 'info', message: 'No spending found for last month to build a budget from.' });
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to generate plan' });
  } finally {
    generating.value = false;
  }
}

async function applyPlan() {
  const items = plan.value
    .map((p) => ({ categoryId: p.categoryId, limit: Number(p.suggestedLimit) }))
    .filter((i) => Number.isFinite(i.limit) && i.limit >= 0);
  if (!items.length) return;
  applying.value = true;
  try {
    await api.setBudgetsBulk(items);
    plannerOpen.value = false;
    await load();
    $q.notify({ type: 'positive', message: `Applied ${items.length} budgets.` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to apply plan' });
  } finally {
    applying.value = false;
  }
}

// Tighten every existing budget by 5% — the "little by little" lever.
async function trimAll() {
  const budgets = data.value?.budgets ?? [];
  if (!budgets.length) return;
  const items = budgets.map((b) => ({
    categoryId: b.categoryId,
    limit: Math.max(5, Math.round(b.limit * 0.95)),
  }));
  trimming.value = true;
  try {
    await api.setBudgetsBulk(items);
    await load();
    $q.notify({ type: 'positive', message: 'Trimmed all budgets by 5%.' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to trim budgets' });
  } finally {
    trimming.value = false;
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

// Expandable category rows
.bb-bg-item {
  border-radius: 10px;
  &:has(.bb-bg-row--click:hover) { background: rgba(255,255,255,0.02); }
}
.bb-bg-row--click { cursor: pointer; }
.bb-bg-chevron {
  color: #6E6E9A; flex-shrink: 0; transition: transform 0.2s ease;
  &.open { transform: rotate(180deg); color: #8B6FEC; }
}
.bb-bg-tx {
  margin: 4px 0 6px 48px; padding: 6px 12px;
  background: #0A0A1B; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
}
.bb-bg-tx-state {
  display: flex; align-items: center; gap: 10px;
  color: #6E6E9A; font-size: 12px; padding: 10px 2px;
}
.bb-bg-tx-row {
  display: flex; align-items: center; gap: 12px; padding: 7px 2px;
  font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.04);
  &:last-child { border-bottom: none; }
}
.bb-bg-tx-date { color: #6E6E9A; font-size: 11px; width: 52px; flex-shrink: 0; }
.bb-bg-tx-desc { color: #D7D7EC; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-bg-tx-amt { color: #F8FAFF; font-weight: 600; white-space: nowrap; &.is-credit { color: #22C55E; } }

.bb-bg-add {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-top: 20px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.06);
}
.bb-bg-add-cat { min-width: 200px; flex: 1; }
.bb-bg-add-amt { width: 150px; }

// Header + actions
.bb-budgets-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.bb-ai-btn {
  background: linear-gradient(135deg, #6C4ED4, #E040FB); color: #fff; border-radius: 10px;
  padding: 8px 16px; font-weight: 600; flex-shrink: 0;
}
.bb-trim-btn { color: #F59E0B; }

// Planner dialog
.bb-planner-card {
  background: #0F1030; color: #E6E6F5; width: 560px; max-width: 92vw;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px;
}
.bb-planner-hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.bb-planner-title { font-size: 18px; font-weight: 700; color: #F8FAFF; display: flex; align-items: center; gap: 8px; }
.bb-planner-sub { color: #8F8FB5; font-size: 13px; margin-top: 4px; max-width: 420px; }

.bb-planner-controls {
  display: flex; align-items: center; gap: 16px; padding: 14px 16px; margin-bottom: 16px;
  background: #0A0A1B; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
}
.bb-planner-slider { flex: 1; }
.bb-planner-slider-lbl { font-size: 12px; color: #C6C6E5; margin-bottom: 4px; }
.bb-planner-slider-lbl strong { color: #8B6FEC; }

.bb-planner-loading, .bb-planner-empty {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  min-height: 160px; color: #8F8FB5; text-align: center; font-size: 14px;
}

.bb-planner-list { display: flex; flex-direction: column; gap: 10px; max-height: 46vh; overflow-y: auto; padding-right: 4px; }
.bb-planner-row { display: flex; align-items: center; gap: 12px; }
.bb-planner-info { flex: 1; min-width: 0; }
.bb-planner-name { font-size: 14px; font-weight: 600; color: #F8FAFF; }
.bb-planner-note { font-size: 12px; color: #6E6E9A; margin-top: 2px; }
.bb-planner-amt { width: 120px; flex-shrink: 0; }

.bb-planner-foot {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);
}
.bb-planner-total { font-size: 14px; color: #C6C6E5; }
.bb-planner-total strong { color: #F8FAFF; font-size: 16px; }
.bb-planner-vs { color: #6E6E9A; font-size: 12px; margin-left: 8px; }
.bb-planner-actions { display: flex; align-items: center; gap: 8px; }

// Phones: show "Your budgets" first and push "Where to cut back" underneath.
// Desktop keeps the suggestions on top (normal document order).
@media (max-width: 599px) {
  .bb-budgets { display: flex; flex-direction: column; }
  .bb-sugg-panel { order: 2; }
}
</style>
