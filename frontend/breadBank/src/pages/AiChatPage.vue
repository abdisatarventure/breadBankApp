<template>
  <q-page class="bb-ai q-pa-lg">
    <div class="bb-page-header">
      <div>
        <div class="bb-page-title">AI Assistant</div>
        <div class="bb-page-sub">Ask anything about your finances in plain English</div>
      </div>
      <q-btn
        v-if="messages.length"
        flat dense no-caps icon="restart_alt" label="New chat"
        class="bb-clear-btn"
        @click="resetChat"
      />
    </div>

    <!-- Credit / budget warning surfaced from the backend usage tracker -->
    <q-banner v-if="statusWarning" class="bb-warn-banner q-mb-md" dense rounded>
      <template #avatar>
        <q-icon name="warning" color="amber" />
      </template>
      {{ statusWarning }}
    </q-banner>

    <div class="bb-chat">
      <!-- Conversation -->
      <div ref="scrollEl" class="bb-messages">
        <!-- Welcome / empty state -->
        <div v-if="!messages.length" class="bb-welcome">
          <div class="bb-welcome-icon">
            <q-icon name="psychology" size="34px" color="white" />
          </div>
          <div class="bb-welcome-title">How can I help with your money?</div>
          <div class="bb-welcome-sub">
            I can answer questions about your spending, income, and habits based on your
            transaction history. Try one of these:
          </div>
          <div class="bb-suggestions">
            <button
              v-for="q in SUGGESTIONS"
              :key="q"
              type="button"
              class="bb-suggestion"
              @click="ask(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="bb-msg"
          :class="msg.role === 'user' ? 'bb-msg--user' : 'bb-msg--ai'"
        >
          <div v-if="msg.role === 'assistant'" class="bb-msg-avatar">
            <q-icon name="psychology" size="16px" color="white" />
          </div>
          <div class="bb-bubble" :class="{ 'bb-bubble--error': msg.error }">
            <span v-if="msg.role === 'assistant'" v-html="renderMarkdown(msg.content)" />
            <span v-else>{{ msg.content }}</span>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-if="loading" class="bb-msg bb-msg--ai">
          <div class="bb-msg-avatar">
            <q-icon name="psychology" size="16px" color="white" />
          </div>
          <div class="bb-bubble bb-bubble--typing">
            <span class="bb-dot" /><span class="bb-dot" /><span class="bb-dot" />
          </div>
        </div>
      </div>

      <!-- Composer -->
      <form class="bb-composer" @submit.prevent="ask()">
        <q-input
          v-model="draft"
          dark dense borderless
          class="bb-input"
          placeholder="Ask about your spending, income, subscriptions…"
          :disable="loading"
          autofocus
          @keydown.enter.exact.prevent="ask()"
        />
        <q-btn
          round dense unelevated
          icon="arrow_upward"
          class="bb-send"
          type="submit"
          :disable="loading || !draft.trim()"
        />
      </form>
    </div>

    <div class="bb-disclaimer">
      Answers are generated from a summary of your last 30 days of transactions and may not
      reflect every detail. Verify important figures against your statements.
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue';
import { api } from 'src/services/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

const SUGGESTIONS = [
  'How much did I spend last month?',
  'What are my top 5 merchants?',
  'How can I cut my spending?',
  'What is my savings rate?',
];

const draft = ref('');
const loading = ref(false);
const messages = ref<ChatMessage[]>([]);
const scrollEl = ref<HTMLElement | null>(null);
const statusWarning = ref('');

async function scrollToBottom() {
  await nextTick();
  if (scrollEl.value) {
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
  }
}

async function ask(preset?: string) {
  const question = (preset ?? draft.value).trim();
  if (!question || loading.value) return;

  draft.value = '';
  messages.value.push({ role: 'user', content: question });
  loading.value = true;
  await scrollToBottom();

  try {
    const { answer } = await api.askAi(question);
    messages.value.push({ role: 'assistant', content: answer });
  } catch (err) {
    messages.value.push({
      role: 'assistant',
      content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      error: true,
    });
  } finally {
    loading.value = false;
    await scrollToBottom();
  }
}

function resetChat() {
  messages.value = [];
  draft.value = '';
}

