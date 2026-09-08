import { useState, type ReactNode } from 'react';
import {
  AndroidConfirmAdd,
  AndroidHomeScreen,
  AndroidMenu,
  AndroidMenuButton,
  IosConfirmAdd,
  IosHomeScreen,
  IosShareButton,
  IosShareSheetCollapsed,
  IosShareSheetExpanded,
} from './Figures.tsx';

/**
 * The app's real address, written out in full rather than as "/".
 *
 * This page is meant to be opened from a link in WhatsApp, and it may end up on
 * an address of its own. A relative link would then point at whatever site the
 * page happens to be served from, which is exactly the wrong thing to save to a
 * home screen. The app's address is fixed, so state it.
 */
const APP_URL = 'https://measure-pressure-app.web.app/';

/** Daniel, for when something goes wrong. */
const WHATSAPP_URL = 'https://wa.me/447866750132';

type Platform = 'ios' | 'android';

/**
 * The reader is on the phone they want to install it on, so guess from that and
 * let them correct it. Anything that is not Android is shown the iPhone steps,
 * which also serves a laptop reader who wants to see what their parent will see.
 */
function guessPlatform(): Platform {
  return /android/i.test(navigator.userAgent) ? 'android' : 'ios';
}

export default function App() {
  const [platform, setPlatform] = useState<Platform>(guessPlatform);

  return (
    <>
      <header className="hero">
        <div className="wrap">
          <div className="brand">
            <img src="/icon.png" alt="" />
            <span>Measure Pressure</span>
          </div>
          <h1>Your blood pressure, written down.</h1>
          <p className="lede">
            Take a photo of your Omron monitor. The app reads the numbers, you check them, and they are
            saved. Over time you can see what pushes them up or down, and your doctor can see them
            too.
          </p>
          <div className="buttons">
            <a className="button" href={APP_URL}>
              Open Measure Pressure
            </a>
            <a className="button secondary" href="#install">
              Put it on your phone
            </a>
          </div>
        </div>
      </header>

      <main>
        <section>
          <div className="wrap">
            <h2>How it works</h2>
            <ol className="steps">
              <Step n={1} title="Take a photo of your Omron monitor">
                Hold the phone over the display and press the button. That is all.
              </Step>
              <Step n={2} title="Check the numbers">
                The app shows you what it read. If a number is wrong, tap it and change it. Nothing
                is saved until you say so.
              </Step>
              <Step n={3} title="Tick a box or two, if you like">
                Just had coffee? Slept badly? Took your tablets? Ticking a box takes a second, and
                after a few weeks you can see what actually moves your readings.
              </Step>
            </ol>
            <p className="muted">
              Your doctor can look at the readings too, in a table, from their computer. You choose
              who sees them.
            </p>
          </div>
        </section>

        <section id="install">
          <div className="wrap">
            <h2>Put it on your phone</h2>
            <p>
              Measure Pressure is not in the App Store. It is a web page that behaves like an app
              once it is on your home screen. This takes about a minute, and you only do it once.
            </p>

            <div className="tabs" role="tablist" aria-label="Which phone do you have?">
              <button
                role="tab"
                aria-selected={platform === 'ios'}
                onClick={() => setPlatform('ios')}
              >
                iPhone
              </button>
              <button
                role="tab"
                aria-selected={platform === 'android'}
                onClick={() => setPlatform('android')}
              >
                Android
              </button>
            </div>

            {platform === 'ios' ? <IosGuide /> : <AndroidGuide />}
          </div>
        </section>

        <section>
          <div className="wrap">
            <h2>The first time you open it</h2>
            <p>
              It asks for your email address. There is no password and nothing to sign up for. A
              six-digit code is sent to your email; type it in and you are in.
            </p>
            <p>
              It stays signed in as long as you keep using it. If you leave it for more than a
              week, it will ask for your email and a new code again. That is normal.
            </p>
            <p className="note">
              If you signed in before adding it to your home screen, it will ask once more when you
              open it from the new icon. That is also normal: the phone treats the icon as a
              separate app.
            </p>
          </div>
        </section>

        <section>
          <div className="wrap">
            <h2>Questions</h2>
            <div className="qa">
              <Question q="Who can see my readings?">
                Only you, and anyone you choose to share them with, such as your doctor. Nobody
                else.
              </Question>
              <Question q="Does it need the internet?">
                Yes. It needs a connection to read the photo and to save the numbers.
              </Question>
              <Question q="Will it work with my monitor?">
                It is built for Omron monitors, which is what we have at home. It reads their
                displays properly because it knows how they lay the numbers out. Another make
                may still work, but it may not, and nothing is lost if it does not &mdash; you
                type the numbers in instead and everything else works the same.
              </Question>
              <Question q="What if the photo does not work?">
                You can always type the numbers in yourself. The photo is a shortcut, not a
                requirement.
              </Question>
              <Question q="Does it cost anything?">
                No. It was built for the family, and there is nothing to pay for and nothing to
                subscribe to.
              </Question>
              <Question q="Something is not working">
                Send Daniel a message and he will sort it out.
                <a className="button" href={WHATSAPP_URL} style={{ marginTop: 16 }}>
                  Message Daniel on WhatsApp
                </a>
              </Question>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <p>Measure Pressure. Made by Daniel Kupfer for his family and their doctor.</p>
        </div>
      </footer>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li>
      <span className="num" aria-hidden="true">
        {n}
      </span>
      <div>
        <h3>{title}</h3>
        <p className="muted">{children}</p>
      </div>
    </li>
  );
}

