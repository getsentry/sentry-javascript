import { DenoClient, getCurrentHub, initAndBind, makeDenoTransport } from './build/esm/index.js';

initAndBind(DenoClient, {
  dsn: 'https://7cea2b6e298f4fcc86bb28d22ceaeac4@o447951.ingest.sentry.io/4505391490007040',
  transport: makeDenoTransport,
  integrations: [],
  beforeSend(event, hint) {
    console.log(event);
    return event;
  },
});

const hub = getCurrentHub();
const client = hub.getClient();

client?.captureException(new Error('Hello from Deno!'));
