import { BrowserClient } from '@sentry/browser';
import { Hub, makeMain } from '@sentry/hub';
// tslint:disable-next-line: no-implicit-dependencies
import { JSDOM } from 'jsdom';

import { SpanStatus } from '../../src';
import { registerBackgroundTabDetection } from '../../src/browser/backgroundtab';

describe('registerBackgroundTabDetection', () => {
  let events: Record<string, any> = {};
  let hub: Hub;
  beforeEach(() => {
    const dom = new JSDOM();
    // @ts-ignore
    global.document = dom.window.document;

    hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
    makeMain(hub);

    // @ts-ignore
    global.document.addEventListener = jest.fn((event, callback) => {
      events[event] = callback;
    });
  });

  afterEach(() => {
    events = {};
    hub.configureScope(scope => scope.setSpan(undefined));
  });

  it('does not creates an event listener if global document is undefined', () => {
    // @ts-ignore;
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
    // @ts-ignore
    global.document.hidden = true;
    events.visibilitychange();

    expect(transaction.status).toBe(SpanStatus.Cancelled);
    expect(transaction.tags.visibilitychange).toBe('document.hidden');
    expect(transaction.endTimestamp).toBeDefined();
  });
});