// Minimal, XSS-safe markdown: escape HTML first, then apply **bold** and newlines.
function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// Surface the credit/budget warning the backend already tracks so a failed
// answer isn't the first the user hears of an exhausted balance.
const STATUS_MESSAGES: Record<string, string> = {
  exhausted: 'The AI credit balance is exhausted. Answers are unavailable until it is topped up.',
  over: 'This month\'s AI spending has exceeded the configured budget.',
  warning: 'This month\'s AI spending is approaching the configured budget.',
};

onMounted(async () => {
  try {
    const status = await api.getAiStatus();
    statusWarning.value = STATUS_MESSAGES[status.level] ?? '';
  } catch {
    // A failed status check should never block the chat.
  }
});
</script>

<style lang="scss">
.bb-ai { background-color: var(--bb-bg); min-height: 100vh; display: flex; flex-direction: column; }
.bb-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.bb-page-title { font-size: 28px; font-weight: 700; }
.bb-page-sub { color: var(--bb-text-soft); margin-top: 8px; }
.bb-clear-btn { color: var(--bb-accent-light); }

.bb-warn-banner { background: rgba(245,158,11,0.12); color: #F5D08B; border: 1px solid rgba(245,158,11,0.25); }

.bb-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bb-surface-2);
  border: 1px solid var(--bb-border);
  border-radius: 18px;
  overflow: hidden;
  min-height: 0;
}

.bb-messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }

/* Welcome */
.bb-welcome { margin: auto; text-align: center; max-width: 520px; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 0; }
.bb-welcome-icon { width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2)); display: grid; place-items: center; }
.bb-welcome-title { font-size: 20px; font-weight: 700; color: var(--bb-text); }
.bb-welcome-sub { color: var(--bb-text-soft); font-size: 14px; line-height: 1.55; }
.bb-suggestions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 6px; }
.bb-suggestion {
  background: rgba(var(--bb-accent-rgb),0.12); color: var(--bb-text-soft); border: 1px solid rgba(var(--bb-accent-rgb),0.25);
  border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.15s ease; font-family: inherit;
}
.bb-suggestion:hover { background: rgba(var(--bb-accent-rgb),0.22); border-color: rgba(var(--bb-accent-rgb),0.45); color: var(--bb-text); }

/* Messages */
.bb-msg { display: flex; gap: 10px; align-items: flex-end; max-width: 100%; }
.bb-msg--user { justify-content: flex-end; }
.bb-msg-avatar { width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0; background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2)); display: grid; place-items: center; }

.bb-bubble {
  max-width: 75%; padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.55;
  word-wrap: break-word; white-space: normal;
}
.bb-msg--user .bb-bubble { background: linear-gradient(135deg, var(--bb-accent), var(--bb-accent-2)); color: var(--bb-text); border-bottom-right-radius: 4px; }
.bb-msg--ai .bb-bubble { background: #1A1A38; color: var(--bb-text-soft); border: 1px solid var(--bb-border); border-bottom-left-radius: 4px; }
.bb-bubble--error { background: rgba(239,68,68,0.12) !important; border-color: rgba(239,68,68,0.3) !important; color: #FCA5A5 !important; }
.bb-bubble strong { color: var(--bb-text); font-weight: 700; }

/* Typing dots */
.bb-bubble--typing { display: flex; gap: 5px; align-items: center; padding: 14px 16px; }
.bb-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bb-accent-light); animation: bb-bounce 1.2s infinite ease-in-out; }
.bb-dot:nth-child(2) { animation-delay: 0.18s; }
.bb-dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes bb-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-5px); opacity: 1; } }

/* Composer */
.bb-composer { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--bb-border); background: #0F0F26; }
.bb-input { flex: 1; }
.bb-input .q-field__control { background: #1A1A38; border-radius: 12px; padding: 0 14px; min-height: 44px; }
.bb-send {
  background: linear-gradient(135deg,var(--bb-accent),var(--bb-accent-2)) !important; color: var(--bb-text) !important;
  width: 40px; height: 40px; flex-shrink: 0;
}
.bb-send:disabled { opacity: 0.4; }

.bb-disclaimer { color: var(--bb-text-dim); font-size: 12px; margin-top: 14px; line-height: 1.5; }
</style>
