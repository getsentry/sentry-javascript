import type { Event, StackFrame } from '@sentry/types';

import { RewriteFrames } from '../src/rewriteframes';

let rewriteFrames: RewriteFrames;
let exceptionEvent: Event;
let exceptionWithoutStackTrace: Event;
let windowsExceptionEvent: Event;
let multipleStacktracesEvent: Event;

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
      rewriteFrames = new RewriteFrames();
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.process(exceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });

    it('ignore exception without StackTrace', () => {
      // @ts-ignore Validates that the Stacktrace does not exist before validating the test.
      expect(exceptionWithoutStackTrace.exception?.values[0].stacktrace).toEqual(undefined);
      const event = rewriteFrames.process(exceptionWithoutStackTrace);
      expect(event.exception!.values![0].stacktrace).toEqual(undefined);
    });
  });

  describe('default iteratee prepends custom prefix to basename if frame starts with `/`', () => {
    beforeEach(() => {
      rewriteFrames = new RewriteFrames({
        prefix: 'foobar/',
      });
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.process(exceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('foobar/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('foobar/file2.js');
    });
  });

  describe('default iteratee appends basename to `app:///` if frame starts with `C:\\`', () => {
    beforeEach(() => {
      rewriteFrames = new RewriteFrames();
    });

    it('transforms windowsExceptionEvent frames', () => {
      const event = rewriteFrames.process(windowsExceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });
  });

  describe('can use custom root to perform `relative` on filepaths', () => {
    beforeEach(() => {
      rewriteFrames = new RewriteFrames({
        root: '/www',
      });
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.process(exceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/mo\\dule/file2.js');
    });

    it('trasforms windowsExceptionEvent frames', () => {
      const event = rewriteFrames.process(windowsExceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('app:///src/app/file2.js');
    });
  });

  describe('can use custom iteratee', () => {
    beforeEach(() => {
      rewriteFrames = new RewriteFrames({
        iteratee: (frame: StackFrame) => ({
          ...frame,
          function: 'whoops',
        }),
      });
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.process(exceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('/www/src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('/www/src/app/mo\\dule/file2.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].function).toEqual('whoops');
    });
  });

  describe('can process events that contain multiple stacktraces', () => {
    it('with defaults', () => {
      rewriteFrames = new RewriteFrames();
      const event = rewriteFrames.process(multipleStacktracesEvent);
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
      rewriteFrames = new RewriteFrames({
        root: '/www',
      });
      const event = rewriteFrames.process(multipleStacktracesEvent);
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
      rewriteFrames = new RewriteFrames({
        iteratee: (frame: StackFrame) => ({
          ...frame,
          function: 'whoops',
        }),
      });
      const event = rewriteFrames.process(multipleStacktracesEvent);
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
      rewriteFrames = new RewriteFrames({});
      const brokenEvent = {
        exception: {
          values: undefined,
        },
      };
      expect(rewriteFrames.process(brokenEvent)).toEqual(brokenEvent);
    });

    it('no frames', () => {
      rewriteFrames = new RewriteFrames({});
      const brokenEvent = {
        exception: {
          values: [
            {
              stacktrace: {},
            },
          ],
        },
      };
      expect(rewriteFrames.process(brokenEvent)).toEqual(brokenEvent);
    });
  });
});
