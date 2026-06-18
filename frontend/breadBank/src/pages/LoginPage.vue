<template>
  <div class="bb-login-page">
    <div class="bb-login-shell">

      <!-- Animated visual panel -->
      <div class="bb-login-art">
        <div class="bb-orbs">
          <span class="bb-orb bb-orb--1"></span>
          <span class="bb-orb bb-orb--2"></span>
          <span class="bb-orb bb-orb--3"></span>
          <span class="bb-orb bb-orb--4"></span>
          <span class="bb-orb bb-orb--5"></span>
          <span class="bb-orb bb-orb--ring"></span>
        </div>

        <div class="bb-art-content">
          <div class="bb-brand">
            <div class="bb-brand-icon">
              <q-icon name="account_balance_wallet" size="22px" color="white" />
            </div>
            <span>BreadBank</span>
          </div>
          <div class="bb-art-copy">
            <div class="bb-art-title">Smarter money,<br />beautifully simple.</div>
            <div class="bb-art-sub">AI-powered insight into every dollar you spend.</div>
          </div>
        </div>
      </div>

      <!-- Form panel -->
      <div class="bb-login-form">
        <div class="bb-form-inner">
          <div class="bb-login-title">Login</div>
          <div class="bb-login-sub">Welcome back — sign in to continue</div>

          <q-form class="bb-form" @submit.prevent="handleLogin">
            <q-banner v-if="errorMessage" class="bb-error-banner q-mb-md" dense rounded>
              {{ errorMessage }}
            </q-banner>

            <q-input
              v-model="email"
              type="email"
              placeholder="Email"
              borderless dark
              class="bb-uinput"
            >
              <template #append>
                <q-icon name="mail_outline" size="18px" />
              </template>
            </q-input>

            <q-input
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              placeholder="Password"
              borderless dark
              class="bb-uinput"
            >
              <template #append>
                <q-icon
                  :name="showPwd ? 'visibility_off' : 'lock_outline'"
                  size="18px"
                  class="cursor-pointer"
                  @click="showPwd = !showPwd"
                />
              </template>
            </q-input>

            <q-btn
              type="submit"
              no-caps unelevated
              label="Login"
              class="bb-login-btn"
              :loading="loading"
              :disable="!canSubmit || loading"
            />

            <div class="bb-form-links">
              <span class="bb-link" @click="router.push('/register')">Create an account</span>
              <span class="bb-link" @click="openForgot">Forgot your password?</span>
            </div>
          </q-form>
        </div>
      </div>

    </div>

    <!-- Forgot-password dialog -->
    <q-dialog v-model="forgotOpen">
      <q-card class="bb-forgot-card" dark>
        <div class="bb-forgot-title">Reset password</div>

        <q-banner v-if="forgotError" class="bb-error-banner q-mb-md" dense rounded>
          {{ forgotError }}
        </q-banner>

        <template v-if="forgotStep === 'email'">
          <div class="bb-forgot-sub">Enter your email and we'll show your security question.</div>
          <q-input
            v-model="forgotEmail"
            type="email"
            placeholder="Email"
            outlined dense dark
            class="bb-forgot-input"
            @keyup.enter="fetchQuestion"
          />
          <q-btn
            no-caps unelevated label="Continue"
            class="bb-login-btn full-width q-mt-md"
            :loading="forgotLoading"
            @click="fetchQuestion"
          />
        </template>

        <template v-else>
          <div class="bb-forgot-sub">{{ forgotQuestion }}</div>
          <q-input
            v-model="forgotAnswer"
            type="text"
            placeholder="Your answer"
            outlined dense dark
            class="bb-forgot-input q-mb-sm"
          />
          <q-input
            v-model="forgotNewPwd"
            type="password"
            placeholder="New password (min 8 chars)"
            outlined dense dark
            class="bb-forgot-input"
            @keyup.enter="submitReset"
          />
          <q-btn
            no-caps unelevated label="Reset password"
            class="bb-login-btn full-width q-mt-md"
            :loading="forgotLoading"
            @click="submitReset"
          />
        </template>

        <div class="text-center q-mt-md">
          <span class="bb-link" @click="forgotOpen = false">Cancel</span>
        </div>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { auth } from 'src/services/auth';

