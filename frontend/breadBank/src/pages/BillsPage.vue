<template>
  <q-page class="bb-bills q-pa-lg">
    <div class="bb-page-header">
      <div>
        <div class="bb-page-title">Bills & Due Dates</div>
        <div class="bb-page-sub">What's hitting your account, and when</div>
      </div>
      <q-btn
        no-caps flat dense
        :icon="remindersOn ? 'notifications_active' : 'notifications_none'"
        :label="remindersOn ? 'Reminders on' : 'Remind me'"
        :style="`color:${remindersOn ? '#22C55E' : '#8B6FEC'}`"
        @click="toggleReminders"
      >
        <q-tooltip>Get a notification when a bill is due within 3 days (checked when the app opens)</q-tooltip>
      </q-btn>
    </div>

    <div v-if="loading && !data" class="bb-loading">
      <q-spinner color="primary" size="40px" /> <span>Loading bills…</span>
    </div>

    <q-banner v-else-if="loadError" class="bb-error-banner q-mb-lg" dense type="negative" rounded>
      {{ loadError }}
    </q-banner>

    <template v-else-if="data">
      <!-- Summary -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-6 col-md-4">
          <div class="bb-stat bb-stat--gradient">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:rgba(255,255,255,0.6)"></span>DUE THIS WEEK</div>
            <div class="bb-stat-val">{{ fmt(data.summary.dueThisWeek) }}</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">{{ data.summary.dueThisWeekCount }} bill{{ data.summary.dueThisWeekCount === 1 ? '' : 's' }} in the next 7 days</span></div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="bb-stat">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:#6C4ED4"></span>UPCOMING (THIS VIEW)</div>
            <div class="bb-stat-val">{{ fmt(data.summary.totalUpcoming) }}</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">{{ upcomingCount }} upcoming bill{{ upcomingCount === 1 ? '' : 's' }}</span></div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="bb-stat">
            <div class="bb-stat-lbl"><span class="bb-dot" style="background:#22C55E"></span>TRACKED</div>
            <div class="bb-stat-val">{{ data.summary.count }}</div>
            <div class="bb-stat-row"><span class="bb-stat-cmp">subscriptions + card payments</span></div>
          </div>
        </div>
      </div>

      <div class="row q-col-gutter-md">
        <!-- Calendar -->
        <div class="col-12 col-md-8">
          <div class="bb-bg-panel">
            <div class="bb-cal-hdr">
              <q-btn flat round dense icon="chevron_left" size="sm" style="color:#9090B8" @click="shiftMonth(-1)" />
              <span class="bb-cal-title">{{ monthTitle }}</span>
              <q-btn flat round dense icon="chevron_right" size="sm" style="color:#9090B8" @click="shiftMonth(1)" />
              <q-space />
              <q-btn flat dense no-caps size="sm" label="Today" style="color:#8B6FEC" @click="goToday" />
            </div>

            <div class="bb-cal-weekdays">
              <span v-for="w in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="w">{{ w }}</span>
            </div>

            <div class="bb-cal-grid">
              <button
                v-for="cell in gridDays" :key="cell.key" type="button"
                class="bb-cal-cell"
                :class="{ 'is-out': !cell.inMonth, 'is-today': cell.isToday, 'is-selected': cell.key === selectedKey, 'has-bills': dayBills(cell.key).length > 0 }"
                @click="selectedKey = cell.key"
              >
                <span class="bb-cal-day">{{ cell.date.getDate() }}</span>
                <span v-if="dayTotal(cell.key) > 0" class="bb-cal-amt">{{ fmtShort(dayTotal(cell.key)) }}</span>
                <span class="bb-cal-dots">
                  <span
                    v-for="(b, i) in dayBills(cell.key).slice(0, 3)" :key="i"
                    class="bb-cal-dot"
                    :style="{ background: dotColor(b) }"
                  />
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Selected day's bills -->
        <div class="col-12 col-md-4">
          <div class="bb-bg-panel">
            <div class="bb-bg-panel-hdr">
              <q-icon name="event" size="18px" style="color:#8B6FEC" />
              <span>{{ selectedLabel }}</span>
            </div>
            <div v-if="selectedBills.length === 0" class="bb-bg-empty">Nothing due this day.</div>
            <div v-else class="bb-bill-list">
              <div v-for="b in selectedBills" :key="b.id" class="bb-bill-row">
                <div class="bb-bill-icon" :style="{ background: dotColor(b) + '22' }">
                  <q-icon :name="b.source === 'liability' ? 'credit_card' : 'autorenew'" size="15px" :style="`color:${dotColor(b)}`" />
                </div>
                <div class="bb-bill-main">
                  <div class="bb-bill-name">{{ b.name }}</div>
                  <div class="bb-bill-sub">
                    <q-badge v-if="b.status === 'paid'" color="grey-8" class="bb-bill-badge">paid</q-badge>
                    <span v-else-if="b.source === 'subscription'">{{ b.cadence }}</span>
                    <span v-else>card payment</span>
                  </div>
                </div>
                <div class="bb-bill-amt">{{ fmt(b.amount) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Upcoming list -->
      <div class="bb-bg-panel q-mt-md">
        <div class="bb-bg-panel-hdr">
          <q-icon name="upcoming" size="18px" style="color:#8B6FEC" />
          <span>Upcoming</span>
        </div>
        <div v-if="upcomingBills.length === 0" class="bb-bg-empty">No upcoming bills in this view.</div>
        <div v-else class="bb-bill-list">
          <div v-for="b in upcomingBills" :key="b.id" class="bb-bill-row">
            <div class="bb-bill-date">
              <div class="bb-bill-date-d">{{ dayNum(b.dueDate) }}</div>
              <div class="bb-bill-date-m">{{ monShort(b.dueDate) }}</div>
            </div>
            <div class="bb-bill-icon" :style="{ background: dotColor(b) + '22' }">
              <q-icon :name="b.source === 'liability' ? 'credit_card' : 'autorenew'" size="15px" :style="`color:${dotColor(b)}`" />
            </div>
            <div class="bb-bill-main">
              <div class="bb-bill-name">{{ b.name }}</div>
              <div class="bb-bill-sub">{{ relativeDue(b.dueDate) }}<span v-if="b.source === 'subscription'"> · {{ b.cadence }}</span></div>
            </div>
            <div class="bb-bill-amt">{{ fmt(b.amount) }}</div>
          </div>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { api, type CalendarData, type Bill } from 'src/services/api';

const $q = useQuasar();

// ── Bill reminder opt-in ──────────────────────────────────────
// The notifications themselves fire from MainLayout when the app opens; this
// button just asks for browser permission and flips the preference.
const remindersOn = ref(localStorage.getItem('bb_bill_reminders') === 'on');

async function toggleReminders() {
  if (remindersOn.value) {
    localStorage.setItem('bb_bill_reminders', 'off');
    remindersOn.value = false;
    $q.notify({ message: 'Bill reminders turned off.' });
    return;
  }
  if (!('Notification' in window)) {
    $q.notify({ type: 'negative', message: 'This browser does not support notifications.' });
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    $q.notify({ type: 'warning', message: 'Notifications are blocked — allow them in your browser/site settings.' });
    return;
  }
  localStorage.setItem('bb_bill_reminders', 'on');
  remindersOn.value = true;
  $q.notify({ type: 'positive', message: "You'll be reminded of bills due within 3 days when you open the app." });
}

const loading = ref(true);
const loadError = ref('');
const data = ref<CalendarData | null>(null);

const now = new Date();
const todayKey = isoLocal(now);
const monthCursor = ref(new Date(now.getFullYear(), now.getMonth(), 1));
const selectedKey = ref(todayKey);

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmt(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(v: number) {
  return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v);
}

const monthTitle = computed(() =>
  monthCursor.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

// 6-week grid starting on the Sunday on/before the 1st.
const gridDays = computed(() => {
  const first = new Date(monthCursor.value);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells: { date: Date; key: string; inMonth: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      key: isoLocal(d),
      inMonth: d.getMonth() === monthCursor.value.getMonth(),
      isToday: isoLocal(d) === todayKey,
    });
  }
  return cells;
});

const billsByDay = computed(() => {
  const map = new Map<string, Bill[]>();
  for (const b of data.value?.bills ?? []) {
    const arr = map.get(b.dueDate) ?? [];
    arr.push(b);
    map.set(b.dueDate, arr);
  }
  return map;
});
function dayBills(key: string): Bill[] { return billsByDay.value.get(key) ?? []; }
function dayTotal(key: string): number { return dayBills(key).reduce((s, b) => s + b.amount, 0); }

const selectedBills = computed(() => dayBills(selectedKey.value));
const selectedLabel = computed(() => {
  if (selectedKey.value === todayKey) return 'Today';
  const [y, m, d] = selectedKey.value.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
});

const upcomingBills = computed(() =>
  (data.value?.bills ?? []).filter((b) => b.status === 'upcoming'));
const upcomingCount = computed(() => upcomingBills.value.length);

function dotColor(b: Bill) {
  return b.source === 'liability' ? '#EF4444' : (b.categoryColor || '#8B6FEC');
}
function dayNum(iso: string) { return Number(iso.slice(8, 10)); }
function monShort(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'short' });
}
function relativeDue(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const due = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - t.getTime()) / 86_400_000);
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 0) return `${-days}d ago`;
  return `in ${days} days`;
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const cells = gridDays.value;
    const from = cells[0]!.key;
    const to = cells[cells.length - 1]!.key;
    data.value = await api.getCalendar(from, to);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load bills';
  } finally {
    loading.value = false;
  }
}

