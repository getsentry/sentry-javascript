import type { Event } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { wasmIntegration } from '../src/index';
import { IMAGES } from '../src/registry';

const WASM_FILENAME = 'http://localhost:8001/main.wasm:wasm-function[10]:0x1234';

function exceptionValue(): NonNullable<NonNullable<Event['exception']>['values']>[number] {
  return { stacktrace: { frames: [{ filename: WASM_FILENAME, function: 'run', in_app: true }] } };
}

describe('processEvent()', () => {
  afterEach(() => {
    IMAGES.length = 0;
  });

  it('patches frames of all exception values, not only the first matching one', () => {
    IMAGES.push({
      type: 'wasm',
      code_id: 'abc123',
      code_file: 'http://localhost:8001/main.wasm',
      debug_file: null,
      debug_id: 'abc12300000000000000000000000000',
    });

    const integration = wasmIntegration();
    const event = integration.processEvent?.(
      { exception: { values: [exceptionValue(), exceptionValue()] } },
      {},
      {} as never,
    ) as Event;

    const frames = event.exception?.values?.map(value => value.stacktrace?.frames?.[0]);
    expect(frames?.[0]?.addr_mode).toBe('rel:0');
    expect(frames?.[1]?.addr_mode).toBe('rel:0');
    expect(event.debug_meta?.images).toHaveLength(1);
  });
});
