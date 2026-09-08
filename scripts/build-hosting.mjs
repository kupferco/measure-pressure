/**
 * Builds all three clients and assembles them for Firebase Hosting.
 *
 * Two Hosting sites, so two output directories - one per site, matching the two
 * targets in firebase.json:
 *
 *   dist/app/           -> measure-pressure-app.web.app
 *   dist/app/doctor/       the clinician app, under the same origin
 *   dist/landing/       -> measurepressure.web.app
 *
 * The app and the clinician app share an origin on purpose: Hosting rewrites
 * /api to Cloud Run there, so from the browser's point of view it is all one
 * origin and the session cookie works with no CORS anywhere. Neither is given an
 * API URL for that reason.
 *
 * The landing page is deliberately somewhere else. It is public, it is the one
 * page that will grow embeds and links, and it must not share a cookie jar - or
 * an installed app's scope - with the readings.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
const appOut = resolve(out, 'app');
const landingOut = resolve(out, 'landing');

function run(command, args, cwd, env = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\nFailed: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(appOut, { recursive: true });
mkdirSync(landingOut, { recursive: true });

// Shared first: both clients import it as a built package, not as source.
run('npm', ['run', 'build', '--workspace=@mp/shared'], root);

// Empty, not unset: an empty EXPO_PUBLIC_API_URL means "same origin".
run('npx', ['expo', 'export', '--platform', 'web'], resolve(root, 'apps/app'), {
  EXPO_PUBLIC_API_URL: '',
});
run('npm', ['run', 'build', '--workspace=@mp/doctor'], root);
run('npm', ['run', 'build', '--workspace=@mp/landing'], root);

const patientDist = resolve(root, 'apps/app/dist');
const doctorDist = resolve(root, 'apps/doctor/dist');
const landingDist = resolve(root, 'apps/landing/dist');
for (const [name, path] of [['patient', patientDist], ['doctor', doctorDist], ['landing', landingDist]]) {
  if (!existsSync(path)) {
    console.error(`\nThe ${name} build produced nothing at ${path}.`);
    process.exit(1);
  }
}

cpSync(patientDist, appOut, { recursive: true });
cpSync(doctorDist, resolve(appOut, 'doctor'), { recursive: true });
cpSync(landingDist, landingOut, { recursive: true });

console.log(`\nAssembled into ${out}`);
console.log('  app/          measure-pressure-app.web.app - patient app');
console.log('  app/doctor/   measure-pressure-app.web.app/doctor - clinician app');
console.log('  landing/      measurepressure.web.app - landing page\n');
