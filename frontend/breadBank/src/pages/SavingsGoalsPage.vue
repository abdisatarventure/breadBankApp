<template>
  <q-page class="bb-goals q-pa-lg">
    <div class="bb-page-header bb-budgets-header">
      <div>
        <div class="bb-page-title">Savings Goals</div>
        <div class="bb-page-sub">Put this month's leftover into buckets for the things you're saving up to buy</div>
      </div>
      <q-btn
        no-caps unelevated icon="auto_awesome" label="Suggest split with AI"
        class="bb-ai-btn"
        :disable="!data || data.goals.length === 0"
        @click="openPlanner"
      />
    </div>

    <div v-if="loading" class="bb-loading">
      <q-spinner color="primary" size="40px" /> <span>Loading goals…</span>
    </div>

    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else-if="data">
      <!-- Summary -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-6 col-md-4">
          <div class="bb-stat bb-stat--gradient">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:rgba(255,255,255,0.6)"></span>TOTAL SAVED SO FAR</div>
            <div class="bb-stat-val">{{ fmt(data.summary.totalSaved) }}</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">of {{ fmt(data.summary.totalTarget) }} targeted</span></div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="bb-stat">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:#6C4ED4"></span>OVERALL PROGRESS</div>
            <div class="bb-stat-val">{{ overallPct.toFixed(0) }}%</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">{{ data.goals.length }} goal{{ data.goals.length === 1 ? '' : 's' }}</span></div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="bb-stat">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:#22C55E"></span>AVAILABLE FOR GOALS</div>
            <div class="bb-stat-val">{{ fmt(data.available) }}</div>
            <div class="bb-stat-row">
              <span class="bb-stat-cmp">{{ (100 - data.reservePct * 100).toFixed(0) }}% of {{ fmt(data.netSavings) }} net savings — rest auto-reserved</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Mandatory savings reserve (pay yourself first) -->
      <div class="bb-bg-panel bb-reserve q-mb-lg">
        <div class="bb-bg-panel-hdr">
          <q-icon name="lock" size="18px" style="color:#22C55E" />
          <span>Savings reserve — {{ (data.reservePct * 100).toFixed(0) }}% first</span>
          <span class="bb-bg-panel-sub">
            {{ (data.reservePct * 100).toFixed(0) }}% of each month's leftover is set aside here before any goal can be funded.
          </span>
          <q-space />
          <q-btn
            v-if="data.reserve.remainingThisMonth > 0"
            no-caps unelevated dense
            :label="`Set aside ${fmt(data.reserve.remainingThisMonth)}`"
            :loading="funding"
            style="background:rgba(34,197,94,0.15);color:#22C55E;border-radius:8px"
            @click="fundReserve"
          />
          <q-badge v-else color="green" class="bb-goal-done">Reserved ✓</q-badge>
        </div>
        <div class="bb-bg-row">
          <div class="bb-category-icon" style="background:#22C55E">
            <q-icon name="savings" size="16px" color="white" />
          </div>
          <div class="bb-bg-main">
            <div class="bb-bg-row-top">
              <span class="bb-bg-name">Savings</span>
              <span class="bb-bg-amounts">
                {{ fmt(data.reserve.savedThisMonth) }} / <span class="bb-bg-limit">{{ fmt(data.reserve.targetThisMonth) }}</span> this month
              </span>
            </div>
            <div class="bb-bg-bar-wrap">
              <div class="bb-bg-bar" :style="{ width: Math.min(data.reserve.pct, 100) + '%', background: '#22C55E' }" />
            </div>
            <div class="bb-bg-row-bot">
              <span style="color:#22C55E">{{ data.reserve.pct.toFixed(0) }}% of this month's reserve</span>
              <span class="bb-bg-last">{{ fmt(data.reserve.savedLifetime) }} saved all-time</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Goals -->
      <div class="bb-bg-panel q-mb-lg">
        <div class="bb-bg-panel-hdr">
          <q-icon name="flag" size="18px" style="color:#8B6FEC" />
          <span>Your goals</span>
          <q-space />
          <q-btn flat dense no-caps icon="add" label="New goal" class="bb-trim-btn" style="color:#8B6FEC" @click="openCreate" />
        </div>

        <div v-if="data.goals.length === 0" class="bb-bg-empty">
          No goals yet. Add one to start saving toward something.
        </div>

        <div v-else class="bb-bg-list">
          <div v-for="g in data.goals" :key="g.id" class="bb-bg-row">
            <div class="bb-category-icon" :style="{ background: g.color || '#6C4ED4' }">
              <q-icon :name="g.icon || 'flag'" size="16px" color="white" />
            </div>
            <div class="bb-bg-main">
              <div class="bb-bg-row-top">
                <span class="bb-bg-name">
                  {{ g.name }}
                  <q-badge v-if="g.remaining <= 0" color="green" class="bb-goal-done">Reached 🎉</q-badge>
                </span>
                <span class="bb-bg-amounts">
                  {{ fmt(g.saved) }} / <span class="bb-bg-limit">{{ fmt(g.target) }}</span>
                </span>
              </div>
              <div class="bb-bg-bar-wrap">
                <div class="bb-bg-bar" :style="{ width: Math.min(g.pct, 100) + '%', background: barColor(g.pct) }" />
              </div>
              <div class="bb-bg-row-bot">
                <span :style="`color:${barColor(g.pct)}`">{{ g.pct.toFixed(0) }}% saved</span>
                <span class="bb-bg-last">
                  <template v-if="g.remaining > 0">{{ fmt(g.remaining) }} to go</template>
                  <template v-else>fully funded</template>
                  <template v-if="g.targetDate"> · by {{ fmtDate(g.targetDate) }}{{ paceText(g) }}</template>
                </span>
              </div>
            </div>
            <q-btn
              flat round dense size="sm" icon="add" class="bb-bg-add-btn"
              :disable="data.available <= 0 || g.remaining <= 0"
              @click="openAddMoney(g)"
            >
              <q-tooltip>{{ data.available <= 0 ? 'No money available this month' : 'Add money' }}</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="edit" class="bb-bg-del" @click="openEdit(g)">
              <q-tooltip>Edit goal</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" icon="delete_outline" class="bb-bg-del" @click="removeGoal(g)">
              <q-tooltip>Delete goal</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
    </template>

    <!-- Add money to a single bucket -->
    <q-dialog v-model="addMoneyOpen">
      <q-card class="bb-planner-card" style="width:380px">
        <div class="bb-planner-hdr">
          <div class="bb-planner-title">
            <q-icon :name="addMoneyGoal?.icon || 'flag'" size="18px" style="color:#8B6FEC" />
            Add to {{ addMoneyGoal?.name }}
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div class="bb-goal-form">
          <q-input
            v-model.number="addAmount" type="number" dense outlined dark autofocus
            prefix="$" label="Amount to add"
            :hint="`${fmt(data?.available ?? 0)} available · ${fmt(addMoneyGoal?.remaining ?? 0)} left on this goal`"
          />
          <div class="bb-add-quick">
            <q-btn flat dense no-caps size="sm" label="Max" @click="addAmount = addMoneyMax" />
            <span class="bb-add-note">caps at whichever is smaller: available money or what this goal still needs</span>
          </div>
        </div>

        <div class="bb-planner-foot">
          <q-space />
          <div class="bb-planner-actions">
            <q-btn flat no-caps label="Cancel" v-close-popup />
            <q-btn
              no-caps unelevated label="Add money"
              :loading="addingMoney"
              :disable="!(Number(addAmount) > 0) || Number(addAmount) > addMoneyMax + 0.01"
              style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px"
              @click="addMoney"
            />
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- Create / edit goal dialog -->
    <q-dialog v-model="editorOpen">
      <q-card class="bb-planner-card" style="width:440px">
        <div class="bb-planner-hdr">
          <div class="bb-planner-title">
            <q-icon name="flag" size="18px" style="color:#8B6FEC" /> {{ editingId ? 'Edit goal' : 'New goal' }}
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div class="bb-goal-form">
          <q-input v-model="form.name" dense outlined dark label="What are you saving for?" maxlength="150" />
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model.number="form.target" type="number" dense outlined dark prefix="$" label="Target amount" />
            </div>
            <div class="col-6">
              <q-input v-model="form.targetDate" type="date" dense outlined dark label="Deadline (optional)" stack-label />
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <!-- Icon -->
            <div class="col-6">
              <div class="bb-picker-lbl">Icon</div>
              <q-btn no-caps outline class="bb-picker-btn full-width">
                <q-icon :name="form.icon || 'flag'" size="18px" />
                <q-icon name="expand_more" size="16px" class="q-ml-auto" />
                <q-menu dark>
                  <div class="bb-icon-grid">
                    <button
                      v-for="ic in ICON_OPTIONS" :key="ic" type="button" v-close-popup
                      class="bb-icon-cell" :class="{ active: form.icon === ic }" @click="form.icon = ic"
                    >
                      <q-icon :name="ic" size="18px" />
                    </button>
                  </div>
                </q-menu>
              </q-btn>
            </div>
            <!-- Color -->
            <div class="col-6">
              <div class="bb-picker-lbl">Color</div>
              <q-btn no-caps outline class="bb-picker-btn full-width">
                <span class="bb-swatch" :style="{ background: form.color }" />
                <q-icon name="expand_more" size="16px" class="q-ml-auto" />
                <q-menu dark>
                  <div class="bb-color-grid">
                    <button
                      v-for="col in COLOR_OPTIONS" :key="col" type="button" v-close-popup
                      class="bb-color-cell" :class="{ active: form.color === col }"
                      :style="{ background: col }" @click="form.color = col"
                    />
                  </div>
                </q-menu>
              </q-btn>
            </div>
          </div>
        </div>

        <div class="bb-planner-foot">
          <q-space />
          <div class="bb-planner-actions">
            <q-btn flat no-caps label="Cancel" v-close-popup />
            <q-btn
              no-caps unelevated :label="editingId ? 'Save' : 'Create goal'"
              :loading="saving" :disable="!form.name.trim() || !(Number(form.target) > 0)"
              style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px"
              @click="saveGoal"
            />
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- AI split planner -->
    <q-dialog v-model="plannerOpen">
      <q-card class="bb-planner-card">
        <div class="bb-planner-hdr">
          <div>
            <div class="bb-planner-title"><q-icon name="auto_awesome" size="18px" style="color:#8B6FEC" /> Split this month's leftover</div>
            <div class="bb-planner-sub">Suggested from your {{ fmt(splitAvailable) }} available (after the 20% savings reserve). Applying also tops up this month's reserve first.</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div v-if="generating && !plan.length" class="bb-planner-loading">
          <q-spinner color="primary" size="32px" /> <span>Building your split…</span>
        </div>

        <div v-else-if="!plan.length" class="bb-planner-empty">
          Nothing to allocate — add a goal, or you have no leftover this month.
        </div>

        <template v-else>
          <div class="bb-planner-list">
            <div v-for="p in plan" :key="p.goalId" class="bb-planner-row">
              <div class="bb-category-icon" :style="{ background: p.color || '#6C4ED4' }">
                <q-icon :name="p.icon || 'flag'" size="15px" color="white" />
              </div>
              <div class="bb-planner-info">
                <div class="bb-planner-name">{{ p.name }}</div>
                <div class="bb-planner-note">
                  {{ fmt(p.remaining) }} to go<span v-if="p.note"> · {{ p.note }}</span>
                </div>
              </div>
              <q-input v-model.number="p.suggestedAmount" type="number" dense outlined dark prefix="$" class="bb-planner-amt" />
            </div>
          </div>

          <div class="bb-planner-foot">
            <div class="bb-planner-total">
              Allocating: <strong :style="planTotal > splitAvailable + 0.01 ? 'color:#EF4444' : ''">{{ fmt(planTotal) }}</strong>
              <span class="bb-planner-vs">of {{ fmt(splitAvailable) }} available</span>
            </div>
            <div class="bb-planner-actions">
              <q-btn flat no-caps label="Cancel" v-close-popup />
              <q-btn
                no-caps unelevated label="Apply split"
                :loading="applying"
                :disable="planTotal <= 0 || planTotal > splitAvailable + 0.01"
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
import { api, type SavingsGoalsData, type SavingsGoal, type SavingsSplitItem } from 'src/services/api';

