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
      <!-- Logo -->
      <div class="bb-logo">
        <div class="bb-logo-icon">
          <q-icon name="account_balance_wallet" size="18px" color="white" />
        </div>
        <span class="bb-logo-text">BreadBank</span>
      </div>

      <!-- Search -->
      <div class="bb-search-wrap">
        <div class="bb-search" @click="$router.push('/transactions')">
          <q-icon name="search" size="15px" style="color: #6E6E9A" class="q-mr-xs" />
          <span class="bb-search-ph">Search</span>
          <div class="bb-kbd">⌘K</div>
        </div>
      </div>

      <!-- General nav -->
      <div class="bb-section-label">General</div>
      <q-list class="bb-nav">
        <q-item
          v-for="item in generalNav"
          :key="item.path"
          clickable
          v-ripple
          :to="item.path"
          active-class="bb-nav-active"
          class="bb-nav-item"
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
          flat round dense icon="chevron_left" size="sm"
          style="color: #6E6E9A"
          @click="router.back()"
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
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth } from 'src/services/auth';

interface NavItem {
  icon: string;
  label: string;
  path: string;
}

const drawerOpen = ref(true);
const route = useRoute();
const router = useRouter();

const generalNav: NavItem[] = [
  { icon: 'dashboard', label: 'Dashboard', path: '/app/dashboard' },
  { icon: 'receipt_long', label: 'Transactions', path: '/app/transactions' },
  { icon: 'upload_file', label: 'Upload', path: '/app/upload' },
  { icon: 'savings', label: 'Budgets', path: '/app/budgets' },
  { icon: 'autorenew', label: 'Subscriptions', path: '/app/subscriptions' },
  { icon: 'trending_up', label: 'Investments', path: '/app/investments' },
  { icon: 'bar_chart', label: 'Reports', path: '/app/reports' },
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

async function logout() {
  auth.logout();
  await router.replace('/login');
}
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

.bb-search-wrap {
  padding: 0 10px 14px;
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

.bb-search {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover { border-color: rgba(108, 78, 212, 0.4); }

  &-ph {
    font-size: 12px;
    color: #6E6E9A;
    flex: 1;
  }
}

.bb-kbd {
  font-size: 10px;
  color: #4D4D70;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 2px 5px;
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

</style>
