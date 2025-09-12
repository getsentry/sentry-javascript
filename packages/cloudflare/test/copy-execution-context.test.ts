import { type ExecutionContext } from '@cloudflare/workers-types';
import { type Mocked, describe, expect, it, vi } from 'vitest';
import { copyExecutionContext } from '../src/utils/copyExecutionContext';

describe('Copy of the execution context', () => {
  describe.for<keyof ExecutionContext>(['waitUntil', 'passThroughOnException'])('%s', method => {
    it('Was not bound more than once', async () => {
      const context = makeExecutionContextMock();
      const copy = copyExecutionContext(context);
      const copy_of_copy = copyExecutionContext(copy);

      expect(copy[method]).toBe(copy_of_copy[method]);
    });
    it('Copied method is bound to the original', async () => {
      const context = makeExecutionContextMock();
      const copy = copyExecutionContext(context);

      expect(copy[method]()).toBe(context);
    });
    it('Copied method "rebind" prevention', async () => {
      const context = makeExecutionContextMock();
      const copy = copyExecutionContext(context);
      expect(copy[method].bind('test')).toBe(copy[method]);
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
    waitUntil: vi.fn().mockReturnThis(),
    passThroughOnException: vi.fn().mockReturnThis(),
  } as unknown as Mocked<T>;
}
