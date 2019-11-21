import { Hub, Scope } from '@sentry/hub';

import { addExtensionMethods } from '../src/hubextensions';

addExtensionMethods();
const clientFn: any = jest.fn();

describe('Hub', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('spans', () => {
    describe('start', () => {
      test('simple', () => {
        const hub = new Hub(clientFn);
        const span = hub.startSpan() as any;
        expect(span._spanId).toBeTruthy();
      });

      test('inherits from parent span', () => {
        const myScope = new Scope();
        const hub = new Hub(clientFn, myScope);
        const parentSpan = hub.startSpan({}) as any;
        expect(parentSpan._parentId).toBeFalsy();
        hub.configureScope(scope => {
          scope.setSpan(parentSpan);
        });
        const span = hub.startSpan({}) as any;
        expect(span._parentSpanId).toBeTruthy();
      });
    });
  });
});
