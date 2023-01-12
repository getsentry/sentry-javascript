import { createTransport } from '@sentry/core';
import type { Event, EventHint } from '@sentry/types';

import type { EdgeClientOptions } from '../../src/edge/edgeclient';
import { EdgeClient } from '../../src/edge/edgeclient';

const PUBLIC_DSN = 'https://username@domain/123';

function getDefaultEdgeClientOptions(options: Partial<EdgeClientOptions> = {}): EdgeClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    stackParser: () => [],
    instrumenter: 'sentry',
    ...options,
  };
}

describe('NodeClient', () => {
  describe('_prepareEvent', () => {
    test('adds platform to event', () => {
      const options = getDefaultEdgeClientOptions({ dsn: PUBLIC_DSN });
      const client = new EdgeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.platform).toEqual('edge');
    });

    test('adds runtime context to event', () => {
      const options = getDefaultEdgeClientOptions({ dsn: PUBLIC_DSN });
      const client = new EdgeClient(options);

      const event: Event = {};
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.contexts?.runtime).toEqual({
        name: 'edge',
      });
    });

    test("doesn't clobber existing runtime data", () => {
      const options = getDefaultEdgeClientOptions({ dsn: PUBLIC_DSN });
      const client = new EdgeClient(options);

      const event: Event = { contexts: { runtime: { name: 'foo', version: '1.2.3' } } };
      const hint: EventHint = {};
      (client as any)._prepareEvent(event, hint);

      expect(event.contexts?.runtime).toEqual({ name: 'foo', version: '1.2.3' });
      expect(event.contexts?.runtime).not.toEqual({ name: 'edge' });
    });
  });
});
