/*
 * Drawn pictures of the phone, one per step.
 *
 * Not screenshots. Screenshots go stale with every iOS release and carry
 * whatever was on the phone that day; a drawing shows just the button to press
 * and a ring around it. Each figure is the whole phone so the reader knows where
 * on the screen to look - "the bottom" means nothing without the rest.
 */
import type { ReactNode } from 'react';

const W = 320;
const H = 480;

const ink = '#14181f';
const grey = '#8e8e93';
const line = '#d9dde3';
const ring = '#e0362f';

/** A phone outline with a screen the children draw on. */
function Phone({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      className="figure"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    >
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="34" fill="#111" />
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="26" fill="#fff" />
      {children}
    </svg>
  );
}

/** A red ring around the thing to press. */
function Ring({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth="4" />;
}

function Highlight({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx="10" fill="none" stroke={ring} strokeWidth="4" />
  );
}

/** The app icon, as it looks once saved. */
function AppIcon({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <image
      href="/icon.png"
      x={x}
      y={y}
      width={size}
      height={size}
      style={{ clipPath: 'inset(0 round 22%)' }}
    />
  );
}

/**
 * The share symbol at reading size, for printing inside a sentence.
 *
 * The step that says "a square with an arrow coming out of the top" is the one
 * an older iPhone lands on, and describing a symbol in words to someone who is
 * hunting for it on a toolbar is much worse than showing it to them.
 */
export function ShareSymbol() {
  return (
    <svg
      className="glyph"
      viewBox="0 0 34 34"
      width="22"
      height="22"
      role="img"
      aria-label="the Share symbol"
    >
      <ShareGlyph cx={17} cy={17} color="currentColor" />
    </svg>
  );
}

/** iOS's share symbol: a box with an arrow rising out of it. */
function ShareGlyph({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${cx - 9} ${cy - 2} h-4 v18 h26 v-18 h-4`} />
      <path d={`M${cx} ${cy + 4} v-20 M${cx - 7} ${cy - 10} l7 -7 l7 7`} />
    </g>
  );
}

/** The "add to home screen" symbol: a rounded square with a plus in it. */
function PlusSquare({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round">
      <rect x={x} y={y} width="24" height="24" rx="6" />
      <path d={`M${x + 12} ${y + 6} v12 M${x + 6} ${y + 12} h12`} />
    </g>
  );
}

/** A greyed-out stand-in for the app's own screen behind the browser bars. */
function AppScreen({ top, bottom }: { top: number; bottom: number }) {
  return (
    <g>
      <rect x="10" y={top} width={W - 20} height={bottom - top} fill="#0f172a" />
      <text x={W / 2} y={top + 46} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="600">
        Measure Pressure
      </text>
      <rect x="40" y={top + 70} width={W - 80} height="54" rx="12" fill="#1e293b" />
      <rect x="40" y={top + 136} width={W - 80} height="54" rx="12" fill="#1e293b" />
      <rect x="40" y={top + 202} width={W - 80} height="54" rx="12" fill="#1e293b" />
    </g>
  );
}

/* ---- iPhone, Safari ------------------------------------------------------
 *
 * Drawn from photographs of a real iPhone rather than from memory, which is how
 * the first version of this file went wrong: it showed a Share button sitting in
 * Safari's toolbar, and on a current iPhone there is no such button. The toolbar
 * holds a "..." that opens a menu, and Share is inside that menu.
 *
 * Safari also tints its toolbar to match the page, and the app is dark, so the
 * bar is drawn dark here. That is what the reader will be looking at.
 */

export function SafariMenuButton() {
  return (
    <Phone label="Safari, with the three-dots button at the bottom right of the screen circled in red">
      <AppScreen top={40} bottom={470} />
      {/* Safari's floating toolbar: back, the address pill, then the menu. */}
      <circle cx="46" cy="440" r="21" fill="#1e293b" />
      <path d="M52 432 l-8 8 l8 8" fill="none" stroke="#cbd5e1" strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round" />
      <rect x="76" y="419" width="156" height="42" rx="21" fill="#1e293b" />
      <text x="154" y="445" textAnchor="middle" fill="#cbd5e1" fontSize="12">
        ...app.web.app
      </text>
      <circle cx="270" cy="440" r="21" fill="#1e293b" />
      <g fill="#cbd5e1">
        <circle cx="261" cy="440" r="2.4" />
        <circle cx="270" cy="440" r="2.4" />
        <circle cx="279" cy="440" r="2.4" />
      </g>
      <Ring cx={270} cy={440} r={31} />
    </Phone>
  );
}

export function SafariMenu() {
  const rows: Array<[number, string, boolean]> = [
    [292, 'Share', true],
    [330, 'Add to Bookmarks', false],
    [368, 'Add Bookmark to...', false],
    [414, 'New Tab', false],
    [452, 'New Private Tab', false],
  ];
  return (
    <Phone label="Safari's menu, with the word Share at the top of it outlined in red">
      <AppScreen top={40} bottom={470} />
      {/* The menu opens upward from the "..." button, so it hangs off the
          bottom right corner rather than sitting in the middle. */}
      <rect x="106" y="268" width="184" height="196" rx="16" fill="#1b2536" />
      {rows.map(([y, text, hit]) => (
        <g key={text}>
          <text x="126" y={y} fill="#f1f5f9" fontSize="14" fontWeight={hit ? 700 : 400}>
            {text}
          </text>
          {text === 'Add Bookmark to...' && (
            <line x1="120" y1={y + 18} x2="276" y2={y + 18} stroke="#334155" />
          )}
        </g>
      ))}
      <Highlight x={112} y={274} w={172} h={30} />
    </Phone>
  );
}

/**
 * The top of the share sheet: the link, the people, the apps.
 *
 * Drawn as shapes without their labels. They are not what the reader is looking
 * for, and at this size their labels would only be small grey noise above the one
 * row that matters.
 */
function ShareSheetTop({ y }: { y: number }) {
  const columns = [46, 116, 186, 256];
  return (
    <g>
      <rect x="140" y={y + 10} width="40" height="5" rx="2.5" fill="#c7c7cc" />
      {/* The link being shared, with Safari's little preview of the page. */}
      <rect x="26" y={y + 28} width="42" height="54" rx="6" fill="#0f172a" />
      <rect x="80" y={y + 40} width="150" height="10" rx="5" fill="#c7c7cc" />
      <rect x="80" y={y + 58} width="190" height="8" rx="4" fill="#dcdce1" />
      <line x1="26" y1={y + 96} x2={W - 26} y2={y + 96} stroke={line} />
      {/* People to send it to, then apps to send it with. */}
      {columns.map((cx) => (
        <circle key={`p${cx}`} cx={cx} cy={y + 128} r="22" fill="#dcdce1" />
      ))}
      <line x1="26" y1={y + 162} x2={W - 26} y2={y + 162} stroke={line} />
      {columns.map((cx) => (
        <rect key={`a${cx}`} x={cx - 22} y={y + 174} width="44" height="44" rx="10" fill="#dcdce1" />
      ))}
      <line x1="26" y1={y + 232} x2={W - 26} y2={y + 232} stroke={line} />
    </g>
  );
}

/**
 * The row of round buttons along the bottom of the share sheet, with View More
 * on the end. The list of written-out actions starts collapsed on a current
 * iPhone, and this is the button that opens it.
 */
function ActionRow({
  labels,
  ringLast,
}: {
  labels: Array<[string, string]>;
  ringLast: boolean;
}) {
  const columns = [46, 116, 186, 256];
  return (
    <g>
      {labels.map(([first, second], i) => (
        <g key={first + second}>
          <circle cx={columns[i]} cy="394" r="26" fill="#e3e3e8" />
          <text
            x={columns[i]}
            y={second ? 434 : 438}
            textAnchor="middle"
            fill={ink}
            fontSize="11"
            fontWeight={ringLast && i === 3 ? 700 : 400}
          >
            {first}
          </text>
          {second && (
            <text x={columns[i]} y="447" textAnchor="middle" fill={ink} fontSize="11">
              {second}
            </text>
          )}
        </g>
      ))}
      {/* The chevron on the last button points down: it opens the list. */}
      <path
        d="M244 388 l12 12 l12 -12"
        stroke={ink}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {ringLast && <Ring cx={256} cy={394} r={34} />}
    </g>
  );
}

export function SafariShareSheet() {
  return (
    <Phone label="Safari's share panel, with the round View More button at the bottom right circled in red">
      <AppScreen top={40} bottom={470} />
      <rect x="10" y="140" width={W - 20} height="330" rx="20" fill="#f2f2f7" />
      <ShareSheetTop y={140} />
      <ActionRow
        labels={[
          ['Copy', ''],
          ['Add to', 'Bookmarks'],
          ['Add to', 'Reading List'],
          ['View More', ''],
        ]}
        ringLast
      />
    </Phone>
  );
}

export function SafariShareList() {
  const rows = [
    { y: 214, text: 'Add Bookmark to...' },
    { y: 250, text: 'Add to Favourites' },
    { y: 286, text: 'Add to Quick Note' },
    { y: 322, text: 'Find on Page' },
    { y: 358, text: 'Add to Home Screen', hit: true },
  ];
  return (
    <Phone label="Safari's opened list, with the row that says Add to Home Screen outlined in red">
      <AppScreen top={40} bottom={470} />
      <rect x="10" y="90" width={W - 20} height="380" rx="20" fill="#f2f2f7" />
      <rect x="140" y="100" width="40" height="5" rx="2.5" fill="#c7c7cc" />
      <rect x="26" y="118" width="42" height="54" rx="6" fill="#0f172a" />
      <rect x="80" y="130" width="150" height="10" rx="5" fill="#c7c7cc" />
      <rect x="80" y="148" width="190" height="8" rx="4" fill="#dcdce1" />
      <rect x="24" y="196" width={W - 48} height="192" rx="12" fill="#fff" />
      {rows.map((row, i) => (
        <g key={row.text}>
          <text
            x="40"
            y={row.y + 18}
            fill={ink}
            fontSize="14"
            fontWeight={row.hit ? 700 : 400}
          >
            {row.text}
          </text>
          {row.hit && <PlusSquare x={W - 66} y={row.y + 2} color={ink} />}
          {i < rows.length - 1 && (
            <line x1="40" y1={row.y + 32} x2={W - 40} y2={row.y + 32} stroke={line} />
          )}
        </g>
      ))}
      {/* Markup and Print sit below, in a group of their own - worth drawing,
          because Add to Home Screen is the last row of the group above it and
          looks like the end of the list until you notice there is more. */}
      <rect x="24" y="404" width={W - 48} height="52" rx="12" fill="#fff" />
      <text x="40" y="424" fill={grey} fontSize="14">Markup</text>
      <text x="40" y="448" fill={grey} fontSize="14">Print</text>
      <Highlight x={22} y={350} w={W - 44} h={40} />
    </Phone>
  );
}

/* ---- iPhone, Chrome ------------------------------------------------------
 *
 * The same share sheet, opened from Chrome instead, which words its own actions
 * differently: "Send to your device" where Safari has "Add to Bookmarks", and a
 * list underneath containing "Find in Page" and "Create a QR code" where Safari
 * has "Find on Page" and "Add to Favourites". Close enough to look identical in
 * a screenshot, different enough to send someone hunting for the wrong words.
 */

export function ChromeShareSheet() {
  const actions: Array<[number, string, string]> = [
    [46, 'Copy', ''],
    [116, 'Send to', 'your device'],
    [186, 'Add to', 'reading list'],
    [256, 'View More', ''],
  ];
  return (
    <Phone label="The share menu, with the round View More button at the bottom right circled in red">
      <AppScreen top={40} bottom={470} />
      <rect x="10" y="140" width={W - 20} height="330" rx="20" fill="#f2f2f7" />
      <ShareSheetTop y={140} />
      {actions.map(([cx, first, second]) => (
        <g key={first}>
          <circle cx={cx} cy="394" r="26" fill="#e3e3e8" />
          <text
            x={cx}
            y={second ? 434 : 438}
            textAnchor="middle"
            fill={ink}
            fontSize="11"
            fontWeight={first === 'View More' ? 700 : 400}
          >
            {first}
          </text>
          {second && (
            <text x={cx} y="447" textAnchor="middle" fill={ink} fontSize="11">
              {second}
            </text>
          )}
        </g>
      ))}
      {/* The chevron on the View More button points down: it opens the list. */}
      <path
        d="M244 388 l12 12 l12 -12"
        stroke={ink}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Ring cx={256} cy={394} r={34} />
    </Phone>
  );
}

/** Chrome, with the list open: Add to Home Screen is at the bottom of it. */
export function ChromeShareList() {
  const rows = [
    { y: 214, text: 'Add to bookmarks' },
    { y: 250, text: 'Create a QR code' },
    { y: 286, text: 'Find in Page' },
    { y: 322, text: 'Request desktop site' },
    { y: 358, text: 'Print' },
  ];
  return (
    <Phone label="The opened list, with the row that says Add to Home Screen outlined in red">
      <AppScreen top={40} bottom={470} />
      <rect x="10" y="90" width={W - 20} height="380" rx="20" fill="#f2f2f7" />
      <rect x="140" y="100" width="40" height="5" rx="2.5" fill="#c7c7cc" />
      <rect x="26" y="118" width="42" height="54" rx="6" fill="#0f172a" />
      <rect x="80" y="130" width="150" height="10" rx="5" fill="#c7c7cc" />
      <rect x="80" y="148" width="190" height="8" rx="4" fill="#dcdce1" />
      {/* The list, then Add to Home Screen in the group below it. */}
      <rect x="24" y="196" width={W - 48} height="192" rx="12" fill="#fff" />
      {rows.map((row, i) => (
        <g key={row.text}>
          <text x="40" y={row.y + 18} fill={ink} fontSize="14">
            {row.text}
          </text>
          {i < rows.length - 1 && (
            <line x1="40" y1={row.y + 32} x2={W - 40} y2={row.y + 32} stroke={line} />
          )}
        </g>
      ))}
      <rect x="24" y="404" width={W - 48} height="52" rx="12" fill="#fff" />
      <PlusSquare x={40} y={418} color={ink} />
      <text x="76" y="436" fill={ink} fontSize="14" fontWeight="700">
        Add to Home Screen
      </text>
      <Highlight x={22} y={402} w={W - 44} h={56} />
    </Phone>
  );
}

export function IosConfirmAdd() {
  const keys = [10, 9, 7];
  return (
    <Phone label="The Add to Home Screen screen, with the Add button at the top right circled in red">
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="26" fill="#f2f2f7" />
      <text x="30" y="55" fill="#0a7aff" fontSize="14">Cancel</text>
      <text x={W / 2} y="55" textAnchor="middle" fill={ink} fontSize="14" fontWeight="600">
        Add to Home Screen
      </text>
      <text x={W - 32} y="55" textAnchor="end" fill="#0a7aff" fontSize="14" fontWeight="700">
        Add
      </text>
      <Ring cx={W - 44} cy={50} r={24} />
      <rect x="24" y="90" width={W - 48} height="78" rx="12" fill="#fff" />
      <AppIcon x={38} y={101} size={56} />
      <text x="108" y="124" fill={ink} fontSize="16" fontWeight="600">Pressure</text>
      <text x="108" y="146" fill={grey} fontSize="12">measure-pressure-app.web.app</text>
      <text x="24" y="200" fill={grey} fontSize="12">
        An icon will be added to your Home Screen
      </text>
      <text x="24" y="218" fill={grey} fontSize="12">
        so you can quickly open this website.
      </text>
      {/* iOS shows the keyboard here, ready to rename the icon. */}
      <rect x="10" y="290" width={W - 20} height="180" fill="#d1d4da" />
      {keys.map((count, row) => {
        const keyWidth = (W - 20 - 8 * (count + 1)) / count;
        return Array.from({ length: count }, (_, i) => (
          <rect
            key={`${row}-${i}`}
            x={18 + i * (keyWidth + 8)}
            y={304 + row * 52}
            width={keyWidth}
            height="42"
            rx="6"
            fill="#fff"
          />
        ));
      })}
      <rect x="70" y="460" width={W - 140} height="42" rx="6" fill="#fff" />
    </Phone>
  );
}

export function IosHomeScreen() {
  const icons = [
    [38, 60], [108, 60], [178, 60], [248, 60],
    [38, 150], [108, 150], [248, 150],
  ];
  return (
    <Phone label="The phone's home screen, with the new Pressure icon circled in red">
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="26" fill="#dfe8f5" />
      {icons.map(([x, y]) => (
        <g key={`${x}${y}`}>
          <rect x={x} y={y} width="52" height="52" rx="12" fill="#b9c7dc" />
          <rect x={x + 8} y={y + 62} width="36" height="8" rx="4" fill="#b9c7dc" />
        </g>
      ))}
      <AppIcon x={178} y={150} size={52} />
      <text x="204" y="230" textAnchor="middle" fill={ink} fontSize="12" fontWeight="600">
        Pressure
      </text>
      <Ring cx={204} cy={176} r={38} />
      <rect x="30" y="392" width={W - 60} height="64" rx="18" fill="#c9d5e6" />
    </Phone>
  );
}

/* ---- Android (Chrome) --------------------------------------------------- */

export function AndroidMenuButton() {
  return (
    <Phone label="Chrome, with the three-dots button at the top right circled in red">
      <rect x="10" y="10" width={W - 20} height="64" fill="#fff" />
      <rect x="28" y="30" width={W - 96} height="34" rx="17" fill="#eef0f3" />
      <text x="46" y="52" fill={ink} fontSize="13">measure-pressure-app.web.app</text>
      <g fill={ink}>
        <circle cx={W - 42} cy="38" r="3" />
        <circle cx={W - 42} cy="47" r="3" />
        <circle cx={W - 42} cy="56" r="3" />
      </g>
      <Ring cx={W - 42} cy={47} r={24} />
      <AppScreen top={74} bottom={470} />
    </Phone>
  );
}

export function AndroidMenu() {
  const rows = [
    { y: 60, text: 'New tab' },
    { y: 100, text: 'History' },
    { y: 140, text: 'Downloads' },
    { y: 180, text: 'Bookmarks' },
    { y: 220, text: 'Add to Home screen', hit: true },
    { y: 260, text: 'Desktop site' },
    { y: 300, text: 'Settings' },
  ];
  return (
    <Phone label="Chrome's menu, with the row that says Add to Home screen outlined in red">
      <AppScreen top={10} bottom={470} />
      <rect x="70" y="30" width={W - 90} height="310" rx="6" fill="#fff" />
      {rows.map((row) => (
        <text
          key={row.text}
          x="90"
          y={row.y + 18}
          fill={ink}
          fontSize="15"
          fontWeight={row.hit ? 700 : 400}
        >
          {row.text}
        </text>
      ))}
      <Highlight x={78} y={214} w={W - 106} h={40} />
    </Phone>
  );
}

export function AndroidConfirmAdd() {
  return (
    <Phone label="A box asking to add to the home screen, with the Add button circled in red">
      <AppScreen top={10} bottom={470} />
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="26" fill="rgba(0,0,0,0.45)" />
      <rect x="34" y="170" width={W - 68} height="140" rx="14" fill="#fff" />
      <AppIcon x={52} y={188} size={40} />
      <text x="104" y="206" fill={ink} fontSize="15" fontWeight="600">Add to Home screen</text>
      <text x="104" y="226" fill={grey} fontSize="12">Measure Pressure</text>
      <text x={W - 120} y="288" textAnchor="end" fill="#1a73e8" fontSize="14" fontWeight="600">
        Cancel
      </text>
      <text x={W - 62} y="288" textAnchor="end" fill="#1a73e8" fontSize="14" fontWeight="700">
        Add
      </text>
      <Ring cx={W - 76} cy={283} r={24} />
    </Phone>
  );
}

export function AndroidHomeScreen() {
  return <IosHomeScreen />;
}
