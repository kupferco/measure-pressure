import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSignedUrl = vi.fn();
const exists = vi.fn();

// storage.ts reads config for the bucket and the local upload directory, and config
// refuses to load without a database URL. Neither matters here - the store under
// test is constructed with its bucket name directly.
vi.mock('../config.js', () => ({
  config: { GCS_BUCKET: 'bucket', LOCAL_UPLOAD_DIR: '.uploads' },
}));

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { file: () => ({ exists, getSignedUrl }) };
    }
  },
}));

const { GcsImageStore } = await import('./storage.js');

describe('signing a URL for a stored photo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exists.mockResolvedValue([true]);
  });

  it('returns the signed URL when signing works', async () => {
    getSignedUrl.mockResolvedValue(['https://storage.example/signed']);
    await expect(new GcsImageStore('bucket').signedUrl('scans/a.jpg')).resolves.toBe(
      'https://storage.example/signed',
    );
  });

  /**
   * The bug that made every production scan look like a camera failure.
   *
   * Signing a v4 URL from Cloud Run calls the IAM Credentials API, which needs a
   * role the runtime service account did not have. The throw happened while the
   * response was being assembled - *after* the photo had been stored, read and
   * saved - so a capture that had entirely succeeded was discarded, and the user
   * was told something had gone wrong.
   */
  it('degrades to null rather than throwing away a capture that worked', async () => {
    getSignedUrl.mockRejectedValue(
      new Error("Permission 'iam.serviceAccounts.signBlob' denied on resource"),
    );
    await expect(new GcsImageStore('bucket').signedUrl('scans/a.jpg')).resolves.toBeNull();
  });

  it('returns null for an object that is not there, without signing it', async () => {
    exists.mockResolvedValue([false]);
    await expect(new GcsImageStore('bucket').signedUrl('scans/gone.jpg')).resolves.toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
