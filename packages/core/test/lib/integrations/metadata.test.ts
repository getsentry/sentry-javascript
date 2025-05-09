import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  captureException,
  createStackParser,
  createTransport,
  GLOBAL_OBJ,
  moduleMetadataIntegration,
  nodeStackLineParser,
  parseEnvelope,
  setCurrentClient,
} from '../../../src';
import type { Event } from '../../../src/types-hoist/event';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const stackParser = createStackParser(nodeStackLineParser());

const stack = new Error().stack || '';

describe('ModuleMetadata integration', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;

    GLOBAL_OBJ._sentryModuleMetadata = GLOBAL_OBJ._sentryModuleMetadata || {};
    GLOBAL_OBJ._sentryModuleMetadata[stack] = { team: 'frontend' };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('Adds and removes metadata from stack frames', () =>
    new Promise<void>(done => {
      const options = getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        enableSend: true,
        stackParser,
        integrations: [moduleMetadataIntegration()],
        beforeSend: (event, _hint) => {
          // copy the frames since reverse in in-place
          const lastFrame = [...(event.exception?.values?.[0]?.stacktrace?.frames || [])].reverse()[0];
          // Ensure module_metadata is populated in beforeSend callback
          expect(lastFrame?.module_metadata).toEqual({ team: 'frontend' });
          return event;
        },
        transport: () =>
          createTransport({ recordDroppedEvent: () => undefined }, async req => {
            const [, items] = parseEnvelope(req.body);

            expect(items[0][1]).toBeDefined();
            const event = items[0][1] as Event;
            const error = event.exception?.values?.[0];

            // Ensure we're looking at the same error we threw
            expect(error?.value).toEqual('Some error');

            const lastFrame = [...(error?.stacktrace?.frames || [])].reverse()[0];
            // Ensure the last frame is in fact for this file
            expect(lastFrame?.filename).toEqual(__filename);

            // Ensure module_metadata has been stripped from the event
            expect(lastFrame?.module_metadata).toBeUndefined();

            done();
            return {};
          }),
      });

      const client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      captureException(new Error('Some error'));
    }));
});
