import dotenv from 'dotenv';

dotenv.config();

// Single source of truth for the JWT signing secret. Fail fast if it isn't
// set — falling back to a hardcoded default would let anyone forge a token for
// any user. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required — set it in backend/.env (see .env.example).');
}

export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRES = '8h';
