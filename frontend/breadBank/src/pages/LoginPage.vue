<template>
  <div class="bb-login-page flex flex-center">
    <div class="bb-login-card">

      <!-- Logo -->
      <div class="bb-login-logo">
        <div class="bb-login-logo-icon">
          <q-icon name="account_balance_wallet" size="26px" color="white" />
        </div>
        <span>BreadBank</span>
      </div>

      <div class="bb-login-title">Sign in to your account</div>
      <div class="bb-login-sub">Track your spending with AI-powered insights</div>

      <q-form class="q-mt-lg" @submit.prevent="handleLogin">
        <q-banner v-if="errorMessage" class="bb-error-banner" dense type="negative">
          {{ errorMessage }}
        </q-banner>

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
              style="color: #6E6E9A"
              @click="showPwd = !showPwd"
            />
          </template>
        </q-input>

        <div class="bb-forgot q-mb-lg" @click="showForgotNotice">Forgot password?</div>

        <q-btn
          type="submit"
          no-caps unelevated
          label="Sign In"
          class="bb-login-btn full-width q-mb-md"
          :loading="loading"
          :disable="!canSubmit || loading"
        />

        <div class="bb-divider"><span>or</span></div>

        <div class="text-center q-mt-md">
          <span class="bb-signup-txt">Don't have an account? </span>
          <span class="bb-signup-link" @click="router.push('/register')">Create one</span>
        </div>
      </q-form>

    </div>
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

function showForgotNotice() {
  $q.notify({
    message: 'Password reset is not yet available. Please contact your admin for help.',
    color: 'purple-8',
    position: 'top',
    timeout: 4000,
  });
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
  background: #0A0A1B;
  min-height: 100vh;
}

.bb-login-card {
  width: 100%;
  max-width: 400px;
  background: #0F1030;
  border: 1px solid rgba(255, 255, 255, 0.07);
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
    background: linear-gradient(135deg, #6C4ED4, #E040FB);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  span {
    font-size: 20px;
    font-weight: 700;
    color: #ffffff;
  }
}

.bb-login-title {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 6px;
}

.bb-login-sub {
  font-size: 13px;
  color: #6E6E9A;
}

.bb-field-label {
  font-size: 12px;
  font-weight: 600;
  color: #9090B8;
  margin-bottom: 6px;
}

.bb-input {
  .q-field__control {
    background: rgba(255, 255, 255, 0.04) !important;
  }

  &.q-field--outlined .q-field__control:before {
    border-color: rgba(255, 255, 255, 0.1) !important;
  }

  &.q-field--focused.q-field--outlined .q-field__control:before {
    border-color: #6C4ED4 !important;
  }
}

.bb-forgot {
  font-size: 12px;
  color: #6C4ED4;
  text-align: right;
  cursor: pointer;

  &:hover { color: #8B6FEC; }
}

.bb-login-btn {
  background: linear-gradient(135deg, #6C4ED4, #E040FB) !important;
  color: #ffffff !important;
  height: 44px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  border-radius: 10px !important;
}

.bb-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #3D3D5C;
  font-size: 12px;

  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
  }
}

.bb-signup-txt {
  font-size: 13px;
  color: #6E6E9A;
}

.bb-signup-link {
  font-size: 13px;
  color: #8B6FEC;
  cursor: pointer;
  font-weight: 500;

  &:hover { color: #E040FB; }
}
</style>