/**
 * One question, folded away until it is tapped.
 *
 * <details> rather than a button and some state: the browser handles opening,
 * keyboard and screen readers on its own, it works before the JavaScript loads,
 * and the text inside is still found by the phone's Find on Page.
 */
function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details>
      <summary>{q}</summary>
      <div className="answer">{children}</div>
    </details>
  );
}

function Guide({ children }: { children: ReactNode }) {
  return <ol className="guide">{children}</ol>;
}

function GuideStep({
  n,
  children,
  figure,
}: {
  n: number;
  children: ReactNode;
  figure?: ReactNode;
}) {
  return (
    <li>
      <div className="head">
        <span className="num" aria-hidden="true">
          {n}
        </span>
        <p>{children}</p>
      </div>
      {figure}
    </li>
  );
}

function IosGuide() {
  return (
    <Guide>
      <GuideStep n={1}>
        Open Measure Pressure in <strong>Safari</strong>, the browser with the blue compass. If
        you are reading this in Safari already, this button will do:
        <br />
        <a className="button" href={APP_URL} style={{ marginTop: 14 }}>
          Open Measure Pressure
        </a>
        <br />
        <span className="muted" style={{ display: 'block', marginTop: 14, fontSize: 18 }}>
          If this link arrived in WhatsApp or an email and opened inside that app, the next step
          will not be there. Copy the link and open it in Safari instead.
        </span>
      </GuideStep>
      <GuideStep n={2} figure={<IosShareButton />}>
        Tap the <strong>Share</strong> button at the bottom of the screen. It is a square with an
        arrow pointing up.
      </GuideStep>
      <GuideStep n={3} figure={<IosShareSheetCollapsed />}>
        A panel slides up from the bottom. Near the bottom of it is a row of round grey buttons.
        Tap the last one, <strong>View More</strong>.
        <br />
        <span className="muted" style={{ display: 'block', marginTop: 14, fontSize: 18 }}>
          If you can already see the words Add to Home Screen, there is no View More button on
          your phone. Skip straight to the next step.
        </span>
      </GuideStep>
      <GuideStep n={4} figure={<IosShareSheetExpanded />}>
        A longer list appears. Scroll down it until you see <strong>Add to Home Screen</strong>,
        and tap that.
      </GuideStep>
      <GuideStep n={5} figure={<IosConfirmAdd />}>
        Tap <strong>Add</strong> in the top right corner.
      </GuideStep>
      <GuideStep n={6} figure={<IosHomeScreen />}>
        Done. There is now a <strong>Pressure</strong> icon on your home screen. From now on, open
        it from there, like any other app.
      </GuideStep>
    </Guide>
  );
}

function AndroidGuide() {
  return (
    <Guide>
      <GuideStep n={1}>
        Open Measure Pressure in <strong>Chrome</strong>. If you are reading this in Chrome
        already, this button will do:
        <br />
        <a className="button" href={APP_URL} style={{ marginTop: 14 }}>
          Open Measure Pressure
        </a>
      </GuideStep>
      <GuideStep n={2} figure={<AndroidMenuButton />}>
        Tap the <strong>three dots</strong> in the top right corner.
      </GuideStep>
      <GuideStep n={3} figure={<AndroidMenu />}>
        Tap <strong>Add to Home screen</strong>. On some phones it says{' '}
        <strong>Install app</strong> instead. It is the same thing.
      </GuideStep>
      <GuideStep n={4} figure={<AndroidConfirmAdd />}>
        Tap <strong>Add</strong>, or <strong>Install</strong>.
      </GuideStep>
      <GuideStep n={5} figure={<AndroidHomeScreen />}>
        Done. There is now a <strong>Pressure</strong> icon on your home screen. From now on, open
        it from there, like any other app.
      </GuideStep>
    </Guide>
  );
}
