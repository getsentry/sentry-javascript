import type { Event, EventHint, ScopeContext } from '@sentry/types';
import { createStackParser, GLOBAL_OBJ } from '@sentry/utils';

import { Scope } from '../../src/scope';
import { applyDebugIds, applyDebugMeta, parseEventHintOrCaptureContext } from '../../src/utils/prepareEvent';

describe('applyDebugIds', () => {
  afterEach(() => {
    GLOBAL_OBJ._sentryDebugIds = undefined;
  });

  it("should put debug IDs into an event's stack frames", () => {
    GLOBAL_OBJ._sentryDebugIds = {
      'filename1.js\nfilename1.js': 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
      'filename2.js\nfilename2.js': 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
      'filename4.js\nfilename4.js': 'cccccccc-cccc-4ccc-cccc-cccccccccc',
    };

    const stackParser = createStackParser([0, line => ({ filename: line })]);

    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'filename1.js' },
                { filename: 'filename2.js' },
                { filename: 'filename1.js' },
                { filename: 'filename3.js' },
              ],
            },
          },
        ],
      },
    };

    applyDebugIds(event, stackParser);

    expect(event.exception?.values?.[0].stacktrace?.frames).toContainEqual({
      filename: 'filename1.js',
      debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
    });

    expect(event.exception?.values?.[0].stacktrace?.frames).toContainEqual({
      filename: 'filename2.js',
      debug_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
    });

    // expect not to contain an image for the stack frame that doesn't have a corresponding debug id
    expect(event.exception?.values?.[0].stacktrace?.frames).not.toContainEqual(
      expect.objectContaining({
        filename3: 'filename3.js',
        debug_id: expect.any(String),
      }),
    );

    // expect not to contain an image for the debug id mapping that isn't contained in the stack trace
    expect(event.exception?.values?.[0].stacktrace?.frames).not.toContainEqual(
      expect.objectContaining({
        filename3: 'filename4.js',
        debug_id: 'cccccccc-cccc-4ccc-cccc-cccccccccc',
      }),
    );
  });
});

describe('applyDebugMeta', () => {
  it("should move the debug IDs inside an event's stack frame into the debug_meta field", () => {
    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'filename1.js', debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' },
                { filename: 'filename2.js', debug_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb' },
                { filename: 'filename1.js', debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' },
                { filename: 'filename3.js' },
              ],
            },
          },
        ],
      },
    };

    applyDebugMeta(event);

    expect(event.exception?.values?.[0].stacktrace?.frames).toEqual([
      { filename: 'filename1.js' },
      { filename: 'filename2.js' },
      { filename: 'filename1.js' },
      { filename: 'filename3.js' },
    ]);

    expect(event.debug_meta?.images).toContainEqual({
      type: 'sourcemap',
      code_file: 'filename1.js',
      debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
    });

    expect(event.debug_meta?.images).toContainEqual({
      type: 'sourcemap',
      code_file: 'filename2.js',
      debug_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
    });
  });
});

describe('parseEventHintOrCaptureContext', () => {
  it('works with undefined', () => {
    const actual = parseEventHintOrCaptureContext(undefined);
    expect(actual).toEqual(undefined);
  });

  it('works with an empty object', () => {
    const actual = parseEventHintOrCaptureContext({});
    expect(actual).toEqual({});
  });

  it('works with a Scope', () => {
    const scope = new Scope();
    const actual = parseEventHintOrCaptureContext(scope);
    expect(actual).toEqual({ captureContext: scope });
  });

  it('works with a function', () => {
    const scope = () => new Scope();
    const actual = parseEventHintOrCaptureContext(scope);
    expect(actual).toEqual({ captureContext: scope });
  });

  it('works with an EventHint', () => {
    const hint: EventHint = {
      mechanism: { handled: false },
    };
    const actual = parseEventHintOrCaptureContext(hint);
    expect(actual).toEqual(hint);
  });

  it('works with a ScopeContext', () => {
    const scopeContext: ScopeContext = {
      user: { id: 'xxx' },
      level: 'debug',
      extra: { foo: 'bar' },
      contexts: { os: { name: 'linux' } },
      tags: { foo: 'bar' },
      fingerprint: ['xx', 'yy'],
      requestSession: { status: 'ok' },
      propagationContext: {
        traceId: 'xxx',
        spanId: 'yyy',
      },
    };

    const actual = parseEventHintOrCaptureContext(scopeContext);
    expect(actual).toEqual({ captureContext: scopeContext });
  });

  it('it TS errors if trying to mix ScopeContext & EventHint xxx', () => {
    const actual = parseEventHintOrCaptureContext({
      // @ts-expect-error We are specifically testing that this errors!
      user: { id: 'xxx' },
      mechanism: { handled: false },
    });

    // ScopeContext takes presedence in this case, but this is actually not supported
    expect(actual).toEqual({
      captureContext: {
        user: { id: 'xxx' },
        mechanism: { handled: false },
      },
    });
  });
});
