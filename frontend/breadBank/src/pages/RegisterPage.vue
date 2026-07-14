<template>
  <div class="bb-login-page flex flex-center">
    <div class="bb-login-card">
      <div class="bb-login-logo">
        <div class="bb-login-logo-icon">
          <q-icon name="account_balance_wallet" size="26px" color="white" />
        </div>
        <span>BreadBank</span>
      </div>

      <div class="bb-login-title">Create your account</div>
      <div class="bb-login-sub">Start tracking spending and importing statements</div>

      <q-form class="q-mt-lg" @submit.prevent="handleRegister">
        <q-banner v-if="errorMessage" class="bb-error-banner" dense type="negative">
          {{ errorMessage }}
        </q-banner>

        <div class="bb-field-label">Name</div>
        <q-input
          v-model="name"
          type="text"
          placeholder="Your full name"
          outlined dense dark
          class="bb-input q-mb-md"
        />

        <div class="bb-field-label">Email</div>
        <q-input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          outlined dense dark
          class="bb-input q-mb-md"
        />

        <div class="bb-field-label">Password</div>
        <q-input
          v-model="password"
          :type="showPwd ? 'text' : 'password'"
          placeholder="••••••••"
          outlined dense dark
          class="bb-input q-mb-xs"
        >
          <template #append>
            <q-icon
              :name="showPwd ? 'visibility_off' : 'visibility'"
              class="cursor-pointer"
              style="color: var(--bb-text-dim)"
              @click="showPwd = !showPwd"
            />
          </template>
        </q-input>

        <div class="bb-field-label q-mt-md">Security question</div>
        <q-select
          v-model="securityQuestion"
          :options="securityQuestions"
          placeholder="Choose a question"
          outlined dense dark
          options-dark
          class="bb-input q-mb-md"
          popup-content-class="bb-select-popup"
        />

        <div class="bb-field-label">Answer</div>
        <q-input
          v-model="securityAnswer"
          type="text"
          placeholder="Used if you forget your password"
          outlined dense dark
          class="bb-input q-mb-md"
        />

        <div class="bb-consent q-mb-md">
          <q-checkbox v-model="consent" dense dark size="sm" color="deep-purple-4" />
          <span>
            I agree to the
            <a href="#/privacy" target="_blank" rel="noopener">Privacy Policy</a>
            and consent to the collection, processing and storage of my financial data as described.
          </span>
        </div>

        <q-btn
          type="submit"
          no-caps unelevated
          label="Create Account"
          class="bb-login-btn full-width q-mb-md"
          :loading="loading"
          :disable="!canSubmit || loading"
        />

        <div class="bb-divider"><span>or</span></div>

        <div class="text-center q-mt-md">
          <span class="bb-signup-txt">Already have an account? </span>
          <span class="bb-signup-link" @click="router.push('/login')">Sign in</span>
        </div>
      </q-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth, SECURITY_QUESTIONS } from 'src/services/auth';

const name = ref('');
const email = ref('');
const password = ref('');
const securityQuestion = ref<string | null>(null);
const securityAnswer = ref('');
const securityQuestions = SECURITY_QUESTIONS;
const showPwd = ref(false);
const consent = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const router = useRouter();

const emailIsValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value));
const canSubmit = computed(() =>
  email.value.trim().length > 0 &&
  password.value.trim().length > 0 &&
  Boolean(securityQuestion.value) &&
  securityAnswer.value.trim().length > 0 &&
  consent.value,
);

async function handleRegister() {
  errorMessage.value = '';

  if (!email.value.trim() || !password.value.trim()) {
    errorMessage.value = 'Email and password are required.';
    return;
  }

  if (!emailIsValid.value) {
    errorMessage.value = 'Please enter a valid email address.';
    return;
  }

  if (!securityQuestion.value || !securityAnswer.value.trim()) {
    errorMessage.value = 'Please choose a security question and answer — it lets you reset your password later.';
    return;
  }

  if (!consent.value) {
    errorMessage.value = 'Please accept the Privacy Policy to create an account.';
    return;
  }

  loading.value = true;

  try {
    await auth.register(
      email.value,
      password.value,
      name.value,
      securityQuestion.value,
      securityAnswer.value,
      consent.value,
    );
    await auth.login(email.value, password.value);
    await router.push('/app/dashboard');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Registration failed. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss">
.bb-login-page {
  background: var(--bb-bg);
  min-height: 100vh;
}

.bb-login-card {
  width: 100%;
  max-width: 400px;
  background: var(--bb-surface);
  border: 1px solid var(--bb-border);
  border-radius: 18px;
  padding: 40px 36px;
}

.bb-login-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;

  &-icon {
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2));
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  span {
    font-size: 20px;
    font-weight: 700;
    color: var(--bb-text);
  }
}

.bb-login-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--bb-text);
  margin-bottom: 6px;
}

.bb-login-sub {
  font-size: 13px;
  color: var(--bb-text-dim);
}

.bb-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--bb-text-soft);
  margin-bottom: 6px;
}

.bb-input {
  .q-field__control {
    background: rgba(255, 255, 255, 0.04) !important;
  }

  &.q-field--outlined .q-field__control:before {
    border-color: var(--bb-border) !important;
  }

  &.q-field--focused.q-field--outlined .q-field__control:before {
    border-color: var(--bb-accent) !important;
  }
}

.bb-login-btn {
  background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2)) !important;
  color: var(--bb-text) !important;
  height: 44px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  border-radius: 10px !important;
}

.bb-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--bb-text-muted);
  font-size: 12px;

  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
  }
}

.bb-consent {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--bb-text-dim);
  line-height: 1.5;

  a { color: var(--bb-accent-light); text-decoration: none; }
  a:hover { text-decoration: underline; }
}

.bb-signup-txt {
  font-size: 13px;
  color: var(--bb-text-dim);
}

.bb-signup-link {
  font-size: 13px;
  color: var(--bb-accent-light);
  cursor: pointer;
  font-weight: 500;

  &:hover { color: var(--bb-accent-2); }
}
</style>
