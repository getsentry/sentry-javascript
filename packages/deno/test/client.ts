import type { sentryTypes } from '../build-test/index.js';
import { sentryUtils } from '../build-test/index.js';
import { DenoClient, getCurrentScope, getDefaultIntegrations } from '../build/index.mjs';
import { getNormalizedEvent } from './normalize.ts';
import { makeTestTransport } from './transport.ts';

export function getTestClient(
  callback: (event?: sentryTypes.Event) => void,
  integrations: sentryTypes.Integration[] = [],
): DenoClient {
  const client = new DenoClient({
    dsn: 'https://233a45e5efe34c47a3536797ce15dafa@nothing.here/5650507',
    debug: true,
    integrations: [...getDefaultIntegrations({}), ...integrations],
    stackParser: sentryUtils.createStackParser(sentryUtils.nodeStackLineParser()),
    transport: makeTestTransport(envelope => {
      callback(getNormalizedEvent(envelope));
    }),
  });

  client.init();
  getCurrentScope().setClient(client);

  return client;
}
