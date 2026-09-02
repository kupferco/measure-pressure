/**
 * Extends app.json with values read from the repository's .env, so the API port
 * is configured in exactly one place.
 *
 * The .env is parsed by hand rather than with process.loadEnvFile, which mutates
 * process.env: that file sets PORT for the API, and Expo's own dev server also
 * looks at PORT - so loading it wholesale would move the Expo server onto the
 * API's port and have the two fight.
 */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function readEnvValue(key, fallback) {
  try {
    const contents = readFileSync(resolve(__dirname, '../../.env'), 'utf8');
    const match = contents.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
    if (!match) return fallback;
    // Strip an inline comment and any surrounding quotes.
    const value = match[1].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
    return value || fallback;
  } catch {
    // No .env - a production build, or a fresh clone. The fallback is correct.
    return fallback;
  }
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // Where the API listens. Read from .env's PORT so changing it in one place is
    // enough for the phone and the browser to follow.
    apiPort: readEnvValue('PORT', '8080'),
  },
});
