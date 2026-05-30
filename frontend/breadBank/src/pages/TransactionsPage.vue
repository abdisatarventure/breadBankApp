<template>
  <q-page class="bb-stub-page q-pa-lg">
    <div class="bb-page-header">
      <div class="bb-page-title">Transactions</div>
      <div class="bb-page-sub">All your transactions in one place — upload a CSV to get started</div>
    </div>
    <div class="bb-stub">
      <q-icon name="receipt_long" size="52px" class="bb-stub-icon" style="color:#6C4ED4" />
      <div class="bb-stub-title">No transactions yet</div>
      <div class="bb-stub-sub">Go to Upload to import your bank statements</div>
      <q-btn no-caps unelevated label="Upload CSV" to="/app/upload" style="background:linear-gradient(135deg,#6C4ED4,#E040FB);color:#fff;border-radius:8px;margin-top:8px" />
    </div>
  </q-page>
</template>
<script setup lang="ts"></script>
<style lang="scss">
.bb-stub-page { background-color: #0A0A1B; min-height: 100vh; }
</style>
