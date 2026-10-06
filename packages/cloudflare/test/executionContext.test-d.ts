import type { ExecutionContext } from '@cloudflare/workers-types';
import { describe, expectTypeOf, it } from 'vitest';
import type { ExecutionContextCompat } from '../src/executionContext';

// The shape of `ExecutionContext` in `@cloudflare/workers-types` v4, which has no `exports` and an optional `tracing`.
interface ExecutionContextV4 {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  readonly props: unknown;
}

describe('ExecutionContextCompat', () => {
  it('accepts a v5 ExecutionContext', () => {
    expectTypeOf<ExecutionContext>().toExtend<ExecutionContextCompat>();
  });

  it('accepts a v4 ExecutionContext without the members v5 made required', () => {
    expectTypeOf<ExecutionContextV4>().toExtend<ExecutionContextCompat>();
  });

  it('rejects a context without waitUntil', () => {
    expectTypeOf<Omit<ExecutionContextV4, 'waitUntil'>>().not.toExtend<ExecutionContextCompat>();
  });

  it('exposes waitUntil from both majors', () => {
    expectTypeOf<ExecutionContextCompat['waitUntil']>().toEqualTypeOf<ExecutionContext['waitUntil']>();
  });
});
