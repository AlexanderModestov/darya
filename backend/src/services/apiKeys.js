const ENV_MAP = {
  claudeKey: 'CLAUDE_API_KEY',
  openaiKey: 'OPENAI_API_KEY',
  geminiKey: 'GEMINI_API_KEY',
  apolloKey: 'APOLLO_API_KEY',
  perplexityKey: 'PERPLEXITY_API_KEY',
  hunterKey: 'HUNTER_API_KEY',
  resendKey: 'RESEND_API_KEY',
};

/**
 * Get a single API key from the environment. Single shared key for all users.
 */
export function getApiKey(cfgKey) {
  const envName = ENV_MAP[cfgKey];
  return envName ? process.env[envName] || null : null;
}
