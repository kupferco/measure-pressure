/**
 * Builds both clients and assembles them into ./dist for Firebase Hosting.
 *
 *   dist/            the patient app, at the root
 *   dist/doctor/     the clinician app
 *
 * Neither is given an API URL: Hosting rewrites /api to Cloud Run, so from the
 * browser's point of view everything is one origin. That is what lets the session
 * cookie work across both apps with no CORS anywhere.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');

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
mkdirSync(out, { recursive: true });

// Shared first: both clients import it as a built package, not as source.
run('npm', ['run', 'build', '--workspace=@mp/shared'], root);

// Empty, not unset: an empty EXPO_PUBLIC_API_URL means "same origin".
run('npx', ['expo', 'export', '--platform', 'web'], resolve(root, 'apps/app'), {
  EXPO_PUBLIC_API_URL: '',
});
run('npm', ['run', 'build', '--workspace=@mp/doctor'], root);

const patientDist = resolve(root, 'apps/app/dist');
const doctorDist = resolve(root, 'apps/doctor/dist');
for (const [name, path] of [['patient', patientDist], ['doctor', doctorDist]]) {
  if (!existsSync(path)) {
    console.error(`\nThe ${name} build produced nothing at ${path}.`);
    process.exit(1);
  }
}

cpSync(patientDist, out, { recursive: true });
cpSync(doctorDist, resolve(out, 'doctor'), { recursive: true });

console.log(`\nAssembled into ${out}`);
console.log('  /         patient app');
console.log('  /doctor   clinician app\n');
