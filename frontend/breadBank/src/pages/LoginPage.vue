<template>
  <div class="bb-login-page" :class="{ 'bb-app-ready': ready }">

    <!-- Boot / preloading screen: plays once, then dissolves as the login
         shell animates into place behind it. -->
    <transition name="bb-boot">
      <div v-if="booting" class="bb-boot">
        <div class="bb-boot-inner">
          <div class="bb-boot-logo">
            <div class="bb-boot-icon">
              <img src="icons/breadbank-logo.png" alt="BreadBank" style="width:100%;height:100%;object-fit:contain;background:transparent" />
            </div>
            <span class="bb-boot-name">BreadBank</span>
          </div>
          <div class="bb-boot-bar"><div class="bb-boot-bar-fill"></div></div>
          <div class="bb-boot-tag">Counting your bread…</div>
        </div>
      </div>
    </transition>

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
              <img src="icons/breadbank-logo.png" alt="BreadBank" style="width:100%;height:100%;object-fit:contain;background:transparent" />
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

            <div class="bb-demo-divider"><span>or</span></div>

            <q-btn
              no-caps outline
              icon="explore"
              label="Try the demo — no signup"
              class="bb-demo-btn"
              :loading="demoLoading"
              :disable="loading || demoLoading"
              @click="handleDemo"
            />

            <div class="bb-form-links">
              <span class="bb-link" @click="router.push('/register')">Create an account</span>
              <span class="bb-link" @click="openForgot">Forgot your password?</span>
            </div>
            <div class="bb-form-links" style="margin-top:10px">
              <span class="bb-link" @click="router.push('/privacy')">Privacy Policy</span>
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
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { auth } from 'src/services/auth';

// Boot screen → app handoff. `booting` shows the preloader; `ready` triggers the
// login shell's staggered entrance. They overlap briefly for a smooth crossfade.
const booting = ref(true);
const ready = ref(false);
const route = useRoute();

onMounted(() => {
  // Arrived here because the session-expiry watchdog logged the user out —
  // say so, otherwise the sudden login screen looks like a bug.
  if (route.query.expired === '1') {
    setTimeout(() => {
      $q.notify({ type: 'info', icon: 'schedule', message: 'Your session expired — please sign in again.' });
    }, 400);
  }
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    booting.value = false;
    ready.value = true;
    return;
  }
  window.setTimeout(() => { ready.value = true; }, 1300);   // shell starts revealing
  window.setTimeout(() => { booting.value = false; }, 1650); // preloader dissolves over it
});

const email = ref('');
const password = ref('');
const showPwd = ref(false);
const loading = ref(false);
const demoLoading = ref(false);
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
    // Privacy: start every session with amounts hidden. The user can reveal
    // them with the dashboard's eye toggle; next login hides them again.
    localStorage.setItem('bb_hide_amounts', '1');
    await router.push('/app/dashboard');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Login failed. Please try again.';
  } finally {
    loading.value = false;
  }
}