const email = ref('');
const password = ref('');
const showPwd = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const router = useRouter();
const $q = useQuasar();

// ── Forgot-password (security question) dialog ────────────────────────
const forgotOpen = ref(false);
const forgotStep = ref<'email' | 'reset'>('email');
const forgotEmail = ref('');
const forgotQuestion = ref('');
const forgotAnswer = ref('');
const forgotNewPwd = ref('');
const forgotError = ref('');
const forgotLoading = ref(false);

function openForgot() {
  forgotStep.value = 'email';
  forgotEmail.value = email.value.trim();
  forgotQuestion.value = '';
  forgotAnswer.value = '';
  forgotNewPwd.value = '';
  forgotError.value = '';
  forgotOpen.value = true;
}

async function fetchQuestion() {
  forgotError.value = '';
  if (!forgotEmail.value.trim()) {
    forgotError.value = 'Enter your email first.';
    return;
  }
  forgotLoading.value = true;
  try {
    const { question } = await auth.getSecurityQuestion(forgotEmail.value);
    forgotQuestion.value = question;
    forgotStep.value = 'reset';
  } catch (err) {
    forgotError.value = err instanceof Error ? err.message : 'Could not find a security question for that email.';
  } finally {
    forgotLoading.value = false;
  }
}

async function submitReset() {
  forgotError.value = '';
  if (!forgotAnswer.value.trim() || !forgotNewPwd.value.trim()) {
    forgotError.value = 'Enter your answer and a new password.';
    return;
  }
  if (forgotNewPwd.value.length < 8) {
    forgotError.value = 'New password must be at least 8 characters.';
    return;
  }
  forgotLoading.value = true;
  try {
    await auth.resetPassword(forgotEmail.value, forgotAnswer.value, forgotNewPwd.value);
    forgotOpen.value = false;
    email.value = forgotEmail.value;
    $q.notify({ message: 'Password reset — you can sign in now.', color: 'green-8', position: 'top', timeout: 4000 });
  } catch (err) {
    forgotError.value = err instanceof Error ? err.message : 'Could not reset your password.';
  } finally {
    forgotLoading.value = false;
  }
}

const emailIsValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value));
const canSubmit = computed(() => email.value.trim().length > 0 && password.value.trim().length > 0);

