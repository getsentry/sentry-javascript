import { BrowserClient } from '@sentry/browser';
import type { Hub, Scope } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import type { Client, ReplayEvent } from '@sentry/types';

import { REPLAY_EVENT_NAME } from '../../../src/constants';
import { prepareReplayEvent } from '../../../src/util/prepareReplayEvent';
import { getDefaultBrowserClientOptions } from '../../utils/getDefaultBrowserClientOptions';

describe('Unit | util | getReplayEvent', () => {
  let hub: Hub;
  let client: Client;
  let scope: Scope;

  beforeEach(() => {
    hub = getCurrentHub();
    client = new BrowserClient(getDefaultBrowserClientOptions());
    hub.bindClient(client);

    client = hub.getClient()!;
    scope = hub.getScope()!;
  });

  it('works', async () => {
    expect(client).toBeDefined();
    expect(scope).toBeDefined();

    const replayId = 'replay-ID';
    const event: ReplayEvent = {
      // @ts-ignore private api
      type: REPLAY_EVENT_NAME,
      timestamp: 1670837008.634,
      error_ids: ['error-ID'],
      trace_ids: ['trace-ID'],
      urls: ['https://sentry.io/'],
      replay_id: replayId,
      replay_type: 'session',
      segment_id: 3,
    };

    const replayEvent = await prepareReplayEvent({ scope, client, replayId, event });

    expect(replayEvent).toEqual({
      type: 'replay_event',
      timestamp: 1670837008.634,
      error_ids: ['error-ID'],
      trace_ids: ['trace-ID'],
      urls: ['https://sentry.io/'],
      replay_id: 'replay-ID',
      replay_type: 'session',
      segment_id: 3,
      platform: 'javascript',
      event_id: 'replay-ID',
      environment: 'production',
      sdk: {
        name: 'sentry.javascript.browser',
        version: 'version:Test',
      },
      sdkProcessingMetadata: {},
      breadcrumbs: undefined,
    });
  });
});
