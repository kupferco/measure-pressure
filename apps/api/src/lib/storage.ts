import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Storage } from '@google-cloud/storage';
import { config } from '../config.js';

/**
 * Where Omron photos live.
 *
 * Cloud Storage in the deployed environments; a folder on disk locally, so nobody
 * needs a bucket or credentials to work on the app. Objects are never public - the
 * API hands out short-lived signed URLs, because these are medical photographs.
 */
export interface ImageStore {
  save(image: Buffer, contentType: string): Promise<string>;
  /** A URL the client can fetch for a limited time, or null if the object is gone. */
  signedUrl(objectName: string): Promise<string | null>;
  read(objectName: string): Promise<Buffer | null>;
}

const URL_TTL_MS = 60 * 60 * 1000;

function objectNameFor(contentType: string): string {
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/heic' ? 'heic' : 'jpg';
  const now = new Date();
  // Date-partitioned so the bucket stays browsable by hand.
  const stamp = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `scans/${stamp}/${randomUUID()}.${ext}`;
}

export class GcsImageStore implements ImageStore {
  private storage = new Storage();

  constructor(private readonly bucketName: string) {}

  async save(image: Buffer, contentType: string): Promise<string> {
    const objectName = objectNameFor(contentType);
    await this.storage
      .bucket(this.bucketName)
      .file(objectName)
      .save(image, { contentType, resumable: false });
    return objectName;
  }

  async signedUrl(objectName: string): Promise<string | null> {
    const file = this.storage.bucket(this.bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) return null;
    try {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + URL_TTL_MS,
      });
      return url;
    } catch (err) {
      // Signing a v4 URL from Cloud Run is not a storage call: it goes to the IAM
      // Credentials API to sign with the runtime service account's key, and needs
      // roles/iam.serviceAccountTokenCreator on that account. Without it every
      // signature fails with iam.serviceAccounts.signBlob denied - and because the
      // URL is the last thing assembled in a scan response, an unhandled throw here
      // took down the whole capture *after* the photo was stored and read.
      //
      // The photo is decoration on a screen that already has the local one. Losing
      // it must never lose the reading, so this degrades to null - which the API
      // contract has always allowed - and says so loudly enough to be found.
      console.error({ err, objectName }, 'could not sign a URL for a stored photo');
      return null;
    }
  }

  async read(objectName: string): Promise<Buffer | null> {
    const file = this.storage.bucket(this.bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [contents] = await file.download();
    return contents;
  }
}

/**
 * Local development. Files go under LOCAL_UPLOAD_DIR and are served back through the
 * API's own authenticated route, so the access rules are identical to production.
 */
class LocalImageStore implements ImageStore {
  private readonly root = resolve(config.LOCAL_UPLOAD_DIR);

  async save(image: Buffer, contentType: string): Promise<string> {
    const objectName = objectNameFor(contentType);
    const path = join(this.root, objectName);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, image);
    return objectName;
  }

  async signedUrl(objectName: string): Promise<string | null> {
    return `/api/scans/image/${encodeURIComponent(objectName)}`;
  }

  async read(objectName: string): Promise<Buffer | null> {
    // Guard against a crafted object name escaping the upload directory.
    const path = resolve(this.root, objectName);
    if (!path.startsWith(this.root)) return null;
    return readFile(path).catch(() => null);
  }
}

export const imageStore: ImageStore = config.GCS_BUCKET
  ? new GcsImageStore(config.GCS_BUCKET)
  : new LocalImageStore();

export const usingCloudStorage = Boolean(config.GCS_BUCKET);
