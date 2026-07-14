<template>
  <q-layout view="lHh Lpr lFf" class="bb-layout">
    <!-- Sidebar -->
    <q-drawer
      v-model="drawerOpen"
      show-if-above
      :width="220"
      :breakpoint="700"
      class="bb-sidebar"
    >
      <!-- Logo → home (Dashboard) -->
      <div class="bb-logo" role="button" @click="goHome">
        <div class="bb-logo-icon">
          <q-icon name="account_balance_wallet" size="18px" color="white" />
        </div>
        <span class="bb-logo-text">BreadBank</span>
      </div>

      <!-- General nav -->
      <div class="bb-section-label">General</div>
      <q-list class="bb-nav" data-tour="nav">
        <q-item
          v-for="item in generalNav"
          :key="item.path"
          clickable
          v-ripple
          :to="item.path"
          active-class="bb-nav-active"
          class="bb-nav-item"
          @click="onNavClick"
        >
          <q-item-section avatar class="bb-nav-icon">
            <q-icon :name="item.icon" size="18px" />
          </q-item-section>
          <q-item-section>{{ item.label }}</q-item-section>
        </q-item>
      </q-list>

      <!-- Other Menu -->
      <div class="bb-section-label bb-section-other">
        <span>Other</span>
        <q-btn flat round dense icon="add" size="xs" style="color: #6E6E9A" />
      </div>
      <q-list class="bb-nav">
        <q-item
          v-for="item in otherNav"
          :key="item.path"
          clickable
          v-ripple
          :to="item.path"
          active-class="bb-nav-active"
          class="bb-nav-item"
          @click="onNavClick"
        >
          <q-item-section avatar class="bb-nav-icon">
            <q-icon :name="item.icon" size="18px" />
          </q-item-section>
          <q-item-section>{{ item.label }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <!-- Top Header -->
    <q-header class="bb-header">
      <q-toolbar class="bb-toolbar">
        <q-btn
          flat round dense icon="menu" size="sm"
          class="bb-menu-btn"
          style="color: #6E6E9A"
          aria-label="Toggle menu"
          @click="drawerOpen = !drawerOpen"
        />
        <q-btn
          flat round dense icon="chevron_left" size="sm"
          style="color: #6E6E9A"
          @click="goBack"
        />
        <q-btn
          flat round dense icon="chevron_right" size="sm"
          style="color: #6E6E9A"
          @click="router.forward()"
        />
        <div class="bb-sep" />
        <span class="bb-breadcrumb">{{ currentTitle }}</span>
        <q-space />
        <q-btn flat dense unelevated label="Logout" class="bb-logout-btn" icon="logout" @click="logout" />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Bottom tab bar — phones only; the drawer holds the rest under "More" -->
    <q-footer v-if="$q.screen.width < 700" class="bb-tabbar">
      <nav class="bb-tabbar-row">
        <router-link
          v-for="t in tabNav" :key="t.path" :to="t.path"
          class="bb-tab" active-class="bb-tab-active"
        >
          <q-icon :name="t.icon" size="21px" />
          <span>{{ t.label }}</span>
        </router-link>
        <a class="bb-tab" role="button" @click="drawerOpen = !drawerOpen">
          <q-icon name="menu" size="21px" />
          <span>More</span>
        </a>
      </nav>
    </q-footer>

    <!-- Low Claude credit warning — shown once per login when running low. -->
    <q-dialog v-model="creditDialogOpen">
      <q-card class="bb-credit-card">
        <div class="bb-credit-hdr">
          <q-icon :name="creditExhausted ? 'error' : 'warning_amber'" size="22px"
            :style="`color:${creditExhausted ? '#EF4444' : '#F59E0B'}`" />
          <span>{{ creditExhausted ? 'Claude credits depleted' : 'Claude credits running low' }}</span>
        </div>

        <div class="bb-credit-balance">
          <div class="bb-credit-remaining" :style="`color:${creditExhausted ? '#EF4444' : '#F59E0B'}`">
            {{ fmtUsd(creditStatus?.creditRemainingUsd ?? 0) }}
          </div>
          <div class="bb-credit-sub">
            estimated left of {{ fmtUsd(creditStatus?.creditTotalUsd ?? 0) }}
            · {{ fmtUsd(creditStatus?.creditSpentAllTimeUsd ?? 0) }} used
          </div>
          <div class="bb-credit-track">
            <div class="bb-credit-fill" :style="{
              width: creditPct + '%',
              background: creditExhausted ? '#EF4444' : 'linear-gradient(90deg,#F59E0B,#EF4444)',
            }" />
          </div>
        </div>

        <div class="bb-credit-body">
          {{ creditExhausted
            ? 'AI features (categorization, summaries, chat) are paused until you add credits to your Anthropic account.'
            : "When this hits $0, AI features stop working. Add credits to your Anthropic account to keep them running." }}
        </div>

        <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener" class="bb-credit-link">
          <q-icon name="open_in_new" size="15px" /> Add credits in Anthropic Console
        </a>

        <div class="bb-credit-topup">
          <div class="bb-credit-topup-lbl">Topped up? Update your total purchased credits to reset the estimate:</div>
          <div class="row items-center q-gutter-sm">
            <q-input v-model.number="creditTotalInput" type="number" dense outlined dark prefix="$"
              style="max-width:130px" @keyup.enter="saveCreditTotal" />
            <q-btn no-caps unelevated label="Update" :loading="savingCredit"
              style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px"
              @click="saveCreditTotal" />
          </div>
        </div>

        <div class="bb-credit-actions">
          <q-btn flat no-caps label="Dismiss" style="color:#9090B8" v-close-popup />
        </div>
      </q-card>
    </q-dialog>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { auth } from 'src/services/auth';
