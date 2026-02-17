import { describe, expect, it, type Mocked, vi } from 'vitest';
import { copyExecutionContext } from '../src/utils/copyExecutionContext';

describe('Copy of the execution context', () => {
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
      const copy = copyExecutionContext(context);
      copy[method] = vi.fn();
      expect(context[method]).not.toBe(copy[method]);
    });

    it('Overridden method was called', async () => {
      const context = {
        [method]: vi.fn(),
      } as any;
      const copy = copyExecutionContext(context);
      const overridden = vi.fn();
      copy[method] = overridden;
      copy[method]();
      expect(overridden).toBeCalled();
      expect(context[method]).not.toBeCalled();
    });
  });

  it('No side effects', async () => {
    const context = makeExecutionContextMock();
    expect(() => copyExecutionContext(Object.freeze(context))).not.toThrow(
      /Cannot define property \w+, object is not extensible/,
    );
  });
  it('Respects symbols', async () => {
    const s = Symbol('test');
    const context = makeExecutionContextMock<ExecutionContext & { [s]: unknown }>();
    context[s] = {};
    const copy = copyExecutionContext(context);
    expect(copy[s]).toBe(context[s]);
  });
});

function makeExecutionContextMock<T extends ExecutionContext>() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as Mocked<T>;
}
