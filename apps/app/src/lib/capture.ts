import { Platform } from 'react-native';

/**
 * Taking a photo in a mobile browser.
 *
 * expo-camera's <CameraView> works on the web via getUserMedia, but on a phone
 * browser that means a video element in the page - a live preview that competes
 * with Safari's own chrome, needs an HTTPS origin, and stops dead when the tab
 * loses focus. A plain file input with `capture` hands off to the phone's real
 * camera app instead: full resolution, familiar shutter, nothing to permission.
 *
 * React Native Web gives no way to render that input declaratively, so it is made
 * and clicked imperatively. Returns a blob URL, which is what the upload path
 * already expects on the web.
 */
export async function capturePhotoInBrowser(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // "environment" asks for the rear camera. Desktop browsers ignore it and show
    // a normal file picker, which is the right fallback there anyway.
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.onchange = () => {
      const file = input.files?.[0];
      finish(file ? URL.createObjectURL(file) : null);
    };
    // Safari fires no event when the picker is dismissed, so a cancelled capture
    // would otherwise leave the promise hanging forever.
    input.oncancel = () => finish(null);

    document.body.appendChild(input);
    input.click();
  });
}