const $q = useQuasar();

const loading = ref(true);
const loadError = ref('');
const data = ref<SavingsGoalsData | null>(null);

// Editor (create/edit) state
const editorOpen = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const form = ref<{ name: string; target: number | null; targetDate: string; icon: string; color: string }>({
  name: '', target: null, targetDate: '', icon: 'flag', color: '#6C4ED4',
});

// Reserve
const funding = ref(false);

// Manual "add money" to a single bucket
const addMoneyOpen = ref(false);
const addMoneyGoal = ref<SavingsGoal | null>(null);
const addAmount = ref<number | null>(null);
const addingMoney = ref(false);
const addMoneyMax = computed(() =>
  Math.min(data.value?.available ?? 0, addMoneyGoal.value?.remaining ?? 0),
);

// AI split state
const plannerOpen = ref(false);
const generating = ref(false);
const applying = ref(false);
const plan = ref<SavingsSplitItem[]>([]);
const splitAvailable = ref(0);

const overallPct = computed(() => {
  const t = data.value?.summary.totalTarget ?? 0;
  return t > 0 ? ((data.value?.summary.totalSaved ?? 0) / t) * 100 : 0;
});
const planTotal = computed(() => plan.value.reduce((a, p) => a + (Number(p.suggestedAmount) || 0), 0));

