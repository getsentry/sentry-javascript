import * as http from 'http';
import type { RequestDataIntegrationOptions} from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import { RequestData, getCurrentHub } from '@sentry/core';
import type { Event, EventProcessor, PolymorphicRequest } from '@sentry/types';
import * as sentryUtils from '@sentry/utils';

import { NodeClient } from '../../src/client';
import { requestHandler } from '../../src/handlers';
import { getDefaultNodeClientOptions } from '../helper/node-client-options';

const addRequestDataToEventSpy = jest.spyOn(sentryUtils, 'addRequestDataToEvent');

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

  describe('usage with express request handler and GCP wrapper', () => {
    it('uses options from Express request handler', async () => {
      const sentryRequestMiddleware = requestHandler({ include: { transaction: 'methodPath' } });
      const res = new http.ServerResponse(req);
      const next = jest.fn();

      const requestDataEventProcessor = initWithRequestDataIntegrationOptions({ transactionNamingScheme: 'path' });

      sentryRequestMiddleware(req, res, next);

      await getCurrentScope().applyToEvent(event, {});
      void requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      // `transaction` matches the request middleware's option, not the integration's option
      expect(passedOptions?.include).toEqual(expect.objectContaining({ transaction: 'methodPath' }));
    });

    it('uses options from GCP wrapper', async () => {
      type GCPHandler = (req: PolymorphicRequest, res: http.ServerResponse) => void;
      const mockGCPWrapper = (origHandler: GCPHandler, options: Record<string, unknown>): GCPHandler => {
        const wrappedHandler: GCPHandler = (req, res) => {
          getCurrentScope().setSDKProcessingMetadata({
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

      await getCurrentScope().applyToEvent(event, {});
      void requestDataEventProcessor(event, {});

      const passedOptions = addRequestDataToEventSpy.mock.calls[0][2];

      // `transaction` matches the GCP wrapper's option, not the integration's option
      expect(passedOptions?.include).toEqual(expect.objectContaining({ transaction: 'methodPath' }));
    });
  });
});