async function handleDemo() {
  errorMessage.value = '';
  demoLoading.value = true;
  try {
    await auth.demoLogin();
    // Demo data is static, so skip the auto Plaid sync; and show amounts (it's
    // a showcase with fake numbers, no privacy concern).
    sessionStorage.setItem('bb_synced_session', '1');
    localStorage.setItem('bb_hide_amounts', '0');
    // Kick off the guided walkthrough on the dashboard's first render.
    localStorage.setItem('bb_show_tour', '1');
    await router.push('/app/dashboard');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Could not start the demo. Please try again.';
  } finally {
    demoLoading.value = false;
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
    radial-gradient(1200px 600px at 15% 10%, rgba(var(--bb-accent-rgb), 0.18), transparent 60%),
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
  border: 1px solid var(--bb-border);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  // Hidden until the boot screen hands off (.bb-app-ready), then it rises in.
  opacity: 0;
}
.bb-app-ready .bb-login-shell {
  animation: bb-shell-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes bb-shell-in {
  from { opacity: 0; transform: translateY(22px) scale(0.97); }
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
  background: conic-gradient(from 0deg, rgba(var(--bb-accent-rgb),0.0), rgba(224,64,251,0.35), rgba(var(--bb-accent-rgb),0.0));
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
  span { font-size: 19px; font-weight: 700; color: var(--bb-text); letter-spacing: -0.2px; }
}
.bb-brand-icon {
  width: 40px; height: 40px; flex-shrink: 0;
  background: transparent;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(var(--bb-accent-rgb), 0.5);
}
.bb-art-copy { padding-bottom: 4px; }
.bb-art-title { font-size: 26px; line-height: 1.25; font-weight: 700; color: var(--bb-text); }
.bb-art-sub { margin-top: 10px; font-size: 13px; color: rgba(248, 250, 255, 0.7); max-width: 280px; }

/* ── Form panel ───────────────────────────────────────────── */
.bb-login-form {
  flex: 1 1 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: var(--bb-surface);
}
.bb-form-inner { width: 100%; max-width: 320px; }

.bb-login-title { font-size: 28px; font-weight: 700; color: var(--bb-text); }
.bb-login-sub { font-size: 13px; color: var(--bb-text-dim); margin-top: 6px; }

// Staggered entrance, kicked off once the boot screen hands off (.bb-app-ready)
// so everything slides into place together after the preloader.
@keyframes bb-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
// Button gets an opacity-only entrance so its persisted final transform can't
// fight the hover-lift below.
@keyframes bb-fade { from { opacity: 0; } to { opacity: 1; } }

.bb-app-ready {
  // Art panel content
  .bb-brand      { animation: bb-rise 0.6s ease both 0.18s; }
  .bb-art-title  { animation: bb-rise 0.6s ease both 0.30s; }
  .bb-art-sub    { animation: bb-rise 0.6s ease both 0.42s; }

  // Form panel content
  .bb-login-title { animation: bb-rise 0.5s ease both 0.20s; }
  .bb-login-sub   { animation: bb-rise 0.5s ease both 0.28s; }
  .bb-form .bb-uinput:nth-of-type(1) { animation: bb-rise 0.5s ease both 0.36s; }
  .bb-form .bb-uinput:nth-of-type(2) { animation: bb-rise 0.5s ease both 0.44s; }
  .bb-login-btn  { animation: bb-fade 0.5s ease both 0.52s; }
  .bb-form-links { animation: bb-rise 0.5s ease both 0.60s; }
}

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
    border: 1px solid var(--bb-border);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
    // Quasar draws its own underline via ::before/::after — hide it.
    &::before, &::after { display: none; }
  }
  .q-field__control:hover { border-color: var(--bb-border); }
  &.q-field--focused .q-field__control {
    border-color: var(--bb-accent-light);
    box-shadow: 0 0 0 3px rgba(var(--bb-accent-rgb), 0.18);
  }

  // Keep the appended icon flush inside the box (no fixed marginal height).
  .q-field__marginal { height: auto; color: var(--bb-text-dim); }
  .q-field__append { padding-left: 8px; }
  &.q-field--focused .q-field__append .q-icon { color: var(--bb-accent-light); transition: color 0.3s ease; }

  .q-field__native { color: var(--bb-text); font-size: 14px; }
  .q-field__native::placeholder { color: var(--bb-text-dim); }

  // Stop Chrome/Safari autofill from painting the field light, and match it to
  // the field colour so the icon area doesn't look like a separate box.
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  input:-webkit-autofill:active {
    -webkit-text-fill-color: var(--bb-text) !important;
    -webkit-box-shadow: 0 0 0 1000px $field-bg inset !important;
    caret-color: var(--bb-text);
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
  color: var(--bb-text) !important;
  background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2)) !important;
  background-size: 180% 180% !important;
  box-shadow: 0 8px 24px rgba(var(--bb-accent-rgb), 0.35);
  transition: transform 0.25s ease, box-shadow 0.25s ease, background-position 0.6s ease;

  &:hover {
    transform: translateY(-2px);
    background-position: 100% 100% !important;
    box-shadow: 0 14px 34px rgba(var(--bb-accent-rgb), 0.55);
  }
  &:active { transform: translateY(0); }
}

/* "or" divider between Login and the Demo button */
.bb-demo-divider {
  display: flex; align-items: center; gap: 12px;
  margin: 16px 0 12px;
  color: var(--bb-text-dim); font-size: 12px;
}
.bb-demo-divider::before, .bb-demo-divider::after {
  content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.12);
}

.bb-demo-btn {
  width: 100%;
  height: 48px;
  font-size: 14px !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
  color: var(--bb-accent-light) !important;
  border: 1px solid rgba(var(--bb-accent-rgb), 0.5) !important;
  transition: background 0.2s ease, transform 0.2s ease;

  &:hover { background: rgba(var(--bb-accent-rgb), 0.12) !important; transform: translateY(-1px); }
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
  color: var(--bb-accent-light);
  cursor: pointer;
  transition: color 0.2s ease;
  &:hover { color: var(--bb-accent-2); }
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
  background: var(--bb-surface) !important;
  border: 1px solid var(--bb-border);
  border-radius: 16px;
}
.bb-forgot-title { font-size: 19px; font-weight: 700; color: var(--bb-text); margin-bottom: 6px; }
.bb-forgot-sub { font-size: 13px; color: var(--bb-text-soft); margin-bottom: 16px; line-height: 1.4; }
.bb-forgot-input {
  .q-field__control { background: rgba(255, 255, 255, 0.04) !important; }
  &.q-field--outlined .q-field__control:before { border-color: var(--bb-border) !important; }
  &.q-field--focused.q-field--outlined .q-field__control:before { border-color: var(--bb-accent) !important; }
}

