import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML shell for the web build.
 *
 * This exists because the web build is not a fallback here - it is how the app is
 * used on the phone, and how the doctor uses it entirely. Expo emits a bare
 * document by default, which loads fine but behaves like a web page: Add to Home
 * Screen keeps the browser chrome, the status bar stays white above a dark app,
 * and the icon is a screenshot.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          viewport-fit=cover lets the app paint under the notch and home indicator
          once it is launched from the home screen. Zoom is deliberately left
          enabled - this app is for people who may want to enlarge the numbers, and
          blocking pinch-zoom to avoid a double-tap quirk is a poor trade.
        */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

        {/* Launch fullscreen from the home screen, with no browser bar. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* translucent lets the dark background run up behind the clock and battery. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Pressure" />
        <meta name="theme-color" content="#0f172a" />

        <meta name="description" content="Track your blood pressure by photographing your monitor." />

        {/*
          Without this, react-native-web's scroll containers fight the document's
          own scrolling on iOS.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: shellStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * Paints the page the app's own colour before any JavaScript runs, so launching
 * from the home screen does not flash white, and the overscroll area at the top
 * and bottom matches rather than showing bare white.
 */
const shellStyle = `
  html, body { background-color: #0f172a; }
  body { overscroll-behavior-y: none; }
`;
