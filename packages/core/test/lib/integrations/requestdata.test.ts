import type { IncomingMessage } from 'http';
import type { RequestDataIntegrationOptions } from '../../../src';
import { requestDataIntegration, setCurrentClient } from '../../../src';
import type { Event, EventProcessor } from '../../../src/types-hoist';

import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

import * as requestDataModule from '../../../src/utils-hoist/requestdata';

const addNormalizedRequestDataToEventSpy = jest.spyOn(requestDataModule, 'addNormalizedRequestDataToEvent');

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
    event = { sdkProcessingMetadata: { request: req, normalizedRequest: {} } };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('option conversion', () => {
    it('leaves `ip` and `user` at top level of `include`', () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({ include: { ip: false, user: true } });

      void requestDataEventProcessor(event, {});
      expect(addNormalizedRequestDataToEventSpy).toHaveBeenCalled();
      const passedOptions = addNormalizedRequestDataToEventSpy.mock.calls[0]?.[3];

      expect(passedOptions?.include).toEqual(expect.objectContaining({ ip: false, user: true }));
    });

    it('moves `transactionNamingScheme` to `transaction` include', () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({ transactionNamingScheme: 'path' });

      void requestDataEventProcessor(event, {});

      const passedOptions = addNormalizedRequestDataToEventSpy.mock.calls[0]?.[3];

      expect(passedOptions?.include).toEqual(expect.objectContaining({ transaction: 'path' }));
    });

    it('moves `true` request keys into `request` include, but omits `false` ones', async () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({
        include: { data: true, cookies: false },
      });

      void requestDataEventProcessor(event, {});

      const passedOptions = addNormalizedRequestDataToEventSpy.mock.calls[0]?.[3];

      expect(passedOptions?.include?.request).toEqual(expect.arrayContaining(['data']));
      expect(passedOptions?.include?.request).not.toEqual(expect.arrayContaining(['cookies']));
    });

    it('moves `true` user keys into `user` include, but omits `false` ones', async () => {
      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({
        include: { user: { id: true, email: false } },
      });

      void requestDataEventProcessor(event, {});

      const passedOptions = addNormalizedRequestDataToEventSpy.mock.calls[0]?.[3];

      expect(passedOptions?.include?.user).toEqual(expect.arrayContaining(['id']));
      expect(passedOptions?.include?.user).not.toEqual(expect.arrayContaining(['email']));
    });
  });
});