const ICON_OPTIONS = [
  'flag', 'savings', 'home', 'directions_car', 'flight', 'phone_iphone',
  'laptop_mac', 'school', 'card_giftcard', 'celebration', 'beach_access',
  'pets', 'fitness_center', 'health_and_safety', 'diamond', 'watch',
  'chair', 'sports_esports', 'two_wheeler', 'shopping_bag',
];
const COLOR_OPTIONS = [
  '#6C4ED4', '#E040FB', '#3B82F6', '#22C55E', '#14B8A6',
  '#F59E0B', '#EF4444', '#EC4899', '#A855F7', '#0EA5E9',
  '#84CC16', '#F97316', '#06B6D4', '#8B5CF6', '#10B981',
];

function fmt(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function barColor(pct: number) {
  return pct >= 100 ? '#22C55E' : pct >= 60 ? '#8B6FEC' : '#6C4ED4';
}
// "$72/mo" pace to hit a dated goal — small, high-value hint.
function paceText(g: SavingsGoal) {
  if (!g.targetDate || g.remaining <= 0) return '';
  const now = new Date();
  const target = new Date(g.targetDate + 'T00:00:00');
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  if (months <= 0) return ' · past due';
  return ` · ${fmt(Math.ceil(g.remaining / months))}/mo`;
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    data.value = await api.getGoals();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load goals';
  } finally {
    loading.value = false;
  }
}

