/**
 * Measures the Omron parser against real captures rather than synthetic ones.
 *
 * The parser's unit tests are all hand-written tokens, which is how it came to pass
 * fourteen tests while getting every actual photograph wrong. Two modes:
 *
 *   npm run scan:check -- ./photo.jpg     send a photo to Cloud Vision, then parse
 *   npm run scan:check -- --stored [n]    replay the last n stored captures
 *
 * The second costs nothing and touches no network beyond the database: every scan
 * keeps Vision's untouched response in `scans.vision_raw`, so a parser change can be
 * re-run over the whole history before it is deployed.
 */
import { readFileSync } from 'node:fs';
import { parseOmronDisplay, type OcrToken } from '../src/modules/scans/omron-parser.js';

// Application default credentials on a laptop usually point at whichever project
// gcloud was last used for; Vision is only enabled on this one.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= process.env.GOOGLE_CLOUD_PROJECT ?? '';

function report(label: string, tokens: OcrToken[]): void {
  const parsed = parseOmronDisplay(tokens);
  const { systolic, diastolic, pulse, confidence, evidence, warnings } = parsed;
  console.log(`\n${label}`);
  console.log(`  read      ${tokens.map((t) => t.text).join(' ')}`);
  console.log(`  result    ${systolic ?? '--'}/${diastolic ?? '--'}  pulse ${pulse ?? '--'}`);
  console.log(
    `  how       ${evidence.strategy}, ${evidence.quarterTurns} quarter-turn(s), ` +
      `${evidence.candidateCount} candidates, confidence ${confidence}`,
  );
  for (const warning of warnings) console.log(`  warning   ${warning}`);
}

/** Rebuilds parser tokens from a stored Vision response. Mirrors vision.ts. */
function tokensFromRaw(raw: any): OcrToken[] {
  const tokens: OcrToken[] = [];
  const words = (raw?.fullTextAnnotation?.pages ?? []).flatMap((page: any) =>
    (page.blocks ?? []).flatMap((block: any) =>
      (block.paragraphs ?? []).flatMap((paragraph: any) => paragraph.words ?? []),
    ),
  );
  for (const word of words) {
    const text = (word.symbols ?? []).map((s: any) => s.text ?? '').join('');
    const poly = (word.boundingBox?.vertices ?? []).map((v: any) => ({ x: v.x ?? 0, y: v.y ?? 0 }));
    if (!text || poly.length === 0) continue;
    const xs = poly.map((v: any) => v.x);
    const ys = poly.map((v: any) => v.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    tokens.push({
      text,
      confidence: word.confidence ?? 0,
      box: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
      poly,
    });
  }
  return tokens;
}

const target = process.argv[2];

if (!target) {
  console.error('Usage: npm run scan:check -- <photo.jpg> | --stored [count]');
  process.exit(1);
} else if (target === '--stored') {
  const limit = Number(process.argv[3] ?? 20);
  const { query, closePool } = await import('../src/db/pool.js');
  const { rows } = await query<{ id: string; created_at: Date; vision_raw: unknown }>(
    'select id, created_at, vision_raw from scans order by created_at desc limit $1',
    [limit],
  );
  if (rows.length === 0) console.log('No stored captures yet.');
  for (const row of rows) {
    const tokens = tokensFromRaw(row.vision_raw);
    if (tokens.length === 0) {
      console.log(`\n${row.id}  (no Vision text - the read failed or errored)`);
      continue;
    }
    report(`${row.id}  ${row.created_at.toISOString()}`, tokens);
  }
  await closePool?.();
} else {
  const { getOcrEngine } = await import('../src/modules/scans/vision.js');
  const { tokens } = await getOcrEngine().detect(readFileSync(target));
  report(target, tokens);
}
