import { describe, expect, it, vi } from 'vitest';
import { BrowserClient, setCurrentClient } from '../../src';
import { reportPageLoaded } from '../../src/tracing/reportPageLoaded';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('reportPageLoaded', () => {
  it('emits the endPageloadSpan event on the global client if no client is passed', () => {
    const client = new BrowserClient(getDefaultBrowserClientOptions({}));
    setCurrentClient(client);

    const emitSpy = vi.spyOn(client, 'emit');
    reportPageLoaded();

    expect(emitSpy).toHaveBeenCalledWith('endPageloadSpan');
  });

  it('emits the endPageloadSpan event on the passed client', () => {
    const client = new BrowserClient(getDefaultBrowserClientOptions({}));
    const emitSpy = vi.spyOn(client, 'emit');
    reportPageLoaded(client);

    expect(emitSpy).toHaveBeenCalledWith('endPageloadSpan');
  });
});
