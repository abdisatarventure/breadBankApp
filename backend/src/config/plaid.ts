import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import dotenv from 'dotenv';

dotenv.config();

// PLAID_ENV picks which Plaid host (and therefore which secret) we talk to:
//   'sandbox'    → fake banks + test credentials, no approval needed
//   'production' → real banks (Wells Fargo etc.), needs Plaid production access
const PLAID_ENV = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments;

export const PLAID_CONFIGURED = Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);

if (!PLAID_CONFIGURED) {
  console.warn('WARNING: PLAID_CLIENT_ID / PLAID_SECRET not set — bank-linking routes will return 503.');
}

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

export const plaid = new PlaidApi(configuration);
export { PLAID_ENV };
