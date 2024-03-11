import { addTracingExtensions, getCurrentScope } from '@sentry/core';
import { setCurrentClient, spanToJSON, startSpan } from '@sentry/core';
import { JSDOM } from 'jsdom';

import { registerBackgroundTabDetection } from '../../src/browser/backgroundtab';
import { TestClient, getDefaultClientOptions } from '../utils/TestClient';

describe('registerBackgroundTabDetection', () => {
  let events: Record<string, any> = {};
  beforeEach(() => {
    const dom = new JSDOM();
    // @ts-expect-error need to override global document
    global.document = dom.window.document;

    const options = getDefaultClientOptions({ tracesSampleRate: 1 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    addTracingExtensions();

    // @ts-expect-error need to override global document
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

  it('finishes a transaction on visibility change', () => {
    registerBackgroundTabDetection();
    startSpan({ name: 'test' }, span => {
      // Simulate document visibility hidden event
      // @ts-expect-error need to override global document
      global.document.hidden = true;
      events.visibilitychange();

      const { status, timestamp, data } = spanToJSON(span);

      expect(status).toBe('cancelled');
      expect(status).toBeDefined();
      expect(data!['sentry.cancellation_reason']).toBe('document.hidden');
      expect(timestamp).toBeDefined();
    });
  });
});
