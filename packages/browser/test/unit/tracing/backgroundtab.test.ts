import { getCurrentScope } from '@sentry/core';
import { setCurrentClient } from '@sentry/core';

import { TextDecoder, TextEncoder } from 'util';
const patchedEncoder = (!global.window.TextEncoder && (global.window.TextEncoder = TextEncoder)) || true;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
const patchedDecoder = (!global.window.TextDecoder && (global.window.TextDecoder = TextDecoder)) || true;

import { JSDOM } from 'jsdom';

import { BrowserClient } from '../../../src/client';
import { registerBackgroundTabDetection } from '../../../src/tracing/backgroundtab';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('registerBackgroundTabDetection', () => {
  afterAll(() => {
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedEncoder && delete global.window.TextEncoder;
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedDecoder && delete global.window.TextDecoder;
  });

  let events: Record<string, any> = {};
  beforeEach(() => {
    const dom = new JSDOM();
    global.document = dom.window.document;

    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    const client = new BrowserClient(options);
    setCurrentClient(client);
    client.init();

    global.document.addEventListener = jest.fn((event, callback) => {
      events[event] = callback;
    });
  });

  afterEach(() => {
    events = {};
    getCurrentScope().clear();
  });

  it('does not create an event listener if global document is undefined', () => {
    // @ts-expect-error need to override global document
    global.document = undefined;
    registerBackgroundTabDetection();
    expect(events).toMatchObject({});
  });

  it('creates an event listener', () => {
    registerBackgroundTabDetection();
    expect(events).toMatchObject({ visibilitychange: expect.any(Function) });
  });
});
