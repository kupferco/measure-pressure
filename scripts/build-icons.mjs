/**
 * Renders every app icon from the two SVGs in apps/app/assets.
 *
 *   npm run icons
 *
 * There are a lot of icons for one small app, because each platform wants a
 * different shape of the same drawing:
 *
 *   icon.svg        full bleed, gradient ground   -> iOS, web, the landing page
 *   icon-glyph.svg  the trace alone, transparent  -> Android layers, the splash
 *
 * Rendering is done by headless Chrome rather than a library. Chrome is already
 * required to look at any of this, it renders SVG exactly as the phone's browser
 * will, and it avoids adding an image toolchain to a project that needs one for
 * about ten seconds every couple of years. ImageMagick's own SVG support is not
 * reliable enough to trust with the artwork.
 *
 * Regenerate after editing either SVG, then look at the result - the only size
 * that matters is the smallest one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const assets = resolve(root, 'apps/app/assets');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => existsSync(path));

if (!CHROME) {
  console.error(
    'No Chrome or Chromium found, and this script renders the icons with it.\n' +
      'The committed PNGs are already correct - you only need this after editing\n' +
      'apps/app/assets/icon.svg or icon-glyph.svg.',
  );
  process.exit(1);
}

/**
 * Every icon this project needs, and who asks for it.
 *
 * `transparent` matters: an icon that carries its own ground must be opaque, and
 * a layer the platform composites must not be, or it paints a white box over
 * whatever is behind it.
 */
const TARGETS = [
  // iOS and the app stores. 1024 is the size Apple asks for.
  { out: 'apps/app/assets/icon.png', source: 'icon.svg', size: 1024 },

  // Android composites these two, then masks the result to the launcher's shape.
  { out: 'apps/app/assets/adaptive-icon.png', source: 'icon-glyph.svg', size: 1024, transparent: true },
  { out: 'apps/app/assets/android-icon-foreground.png', source: 'icon-glyph.svg', size: 1024, transparent: true },
  { out: 'apps/app/assets/android-icon-background.png', source: 'ground.svg', size: 1024 },
  // Themed icons: Android recolours this one itself, so it must be a flat shape.
  { out: 'apps/app/assets/android-icon-monochrome.png', source: 'icon-glyph.svg', size: 1024, transparent: true },

  // Painted over app.json's splash.backgroundColor, so no ground of its own.
  { out: 'apps/app/assets/splash-icon.png', source: 'icon-glyph.svg', size: 1024, transparent: true },

  // The browser tab for the Expo web build.
  { out: 'apps/app/assets/favicon.png', source: 'icon.svg', size: 64 },

  // What Add to Home Screen uses. 180 is what iOS asks for.
  { out: 'apps/app/public/apple-touch-icon.png', source: 'icon.svg', size: 180 },

  // The landing page: its own tab icon, the icon drawn inside the install
  // pictures, and the preview image WhatsApp shows when the link is pasted.
  { out: 'apps/landing/public/icon.png', source: 'icon.svg', size: 512 },
];

/** The gradient ground with no trace on it, for Android's background layer. */
const GROUND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4cc4fb"/><stop offset="1" stop-color="#1f6fd0"/>
  </linearGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/>
</svg>`;

const work = resolve(tmpdir(), `mp-icons-${process.pid}`);
mkdirSync(work, { recursive: true });
writeFileSync(resolve(work, 'ground.svg'), GROUND_SVG);

function render({ out, source, size, transparent }) {
  const svg = source === 'ground.svg' ? resolve(work, source) : resolve(assets, source);
  if (!existsSync(svg)) {
    console.error(`Missing source: ${svg}`);
    process.exit(1);
  }

  // The SVG is loaded inside a page sized exactly to the output, with no margin
  // and the image stretched to fill it, so the screenshot is the icon and
  // nothing else - no scrollbars, no letterboxing, no half-pixel offset.
  const page = resolve(work, `page-${size}-${transparent ? 't' : 'o'}.html`);
  writeFileSync(
    page,
    `<style>html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}` +
      `img{display:block;width:${size}px;height:${size}px}</style>` +
      `<img src="file://${svg}">`,
  );

  const shot = resolve(work, 'shot.png');
  rmSync(shot, { force: true });
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--default-background-color=${transparent ? '00000000' : 'ffffffff'}`,
      `--window-size=${size},${size}`,
      `--screenshot=${shot}`,
      '--virtual-time-budget=2000',
      `file://${page}`,
    ],
    { stdio: 'pipe' },
  );

  const destination = resolve(root, out);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(shot, destination);
  console.log(`  ${String(size).padStart(4)}px  ${transparent ? 'alpha ' : 'opaque'}  ${out}`);
}

console.log('Rendering icons from apps/app/assets/*.svg\n');
for (const target of TARGETS) render(target);
rmSync(work, { recursive: true, force: true });
console.log('\nDone. Look at the smallest one before believing any of it.');
