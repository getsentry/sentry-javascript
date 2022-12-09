import * as Sentry from '@sentry/node';
import '@sentry/tracing'; // this has a addExtensionMethods side effect
import { ProfilingIntegration } from '../../src/index'; // this has a addExtensionMethods side effect
import { writeFileSync } from 'node:fs';
import path from 'path';

const transport = () => {
  return {
    send: (event: any) => {
      if (event[1][0][0].type === 'profile') {
        console.log('Writing main.profile.json');
        writeFileSync(path.resolve(__dirname, 'main.profile.json'), JSON.stringify(event[1][0][1]));
      }
      return Promise.resolve();
    },
    flush: () => {
      return Promise.resolve(true);
    },
  };
};

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  debug: true,
  tracesSampleRate: 1,
  profilesSampleRate: 1,
  integrations: [new ProfilingIntegration()],
  transport,
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const transaction = Sentry.startTransaction({ name: 'first-sampled-profile' });
  await wait(1000);
  transaction.finish();
  await Sentry.flush(5000);
})();
