import type { IncomingMessage } from 'http';
import type { RequestDataIntegrationOptions } from '@sentry/core';
import { Hub, RequestData, getCurrentHub, makeMain } from '@sentry/core';
import type { Event, EventProcessor } from '@sentry/types';
import * as sentryUtils from '@sentry/utils';

import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

const addRequestDataToEventSpy = jest.spyOn(sentryUtils, 'addRequestDataToEvent');
const requestDataEventProcessor = jest.fn();

const headers = { ears: 'furry', nose: 'wet', tongue: 'spotted', cookie: 'favorite=zukes' };
const method = 'wagging';
const protocol = 'mutualsniffing';
const hostname = 'the.dog.park';
const path = '/by/the/trees/';
const queryString = 'chase=me&please=thankyou';

function initWithRequestDataIntegrationOptions(integrationOptions: RequestDataIntegrationOptions): void {
  const setMockEventProcessor = (eventProcessor: EventProcessor) =>
    requestDataEventProcessor.mockImplementationOnce(eventProcessor);

  const requestDataIntegration = new RequestData({
    ...integrationOptions,
  });

  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      integrations: [requestDataIntegration],
    }),
  );
  client.setupIntegrations = () => requestDataIntegration.setupOnce(setMockEventProcessor, getCurrentHub);
  client.getIntegration = () => requestDataIntegration as any;

  const hub = new Hub(client);

  makeMain(hub);
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
      initWithRequestDataIntegrationOptions({ include: { ip: false, user: true } });

      requestDataEventProcessor(event);

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include).toEqual(expect.objectContaining({ ip: false, user: true }));
    });

    it('moves `transactionNamingScheme` to `transaction` include', () => {
      initWithRequestDataIntegrationOptions({ transactionNamingScheme: 'path' });

      requestDataEventProcessor(event);

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include).toEqual(expect.objectContaining({ transaction: 'path' }));
    });

    it('moves `true` request keys into `request` include, but omits `false` ones', async () => {
      initWithRequestDataIntegrationOptions({ include: { data: true, cookies: false } });

      requestDataEventProcessor(event);

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include?.request).toEqual(expect.arrayContaining(['data']));
      expect(passedOptions?.include?.request).not.toEqual(expect.arrayContaining(['cookies']));
    });

    it('moves `true` user keys into `user` include, but omits `false` ones', async () => {
      initWithRequestDataIntegrationOptions({ include: { user: { id: true, email: false } } });

      requestDataEventProcessor(event);

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      expect(passedOptions?.include?.user).toEqual(expect.arrayContaining(['id']));
      expect(passedOptions?.include?.user).not.toEqual(expect.arrayContaining(['email']));
    });
  });
});