import { api, type AiStatus } from 'src/services/api';

interface NavItem {
  icon: string;
  label: string;
  path: string;
}

// Start closed; `show-if-above` keeps it open on desktop, while on phones it
// stays an overlay you open with the header menu button.
const drawerOpen = ref(false);
const route = useRoute();
const router = useRouter();
const $q = useQuasar();

const DRAWER_BREAKPOINT = 700;

// On a phone, tapping a destination should close the overlay drawer so it
// doesn't sit on top of the page you just navigated to.
function onNavClick() {
  if ($q.screen.width < DRAWER_BREAKPOINT) drawerOpen.value = false;
}

const generalNav: NavItem[] = [
  { icon: 'dashboard', label: 'Dashboard', path: '/app/dashboard' },
  { icon: 'receipt_long', label: 'Transactions', path: '/app/transactions' },
  { icon: 'upload_file', label: 'Upload', path: '/app/upload' },
  { icon: 'savings', label: 'Budgets', path: '/app/budgets' },
  { icon: 'flag', label: 'Savings Goals', path: '/app/goals' },
  { icon: 'autorenew', label: 'Subscriptions', path: '/app/subscriptions' },
  { icon: 'event', label: 'Bills', path: '/app/bills' },
  { icon: 'trending_up', label: 'Investments', path: '/app/investments' },
  { icon: 'bar_chart', label: 'Reports', path: '/app/reports' },
];

// The four destinations that earn a spot on the phone tab bar.
const tabNav: NavItem[] = [
  { icon: 'dashboard', label: 'Home', path: '/app/dashboard' },
  { icon: 'receipt_long', label: 'Activity', path: '/app/transactions' },
  { icon: 'savings', label: 'Budgets', path: '/app/budgets' },
  { icon: 'event', label: 'Bills', path: '/app/bills' },
];

const otherNav: NavItem[] = [
  { icon: 'psychology', label: 'AI Assistant', path: '/app/ai-chat' },
  { icon: 'label', label: 'Categories', path: '/app/categories' },
  { icon: 'settings', label: 'Settings', path: '/app/settings' },
];

