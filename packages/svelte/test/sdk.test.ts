import { addGlobalEventProcessor, init as browserInit, SDK_VERSION } from '@sentry/browser';
import type { EventProcessor } from '@sentry/types';

import { detectAndReportSvelteKit, init as svelteInit, isSvelteKitApp } from '../src/sdk';

let passedEventProcessor: EventProcessor | undefined;

jest.mock('@sentry/browser', () => {
  const actual = jest.requireActual('@sentry/browser');
  return {
    ...actual,
    init: jest.fn().mockImplementation(actual.init),
    addGlobalEventProcessor: jest.fn().mockImplementation(proc => {
      passedEventProcessor = proc;
    }),
  };
});

describe('Initialize Svelte SDk', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  it('has the correct metadata', () => {
    svelteInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.svelte',
          packages: [{ name: 'npm:@sentry/svelte', version: SDK_VERSION }],
          version: SDK_VERSION,
        },
      },
    };

    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenCalledWith(expect.objectContaining(expectedMetadata));
  });
});

describe('detectAndReportSvelteKit()', () => {
  const originalHtmlBody = document.body.innerHTML;
  afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = originalHtmlBody;
    passedEventProcessor = undefined;
  });

  it('registers a global event processor', async () => {
    detectAndReportSvelteKit();

    expect(addGlobalEventProcessor).toHaveBeenCalledTimes(1);
    expect(passedEventProcessor?.id).toEqual('svelteKitProcessor');
  });

  it('adds "SvelteKit" as a module to the event, if SvelteKit was detected', () => {
    document.body.innerHTML += '<div id="svelte-announcer">Home</div>';
    detectAndReportSvelteKit();

    const processedEvent = passedEventProcessor && passedEventProcessor({} as unknown as any, {});

    expect(processedEvent).toBeDefined();
    expect(processedEvent).toEqual({ modules: { svelteKit: 'latest' } });
  });

  it("doesn't add anything to the event, if SvelteKit was not detected", () => {
    document.body.innerHTML = '';
    detectAndReportSvelteKit();

    const processedEvent = passedEventProcessor && passedEventProcessor({} as unknown as any, {});

    expect(processedEvent).toBeDefined();
    expect(processedEvent).toEqual({});
  });

  describe('isSvelteKitApp()', () => {
    it('returns true if the svelte-announcer div is present', () => {
      document.body.innerHTML += '<div id="svelte-announcer">Home</div>';
      expect(isSvelteKitApp()).toBe(true);
    });
    it('returns false if the svelte-announcer div is not present (but similar elements)', () => {
      document.body.innerHTML += '<div id="svelte-something">Home</div>';
      expect(isSvelteKitApp()).toBe(false);
    });
    it('returns false if no div is present', () => {
      document.body.innerHTML = '';
      expect(isSvelteKitApp()).toBe(false);
    });
  });
});
