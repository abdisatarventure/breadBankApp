<template>
  <div class="bb-legal">
    <div class="bb-legal-wrap">
      <div class="bb-legal-back">
        <q-btn flat no-caps dense icon="arrow_back" label="Back" @click="goBack" />
      </div>

      <h1>Privacy Policy</h1>
      <p class="bb-legal-meta">Version {{ VERSION }} · Last updated {{ UPDATED }}</p>

      <p>
        BreadBank ("we", "the app") is a personal-finance dashboard that helps you see your
        spending, budgets, savings goals and net worth in one place. This policy explains what
        data we collect, why, who we share it with, and the control you have over it.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account details</strong> — your email address, a display name, a hashed
          password, and (optionally) a hashed security-question answer.</li>
        <li><strong>Financial data via Plaid</strong> — when you connect a bank, card or
          brokerage through Plaid, we receive transactions, balances, account and holding
          details for the accounts you choose to link.</li>
        <li><strong>Files you upload</strong> — CSV statements you import are parsed into
          transactions and stored in your account.</li>
        <li><strong>Usage records</strong> — minimal operational data such as AI-feature usage
          counts.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>
        Your data is used solely to provide the app to you: categorizing transactions, showing
        budgets, goals, bills, reports and net worth. We do <strong>not</strong> sell your data
        or use it for advertising.
      </p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li><strong>Plaid Inc.</strong> — provides the secure bank-connection service. Your bank
          credentials are entered directly into Plaid and are never seen or stored by us; we
          only hold the resulting access token (encrypted) and the account data Plaid returns.
          See Plaid's privacy policy at plaid.com/legal.</li>
        <li><strong>Anthropic (Claude)</strong> — if you use the optional AI features (AI chat,
          smart categorization or savings suggestions), the relevant financial context for that
          request is sent to Anthropic's API to generate a response. Don't use those features if
          you'd prefer no data leave the app.</li>
      </ul>
      <p>We share data with no one else except where required by law.</p>

      <h2>4. How we protect it</h2>
      <ul>
        <li>Passwords and security answers are <strong>hashed</strong> (bcrypt) — never stored in
          plain text.</li>
        <li>Plaid access tokens are <strong>encrypted at rest</strong> (AES-256-GCM).</li>
        <li>Access to your data is scoped to your account only; every request is authenticated.</li>
        <li>Traffic is served over encrypted transport (HTTPS/TLS).</li>
      </ul>

      <h2>5. Data retention &amp; deletion</h2>
      <p>
        We keep your data only while your account is active. You can permanently delete your
        account and all associated data at any time from <strong>Settings → Delete account</strong>.
        Doing so disconnects your linked Plaid items (so Plaid stops sharing data) and erases your
        transactions, accounts, goals, budgets and profile from our database.
      </p>

      <h2>6. Your consent</h2>
      <p>
        When you create an account you consent to the collection, processing and storage of your
        data as described here. Connecting a bank through Plaid is an additional, explicit choice
        you make per institution.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions or a data request? Contact the operator at
        <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const VERSION = '1.0';
const UPDATED = 'July 14, 2026';
const CONTACT = 'abdisatar.venture@gmail.com';

const router = useRouter();
function goBack() {
  if (window.history.length > 1) router.back();
  else void router.push('/login');
}
</script>

<style lang="scss">
.bb-legal { background: #0A0A1B; min-height: 100vh; padding: 32px 16px 64px; }
.bb-legal-wrap { max-width: 760px; margin: 0 auto; color: #C6C6E5; line-height: 1.65; }
.bb-legal-back { margin-bottom: 12px; }
.bb-legal-back .q-btn { color: #8B6FEC; }
.bb-legal h1 { font-size: 30px; font-weight: 800; color: #F8FAFF; margin: 8px 0 4px; }
.bb-legal h2 { font-size: 18px; font-weight: 700; color: #F1F1FB; margin: 28px 0 8px; }
.bb-legal-meta { font-size: 13px; color: #6E6E9A; margin-bottom: 20px; }
.bb-legal p { margin: 10px 0; }
.bb-legal ul { margin: 8px 0 8px 4px; padding-left: 20px; }
.bb-legal li { margin: 6px 0; }
.bb-legal a { color: #8B6FEC; text-decoration: none; }
.bb-legal a:hover { text-decoration: underline; }
.bb-legal strong { color: #E6E6F5; }
</style>
