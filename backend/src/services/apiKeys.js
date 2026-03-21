import { query } from './db.js';

/**
 * Map of config key → environment variable name.
 * User settings override env vars.
 */
const ENV_MAP = {
  claudeKey:  'CLAUDE_API_KEY',
  openaiKey:  'OPENAI_API_KEY',
  geminiKey:  'GEMINI_API_KEY',
  apolloKey:  'APOLLO_API_KEY',
  perplexityKey: 'PERPLEXITY_API_KEY',
};

/**
 * Get a single API key: user setting first, then env var fallback.
 */
export async function getApiKey(userId, cfgKey) {
  const { rows } = await query('SELECT cfg FROM settings WHERE user_id = $1', [userId]);
  const userValue = rows[0]?.cfg?.[cfgKey];
  if (userValue) return userValue;
  const envName = ENV_MAP[cfgKey];
  return envName ? process.env[envName] || null : null;
}

/**
 * Get all user config with env fallbacks merged in.
 */
export async function getCfgWithDefaults(userId) {
  const { rows } = await query('SELECT cfg FROM settings WHERE user_id = $1', [userId]);
  const cfg = rows[0]?.cfg || {};
  const merged = { ...cfg };
  for (const [cfgKey, envName] of Object.entries(ENV_MAP)) {
    if (!merged[cfgKey] && process.env[envName]) {
      merged[cfgKey] = process.env[envName];
    }
  }
  return merged;
}

/**
 * Returns which keys have env defaults set (without exposing values).
 */
export function getEnvDefaults() {
  const defaults = {};
  for (const [cfgKey, envName] of Object.entries(ENV_MAP)) {
    defaults[cfgKey] = !!process.env[envName];
  }
  return defaults;
}
