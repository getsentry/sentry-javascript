import { Hub, makeMain } from '@sentry/core';
import { JSDOM } from 'jsdom';

import { addExtensionMethods } from '../../../tracing/src';
import { conditionalTest, getDefaultBrowserClientOptions } from '../../../tracing/test/testutils';
import { registerBackgroundTabDetection } from '../../src/browser/backgroundtab';
import { TestClient } from '../utils/TestClient';

conditionalTest({ min: 10 })('registerBackgroundTabDetection', () => {
  let events: Record<string, any> = {};
  let hub: Hub;
  beforeEach(() => {
    const dom = new JSDOM();
    // @ts-expect-error need to override global document
    global.document = dom.window.document;

    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    hub = new Hub(new TestClient(options));
    makeMain(hub);

    // If we do not add extension methods, invoking hub.startTransaction returns undefined
    // eslint-disable-next-line deprecation/deprecation
    addExtensionMethods();

    // @ts-expect-error need to override global document
    global.document.addEventListener = jest.fn((event, callback) => {
      events[event] = callback;
    });
  });

  afterEach(() => {
    events = {};
    hub.configureScope(scope => scope.setSpan(undefined));
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
    const transaction = hub.startTransaction({ name: 'test' });
    hub.configureScope(scope => scope.setSpan(transaction));

    // Simulate document visibility hidden event
    // @ts-expect-error need to override global document
    global.document.hidden = true;
    events.visibilitychange();

    expect(transaction.status).toBe('cancelled');
    expect(transaction.tags.visibilitychange).toBe('document.hidden');
    expect(transaction.endTimestamp).toBeDefined();
  });
});