async function handleLogin() {
  errorMessage.value = '';

  if (!email.value.trim() || !password.value.trim()) {
    errorMessage.value = 'Email and password are required.';
    return;
  }

  if (!emailIsValid.value) {
    errorMessage.value = 'Please enter a valid email address.';
    return;
  }

  loading.value = true;

  try {
    await auth.login(email.value, password.value);
    // Tell the dashboard to pull fresh bank data once, on this login.
    sessionStorage.setItem('bb_sync_on_login', '1');
    await router.push('/app/dashboard');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Login failed. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss">
.bb-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(1200px 600px at 15% 10%, rgba(108, 78, 212, 0.18), transparent 60%),
    radial-gradient(900px 500px at 90% 90%, rgba(224, 64, 251, 0.14), transparent 60%),
    #070714;
}

.bb-login-shell {
  display: flex;
  width: 100%;
  max-width: 920px;
  min-height: 520px;
  border-radius: 24px;
  overflow: hidden;
  background: #0F0F26;
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  animation: bb-shell-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes bb-shell-in {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}

/* ── Visual panel ─────────────────────────────────────────── */
.bb-login-art {
  position: relative;
  flex: 1 1 50%;
  overflow: hidden;
  background: linear-gradient(150deg, #241252 0%, #15103a 45%, #0a0a1f 100%);
}

.bb-orbs { position: absolute; inset: 0; }

.bb-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(14px);
  opacity: 0.85;
  will-change: transform;
  mix-blend-mode: screen;
}

.bb-orb--1 {
  width: 240px; height: 240px; top: 8%; left: 6%;
  background: radial-gradient(circle at 32% 30%, #9b7bff, #6c4ed4 46%, transparent 72%);
  animation: bb-float-1 15s ease-in-out infinite alternate;
}
.bb-orb--2 {
  width: 200px; height: 200px; top: 44%; left: 36%;
  background: radial-gradient(circle at 30% 30%, #ff7ce0, #e040fb 48%, transparent 72%);
  animation: bb-float-2 19s ease-in-out infinite alternate;
}
.bb-orb--3 {
  width: 170px; height: 170px; top: 60%; left: 4%;
  background: radial-gradient(circle at 30% 30%, #7c6bff, #4f46e5 50%, transparent 73%);
  animation: bb-float-3 17s ease-in-out infinite alternate;
}
.bb-orb--4 {
  width: 150px; height: 150px; top: 6%; left: 52%;
  background: radial-gradient(circle at 30% 30%, #ff9ad1, #c026c9 52%, transparent 74%);
  animation: bb-float-4 21s ease-in-out infinite alternate;
}
.bb-orb--5 {
  width: 120px; height: 120px; top: 72%; left: 54%;
  background: radial-gradient(circle at 30% 30%, #b69bff, #7c3aed 52%, transparent 74%);
  animation: bb-float-1 23s ease-in-out infinite alternate;
}
/* A faint slow-rotating ring for extra depth. */
.bb-orb--ring {
  width: 360px; height: 360px; top: 50%; left: 50%;
  margin: -180px 0 0 -180px;
  background: conic-gradient(from 0deg, rgba(108,78,212,0.0), rgba(224,64,251,0.35), rgba(108,78,212,0.0));
  filter: blur(30px);
  opacity: 0.5;
  mix-blend-mode: screen;
  animation: bb-spin 28s linear infinite;
}

@keyframes bb-float-1 { from { transform: translate(0, 0) scale(1); } to { transform: translate(46px, -34px) scale(1.16); } }
@keyframes bb-float-2 { from { transform: translate(0, 0) scale(1.05); } to { transform: translate(-40px, 30px) scale(0.9); } }
@keyframes bb-float-3 { from { transform: translate(0, 0) scale(0.95); } to { transform: translate(34px, -28px) scale(1.12); } }
@keyframes bb-float-4 { from { transform: translate(0, 0) scale(1); } to { transform: translate(-30px, 36px) scale(1.18); } }
@keyframes bb-spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.bb-art-content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 32px;
}

.bb-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  span { font-size: 19px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px; }
}
.bb-brand-icon {
  width: 40px; height: 40px; flex-shrink: 0;
  background: linear-gradient(135deg, #6C4ED4, #E040FB);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(108, 78, 212, 0.5);
}
.bb-art-copy { padding-bottom: 4px; }
.bb-art-title { font-size: 26px; line-height: 1.25; font-weight: 700; color: #F8FAFF; }
.bb-art-sub { margin-top: 10px; font-size: 13px; color: rgba(248, 250, 255, 0.7); max-width: 280px; }

/* ── Form panel ───────────────────────────────────────────── */
.bb-login-form {
  flex: 1 1 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: #0F1030;
}
.bb-form-inner { width: 100%; max-width: 320px; }

.bb-login-title { font-size: 28px; font-weight: 700; color: #ffffff; animation: bb-rise 0.5s ease both; }
.bb-login-sub { font-size: 13px; color: #6E6E9A; margin-top: 6px; animation: bb-rise 0.5s ease both 0.06s; }

// Staggered entrance for the form, so the panel feels alive on load.
@keyframes bb-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
// Button gets an opacity-only entrance so its persisted final transform can't
// fight the hover-lift below.
@keyframes bb-fade { from { opacity: 0; } to { opacity: 1; } }
.bb-form .bb-uinput:nth-of-type(1) { animation: bb-rise 0.5s ease both 0.12s; }
.bb-form .bb-uinput:nth-of-type(2) { animation: bb-rise 0.5s ease both 0.18s; }
.bb-login-btn  { animation: bb-fade 0.5s ease both 0.24s; }
.bb-form-links { animation: bb-rise 0.5s ease both 0.30s; }

.bb-form { margin-top: 30px; }

.bb-uinput {
  margin-bottom: 16px;

  // Solid field colour. The native input, the icon area, and the autofill fill
  // all use this exact value so the field reads as one seamless rounded box
  // (no two-tone seam where the icon sits).
  $field-bg: #17162F;

  .q-field__control {
    height: 52px;
    padding: 0 14px;
    background: $field-bg;
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
    // Quasar draws its own underline via ::before/::after — hide it.
    &::before, &::after { display: none; }
  }
  .q-field__control:hover { border-color: rgba(255, 255, 255, 0.22); }
  &.q-field--focused .q-field__control {
    border-color: #8B6FEC;
    box-shadow: 0 0 0 3px rgba(139, 111, 236, 0.18);
  }

  // Keep the appended icon flush inside the box (no fixed marginal height).
  .q-field__marginal { height: auto; color: #6E6E9A; }
  .q-field__append { padding-left: 8px; }
  &.q-field--focused .q-field__append .q-icon { color: #8B6FEC; transition: color 0.3s ease; }

  .q-field__native { color: #F8FAFF; font-size: 14px; }
  .q-field__native::placeholder { color: #6E6E9A; }

  // Stop Chrome/Safari autofill from painting the field light, and match it to
  // the field colour so the icon area doesn't look like a separate box.
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  input:-webkit-autofill:active {
    -webkit-text-fill-color: #F8FAFF !important;
    -webkit-box-shadow: 0 0 0 1000px $field-bg inset !important;
    caret-color: #F8FAFF;
    transition: background-color 9999s ease-out 0s;
  }
}

.bb-login-btn {
  width: 100%;
  height: 50px;
  margin-top: 10px;
  font-size: 14px !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
  color: #ffffff !important;
  background: linear-gradient(135deg, #6C4ED4, #E040FB) !important;
  background-size: 180% 180% !important;
  box-shadow: 0 8px 24px rgba(108, 78, 212, 0.35);
  transition: transform 0.25s ease, box-shadow 0.25s ease, background-position 0.6s ease;

  &:hover {
    transform: translateY(-2px);
    background-position: 100% 100% !important;
    box-shadow: 0 14px 34px rgba(108, 78, 212, 0.55);
  }
  &:active { transform: translateY(0); }
}

.bb-form-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
}
.bb-link {
  font-size: 12.5px;
  color: #8B6FEC;
  cursor: pointer;
  transition: color 0.2s ease;
  &:hover { color: #E040FB; }
}

.bb-error-banner {
  background: rgba(239, 68, 68, 0.12) !important;
  color: #ffb4b4 !important;
  border: 1px solid rgba(239, 68, 68, 0.3);
  font-size: 12.5px;
}

/* ── Forgot-password dialog ───────────────────────────────── */
.bb-forgot-card {
  width: 360px;
  max-width: 90vw;
  padding: 28px 26px;
  background: #0F1030 !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}
.bb-forgot-title { font-size: 19px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.bb-forgot-sub { font-size: 13px; color: #9090B8; margin-bottom: 16px; line-height: 1.4; }
.bb-forgot-input {
  .q-field__control { background: rgba(255, 255, 255, 0.04) !important; }
  &.q-field--outlined .q-field__control:before { border-color: rgba(255, 255, 255, 0.1) !important; }
  &.q-field--focused.q-field--outlined .q-field__control:before { border-color: #6C4ED4 !important; }
}

/* ── Responsive: stack and drop the art panel on small screens ─ */
@media (max-width: 820px) {
  .bb-login-art { display: none; }
  .bb-login-shell { max-width: 420px; min-height: 0; }
  .bb-login-form { padding: 36px 28px; }
}

/* Respect users who prefer reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .bb-orb, .bb-orb--ring, .bb-login-shell,
  .bb-login-title, .bb-login-sub, .bb-uinput, .bb-login-btn, .bb-form-links {
    animation: none;
  }
}
</style>
