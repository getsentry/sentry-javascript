import { maybeInstrument } from '../src';

describe('maybeInstrument', () => {
  test('does not throw when instrumenting fails', () => {
    maybeInstrument('xhr', () => {
      throw new Error('test');
    });
  });

  test('does not throw when instrumenting fn is not a function', () => {
    maybeInstrument('xhr', undefined as any);
  });
});
