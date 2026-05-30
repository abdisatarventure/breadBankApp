<template>
  <q-page class="bb-upload-page q-pa-lg">

    <div class="bb-page-header">
      <div class="bb-page-title">Upload Statements</div>
      <div class="bb-page-sub">Import CSV files from your bank or credit card accounts</div>
    </div>

    <!-- Account selector -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div
        v-for="account in accounts"
        :key="account.id"
        class="col-6 col-md-3"
      >
        <div
          class="bb-account-card"
          :class="{ 'bb-account-card--active': selectedAccount === account.id }"
          @click="selectedAccount = account.id"
        >
          <q-icon :name="account.icon" size="22px" :style="{ color: account.color }" />
          <div class="bb-account-name">{{ account.name }}</div>
          <div class="bb-account-type">{{ account.type }}</div>
        </div>
      </div>
    </div>

    <!-- Drop Zone -->
    <div
      class="bb-drop-zone"
      :class="{ 'bb-drop-zone--active': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".csv"
        style="display:none"
        @change="handleFileChange"
      />
      <div class="bb-drop-icon">
        <q-icon name="cloud_upload" size="40px" style="color: #6C4ED4; opacity: 0.7" />
      </div>
      <div class="bb-drop-title">
        {{ isDragging ? 'Drop your CSV here' : 'Drag & drop your CSV file here' }}
      </div>
      <div class="bb-drop-sub">or click to browse · supports .csv files</div>
      <q-chip
        v-if="selectedAccount"
        class="q-mt-sm"
        style="background: rgba(108,78,212,0.15); color: #8B6FEC"
      >
        {{ accounts.find(a => a.id === selectedAccount)?.name }}
      </q-chip>
    </div>

    <!-- How to export tips -->
    <div class="row q-col-gutter-md q-mt-lg">
      <div v-for="tip in exportTips" :key="tip.bank" class="col-12 col-md-4">
        <div class="bb-tip-card">
          <div class="bb-tip-header">
            <q-icon :name="tip.icon" size="16px" :style="{ color: tip.color }" />
            <span class="bb-tip-bank">{{ tip.bank }}</span>
          </div>
          <ol class="bb-tip-steps">
            <li v-for="step in tip.steps" :key="step">{{ step }}</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- Recent Uploads -->
    <div class="bb-recent q-mt-lg">
      <div class="bb-recent-title">Recent Uploads</div>
      <div class="bb-empty-uploads">
        <q-icon name="history" size="32px" style="color: #3D3D5C" />
        <span>No uploads yet — import your first statement above</span>
      </div>
    </div>

  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Account {
  id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
}

const selectedAccount = ref('wells-fargo');
const isDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const accounts: Account[] = [
  { id: 'wells-fargo', name: 'Wells Fargo', type: 'Checking / Savings', icon: 'account_balance', color: '#EF4444' },
  { id: 'apple-card', name: 'Apple Card', type: 'Credit Card', icon: 'credit_card', color: '#9090B8' },
  { id: 'discover', name: 'Discover', type: 'Credit Card', icon: 'credit_card', color: '#F59E0B' },
  { id: 'other', name: 'Other', type: 'Any account', icon: 'add_card', color: '#6C4ED4' },
];

const exportTips = [
  {
    bank: 'Wells Fargo',
    icon: 'account_balance',
    color: '#EF4444',
    steps: [
      'Log in at wellsfargo.com',
      'Go to Account Activity',
      'Click Download Activity',
      'Select CSV format & date range',
    ],
  },
  {
    bank: 'Apple Card',
    icon: 'credit_card',
    color: '#9090B8',
    steps: [
      'Open Wallet app on iPhone',
      'Tap Apple Card',
      'Tap the ··· menu',
      'Select Download Transactions',
    ],
  },
  {
    bank: 'Discover',
    icon: 'credit_card',
    color: '#F59E0B',
    steps: [
      'Log in at discover.com',
      'Go to Manage > Activity',
      'Click Download Transactions',
      'Choose CSV format',
    ],
  },
];

function triggerFileInput() {
  fileInput.value?.click();
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) processFile(file);
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) processFile(file);
}

function processFile(file: File) {
  // TODO: send to backend for parsing
  console.log('File selected:', file.name, 'Account:', selectedAccount.value);
}
</script>

<style lang="scss">
.bb-upload-page {
  background-color: #0A0A1B;
  min-height: 100vh;
}

.bb-account-card {
  background: #0F1030;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &:hover {
    border-color: rgba(108, 78, 212, 0.3);
    background: #141440;
  }

  &--active {
    border-color: #6C4ED4 !important;
    background: rgba(108, 78, 212, 0.1) !important;
  }
}

.bb-account-name {
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
}

.bb-account-type {
  font-size: 11px;
  color: #6E6E9A;
}

.bb-drop-zone {
  background: #0F1030;
  border: 2px dashed rgba(108, 78, 212, 0.25);
  border-radius: 16px;
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(108, 78, 212, 0.5);
    background: rgba(108, 78, 212, 0.04);
  }

  &--active {
    border-color: #6C4ED4 !important;
    background: rgba(108, 78, 212, 0.08) !important;
  }
}

.bb-drop-icon { margin-bottom: 8px; }

.bb-drop-title {
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
}

.bb-drop-sub {
  font-size: 12px;
  color: #6E6E9A;
}

.bb-tip-card {
  background: #0F1030;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px;
}

.bb-tip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.bb-tip-bank {
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
}

.bb-tip-steps {
  padding-left: 16px;
  margin: 0;

  li {
    font-size: 12px;
    color: #6E6E9A;
    line-height: 1.8;
  }
}

.bb-recent { }

.bb-recent-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 12px;
}

.bb-empty-uploads {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px;
  background: #0F1030;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  color: #3D3D5C;
  font-size: 13px;
}
</style>
