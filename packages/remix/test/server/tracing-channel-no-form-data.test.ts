import { tracingChannel } from 'node:diagnostics_channel';
import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
  CHANNELS,
  makeRequest,
  makeSpan,
  setupRemixChannelIntegration,
  teardownTestAsyncContextStrategy,
} from './tracing-channel-test-utils';

// Runs in its own file so the channel subscriptions register with NO form-data capture configured -
// the default for most apps. `captureActionFormDataKeys` gates only the optional attribute
// extraction, so ACTION spans must still be created.
describe('remixIntegration with orchestrion (no form-data capture configured)', () => {
  let startInactiveSpanSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    setupRemixChannelIntegration(undefined);
  });

  afterAll(() => {
    teardownTestAsyncContextStrategy();
  });

  beforeEach(() => {
    span = makeSpan();
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    getActiveSpanSpy = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({} as Span);
  });

  afterEach(() => {
    startInactiveSpanSpy.mockRestore();
    getActiveSpanSpy.mockRestore();
  });

  it('callRouteAction: still builds an ACTION span and sets the response status', async () => {
    const ctx = {
      arguments: [
        {
          routeId: 'routes/submit',
          request: makeRequest({ method: 'POST', url: 'http://localhost/submit', formEntries: { _action: 'create' } }),
          params: {},
        },
      ],
    };

    await tracingChannel(CHANNELS.CALL_ROUTE_ACTION).tracePromise(async () => ({ status: 201 }), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ACTION routes/submit',
        attributes: expect.objectContaining({
          'sentry.op': 'action.remix',
          'code.function': 'action',
          'http.method': 'POST',
        }),
      }),
    );
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 201);
    // No form-data capture configured, so no `formData.*` attribute is set.
    expect(span.setAttribute).not.toHaveBeenCalledWith('formData.actionType', expect.anything());
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
