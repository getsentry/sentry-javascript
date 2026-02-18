import { describe, expect, it, type Mocked, vi } from 'vitest';
import { instrumentContext } from '../src/utils/instrumentContext';

describe('instrumentContext', () => {
  describe.for([
    'waitUntil',
    'passThroughOnException',
    'acceptWebSocket',
    'blockConcurrencyWhile',
    'getWebSockets',
    'arbitraryMethod',
    'anythingElse',
  ])('%s', method => {
    it('Override without changing original', async () => {
      const context = {
        [method]: vi.fn(),
      } as any;
      const instrumented = instrumentContext(context);
      instrumented[method] = vi.fn();
      expect(context[method]).not.toBe(instrumented[method]);
    });

    it('Overridden method was called', async () => {
      const context = {
        [method]: vi.fn(),
      } as any;
      const instrumented = instrumentContext(context);
      const overridden = vi.fn();
      instrumented[method] = overridden;
      instrumented[method]();
      expect(overridden).toBeCalled();
      expect(context[method]).not.toBeCalled();
    });
  });

  it('No side effects', async () => {
    const context = makeExecutionContextMock();
    expect(() => instrumentContext(Object.freeze(context))).not.toThrow(
      /Cannot define property \w+, object is not extensible/,
    );
  });
  it('Respects symbols', async () => {
    const s = Symbol('test');
    const context = makeExecutionContextMock<ExecutionContext & { [s]: unknown }>();
    context[s] = {};
    const instrumented = instrumentContext(context);
    expect(instrumented[s]).toBe(context[s]);
  });
});

function makeExecutionContextMock<T extends ExecutionContext>() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as Mocked<T>;
}
