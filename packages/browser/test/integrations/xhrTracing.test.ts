/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/client';
import { xhrTracingIntegration } from '../../src/integrations/xhrTracing';
import * as requestModule from '../../src/tracing/request';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('xhrTracingIntegration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'instruments XHR requests for normal user agents',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0',
      1,
    ],
    ['does not instrument XHR requests for bot user agents', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 0],
  ])('%s', (_name, userAgent, calls) => {
    const instrumentSpy = vi.spyOn(requestModule, 'instrumentXhrRequests').mockImplementation(() => {});
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);

    xhrTracingIntegration().setup?.(new BrowserClient(getDefaultBrowserClientOptions()));

    expect(instrumentSpy).toHaveBeenCalledTimes(calls);
  });
});