function shiftMonth(delta: number) {
  monthCursor.value = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth() + delta, 1);
  void load();
}
function goToday() {
  monthCursor.value = new Date(now.getFullYear(), now.getMonth(), 1);
  selectedKey.value = todayKey;
  void load();
}

onMounted(load);
</script>

<style lang="scss">
.bb-bills { background-color: #0A0A1B; min-height: 100vh; }

// Reuse panel styling from elsewhere, defined locally so the page stands alone.
.bb-bg-panel { background: #0F1030; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 20px; }
.bb-bg-panel-hdr {
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
  font-size: 14px; font-weight: 600; color: #ffffff;
}
.bb-bg-empty { color: #6E6E9A; font-size: 13px; padding: 8px 0; }

// Calendar
.bb-cal-hdr { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; }
.bb-cal-title { font-size: 15px; font-weight: 700; color: #F8FAFF; min-width: 150px; text-align: center; }
.bb-cal-weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 6px;
  font-size: 10px; font-weight: 600; letter-spacing: 0.5px; color: #4D4D70; text-transform: uppercase; text-align: center;
}
.bb-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.bb-cal-cell {
  position: relative; min-height: 64px; padding: 6px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  background: #0A0A1B; border: 1px solid rgba(255,255,255,0.05); border-radius: 9px;
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: rgba(139,111,236,0.5); }
  &.is-out { opacity: 0.4; }
  &.is-today { border-color: rgba(139,111,236,0.7); }
  &.is-selected { background: rgba(108,78,212,0.18); border-color: #8B6FEC; }
  &.has-bills .bb-cal-day { color: #F8FAFF; }
}
.bb-cal-day { font-size: 12px; font-weight: 600; color: #9090B8; }
.bb-cal-amt { font-size: 10px; font-weight: 700; color: #C9B6FF; }
.bb-cal-dots { display: flex; gap: 3px; margin-top: auto; }
.bb-cal-dot { width: 6px; height: 6px; border-radius: 50%; }

// Bill lists
.bb-bill-list { display: flex; flex-direction: column; gap: 10px; }
.bb-bill-row { display: flex; align-items: center; gap: 12px; }
.bb-bill-date { width: 38px; flex-shrink: 0; text-align: center; }
.bb-bill-date-d { font-size: 16px; font-weight: 800; color: #F8FAFF; line-height: 1; }
.bb-bill-date-m { font-size: 10px; text-transform: uppercase; color: #6E6E9A; }
.bb-bill-icon { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; }
.bb-bill-main { flex: 1; min-width: 0; }
.bb-bill-name { font-size: 13px; font-weight: 600; color: #F8FAFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-bill-sub { font-size: 11px; color: #6E6E9A; text-transform: capitalize; }
.bb-bill-badge { font-size: 9px; }
.bb-bill-amt { font-size: 13px; font-weight: 700; color: #F8FAFF; white-space: nowrap; }
</style>
