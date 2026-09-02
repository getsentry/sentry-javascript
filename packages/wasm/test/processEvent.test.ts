import type { DebugImage, Event } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { wasmIntegration } from '../src/index';
import { IMAGES } from '../src/registry';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryWasmImages?: Array<DebugImage>;
};

const WASM_FILENAME = 'http://localhost:8001/main.wasm:wasm-function[10]:0x1234';

function exceptionValue(): NonNullable<NonNullable<Event['exception']>['values']>[number] {
  return { stacktrace: { frames: [{ filename: WASM_FILENAME, function: 'run', in_app: true }] } };
}

describe('processEvent()', () => {
  afterEach(() => {
    IMAGES.length = 0;
    delete WINDOW._sentryWasmImages;
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

  it('attaches images for wasm:// frames on the main thread when the basename is unique', () => {
    IMAGES.push({
      type: 'wasm',
      code_id: 'abc123',
      code_file: 'http://localhost:8080/web/assets/emscripten-raycast/maze.split.wasm',
      debug_file: null,
      debug_id: 'abc12300000000000000000000000000',
    });

    const integration = wasmIntegration();
    const event = integration.processEvent?.(
      {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: 'wasm://wasm/maze.split.wasm-000197f6',
                    function: 'trigger_crash_divzero',
                    instruction_addr: '0x283d',
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      },
      {},
      {} as never,
    ) as Event;

    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.addr_mode).toBe('rel:0');
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      'http://localhost:8080/web/assets/emscripten-raycast/maze.split.wasm',
    );
    expect(event.debug_meta?.images).toHaveLength(1);
  });

  it('attaches a wasm:// image when page and worker registered the same code_file', () => {
    const image: DebugImage = {
      type: 'wasm',
      code_id: 'abc123',
      code_file: 'http://localhost:8080/web/assets/emscripten-raycast/maze.split.wasm',
      debug_file: null,
      debug_id: 'abc12300000000000000000000000000',
    };
    IMAGES.push(image);
    WINDOW._sentryWasmImages = [image];

    const integration = wasmIntegration();
    const event = integration.processEvent?.(
      {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: 'wasm://wasm/maze.split.wasm-000197f6',
                    function: 'trigger_crash_divzero',
                    instruction_addr: '0x283d',
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      },
      {},
      {} as never,
    ) as Event;

    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.addr_mode).toBe('rel:0');
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      'http://localhost:8080/web/assets/emscripten-raycast/maze.split.wasm',
    );
    expect(event.debug_meta?.images).toHaveLength(2);
  });

  it('does not guess a wasm:// image when two registered modules share the filename', () => {
    IMAGES.push(
      {
        type: 'wasm',
        code_id: 'aaa',
        code_file: 'http://localhost:8001/v1/app.wasm',
        debug_file: null,
        debug_id: 'aaa00000000000000000000000000000',
      },
      {
        type: 'wasm',
        code_id: 'bbb',
        code_file: 'http://localhost:8001/v2/app.wasm',
        debug_file: null,
        debug_id: 'bbb00000000000000000000000000000',
      },
    );

    const integration = wasmIntegration();
    const event = integration.processEvent?.(
      {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: 'wasm://wasm/app.wasm-abc123',
                    function: 'run',
                    instruction_addr: '0x10',
                    in_app: true,
                  },
                ],
              },
            },
          ],
        },
      },
      {},
      {} as never,
    ) as Event;

    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.addr_mode).toBeUndefined();
    expect(event.debug_meta?.images).toBeUndefined();
  });
});
