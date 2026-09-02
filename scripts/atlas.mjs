/**
 * Runs Atlas with .env loaded.
 *
 * The obvious version of this is `set -a; . ./.env` in the npm script, but that
 * hands the file to the *shell*, which then interprets it: an unquoted `<` in a
 * MAIL_FROM address becomes a redirect and the whole thing dies with a syntax
 * error. Node's own .env parser reads it as data, so values can contain spaces,
 * angle brackets and quotes without anyone having to think about escaping.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    console.error(`Could not read .env: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    '\nDATABASE_URL is not set.\n' +
      'Copy .env.example to .env, or export it for this command.\n',
  );
  process.exit(1);
}

const result = spawnSync('atlas', process.argv.slice(2), { stdio: 'inherit' });

if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
  console.error(
    '\nAtlas is not installed. It is what applies the declarative schema:\n' +
      '  brew install ariga/tap/atlas\n',
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