// ── Create / edit ───────────────────────────────────────────
function openCreate() {
  editingId.value = null;
  form.value = { name: '', target: null, targetDate: '', icon: 'flag', color: '#6C4ED4' };
  editorOpen.value = true;
}
function openEdit(g: SavingsGoal) {
  editingId.value = g.id;
  form.value = {
    name: g.name, target: g.target, targetDate: g.targetDate ?? '',
    icon: g.icon ?? 'flag', color: g.color ?? '#6C4ED4',
  };
  editorOpen.value = true;
}

async function saveGoal() {
  const target = Number(form.value.target);
  if (!form.value.name.trim() || !(target > 0)) return;
  saving.value = true;
  try {
    const body = {
      name: form.value.name.trim(),
      target,
      targetDate: form.value.targetDate || null,
      icon: form.value.icon,
      color: form.value.color,
    };
    if (editingId.value) await api.updateGoal(editingId.value, body);
    else await api.createGoal(body);
    editorOpen.value = false;
    await load();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to save goal' });
  } finally {
    saving.value = false;
  }
}

function removeGoal(g: SavingsGoal) {
  $q.dialog({
    title: 'Delete goal',
    message: `Delete "${g.name}" and its ${fmt(g.saved)} of saved history?`,
    cancel: true, dark: true,
  }).onOk(() => {
    void (async () => {
      try {
        await api.deleteGoal(g.id);
        await load();
      } catch (e) {
        $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to delete goal' });
      }
    })();
  });
}

