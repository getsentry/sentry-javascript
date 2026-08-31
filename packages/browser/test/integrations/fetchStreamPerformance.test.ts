import type { Client, HandlerDataFetch } from '@sentry/core/browser';
import * as utils from '@sentry/core/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStreamPerformanceIntegration } from '../../src/integrations/fetchStreamPerformance';

describe('fetchStreamPerformanceIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { origin: 'https://app.example.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Runs the integration's fetch handler for a streamed response and returns the `startInactiveSpan` spy. */
  function trackStreamedFetch(traceLifecycle: 'static' | 'stream', url: string) {
    let fetchHandler: ((data: HandlerDataFetch) => void) | undefined;
    vi.spyOn(utils, 'addFetchInstrumentationHandler').mockImplementation(handler => {
      fetchHandler = handler;
      return () => {};
    });
    vi.spyOn(utils, 'addFetchEndInstrumentationHandler').mockImplementation(() => () => {});
    const startInactiveSpanSpy = vi
      .spyOn(utils, 'startInactiveSpan')
      .mockReturnValue(new utils.SentryNonRecordingSpan());

    fetchStreamPerformanceIntegration().setup?.({
      getOptions: () => ({ traceLifecycle }),
      getDataCollectionOptions: () => ({ urlQueryParams: true }),
    } as unknown as Client);

    // A streamed response is detected by a streaming content type and a missing content-length.
    fetchHandler?.({
      fetchData: { url, method: 'GET' },
      args: [url],
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 1,
      response: { headers: new Headers({ 'content-type': 'text/event-stream' }) },
    } as unknown as HandlerDataFetch);

    return startInactiveSpanSpy;
  }

  it('drops the URL path but keeps the domain with span streaming enabled', () => {
    expect(trackStreamedFetch('stream', 'https://api.example.com/v1/chat?stream=1')).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET api.example.com',
        attributes: expect.objectContaining({ 'url.domain': 'api.example.com' }),
      }),
    );
  });

  it('resolves a relative URL against the page origin', () => {
    expect(trackStreamedFetch('stream', '/v1/chat')).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET app.example.com',
        attributes: expect.objectContaining({ 'url.domain': 'app.example.com' }),
      }),
    );
  });

  it('falls back to the request method for a data URL, which has no domain', () => {
    expect(trackStreamedFetch('stream', 'data:text/event-stream,data: hi')).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET',
        attributes: expect.objectContaining({ 'url.domain': undefined }),
      }),
    );
  });

  it('keeps the sanitized URL with `traceLifecycle: "static"`', () => {
    expect(trackStreamedFetch('static', 'https://api.example.com/v1/chat?stream=1')).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET https://api.example.com/v1/chat',
        attributes: expect.objectContaining({ 'url.domain': 'api.example.com' }),
      }),
    );
  });
});
