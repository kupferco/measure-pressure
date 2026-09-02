/**
 * Generates a realistic reading history, so the dashboard, trend, time-of-day
 * split and insights screen have something to show before you have months of
 * your own data.
 *
 * DANGEROUS BY NATURE. Every environment in this project points at one database,
 * so a seed script is a script that can write to production. Three guards:
 *   - it prints the database it is about to write to, and needs --yes
 *   - it only ever touches the single account named by --email
 *   - it deletes nothing unless you also pass --reset
 *
 *   node scripts/seed.mjs --email you@example.com --yes
 *   node scripts/seed.mjs --email you@example.com --reset --yes
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import pg from 'pg';
import { SEED_TAGS } from '@mp/shared';

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const email = (value('email') ?? '').trim().toLowerCase();
const days = Number.parseInt(value('days') ?? '60', 10);

if (!email) {
  console.error('\nusage: node scripts/seed.mjs --email you@example.com [--days 60] [--reset] --yes\n');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('\nDATABASE_URL is not set. Copy .env.example to .env.\n');
  process.exit(1);
}

const target = (() => {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return `${url.pathname.replace(/^\//, '')} @ ${url.searchParams.get('host') ?? url.hostname}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
})();

console.log(`\nDatabase: ${target}`);
console.log(`Account:  ${email}`);
console.log(`History:  ${days} days${flag('reset') ? '  (existing readings will be DELETED)' : ''}`);

if (!flag('yes')) {
  console.error('\nRefusing to write without --yes.\n');
  process.exit(1);
}

// Deterministic, so re-running produces the same history rather than a new random
// one every time - easier to talk about a chart that does not move under you.
let seed = 20260902;
const random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
/** Box-Muller, for variation that looks like measurement rather than noise. */
const gaussian = (mean, sd) => {
  const u = Math.max(random(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};
const pick = (list) => list[Math.floor(random() * list.length)];

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const NOTES = {
  bad_sleep: ['barely slept', 'awake since 4', 'rough night', 'kept waking up'],
  yoga: ['after yoga', 'did the breathing thing first', 'stretched for 20 min'],
  stress: ['bad call with the bank', 'deadline day', 'argument this morning'],
  ill: ['streaming cold', 'feel awful', 'still under the weather'],
  calm: ['quiet morning', 'nothing much on', 'relaxed day', 'slow start'],
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: userRows } = await client.query(
      `insert into users (email, name) values ($1, $2)
       on conflict (email) do update set email = excluded.email
       returning id`,
      [email, value('name') ?? 'Daniel'],
    );
    const userId = userRows[0].id;

    if (flag('reset')) {
      // Readings only. The account, and anything shared with a doctor, survive.
      const { rowCount } = await client.query('delete from readings where user_id = $1', [userId]);
      console.log(`\nDeleted ${rowCount} existing readings.`);
    }

    // Tags are normally seeded when an account is created; make sure they exist.
    for (const [i, tag] of SEED_TAGS.entries()) {
      await client.query(
        `insert into tags (user_id, label, tag_group, sort_order) values ($1, $2, $3, $4)
         on conflict do nothing`,
        [userId, tag.label, tag.group, i],
      );
    }
    const { rows: tagRows } = await client.query(
      'select id, label from tags where user_id = $1',
      [userId],
    );
    const tagId = (label) => tagRows.find((t) => t.label === label)?.id;

    const now = new Date();
    let created = 0;

    for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
      // A real log has gaps: some days simply get missed.
      if (random() < 0.12) continue;

      const badSleep = random() < 0.28;
      const didYoga = !badSleep && random() < 0.22;
      const stressed = !didYoga && random() < 0.18;
      // A week of flu early in the period. Deliberately not recent: an illness
      // spike near the end fights the downward trend and the two cancel out,
      // leaving a flat chart that demonstrates nothing.
      const ill = dayOffset > days * 0.72 && dayOffset < days * 0.72 + 7;

      // Morning, and usually an evening reading too.
      const times = random() < 0.75 ? ['morning', 'evening'] : ['morning'];

      for (const slot of times) {
        const at = new Date(now);
        at.setDate(at.getDate() - dayOffset);
        at.setHours(
          slot === 'morning' ? 7 + Math.floor(random() * 2) : 20 + Math.floor(random() * 2),
          Math.floor(random() * 60),
          0,
          0,
        );

        // A clear improvement over the period - someone whose treatment is working,
        // which is the case worth being able to see on a chart. Starts around 138
        // systolic and ends in the low 120s.
        const drift = -15 * ((days - dayOffset) / days);
        // Blood pressure is genuinely higher in the morning.
        const diurnal = slot === 'morning' ? 3.5 : 0;

        let systolic =
          136 + drift + diurnal + (badSleep ? 10 : 0) - (didYoga ? 5 : 0) + (stressed ? 7 : 0) + (ill ? 8 : 0);
        systolic = Math.round(gaussian(systolic, 4));
        let diastolic = Math.round(gaussian(systolic * 0.63, 3));
        // Keep every generated row inside what the schema will actually accept.
        systolic = Math.min(200, Math.max(95, systolic));
        diastolic = Math.min(systolic - 25, Math.max(58, diastolic));
        const pulse = Math.round(gaussian(ill ? 82 : 68, 6));

        const tags = [];
        if (badSleep) tags.push('Slept badly');
        else if (random() < 0.35) tags.push('Slept well');
        if (didYoga) tags.push('Yoga / breathing');
        if (stressed) tags.push('Stressed');
        if (ill) tags.push('Ill / flu');
        if (slot === 'morning' && random() < 0.4) tags.push('Caffeine');
        if (random() < 0.8) tags.push('Took medication');
        if (slot === 'morning' && random() < 0.5) tags.push('Rested 5+ min first');

        let note = null;
        if (ill && random() < 0.5) note = pick(NOTES.ill);
        else if (badSleep && random() < 0.6) note = pick(NOTES.bad_sleep);
        else if (didYoga && random() < 0.6) note = pick(NOTES.yoga);
        else if (stressed && random() < 0.7) note = pick(NOTES.stress);
        else if (random() < 0.15) note = pick(NOTES.calm);

        // Most sittings are three measurements a minute apart, which is how blood
        // pressure is supposed to be taken. The first runs high and settles - that
        // is the whole reason the average is worth having.
        const measurements = random() < 0.8 ? 3 : random() < 0.5 ? 2 : 1;
        const sessionId = randomUUID();

        for (let n = 0; n < measurements; n++) {
          const at_n = new Date(at.getTime() + n * 60_000 + Math.floor(random() * 20_000));
          const settling = n === 0 ? 0 : -Math.round(gaussian(4.5, 2));
          const s_n = Math.min(200, Math.max(95, Math.round(gaussian(systolic + settling, 2.5))));
          const d_n = Math.min(s_n - 25, Math.max(58, Math.round(gaussian(diastolic + settling * 0.6, 2))));

          const { rows } = await client.query(
            `insert into readings
               (user_id, systolic, diastolic, pulse, measured_at, note, arm, posture, source, session_id)
             values ($1, $2, $3, $4, $5, $6, 'left', 'sitting', 'manual', $7)
             returning id`,
            // The note belongs to the sitting, so it goes on the first reading only.
            [userId, s_n, d_n, Math.round(gaussian(pulse, 2)), at_n.toISOString(), n === 0 ? note : null, sessionId],
          );

          const ids = tags.map(tagId).filter(Boolean);
          if (ids.length > 0) {
            await client.query(
              `insert into reading_tags (reading_id, tag_id) select $1, unnest($2::uuid[])`,
              [rows[0].id, ids],
            );
          }
          created++;
        }
      }
    }

    await client.query('commit');
    console.log(`\nCreated ${created} readings for ${email}.\n`);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
