/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/client';
import { linkedTracesIntegration } from '../../src/integrations/linkedTraces';
import * as linkedTracesModule from '../../src/tracing/linkedTraces';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('linkedTracesIntegration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('links traces using the given storage', () => {
    const linkTracesSpy = vi.spyOn(linkedTracesModule, 'linkTraces').mockImplementation(() => {});
    const client = new BrowserClient(getDefaultBrowserClientOptions());

    linkedTracesIntegration({ storage: 'session-storage' }).setup?.(client);

    expect(linkTracesSpy).toHaveBeenCalledWith(client, {
      linkPreviousTrace: 'session-storage',
      consistentTraceSampling: false,
    });
  });

  it('does not link traces for bot user agents', () => {
    const linkTracesSpy = vi.spyOn(linkedTracesModule, 'linkTraces').mockImplementation(() => {});
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (compatible; Googlebot/2.1)');

    linkedTracesIntegration().setup?.(new BrowserClient(getDefaultBrowserClientOptions()));

    expect(linkTracesSpy).not.toHaveBeenCalled();
  });
});
