import type { IncomingMessage } from 'http';
import type { Event, EventProcessor } from '@sentry/types';
import * as sentryUtils from '@sentry/utils';
import type { RequestDataIntegrationOptions } from '../../../src';
import { requestDataIntegration, setCurrentClient } from '../../../src';

import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

const addRequestDataToEventSpy = jest.spyOn(sentryUtils, 'addRequestDataToEvent');

const headers = { ears: 'furry', nose: 'wet', tongue: 'spotted', cookie: 'favorite=zukes' };
const method = 'wagging';
const protocol = 'mutualsniffing';
const hostname = 'the.dog.park';
const path = '/by/the/trees/';
const queryString = 'chase=me&please=thankyou';

function initWithRequestDataIntegrationOptions(integrationOptions: RequestDataIntegrationOptions): EventProcessor {
  const integration = requestDataIntegration({
    ...integrationOptions,
  });

  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      integrations: [integration],
    }),
  );

  setCurrentClient(client);
  client.init();

  const eventProcessors = client['_eventProcessors'] as EventProcessor[];
  const eventProcessor = eventProcessors.find(processor => processor.id === 'RequestData');

  expect(eventProcessor).toBeDefined();

  return eventProcessor!;
}

describe('`RequestData` integration', () => {
  let req: IncomingMessage, event: Event;

  beforeEach(() => {
    req = {
      headers,
      method,
      protocol,
      hostname,
      originalUrl: `${path}?${queryString}`,
    } as unknown as IncomingMessage;
    event = { sdkProcessingMetadata: { request: req } };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('option conversion', () => {
    it('leaves `ip` and `user` at top level of `include`', () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({ include: { ip: false, user: true } });

      void requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include).toEqual(expect.objectContaining({ ip: false, user: true }));
    });

    it('moves `transactionNamingScheme` to `transaction` include', () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({ transactionNamingScheme: 'path' });

      void requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include).toEqual(expect.objectContaining({ transaction: 'path' }));
    });

    it('moves `true` request keys into `request` include, but omits `false` ones', async () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({
        include: { data: true, cookies: false },
      });

      void requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include?.request).toEqual(expect.arrayContaining(['data']));
      expect(passedOptions?.include?.request).not.toEqual(expect.arrayContaining(['cookies']));
    });

    it('moves `true` user keys into `user` include, but omits `false` ones', async () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({
        include: { user: { id: true, email: false } },
      });

      void requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include?.user).toEqual(expect.arrayContaining(['id']));
      expect(passedOptions?.include?.user).not.toEqual(expect.arrayContaining(['email']));
    });
  });
});
