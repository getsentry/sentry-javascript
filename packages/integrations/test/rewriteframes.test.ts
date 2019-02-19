import { Event, StackFrame } from '@sentry/types';
import { RewriteFrames } from '../src/rewriteframes';

let rewriteFrames: RewriteFrames;
let messageEvent: Event;
let exceptionEvent: Event;

describe('RewriteFrames', () => {
  beforeEach(() => {
    messageEvent = {
      stacktrace: {
        frames: [
          {
            filename: '/www/src/app/file1.js',
          },
          {
            filename: '/www/src/app/file2.js',
          },
        ],
      },
    };
    exceptionEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: '/www/src/app/file1.js',
                },
                {
                  filename: '/www/src/app/file2.js',
                },
              ],
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

    it('transforms messageEvent frames', () => {
      const event = rewriteFrames.process(messageEvent);
      expect(event.stacktrace!.frames![0].filename).toEqual('app:///file1.js');
      expect(event.stacktrace!.frames![1].filename).toEqual('app:///file2.js');
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.process(exceptionEvent);
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

    it('transforms messageEvent frames', () => {
      const event = rewriteFrames.process(messageEvent);
      expect(event.stacktrace!.frames![0].filename).toEqual('app:///src/app/file1.js');
      expect(event.stacktrace!.frames![1].filename).toEqual('app:///src/app/file2.js');
    });

    it('transforms exceptionEvent frames', () => {
      const event = rewriteFrames.process(exceptionEvent);
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

    it('transforms messageEvent frames', async () => {
      const event = rewriteFrames.process(messageEvent);
      expect(event.stacktrace!.frames![0].filename).toEqual('/www/src/app/file1.js');
      expect(event.stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.stacktrace!.frames![1].filename).toEqual('/www/src/app/file2.js');
      expect(event.stacktrace!.frames![1].function).toEqual('whoops');
    });

    it('transforms exceptionEvent frames', async () => {
      const event = rewriteFrames.process(exceptionEvent);
      expect(event.exception!.values![0].stacktrace!.frames![0].filename).toEqual('/www/src/app/file1.js');
      expect(event.exception!.values![0].stacktrace!.frames![0].function).toEqual('whoops');
      expect(event.exception!.values![0].stacktrace!.frames![1].filename).toEqual('/www/src/app/file2.js');
      expect(event.exception!.values![0].stacktrace!.frames![1].function).toEqual('whoops');
    });
  });
});