const allNav = [...generalNav, ...otherNav];

const currentTitle = computed(() => {
  const match = allNav.find((n) => route.path.startsWith(n.path));
  return match ? match.label : 'BreadBank';
});

function goHome() {
  void router.push('/app/dashboard');
  onNavClick(); // close the drawer on mobile
}

function goBack() {
  // Stay inside the app: if there's no in-app history to go back to,
  // fall back to the dashboard instead of leaving the SPA entirely.
  if (window.history.state?.back) {
    router.back();
  } else {
    void router.push('/app/dashboard');
  }
}

async function logout() {
  auth.logout();
  await router.replace('/login');
}

// ── Low Claude-credit warning ────────────────────────────────
const creditDialogOpen = ref(false);
const creditStatus = ref<AiStatus | null>(null);
const creditTotalInput = ref<number | null>(null);
const savingCredit = ref(false);

const creditExhausted = computed(() => (creditStatus.value?.creditRemainingUsd ?? 1) <= 0 || !!creditStatus.value?.creditExhausted);
const creditPct = computed(() => {
  const s = creditStatus.value;
  if (!s || s.creditTotalUsd <= 0) return 0;
  return Math.min(100, Math.max(0, (s.creditRemainingUsd / s.creditTotalUsd) * 100));
});

function fmtUsd(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function saveCreditTotal() {
  if (creditTotalInput.value == null || creditTotalInput.value < 0) return;
  savingCredit.value = true;
  try {
    creditStatus.value = await api.setAiCreditTotal(creditTotalInput.value);
    if (!creditStatus.value.creditLow) {
      creditDialogOpen.value = false;
      $q.notify({ type: 'positive', message: 'Credit balance updated.' });
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Failed to update credits' });
  } finally {
    savingCredit.value = false;
  }
}

// ── Bill reminders (local notifications) ─────────────────────
// Fires when the app opens: any upcoming bill due within 3 days gets one
// notification per day. Opt-in from the Bills page ("Remind me").
async function checkBillReminders() {
  if (localStorage.getItem('bb_bill_reminders') !== 'on') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const { bills } = await api.getCalendar();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
    for (const b of bills) {
      if (b.status !== 'upcoming') continue;
      const days = Math.round((new Date(b.dueDate + 'T00:00:00').getTime() - today.getTime()) / 86400000);
      if (days < 0 || days > 3) continue;
      const key = `bb_notified_${b.id}_${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(key)) continue;
      const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      const body = `${b.name} — $${b.amount.toFixed(2)} due ${when}`;
      if (reg) await reg.showNotification('Upcoming bill', { body, icon: 'icons/icon-192x192.png', tag: String(b.id) });
      else new Notification('Upcoming bill', { body });
      localStorage.setItem(key, '1');
    }
  } catch { /* reminders are best-effort; never block the app */ }
}

onMounted(async () => {
  void checkBillReminders();
  // The Claude-credit warning only matters to the app owner (who funds the
  // Anthropic account) — never show it to other users or the demo.
  if (auth.getUser()?.email !== 'jibrilabdisatar@gmail.com') return;
  // Show the warning at most once per session (per login), so it greets you on
  // login but doesn't nag on every navigation.
  if (sessionStorage.getItem('bb_credit_warned') === '1') return;
  try {
    const status = await api.getAiStatus();
    creditStatus.value = status;
    creditTotalInput.value = status.creditTotalUsd;
    if (status.creditLow) {
      creditDialogOpen.value = true;
      sessionStorage.setItem('bb_credit_warned', '1');
    }
  } catch {
    // Status is best-effort; never block the app on it.
  }
});
</script>

<style lang="scss">
.bb-layout {
  background-color: #0A0A1B;
}

.bb-sidebar {
  background-color: #0A0A1B !important;
  border-right: 1px solid rgba(255, 255, 255, 0.06) !important;
}

.bb-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 14px;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover { opacity: 0.85; }

  &-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #6C4ED4, #E040FB);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &-text {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.2px;
  }
}

.bb-logout-btn {
  color: var(--bb-text) !important;
  background: rgba(236, 64, 251, 0.08) !important;
  border: 1px solid var(--bb-border-hover) !important;
  border-radius: 6px !important;
  padding: 4px 10px !important;
  font-size: 12px !important;
  min-height: auto !important;
  height: auto !important;
  transition: all 0.2s ease !important;

  &:hover {
    background: rgba(236, 64, 251, 0.15) !important;
    border-color: rgba(236, 64, 251, 0.3) !important;
  }
}

.bb-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #4D4D70;
  padding: 10px 16px 4px;
}

.bb-section-other {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;
  margin-top: 6px;
}

.bb-nav {
  padding: 0 8px 4px;
}

.bb-nav-item {
  border-radius: 8px;
  min-height: 36px !important;
  padding: 0 8px !important;
  color: #6E6E9A;
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(108, 78, 212, 0.1) !important;
    color: #c0b0f0 !important;
  }

  .q-item__section--avatar {
    min-width: 30px !important;
    padding-right: 6px !important;
  }
}

.bb-nav-active {
  background: rgba(108, 78, 212, 0.18) !important;
  color: #ffffff !important;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: -8px;
    top: 6px;
    bottom: 6px;
    width: 3px;
    background: #6C4ED4;
    border-radius: 0 3px 3px 0;
  }
}

.bb-nav-icon {
  color: inherit !important;
}

.bb-header {
  background-color: #0A0A1B !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: none !important;
}

.bb-toolbar {
  min-height: 50px !important;
  padding: 0 16px !important;
}

// The hamburger only matters on phones — the drawer is docked on desktop.
.bb-menu-btn { display: none; }
@media (max-width: 699px) {
  .bb-menu-btn { display: inline-flex; }
}

.bb-sep {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 10px;
}

.bb-breadcrumb {
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
}

/* ── Bottom tab bar (phones) ───────────────────────────────── */
.bb-tabbar {
  background: #0D0D24 !important;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  // Keep the bar above the iPhone home indicator in standalone (PWA) mode.
  padding-bottom: env(safe-area-inset-bottom);
}
.bb-tabbar-row { display: flex; }
.bb-tab {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 0 6px;
  font-size: 10px; font-weight: 600;
  color: #6E6E9A; text-decoration: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.bb-tab-active { color: #8B6FEC; }

/* ── Low-credit warning dialog ─────────────────────────────── */
.bb-credit-card {
  width: 420px; max-width: 92vw;
  background: #0F1030 !important; color: #E6E6F5;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; padding: 24px;
}
.bb-credit-hdr {
  display: flex; align-items: center; gap: 10px;
  font-size: 17px; font-weight: 700; color: #F8FAFF; margin-bottom: 16px;
}
.bb-credit-balance { text-align: center; margin-bottom: 16px; }
.bb-credit-remaining { font-size: 34px; font-weight: 800; letter-spacing: -0.5px; }
.bb-credit-sub { font-size: 12px; color: #8F8FB5; margin-top: 2px; }
.bb-credit-track {
  height: 7px; margin-top: 12px;
  background: rgba(255,255,255,0.07); border-radius: 4px; overflow: hidden;
}
.bb-credit-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.bb-credit-body { font-size: 13px; line-height: 1.5; color: #C6C6E5; margin-bottom: 16px; }
.bb-credit-link {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: #8B6FEC; text-decoration: none;
  &:hover { color: #B79DFF; }
}
.bb-credit-topup {
  margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.07);
}
.bb-credit-topup-lbl { font-size: 12px; color: #8F8FB5; margin-bottom: 8px; }
.bb-credit-actions { display: flex; justify-content: flex-end; margin-top: 16px; }

</style>
