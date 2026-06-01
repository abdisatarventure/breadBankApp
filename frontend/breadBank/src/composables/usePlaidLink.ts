import { ref } from 'vue';
import { api } from 'src/services/api';

// Plaid Link is a drop-in widget loaded from Plaid's CDN at runtime.
declare global {
  interface Window {
    Plaid?: { create: (cfg: Record<string, unknown>) => { open: () => void } };
  }
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Plaid Link'));
    document.head.appendChild(s);
  });
}

/**
 * Opens the Plaid Link flow and runs `onLinked` once an account is connected
 * and exchanged. Shared by the dashboard and investments pages.
 */
export function usePlaidLink(onLinked: () => Promise<void> | void) {
  const connecting = ref(false);
  const error = ref('');

  async function connect() {
    error.value = '';
    connecting.value = true;
    try {
      await loadPlaidScript();
      const { link_token } = await api.createPlaidLinkToken();
      const handler = window.Plaid!.create({
        token: link_token,
        onSuccess: async (publicToken: string) => {
          try {
            await api.exchangePlaidToken(publicToken);
            await onLinked();
          } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to import account';
          } finally {
            connecting.value = false;
          }
        },
        onExit: () => { connecting.value = false; },
      });
      handler.open();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to start bank linking';
      connecting.value = false;
    }
  }

  return { connecting, error, connect };
}
