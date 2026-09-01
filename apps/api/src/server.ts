import { config } from './config.js';
import { buildApp } from './app.js';
import { closePool, describeTarget } from './db/pool.js';
import { usingCloudStorage } from './lib/storage.js';
import { purgeExpired } from './modules/auth/service.js';

const app = await buildApp();

app.log.info(
  {
    env: config.APP_ENV,
    database: describeTarget(),
    mail: config.MAIL_TRANSPORT,
    images: usingCloudStorage ? 'cloud storage' : `disk (${config.LOCAL_UPLOAD_DIR})`,
  },
  'starting measure-pressure api',
);

// Expired sessions and spent login links accumulate forever otherwise. Cheap
// enough to do at boot rather than standing up a scheduler for it.
purgeExpired().catch((err) => app.log.warn({ err }, 'housekeeping failed'));

// Cloud Run sends SIGTERM and then waits; finish in-flight requests and hand back
// the database connections rather than dropping them.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app
      .close()
      .then(closePool)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
