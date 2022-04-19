import { BrowserClient } from '@sentry/browser';
import { setupBrowserTransport } from '@sentry/browser/src/transports';
import { getDefaultBrowserClientOptions } from '@sentry/browser/test/unit/helper/browser-client-options';
import { Hub, makeMain } from '@sentry/hub';
import { JSDOM } from 'jsdom';

import { registerBackgroundTabDetection } from '../../src/browser/backgroundtab';
import { addExtensionMethods } from '../../src/hubextensions';

describe('registerBackgroundTabDetection', () => {
  let events: Record<string, any> = {};
  let hub: Hub;
  beforeEach(() => {
    const dom = new JSDOM();
    // @ts-ignore need to override global document
    global.document = dom.window.document;

    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
    makeMain(hub);

    // If we do not add extension methods, invoking hub.startTransaction returns undefined
    addExtensionMethods();

    // @ts-ignore need to override global document
    global.document.addEventListener = jest.fn((event, callback) => {
      events[event] = callback;
    });
  });

  afterEach(() => {
    events = {};
    hub.configureScope(scope => scope.setSpan(undefined));
  });

  it('does not creates an event listener if global document is undefined', () => {
    // @ts-ignore need to override global document
    global.document = undefined;
    registerBackgroundTabDetection();
    expect(events).toMatchObject({});
  });

  it('creates an event listener', () => {
    registerBackgroundTabDetection();
    expect(events).toMatchObject({ visibilitychange: expect.any(Function) });
  });

  it('finishes a transaction on visibility change', () => {
    registerBackgroundTabDetection();
    const transaction = hub.startTransaction({ name: 'test' });
    hub.configureScope(scope => scope.setSpan(transaction));

    // Simulate document visibility hidden event
    // @ts-ignore need to override global document
    global.document.hidden = true;
    events.visibilitychange();

    expect(transaction.status).toBe('cancelled');
    expect(transaction.tags.visibilitychange).toBe('document.hidden');
    expect(transaction.endTimestamp).toBeDefined();
  });
});
