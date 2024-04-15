import type { Event, StackFrame } from '@sentry/types';

import { generateIteratee, rewriteFramesIntegration } from '../../../src/integrations/rewriteframes';

let rewriteFrames: ReturnType<typeof rewriteFramesIntegration>;
let exceptionEvent: Event;
let exceptionWithoutStackTrace: Event;
let windowsExceptionEvent: Event;
let windowsLowerCaseExceptionEvent: Event;
let windowsExceptionEventWithoutPrefix: Event;
let windowsExceptionEventWithBackslashPrefix: Event;
let multipleStacktracesEvent: Event;

const originalWindow = global.window;

beforeAll(() => {
  // @ts-expect-error We need to do this because the integration has different behaviour on the browser and on the client
  global.window = undefined;
});

afterAll(() => {
  global.window = originalWindow;
});

describe('RewriteFrames', () => {
  beforeEach(() => {
    exceptionEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: '/www/src/app/file1.js' }, { filename: '/www/src/app/mo\\dule/file2.js' }],
            },
          },
        ],
      },
    };
    windowsExceptionEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: 'C:\\www\\src\\app\\file1.js' }, { filename: 'C:\\www\\src\\app\\file2.js' }],
            },
          },
        ],
      },
    };
    windowsLowerCaseExceptionEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: 'c:\\www\\src\\app\\file1.js' }, { filename: 'c:\\www\\src\\app\\file2.js' }],
            },
          },
        ],
      },
    };
    windowsExceptionEventWithoutPrefix = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: 'www\\src\\app\\file1.js' }, { filename: 'www\\src\\app\\file2.js' }],
            },
          },
        ],
      },
    };
    windowsExceptionEventWithBackslashPrefix = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: '\\www\\src\\app\\file1.js' }, { filename: '\\www\\src\\app\\file2.js' }],
            },
          },
        ],
      },
    };
    exceptionWithoutStackTrace = {
      exception: {
        values: [{}],
      },
    };
    multipleStacktracesEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: '/www/src/app/file1.js' }, { filename: '/www/src/app/mo\\dule/file2.js' }],
            },
          },
          {
            stacktrace: {
              frames: [{ filename: '/www/src/app/file3.js' }, { filename: '/www/src/app/mo\\dule/file4.js' }],
            },
          },
          {
            stacktrace: {
              frames: [{ filename: '/www/src/app/file5.js' }, { filename: '/www/src/app/mo\\dule/file6.js' }],
            },
          },
        ],
      },
    };
  });

  describe('default iteratee appends basename to `app:///` if frame starts with `/`', () => {
    beforeEach(() => {
      rewriteFrames = rewriteFramesIntegration();
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.processEvent?.(exceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });

    it('ignore exception without StackTrace', () => {
      // @ts-expect-error Validates that the Stacktrace does not exist before validating the test.
      expect(exceptionWithoutStackTrace.exception?.values[0].stacktrace).toEqual(undefined);
      const event = rewriteFrames.processEvent?.(exceptionWithoutStackTrace, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace).toEqual(undefined);
    });
  });

  describe('default iteratee prepends custom prefix to basename if frame starts with `/`', () => {
    beforeEach(() => {
      rewriteFrames = rewriteFramesIntegration({
        prefix: 'foobar/',
      });
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.processEvent?.(exceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('foobar/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('foobar/file2.js');
    });
  });

  describe('default iteratee appends basename to `app:///` if frame starts with Windows path prefix', () => {
    beforeEach(() => {
      rewriteFrames = rewriteFramesIntegration();
    });

    it('transforms windowsExceptionEvent frames (C:\\)', () => {
      const event = rewriteFrames.processEvent?.(windowsExceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });

    it('transforms windowsExceptionEvent frames with lower-case prefix (c:\\)', () => {
      const event = rewriteFrames.processEvent?.(windowsLowerCaseExceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });

    it('transforms windowsExceptionEvent frames with no prefix', () => {
      const event = rewriteFrames.processEvent?.(windowsExceptionEventWithoutPrefix, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });

    it('transforms windowsExceptionEvent frames with backslash prefix', () => {
      const event = rewriteFrames.processEvent?.(windowsExceptionEventWithBackslashPrefix, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });
  });

  describe('can use custom root to perform `relative` on filepaths', () => {
    beforeEach(() => {
      rewriteFrames = rewriteFramesIntegration({
        root: '/www',
      });
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.processEvent?.(exceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/mo\\dule/file2.js');
    });

    it('transforms windowsExceptionEvent frames', () => {
      const event = rewriteFrames.processEvent?.(windowsExceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/file2.js');
    });

    it('transforms windowsExceptionEvent lower-case prefix frames', () => {
      const event = rewriteFrames.processEvent?.(windowsLowerCaseExceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/file2.js');
    });

    it('transforms windowsExceptionEvent frames with no prefix', () => {
      const event = rewriteFrames.processEvent?.(windowsExceptionEventWithoutPrefix, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/file2.js');
    });

    it('transforms windowsExceptionEvent frames with backslash prefix', () => {
      const event = rewriteFrames.processEvent?.(windowsExceptionEventWithBackslashPrefix, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/file2.js');
    });
  });

  describe('can use custom iteratee', () => {
    beforeEach(() => {
      rewriteFrames = rewriteFramesIntegration({
        iteratee: (frame: StackFrame) => ({
          ...frame,
          function: 'whoops',
        }),
      });
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.processEvent?.(exceptionEvent, {}, {} as any) as Event;
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('/www/src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('/www/src/app/mo\\dule/file2.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].function).toEqual('whoops');
    });
  });

  describe('can process events that contain multiple stacktraces', () => {
    it('with defaults', () => {
      rewriteFrames = rewriteFramesIntegration();
      const event = rewriteFrames.processEvent?.(multipleStacktracesEvent, {}, {} as any) as Event;
      // first stacktrace
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
      // second stacktrace
      expect(event.exception!.values![1].stacktrace!.frames![0].filename).toEqual('app:///file3.js');
      expect(event.exception!.values![1].stacktrace!.frames![1].filename).toEqual('app:///file4.js');
      // third stacktrace
      expect(event.exception!.values![2].stacktrace!.frames![0].filename).toEqual('app:///file5.js');
      expect(event.exception!.values![2].stacktrace!.frames![1].filename).toEqual('app:///file6.js');
    });

    it('with custom root', () => {
      rewriteFrames = rewriteFramesIntegration({
        root: '/www',
      });
      const event = rewriteFrames.processEvent?.(multipleStacktracesEvent, {}, {} as any) as Event;
      // first stacktrace
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/mo\\dule/file2.js');
      // second stacktrace
      expect(event.exception!.values![1].stacktrace!.frames![0].filename).toEqual('app:///src/app/file3.js');
      expect(event.exception!.values![1].stacktrace!.frames![1].filename).toEqual('app:///src/app/mo\\dule/file4.js');
      // third stacktrace
      expect(event.exception!.values![2].stacktrace!.frames![0].filename).toEqual('app:///src/app/file5.js');
      expect(event.exception!.values![2].stacktrace!.frames![1].filename).toEqual('app:///src/app/mo\\dule/file6.js');
    });

    it('with custom iteratee', () => {
      rewriteFrames = rewriteFramesIntegration({
        iteratee: (frame: StackFrame) => ({
          ...frame,
          function: 'whoops',
        }),
      });
      const event = rewriteFrames.processEvent?.(multipleStacktracesEvent, {}, {} as any) as Event;
      // first stacktrace
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('/www/src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('/www/src/app/mo\\dule/file2.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].function).toEqual('whoops');
      // second stacktrace
      expect(event.exception!.values![1].stacktrace!.frames![0].filename).toEqual('/www/src/app/file3.js');
      expect(event.exception!.values![1].stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.exception!.values![1].stacktrace!.frames![1].filename).toEqual('/www/src/app/mo\\dule/file4.js');
      expect(event.exception!.values![1].stacktrace!.frames![1].function).toEqual('whoops');
      // third stacktrace
      expect(event.exception!.values![2].stacktrace!.frames![0].filename).toEqual('/www/src/app/file5.js');
      expect(event.exception!.values![2].stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.exception!.values![2].stacktrace!.frames![1].filename).toEqual('/www/src/app/mo\\dule/file6.js');
      expect(event.exception!.values![2].stacktrace!.frames![1].function).toEqual('whoops');
    });
  });

  describe('bails when unable to extract frames', () => {
    it('no exception values', () => {
      rewriteFrames = rewriteFramesIntegration({});
      const brokenEvent = {
        exception: {
          values: undefined,
        },
      };
      expect(rewriteFrames.processEvent?.(brokenEvent, {}, {} as any)).toEqual(brokenEvent);
    });

    it('no frames', () => {
      rewriteFrames = rewriteFramesIntegration({});
      const brokenEvent = {
        exception: {
          values: [
            {
              stacktrace: {},
            },
          ],
        },
      };
      expect(rewriteFrames.processEvent?.(brokenEvent, {}, {} as any)).toEqual(brokenEvent);
    });
  });

  describe('generateIteratee()', () => {
    describe('on the browser', () => {
      it('should replace the `root` value in the filename with the `assetPrefix` value', () => {
        const iteratee = generateIteratee({
          isBrowser: true,
          prefix: 'my-prefix://',
          root: 'http://example.com/my/path',
        });

        const result = iteratee({ filename: 'http://example.com/my/path/static/asset.js' });
        expect(result.filename).toBe('my-prefix:///static/asset.js');
      });

      it('should replace not the `root` value in the filename with the `assetPrefix` value, if the root value is not at the beginning of the frame', () => {
        const iteratee = generateIteratee({
          isBrowser: true,
          prefix: 'my-prefix://',
          root: '/my/path',
        });

        const result = iteratee({ filename: 'http://example.com/my/path/static/asset.js' });
        expect(result.filename).toBe('http://example.com/my/path/static/asset.js'); // unchanged
      });
    });
  });
});