// ── Manual add ──────────────────────────────────────────────
function openAddMoney(g: SavingsGoal) {
  addMoneyGoal.value = g;
  addAmount.value = null;
  addMoneyOpen.value = true;
}

async function addMoney() {
  const goal = addMoneyGoal.value;
  const amount = Number(addAmount.value);
  if (!goal || !(amount > 0)) return;
  addingMoney.value = true;
  try {
    // Reuses the same allocation path: enforces the 80% available cap and
    // tops up the 20% Savings reserve first, server-side.
    const res = await api.applySavingsSplit([{ goalId: goal.id, amount }]);
    addMoneyOpen.value = false;
    await load();
    const reservedMsg = res.reserved > 0 ? ` (plus ${fmt(res.reserved)} to Savings first)` : '';
    $q.notify({ type: 'positive', message: `Added ${fmt(amount)} to ${goal.name}${reservedMsg}.` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to add money' });
  } finally {
    addingMoney.value = false;
  }
}

// ── Reserve ─────────────────────────────────────────────────
async function fundReserve() {
  funding.value = true;
  try {
    const res = await api.fundSavingsReserve();
    await load();
    $q.notify({ type: 'positive', message: `Set aside ${fmt(res.funded)} into Savings.` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to fund reserve' });
  } finally {
    funding.value = false;
  }
}

// ── AI split ────────────────────────────────────────────────
function openPlanner() {
  plannerOpen.value = true;
  if (!plan.value.length) void generate();
}

async function generate() {
  generating.value = true;
  try {
    const res = await api.suggestSavingsSplit();
    plan.value = res.plan;
    splitAvailable.value = res.available;
    if (res.available <= 0) {
      $q.notify({ type: 'info', message: 'No leftover net savings to allocate this month yet.' });
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to suggest a split' });
  } finally {
    generating.value = false;
  }
}

async function applyPlan() {
  const items = plan.value
    .map((p) => ({ goalId: p.goalId, amount: Number(p.suggestedAmount) }))
    .filter((i) => Number.isFinite(i.amount) && i.amount > 0);
  if (!items.length) return;
  applying.value = true;
  try {
    const res = await api.applySavingsSplit(items);
    plannerOpen.value = false;
    plan.value = [];
    await load();
    const reservedMsg = res.reserved > 0 ? ` (plus ${fmt(res.reserved)} to Savings first)` : '';
    $q.notify({ type: 'positive', message: `Allocated ${fmt(res.total)} across ${res.applied} goal${res.applied === 1 ? '' : 's'}${reservedMsg}.` });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to apply split' });
  } finally {
    applying.value = false;
  }
}

onMounted(load);
</script>

<style lang="scss">
.bb-goals { background-color: #0A0A1B; min-height: 100vh; }

.bb-goal-done { margin-left: 8px; font-size: 10px; }

.bb-goal-form { display: flex; flex-direction: column; gap: 14px; margin-bottom: 6px; }
.bb-picker-lbl { font-size: 11px; color: #8F8FB5; margin-bottom: 6px; }
.bb-picker-btn {
  color: #E6E6F5; border-color: rgba(255,255,255,0.18); border-radius: 8px;
  text-transform: none; padding: 6px 12px;
}
.bb-swatch { width: 18px; height: 18px; border-radius: 5px; display: inline-block; }

.bb-icon-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; padding: 10px;
  background: #0F1030;
}
.bb-icon-cell {
  width: 38px; height: 38px; border-radius: 8px; display: grid; place-items: center;
  background: #0A0A1B; border: 1px solid rgba(255,255,255,0.08); color: #C6C6E5; cursor: pointer;
  &:hover { border-color: #6C4ED4; }
  &.active { border-color: #8B6FEC; background: rgba(108,78,212,0.25); color: #fff; }
}
.bb-color-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 10px; background: #0F1030;
}
.bb-color-cell {
  width: 30px; height: 30px; border-radius: 8px; cursor: pointer; border: 2px solid transparent;
  &.active { border-color: #fff; }
}

// ── Shared look reused from Budgets, defined locally so this page renders
//    correctly whether or not the Budgets tab has been visited this session. ──
.bb-budgets-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.bb-ai-btn {
  background: linear-gradient(135deg, #6C4ED4, #E040FB); color: #fff; border-radius: 10px;
  padding: 8px 16px; font-weight: 600; flex-shrink: 0;
}
.bb-trim-btn { color: #F59E0B; }

.bb-category-icon { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }

// Panel + goal rows
.bb-bg-panel { background: #0F1030; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 20px; }
.bb-bg-panel-hdr {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;
  font-size: 14px; font-weight: 600; color: #ffffff;
}
.bb-bg-panel-sub { font-size: 12px; font-weight: 400; color: #6E6E9A; flex-basis: 100%; }
.bb-bg-empty { color: #6E6E9A; font-size: 13px; padding: 8px 0 16px; }
.bb-reserve { border-color: rgba(34,197,94,0.25); }
.bb-bg-list { display: flex; flex-direction: column; gap: 14px; }
.bb-bg-row { display: flex; align-items: center; gap: 14px; }
.bb-bg-main { flex: 1; min-width: 0; }
.bb-bg-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; }
.bb-bg-name { font-size: 14px; font-weight: 600; color: #F8FAFF; }
.bb-bg-amounts { font-size: 13px; color: #9090B8; white-space: nowrap; }
.bb-bg-limit { color: #F8FAFF; font-weight: 600; }
.bb-bg-bar-wrap { height: 7px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.bb-bg-bar { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.bb-bg-row-bot { display: flex; justify-content: space-between; margin-top: 5px; font-size: 11px; font-weight: 600; }
.bb-bg-last { color: #6E6E9A; font-weight: 400; }
.bb-bg-del { color: #6E6E9A; flex-shrink: 0; &:hover { color: #EF4444; } }
.bb-bg-add-btn { color: #22C55E; flex-shrink: 0; &:hover { color: #4ADE80; } }

.bb-add-quick { display: flex; align-items: center; gap: 10px; }
.bb-add-quick .q-btn { color: #8B6FEC; }
.bb-add-note { font-size: 11px; color: #6E6E9A; }

// Dialog (editor + AI split)
.bb-planner-card {
  background: #0F1030; color: #E6E6F5; width: 560px; max-width: 92vw;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px;
}
.bb-planner-hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.bb-planner-title { font-size: 18px; font-weight: 700; color: #F8FAFF; display: flex; align-items: center; gap: 8px; }
.bb-planner-sub { color: #8F8FB5; font-size: 13px; margin-top: 4px; max-width: 420px; }
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
</style>