/* ── Boot / preloading screen ─────────────────────────────── */
.bb-boot {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(1200px 600px at 15% 10%, rgba(var(--bb-accent-rgb), 0.22), transparent 60%),
    radial-gradient(900px 500px at 90% 90%, rgba(224, 64, 251, 0.18), transparent 60%),
    #070714;

  // Two soft glows drifting behind the logo for depth.
  &::before, &::after {
    content: '';
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    mix-blend-mode: screen;
    opacity: 0.55;
  }
  &::before {
    width: 380px; height: 380px; top: 12%; left: 14%;
    background: radial-gradient(circle at 35% 30%, #9b7bff, #6c4ed4 50%, transparent 72%);
    animation: bb-float-1 14s ease-in-out infinite alternate;
  }
  &::after {
    width: 320px; height: 320px; bottom: 10%; right: 14%;
    background: radial-gradient(circle at 35% 30%, #ff7ce0, #e040fb 52%, transparent 74%);
    animation: bb-float-2 18s ease-in-out infinite alternate;
  }
}

.bb-boot-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
}

.bb-boot-logo { display: flex; align-items: center; gap: 16px; }

.bb-boot-icon {
  width: 64px; height: 64px; flex-shrink: 0;
  border-radius: 18px;
  background: transparent;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 12px 44px rgba(var(--bb-accent-rgb), 0.6);
  animation:
    bb-boot-pop 0.8s cubic-bezier(0.22, 1, 0.36, 1) both,
    bb-boot-pulse 2.2s ease-in-out 0.8s infinite;
}

.bb-boot-name {
  font-size: 30px; font-weight: 800; letter-spacing: -0.5px;
  background: linear-gradient(90deg, #ffffff 0%, #c9b6ff 50%, #ffffff 100%);
  background-size: 220% auto;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
  animation:
    bb-boot-reveal 0.7s ease 0.25s both,
    bb-boot-shimmer 2.6s linear 1s infinite;
}

.bb-boot-bar {
  width: 190px; height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.bb-boot-bar-fill {
  height: 100%; width: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #6C4ED4, #E040FB);
  transform-origin: left center;
  transform: scaleX(0);
  animation: bb-boot-fill 1.5s cubic-bezier(0.6, 0, 0.2, 1) 0.2s forwards;
}

.bb-boot-tag {
  font-size: 12px; letter-spacing: 0.3px;
  color: rgba(248, 250, 255, 0.55);
  animation: bb-boot-reveal 0.7s ease 0.5s both;
}

@keyframes bb-boot-pop {
  0%   { opacity: 0; transform: scale(0.4) rotate(-14deg); }
  60%  { opacity: 1; transform: scale(1.1) rotate(4deg); }
  100% { opacity: 1; transform: none; }
}
@keyframes bb-boot-pulse {
  0%, 100% { box-shadow: 0 12px 40px rgba(var(--bb-accent-rgb), 0.45); }
  50%      { box-shadow: 0 12px 64px rgba(224, 64, 251, 0.8); }
}
@keyframes bb-boot-reveal { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes bb-boot-shimmer { to { background-position: 220% center; } }
@keyframes bb-boot-fill { to { transform: scaleX(1); } }

// Exit: the whole boot screen fades and zooms out, revealing the shell beneath.
.bb-boot-leave-active { transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1); }
.bb-boot-leave-to { opacity: 0; transform: scale(1.08); }

/* ── Responsive: stack and drop the art panel on small screens ─ */
@media (max-width: 820px) {
  .bb-login-art { display: none; }
  .bb-login-shell { max-width: 420px; min-height: 0; }
  .bb-login-form { padding: 36px 28px; }
}

/* Respect users who prefer reduced motion. The boot screen is skipped in JS, so
   just make sure the shell (hidden by default) is shown without animation. */
@media (prefers-reduced-motion: reduce) {
  .bb-orb, .bb-orb--ring, .bb-login-shell,
  .bb-login-title, .bb-login-sub, .bb-uinput, .bb-login-btn, .bb-form-links,
  .bb-brand, .bb-art-title, .bb-art-sub {
    animation: none;
  }
  .bb-login-shell { opacity: 1; }
}
</style>
