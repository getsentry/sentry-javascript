import { getCurrentHub } from '@sentry/core';
import type { Event, EventProcessor, PolymorphicRequest } from '@sentry/types';
import * as http from 'http';

import { NodeClient } from '../../src/client';
import { requestHandler } from '../../src/handlers';
import type { RequestDataIntegrationOptions } from '../../src/integrations/requestdata';
import { RequestData } from '../../src/integrations/requestdata';
import * as requestDataModule from '../../src/requestdata';
import { getDefaultNodeClientOptions } from '../helper/node-client-options';

const addRequestDataToEventSpy = jest.spyOn(requestDataModule, 'addRequestDataToEvent');

const headers = { ears: 'furry', nose: 'wet', tongue: 'spotted', cookie: 'favorite=zukes' };
const method = 'wagging';
const protocol = 'mutualsniffing';
const hostname = 'the.dog.park';
const path = '/by/the/trees/';
const queryString = 'chase=me&please=thankyou';

function initWithRequestDataIntegrationOptions(integrationOptions: RequestDataIntegrationOptions): EventProcessor {
  const requestDataIntegration = new RequestData({
    ...integrationOptions,
  });

  const client = new NodeClient(
    getDefaultNodeClientOptions({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      integrations: [requestDataIntegration],
    }),
  );

  getCurrentHub().bindClient(client);

  const eventProcessors = client['_eventProcessors'] as EventProcessor[];
  const eventProcessor = eventProcessors.find(processor => processor.id === 'RequestData');

  expect(eventProcessor).toBeDefined();

  return eventProcessor!;
}

describe('`RequestData` integration', () => {
  let req: http.IncomingMessage, event: Event;

  beforeEach(() => {
    req = {
      headers,
      method,
      protocol,
      hostname,
      originalUrl: `${path}?${queryString}`,
    } as unknown as http.IncomingMessage;
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

  describe('usage with express request handler and GCP wrapper', () => {
    it('uses options from Express request handler', async () => {
      const sentryRequestMiddleware = requestHandler({ include: { transaction: 'methodPath' } });
      const res = new http.ServerResponse(req);
      const next = jest.fn();

      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({ transactionNamingScheme: 'path' });

      sentryRequestMiddleware(req, res, next);

      await getCurrentHub().getScope()!.applyToEvent(event, {});
      await requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      // `transaction` matches the request middleware's option, not the integration's option
      expect(passedOptions?.include).toEqual(expect.objectContaining({ transaction: 'methodPath' }));
    });

    it('uses options from GCP wrapper', async () => {
      type GCPHandler = (req: PolymorphicRequest, res: http.ServerResponse) => void;
      const mockGCPWrapper = (origHandler: GCPHandler, options: Record<string, unknown>): GCPHandler => {
        const wrappedHandler: GCPHandler = (req, res) => {
          getCurrentHub().getScope().setSDKProcessingMetadata({
            request: req,
            requestDataOptionsFromGCPWrapper: options,
          });
          origHandler(req, res);
        };
        return wrappedHandler;
      };

      const wrappedGCPFunction = mockGCPWrapper(jest.fn(), { include: { transaction: 'methodPath' } });
      const res = new http.ServerResponse(req);

      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({ transactionNamingScheme: 'path' });

      wrappedGCPFunction(req, res);

      await getCurrentHub().getScope()!.applyToEvent(event, {});
      await requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      // `transaction` matches the GCP wrapper's option, not the integration's option
      expect(passedOptions?.include).toEqual(expect.objectContaining({ transaction: 'methodPath' }));
    });
  });
});
